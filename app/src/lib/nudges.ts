import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/site-url";

/**
 * Nudge links: what n8n puts in an SMS to bring a viewer back to checkout.
 *
 * n8n asks for a link (POST /api/internal/nudges); the storefront applies the
 * business rules, prices the offer, stores the nudge and signs a token for it.
 * The discount lives in the database, not the link, so n8n can't invent a
 * price, and a link works once and expires. The rules live here, in one place,
 * whichever workflow asks:
 *
 * - never about films the viewer already owns;
 * - at most MAX_PER_USER_DAY nudges per viewer per 24 h, MAX_PER_ORDER per order;
 * - never for an order that's already paid;
 * - discount capped at MAX_DISCOUNT_PCT.
 */

/** Anti-spam caps: nudges per viewer per 24 h (NUDGE_MAX_PER_USER_DAY, default 20). */
const MAX_PER_USER_DAY = Number(process.env.NUDGE_MAX_PER_USER_DAY ?? 20);
const MAX_PER_ORDER = 2;
const MAX_DISCOUNT_PCT = 30;
const DEFAULT_TTL_MINUTES = 60;

export type Scenario = "A" | "B" | "C" | "welcome";

function secret(): string {
  const value = process.env.NUDGE_LINK_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("Set NUDGE_LINK_SECRET");
  return value;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(`nudge:${id}`).digest("base64url").slice(0, 24);
}

export function nudgeToken(id: string): string {
  return `${id}.${sign(id)}`;
}

export function nudgeUrl(id: string): string {
  return `${publicSiteUrl()}/c/${nudgeToken(id)}`;
}

/** Prices films the way checkout will: the viewer's unowned films, minus the discount, at least KES 10. */
export async function priceOffer(userId: string, movieIds: string[], discountPct: number) {
  const [movies, owned] = await Promise.all([
    prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true, title: true, priceKes: true, genres: true } }),
    prisma.entitlement.findMany({ where: { userId, movieId: { in: movieIds } }, select: { movieId: true } }),
  ]);
  const ownedIds = new Set(owned.map((row) => row.movieId));
  const films = movieIds.flatMap((id) => movies.filter((movie) => movie.id === id && !ownedIds.has(id)));
  const subtotalKes = films.reduce((sum, film) => sum + film.priceKes, 0);
  const discountKes = Math.round((subtotalKes * discountPct) / 100);
  return { films, ownedIds: [...ownedIds], subtotalKes, discountKes, totalKes: Math.max(subtotalKes - discountKes, 10) };
}

export type CreateNudgeResult =
  | {
      status: "created";
      nudgeId: string;
      url: string;
      expiresAt: string;
      films: { id: string; title: string; priceKes: number }[];
      subtotalKes: number;
      discountKes: number;
      totalKes: number;
      discountPct: number;
    }
  | { status: "skipped"; reason: "owns_all" | "order_paid" | "user_capped" | "order_capped" | "unknown_films" };

export async function createNudge(input: {
  userId: string;
  scenario: Scenario;
  step?: string;
  movieIds: string[];
  orderId?: string | null;
  discountPct?: number;
  code?: string | null;
  message?: string | null;
  ttlMinutes?: number;
}): Promise<CreateNudgeResult> {
  const discountPct = Math.min(Math.max(Math.round(input.discountPct ?? 0), 0), MAX_DISCOUNT_PCT);
  const movieIds = [...new Set(input.movieIds)].slice(0, 5);
  if (movieIds.length === 0) return { status: "skipped", reason: "unknown_films" };

  if (input.orderId) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { status: true } });
    if (order?.status === "paid") return { status: "skipped", reason: "order_paid" };
    const forOrder = await prisma.nudge.count({ where: { orderId: input.orderId } });
    if (forOrder >= MAX_PER_ORDER) return { status: "skipped", reason: "order_capped" };
  }
  const today = await prisma.nudge.count({ where: { userId: input.userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
  if (today >= MAX_PER_USER_DAY) return { status: "skipped", reason: "user_capped" };

  const offer = await priceOffer(input.userId, movieIds, discountPct);
  if (offer.films.length === 0) return { status: "skipped", reason: offer.ownedIds.length ? "owns_all" : "unknown_films" };

  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60_000);
  const nudge = await prisma.nudge.create({
    data: {
      userId: input.userId,
      scenario: input.scenario,
      step: input.step ?? "first",
      movieIds: offer.films.map((film) => film.id),
      orderId: input.orderId ?? null,
      discountPct,
      code: input.code ?? null,
      message: input.message ?? null,
      expiresAt,
    },
  });
  return {
    status: "created",
    nudgeId: nudge.id,
    url: nudgeUrl(nudge.id),
    expiresAt: expiresAt.toISOString(),
    films: offer.films.map(({ id, title, priceKes }) => ({ id, title, priceKes })),
    subtotalKes: offer.subtotalKes,
    discountKes: offer.discountKes,
    totalKes: offer.totalKes,
    discountPct,
  };
}

export type ResolvedNudge =
  | { state: "valid"; nudge: NonNullable<Awaited<ReturnType<typeof prisma.nudge.findUnique>>> }
  | { state: "invalid" }
  | { state: "expired" | "used"; nudge: NonNullable<Awaited<ReturnType<typeof prisma.nudge.findUnique>>> };

/** A token from a link → its nudge, if the signature holds and it's still usable. */
export async function resolveNudgeToken(token: string): Promise<ResolvedNudge> {
  const [id, signature] = token.split(".");
  if (!id || !signature) return { state: "invalid" };
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { state: "invalid" };
  const nudge = await prisma.nudge.findUnique({ where: { id } });
  if (!nudge) return { state: "invalid" };
  if (nudge.convertedAt) return { state: "used", nudge };
  if (nudge.expiresAt < new Date()) return { state: "expired", nudge };
  return { state: "valid", nudge };
}

/** Constant-time check of the key n8n sends to the internal API (x-internal-key). */
export function internalRequestAllowed(request: Request): boolean {
  const key = process.env.INTERNAL_API_KEY;
  const given = request.headers.get("x-internal-key");
  if (!key || !given) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
