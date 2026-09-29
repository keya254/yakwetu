import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { EVENTS, exchangeFor, type EventType } from "@/lib/events/catalog";
import type { EventEnvelope } from "@/lib/events/envelope";
import { enqueueEvents, errorSummary } from "@/lib/events/outbox";
import { publishEvents, publisherConfigured } from "@/lib/events/publisher";

/** First-party id for signed-out visitors: set by the relay, readable only by the server. */
export const ANONYMOUS_COOKIE = "ykw_aid";
export const ANONYMOUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client clocks drift and queued events arrive late: accept up to a week back, never the future. */
export function clampOccurredAt(value: string | undefined, now = new Date()): string {
  const at = value ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > 7 * 86_400_000) return now.toISOString();
  return new Date(at).toISOString();
}

export function clientIp(requestHeaders: Headers): string | undefined {
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined;
}

export function buildEnvelope(input: {
  id?: string;
  type: EventType;
  occurredAt?: string;
  userId: string | null;
  anonymousId: string | null;
  sessionId?: string | null;
  context?: EventEnvelope["context"];
  properties?: Record<string, unknown>;
}): EventEnvelope {
  const now = new Date();
  const distinctId = input.userId ?? input.anonymousId ?? `anon-${randomUUID()}`;
  return {
    id: input.id ?? randomUUID(),
    type: input.type,
    occurredAt: clampOccurredAt(input.occurredAt, now),
    receivedAt: now.toISOString(),
    source: EVENTS[input.type].source,
    userId: input.userId,
    anonymousId: input.anonymousId,
    distinctId,
    sessionId: input.sessionId ?? null,
    context: input.context ?? {},
    properties: input.properties ?? {},
  };
}

/**
 * Records an event that happens on the server (sign-up, sign-in, and later
 * checkout and Paystack results). Never throws: capturing an event must not
 * break the action it describes. The outbox write is the commit point; if
 * Postgres is down it publishes directly instead.
 */
export async function emitServerEvent(type: EventType, userId: string | null, properties: Record<string, unknown> = {}): Promise<void> {
  let envelope: EventEnvelope | null = null;
  try {
    let anonymousId: string | null = null;
    let context: EventEnvelope["context"] = {};
    try {
      const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
      anonymousId = cookieStore.get(ANONYMOUS_COOKIE)?.value ?? null;
      context = { userAgent: requestHeaders.get("user-agent") ?? undefined, ip: clientIp(requestHeaders) };
    } catch {
      // outside a request (a script or background job): no cookies or headers
    }
    envelope = buildEnvelope({ type, userId, anonymousId, context, properties });
    await enqueueEvents([envelope]);
  } catch (error) {
    // Outbox unavailable (Postgres down): publish straight to RabbitMQ instead.
    const direct = envelope && publisherConfigured() ? await publishEvents([{ exchange: exchangeFor(type), envelope }]).catch(() => null) : null;
    if (!direct?.confirmed.length) console.error(`[events] couldn't record ${type}: ${errorSummary(error)}`);
  }
}
