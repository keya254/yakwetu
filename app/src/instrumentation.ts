/**
 * Runs once when a server instance starts. Node only: amqplib and Prisma don't
 * run on the edge runtime.
 * - the outbox drain publishes captured events to RabbitMQ (lib/events/outbox.ts);
 * - the payment-check consumer settles payments on RabbitMQ timers (lib/payments/checks.ts);
 * - the webhook inbox is drained every 15 s, in case processing right after
 *   a webhook failed (lib/payments/inbox.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDrain } = await import("@/lib/events/outbox");
    startDrain();

    const { startPaymentChecks } = await import("@/lib/payments/checks");
    void startPaymentChecks().catch((error: unknown) => console.warn("[payments] checks not started:", error));

    const { processInbox } = await import("@/lib/payments/inbox");
    const globalForInbox = globalThis as unknown as { yakwetuInboxTimer?: ReturnType<typeof setInterval> };
    globalForInbox.yakwetuInboxTimer ??= setInterval(() => void processInbox().catch(() => {}), 15_000);
  }
}
