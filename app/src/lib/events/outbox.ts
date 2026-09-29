import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { exchangeFor } from "@/lib/events/catalog";
import type { EventEnvelope } from "@/lib/events/envelope";
import { publishEvents, publisherConfigured } from "@/lib/events/publisher";
import { prisma } from "@/lib/prisma";

/**
 * The transactional outbox: accept an event by writing it to Postgres, then
 * let the drain publish it to RabbitMQ.
 *
 * Why not publish straight away? Because "accepted" must survive anything
 * that happens next. With the row written:
 * - RabbitMQ down or blocking: rows wait, the drain retries with backoff, and
 *   they go out in order once it's back.
 * - The process dies after the write: the row is still there; the next
 *   process (or another instance) drains it.
 * - A drain dies mid-batch: its claim is a 30 s lease (lockedUntil), so the
 *   rows become claimable again by itself. A publish that did reach the
 *   broker before the crash goes out twice, and consumers dedupe on the id.
 * Several server instances can drain at once: claims use SKIP LOCKED, so no
 * row is claimed by two of them.
 */

const BATCH = 100;
const IDLE_MS = 2_000;
const LEASE = "30 seconds";
const KEEP_PUBLISHED_DAYS = 7;

const table = `"${process.env.DATABASE_SCHEMA ?? "storefront"}"."event_outbox"`;

/** Prisma's messages span several lines with the cause last; logs want the cause. */
export function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? message;
}

interface DrainState {
  running: boolean;
  wake: (() => void) | null;
  lastPrune: number;
}
const globalForDrain = globalThis as unknown as { yakwetuDrain?: DrainState };
const drain: DrainState = (globalForDrain.yakwetuDrain ??= { running: false, wake: null, lastPrune: 0 });

/** Writes events to the outbox (a duplicate id is ignored: retries are safe) and nudges the drain. */
export async function enqueueEvents(envelopes: EventEnvelope[]): Promise<number> {
  if (envelopes.length === 0) return 0;
  const { count } = await prisma.eventOutbox.createMany({
    data: envelopes.map((envelope) => ({
      id: envelope.id,
      type: envelope.type,
      exchange: exchangeFor(envelope.type),
      payload: envelope as unknown as Prisma.InputJsonValue,
      occurredAt: new Date(envelope.occurredAt),
    })),
    skipDuplicates: true,
  });
  kickDrain();
  return count;
}

export function kickDrain(): void {
  drain.wake?.();
}

interface ClaimedRow {
  id: string;
  exchange: string;
  payload: EventEnvelope;
  attempts: number;
}

/** Retry delay after a failed publish: 2 s, 4 s, 8 s … capped at a minute. */
function backoffSeconds(attempts: number): number {
  return Math.min(60, 2 ** Math.min(attempts, 6));
}

async function drainOnce(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<ClaimedRow[]>(
    `UPDATE ${table}
        SET "lockedUntil" = now() + interval '${LEASE}', "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM ${table}
         WHERE "publishedAt" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
         ORDER BY "createdAt"
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING "id", "exchange", "payload", "attempts"`,
    BATCH,
  );
  if (rows.length === 0) return 0;

  let confirmed: string[] = [];
  let failed: { id: string; error: string }[] = [];
  try {
    ({ confirmed, failed } = await publishEvents(rows.map((row) => ({ exchange: row.exchange, envelope: row.payload }))));
  } catch (error) {
    failed = rows.map((row) => ({ id: row.id, error: errorSummary(error) }));
  }

  if (confirmed.length) {
    await prisma.eventOutbox.updateMany({
      where: { id: { in: confirmed } },
      data: { publishedAt: new Date(), lockedUntil: null, lastError: null },
    });
  }
  const attemptsById = new Map(rows.map((row) => [row.id, row.attempts]));
  for (const { id, error } of failed) {
    const retryAt = new Date(Date.now() + backoffSeconds(attemptsById.get(id) ?? 1) * 1000);
    await prisma.eventOutbox.update({ where: { id }, data: { lockedUntil: retryAt, lastError: error.slice(0, 500) } });
  }
  if (failed.length) console.warn(`[events] ${failed.length} event(s) not published yet (${failed[0].error}); they stay in the outbox`);

  // A full batch that all went out means there's probably more waiting.
  return failed.length === 0 ? rows.length : 0;
}

async function prune(): Promise<void> {
  if (Date.now() - drain.lastPrune < 3_600_000) return;
  drain.lastPrune = Date.now();
  await prisma.eventOutbox.deleteMany({
    where: { publishedAt: { lt: new Date(Date.now() - KEEP_PUBLISHED_DAYS * 86_400_000) } },
  });
}

/** Starts the drain loop once per process (instrumentation.ts calls it at boot). */
export function startDrain(): void {
  if (drain.running) return;
  if (!publisherConfigured()) {
    console.info("[events] RABBITMQ_URL not set: events are kept in the outbox and not published");
    return;
  }
  drain.running = true;

  void (async () => {
    let dbFailures = 0;
    for (;;) {
      let drained = 0;
      try {
        drained = await drainOnce();
        await prune();
        if (dbFailures) console.info("[events] outbox drain resumed");
        dbFailures = 0;
      } catch (error) {
        // Postgres unreachable: nothing to claim right now. Back off, and log only the first failure of a streak.
        if (dbFailures++ === 0) console.warn(`[events] outbox drain paused: ${errorSummary(error)}`);
      }
      if (drained === BATCH) continue;
      const idle = dbFailures ? Math.min(30_000, IDLE_MS * 2 ** Math.min(dbFailures, 4)) : IDLE_MS;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, idle);
        drain.wake = () => {
          clearTimeout(timer);
          drain.wake = null;
          resolve();
        };
      });
    }
  })();
}

/** Pending and failing counts, for the ops page and health checks. */
export async function outboxStats() {
  const [pending, retrying, oldest] = await Promise.all([
    prisma.eventOutbox.count({ where: { publishedAt: null } }),
    prisma.eventOutbox.count({ where: { publishedAt: null, lastError: { not: null } } }),
    prisma.eventOutbox.findFirst({ where: { publishedAt: null }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { pending, retrying, oldestPendingAt: oldest?.createdAt ?? null };
}
