import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { EventType } from "@/lib/events/catalog";
import { enqueueEventsInTransaction, kickDrain } from "@/lib/events/outbox";
import { buildEnvelope } from "@/lib/events/server";
import { classifyFailure, initializeTransaction, paystackEmail, verifyTransaction, type PaystackTransaction } from "@/lib/payments/paystack";
import { prisma } from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/site-url";

/**
 * Checkout and settlement: the only code that changes money state.
 *
 * - The server prices every order from the catalogue; the browser only names films.
 * - Every payment has our own reference, created before Paystack is called.
 * - settlePayment() is the single way a payment's state changes, whoever asks
 *   (the return page, a webhook, the delayed RabbitMQ check). It asks Paystack,
 *   locks the row, moves state forward only, and writes the new state, the
 *   entitlements and the events in ONE transaction.
 */

const SCHEMA = process.env.DATABASE_SCHEMA ?? "storefront";
const TX = { timeout: 20_000, maxWait: 10_000 };
/** A payment still unpaid this long after checkout is abandoned (Paystack keeps saying "abandoned" until someone pays). */
const ABANDON_AFTER_MS = Number(process.env.PAYMENT_ABANDON_MINUTES ?? 15) * 60_000;
/** Reuse a pending checkout for the same films instead of opening a second Paystack transaction (double clicks, retries). */
const REUSE_PENDING_MS = 20 * 60_000;
const MAX_FILMS = 5;

type Tx = Prisma.TransactionClient;
export type PaymentStatus = "created" | "pending" | "succeeded" | "failed" | "abandoned";

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: "no_films" | "unknown_film" | "already_owned" | "paystack_unavailable",
    readonly status = 400,
  ) {
    super(message);
  }
}

function newReference(): string {
  return `ykw_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function event(type: EventType, userId: string, properties: Record<string, unknown>) {
  return buildEnvelope({ type, userId, anonymousId: null, properties });
}

async function ownedMovieIds(userId: string, movieIds: string[]): Promise<Set<string>> {
  const rows = await prisma.entitlement.findMany({ where: { userId, movieId: { in: movieIds } }, select: { movieId: true } });
  return new Set(rows.map((row) => row.movieId));
}

export async function isOwned(userId: string, movieId: string): Promise<boolean> {
  return (await ownedMovieIds(userId, [movieId])).has(movieId);
}

// ── Checkout ─────────────────────────────────────────────────────────────

export interface CheckoutResult {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  orderId: string;
  amountKes: number;
  reused: boolean;
}

export async function createCheckout(input: {
  user: { id: string; email: string | null };
  movieIds: string[];
  /** Only from a server-signed link (nudges); never from the request body. */
  discount?: { pct: number; code: string };
  nudgeId?: string;
}): Promise<CheckoutResult> {
  const wanted = [...new Set(input.movieIds)].slice(0, MAX_FILMS);
  if (wanted.length === 0) throw new CheckoutError("Choose a film to buy.", "no_films");

  const movies = await prisma.movie.findMany({ where: { id: { in: wanted } }, select: { id: true, title: true, priceKes: true } });
  if (movies.length !== wanted.length) throw new CheckoutError("One of those films isn't in the catalogue.", "unknown_film");

  const owned = await ownedMovieIds(input.user.id, wanted);
  const toBuy = movies.filter((movie) => !owned.has(movie.id));
  if (toBuy.length === 0) throw new CheckoutError("You already own this.", "already_owned", 409);
  const movieIds = toBuy.map((movie) => movie.id).sort();

  // A pending checkout for exactly these films: hand back the same Paystack transaction.
  const pending = await prisma.payment.findFirst({
    where: { userId: input.user.id, status: "pending", createdAt: { gt: new Date(Date.now() - REUSE_PENDING_MS) }, accessCode: { not: null } },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });
  if (pending && pending.order.movieIds.slice().sort().join() === movieIds.join() && !input.discount && !input.nudgeId) {
    return {
      reference: pending.reference,
      accessCode: pending.accessCode!,
      authorizationUrl: `https://checkout.paystack.com/${pending.accessCode}`,
      orderId: pending.orderId,
      amountKes: pending.amountKes,
      reused: true,
    };
  }

  const subtotalKes = toBuy.reduce((sum, movie) => sum + movie.priceKes, 0);
  const discountKes = input.discount ? Math.round((subtotalKes * Math.min(Math.max(input.discount.pct, 0), 50)) / 100) : 0;
  const totalKes = Math.max(subtotalKes - discountKes, 10);
  const reference = newReference();
  const userId = input.user.id;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({ data: { userId, movieIds, subtotalKes, discountKes, totalKes, nudgeId: input.nudgeId } });
    await tx.payment.create({ data: { reference, orderId: created.id, userId, amountKes: totalKes } });
    await enqueueEventsInTransaction(tx, [
      event("checkout.started", userId, { orderId: created.id, movieIds, subtotalKes, discountKes, totalKes, nudgeId: input.nudgeId ?? null, discountCode: input.discount?.code ?? null }),
    ]);
    return created;
  }, TX);
  kickDrain();

  let init;
  try {
    init = await initializeTransaction({
      reference,
      email: paystackEmail(input.user.email, userId),
      amountKes: totalKes,
      callbackUrl: `${publicSiteUrl()}/checkout/return`,
      metadata: {
        orderId: order.id,
        userId,
        movieIds,
        nudgeId: input.nudgeId ?? null,
        custom_fields: [{ display_name: "Films", variable_name: "films", value: toBuy.map((movie) => movie.title).join(", ") }],
      },
    });
  } catch (error) {
    // Our side (or Paystack's) failed before the viewer could pay: no rescue message for this.
    await prisma.payment.update({ where: { reference }, data: { status: "failed", failureReason: "init_error", gatewayResponse: String(error).slice(0, 300) } });
    throw new CheckoutError("Payments are unavailable right now. Try again in a minute.", "paystack_unavailable", 502);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { reference }, data: { status: "pending", accessCode: init.access_code } });
    await enqueueEventsInTransaction(tx, [
      event("payment.submitted", userId, { reference, orderId: order.id, amountKes: totalKes, movieIds }),
      // A timer on RabbitMQ: comes back after the delay queue's TTL and re-verifies (lost webhooks, late M-Pesa).
      event("payment.check", userId, { reference, orderId: order.id }),
    ]);
  }, TX);
  kickDrain();

  return { reference, accessCode: init.access_code, authorizationUrl: init.authorization_url, orderId: order.id, amountKes: totalKes, reused: false };
}

// ── Settlement ───────────────────────────────────────────────────────────

export interface Settlement {
  reference: string;
  status: PaymentStatus;
  changed: boolean;
  duplicate: boolean;
  movieIds: string[];
  failureReason: string | null;
  /** Still pending and worth checking again (the delayed check reschedules itself). */
  recheck: boolean;
}

function nextStatus(tx: PaystackTransaction, createdAt: Date, amountKes: number): { status: PaymentStatus; reason?: string } {
  const status = tx.status.toLowerCase();
  if (status === "success") {
    if (tx.currency !== "KES" || tx.amount !== Math.round(amountKes * 100)) return { status: "failed", reason: "amount_mismatch" };
    return { status: "succeeded" };
  }
  if (status === "failed" || status === "reversed") return { status: "failed", reason: classifyFailure(tx.gateway_response, status) };
  if (status === "abandoned" && Date.now() - createdAt.getTime() > ABANDON_AFTER_MS) return { status: "abandoned" };
  return { status: "pending" };
}

/** Forward only; a success can override a failure or abandonment, nothing overrides a success. */
function allowed(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to || from === "succeeded") return false;
  if (from === "failed" || from === "abandoned") return to === "succeeded";
  return true;
}

export async function settlePayment(reference: string, source: "return" | "webhook" | "check"): Promise<Settlement> {
  const known = await prisma.payment.findUnique({ where: { reference }, include: { order: true } });
  if (!known) throw new Error(`Unknown payment ${reference}`);

  let paystack: PaystackTransaction | null = null;
  try {
    paystack = await verifyTransaction(reference);
  } catch (error) {
    if ((error as { status?: number }).status !== 400 && (error as { status?: number }).status !== 404) throw error;
    // Paystack has no transaction for it (initialise failed): nothing to settle.
  }

  const result = await prisma.$transaction(async (tx: Tx) => {
    // Serialise concurrent settlements of the same payment (return page + webhook + check at once).
    await tx.$queryRawUnsafe(`SELECT 1 FROM "${SCHEMA}"."payment" WHERE "reference" = $1 FOR UPDATE`, reference);
    const payment = await tx.payment.findUniqueOrThrow({ where: { reference }, include: { order: true } });
    const current = payment.status as PaymentStatus;
    const movieIds = payment.order.movieIds;
    const base = { reference, movieIds, duplicate: payment.duplicate, failureReason: payment.failureReason };

    if (source === "check") await tx.payment.update({ where: { reference }, data: { checks: { increment: 1 } } });
    if (!paystack) return { ...base, status: current, changed: false, recheck: false };

    const next = nextStatus(paystack, payment.createdAt, payment.amountKes);
    if (!allowed(current, next.status)) {
      return { ...base, status: current, changed: false, recheck: current === "pending" || current === "created" };
    }

    const facts = {
      channel: paystack.channel ?? payment.channel,
      gatewayResponse: paystack.gateway_response?.slice(0, 300) ?? payment.gatewayResponse,
      paystackId: String(paystack.id),
    };
    const props = { reference, orderId: payment.orderId, amountKes: payment.amountKes, movieIds, channel: facts.channel, source };

    if (next.status === "succeeded") {
      const alreadyPaid = payment.order.status === "paid";
      await tx.payment.update({
        where: { reference },
        data: { ...facts, status: "succeeded", failureReason: null, duplicate: alreadyPaid, paidAt: paystack.paid_at ? new Date(paystack.paid_at) : new Date() },
      });
      // Attribution: the nudge that brought them back converts in the same transaction.
      const nudge = payment.order.nudgeId ? await tx.nudge.findUnique({ where: { id: payment.order.nudgeId } }) : null;
      if (nudge && !alreadyPaid && !nudge.convertedAt) {
        await tx.nudge.update({ where: { id: nudge.id }, data: { convertedAt: new Date(), revenueKes: payment.amountKes } });
      }
      const events = [
        event("payment.succeeded", payment.userId, {
          ...props,
          nudgeId: payment.order.nudgeId,
          nudgeScenario: nudge?.scenario ?? null,
          nudgeStep: nudge?.step ?? null,
          discountKes: payment.order.discountKes,
          duplicate: alreadyPaid,
        }),
      ];
      if (!alreadyPaid) {
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "paid", paidAt: new Date() } });
        await tx.entitlement.createMany({ data: movieIds.map((movieId) => ({ userId: payment.userId, movieId, reference })), skipDuplicates: true });
        events.push(event("purchase.confirmed", payment.userId, { orderId: payment.orderId, reference, movieIds, amountKes: payment.amountKes }));
      }
      await enqueueEventsInTransaction(tx, events);
      return { ...base, status: "succeeded" as const, changed: true, duplicate: alreadyPaid, failureReason: null, recheck: false };
    }

    if (next.status === "failed" || next.status === "abandoned") {
      await tx.payment.update({ where: { reference }, data: { ...facts, status: next.status, failureReason: next.reason ?? null } });
      await enqueueEventsInTransaction(tx, [
        next.status === "failed"
          ? event("payment.failed", payment.userId, { ...props, reason: next.reason, gatewayResponse: facts.gatewayResponse })
          : event("payment.abandoned", payment.userId, props),
      ]);
      return { ...base, status: next.status, changed: true, failureReason: next.reason ?? null, recheck: false };
    }

    // pending
    await tx.payment.update({ where: { reference }, data: { ...facts, status: "pending" } });
    return { ...base, status: "pending" as const, changed: current !== "pending", recheck: true };
  }, TX);

  if (result.changed) kickDrain();
  return result;
}

/** Schedules another delayed check (the check consumer calls this while a payment is still pending). */
export async function scheduleCheck(reference: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { reference }, select: { userId: true, orderId: true } });
  if (!payment) return;
  await prisma.$transaction(async (tx) => {
    await enqueueEventsInTransaction(tx, [event("payment.check", payment.userId, { reference, orderId: payment.orderId })]);
  }, TX);
  kickDrain();
}
