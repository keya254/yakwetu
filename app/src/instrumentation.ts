/**
 * Runs once when a server instance starts. Starts the outbox drain, which
 * publishes captured events to RabbitMQ (see lib/events/outbox.ts). Node only:
 * amqplib and Prisma don't run on the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDrain } = await import("@/lib/events/outbox");
    startDrain();
  }
}
