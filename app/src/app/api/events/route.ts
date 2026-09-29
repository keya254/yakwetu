import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { exchangeFor, isBrowserEvent } from "@/lib/events/catalog";
import type { EventEnvelope } from "@/lib/events/envelope";
import { enqueueEvents, errorSummary } from "@/lib/events/outbox";
import { publishEvents, publisherConfigured } from "@/lib/events/publisher";
import { ANONYMOUS_COOKIE, ANONYMOUS_COOKIE_MAX_AGE, buildEnvelope, clientIp } from "@/lib/events/server";

/**
 * The event relay. The browser posts batches here, on our own domain, instead
 * of to an analytics host that Brave, uBlock and friends block. The server
 * adds who it is (the session, never a user id from the body), writes the
 * batch to the outbox and answers 202; the drain takes it to RabbitMQ.
 *
 * Only events the catalogue marks as browser events are accepted: sign-ups
 * and payments are recorded by the server itself and can't be posted here.
 */

const MAX_PROPERTIES_BYTES = 4_096;

const bodySchema = z.object({
  sessionId: z.string().max(64).optional(),
  events: z
    .array(
      z.object({
        id: z.uuid(),
        type: z.string().max(80),
        occurredAt: z.string().max(40).optional(),
        path: z.string().max(500).optional(),
        referrer: z.string().max(1000).optional(),
        properties: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  // sendBeacon posts text/plain; fetch posts JSON. Read the text either way.
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(JSON.parse(await request.text()));
    if (!parsed.success) return NextResponse.json({ error: "invalid batch", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const [session, cookieStore] = await Promise.all([auth.api.getSession({ headers: request.headers }).catch(() => null), cookies()]);
  let anonymousId = cookieStore.get(ANONYMOUS_COOKIE)?.value ?? null;
  const newVisitor = !anonymousId;
  anonymousId ??= randomUUID();

  const rejected: { id: string; reason: string }[] = [];
  const envelopes: EventEnvelope[] = [];
  for (const event of body.events) {
    if (!isBrowserEvent(event.type)) {
      rejected.push({ id: event.id, reason: `unknown or server-only event "${event.type}"` });
      continue;
    }
    if (JSON.stringify(event.properties).length > MAX_PROPERTIES_BYTES) {
      rejected.push({ id: event.id, reason: "properties over 4 KB" });
      continue;
    }
    envelopes.push(
      buildEnvelope({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        userId: session?.user.id ?? null,
        anonymousId,
        sessionId: body.sessionId ?? null,
        context: { path: event.path, referrer: event.referrer || undefined, userAgent: request.headers.get("user-agent") ?? undefined, ip: clientIp(request.headers) },
        properties: event.properties,
      }),
    );
  }

  let status = 202;
  if (envelopes.length) {
    try {
      await enqueueEvents(envelopes);
    } catch (outboxError) {
      // Postgres unreachable. Second line: publish straight to RabbitMQ. If that
      // fails too, answer 503 and the browser keeps the batch for its next try.
      console.warn(`[events] outbox write failed (${errorSummary(outboxError)}); publishing directly`);
      const direct = publisherConfigured()
        ? await publishEvents(envelopes.map((envelope) => ({ exchange: exchangeFor(envelope.type), envelope }))).catch(() => null)
        : null;
      if (!direct || direct.failed.length) status = 503;
    }
  }

  const response = NextResponse.json({ accepted: status === 202 ? envelopes.length : 0, rejected }, { status });
  if (newVisitor) {
    response.cookies.set(ANONYMOUS_COOKIE, anonymousId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ANONYMOUS_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}
