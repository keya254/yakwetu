import type { EventType } from "@/lib/events/catalog";

/**
 * The shape of every message on the bus, for every consumer (n8n → PostHog,
 * sinema-recs, the scenario workflows). Top-level fields are what routing,
 * dedupe and identity need; everything event-specific is in `properties`.
 */
export interface EventEnvelope {
  /** uuid, made where the event happened. Consumers dedupe on it. */
  id: string;
  /** e.g. "video.started". Also the routing key and the PostHog event name. */
  type: EventType;
  /** When it happened (client clock, clamped by the server). ISO 8601. */
  occurredAt: string;
  /** When the storefront server accepted it. */
  receivedAt: string;
  source: "browser" | "server";
  /** Signed-in user id, from the server session. Never taken from the browser. */
  userId: string | null;
  /** First-party cookie id for signed-out visitors. */
  anonymousId: string | null;
  /** userId when known, else anonymousId: PostHog's distinct_id. */
  distinctId: string;
  /** One browser tab session. */
  sessionId: string | null;
  context: {
    path?: string;
    referrer?: string;
    userAgent?: string;
    ip?: string;
  };
  properties: Record<string, unknown>;
}
