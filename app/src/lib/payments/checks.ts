import "server-only";
import { connect, type ChannelModel, type ConsumeMessage, type RecoveringChannelModel } from "amqplib";
import { errorSummary } from "@/lib/events/outbox";
import { scheduleCheck, settlePayment } from "@/lib/payments/service";
import { prisma } from "@/lib/prisma";

/**
 * Consumes q.payments.check: payment timers. Every checkout schedules a
 * payment.check through the outbox to yakwetu.delay; RabbitMQ holds it for the
 * delay queue's TTL, then dead-letters it to yakwetu.internal → q.payments.check.
 * Here we re-verify with Paystack. Still pending? Schedule the next one, until
 * the payment is paid, failed or abandoned.
 *
 * That's what makes payments work without webhooks (localhost, or a webhook
 * lost to an outage), and what catches M-Pesa payments that settle late.
 * Transient failures (Paystack or Postgres unreachable) are retried in place;
 * the message stays unacked, so a crash just redelivers it.
 */

const QUEUE = "q.payments.check";
/** 2-minute TTL × 12 ≈ the abandonment window, with room to spare. */
const MAX_CHECKS = 12;

interface State {
  connection: RecoveringChannelModel | null;
  stopping: boolean;
}
const globalForChecks = globalThis as unknown as { yakwetuPaymentChecks?: State };
const state: State = (globalForChecks.yakwetuPaymentChecks ??= { connection: null, stopping: false });

async function handle(reference: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { reference }, select: { status: true, checks: true } });
  if (!payment || payment.status === "succeeded") return;
  const settlement = await settlePayment(reference, "check");
  if (settlement.recheck && payment.checks + 1 < MAX_CHECKS) await scheduleCheck(reference);
}

export async function startPaymentChecks(): Promise<void> {
  if (state.connection || !process.env.RABBITMQ_URL || !process.env.PAYSTACK_SECRET_KEY) return;
  const url = new URL(process.env.RABBITMQ_URL);
  if (!url.searchParams.has("heartbeat")) url.searchParams.set("heartbeat", "30");

  state.connection = await connect(url.toString(), {
    clientProperties: { connection_name: "yakwetu storefront payment checks" },
    recovery: {
      initialDelay: 500,
      maxDelay: 15_000,
      waitForConnect: false,
      async setup(model: ChannelModel) {
        const channel = await model.createChannel();
        await channel.prefetch(10);
        await channel.consume(
          QUEUE,
          (message: ConsumeMessage | null) => {
            if (!message) return;
            void (async () => {
              let reference: string | undefined;
              try {
                reference = (JSON.parse(message.content.toString("utf8")) as { properties?: { reference?: string } }).properties?.reference;
              } catch {
                // not JSON: fall through to reject
              }
              if (!reference) return channel.reject(message, false); // poison → q.payments.check.dlq
              for (let attempt = 1; ; attempt++) {
                try {
                  await handle(reference);
                  return channel.ack(message);
                } catch (error) {
                  if (state.stopping) return;
                  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
                  console.warn(`[payments] check for ${reference} failed (${errorSummary(error)}); retrying in ${delay / 1000}s`);
                  await new Promise((resolve) => setTimeout(resolve, delay));
                }
              }
            })();
          },
          { noAck: false },
        );
      },
    },
  });
  state.connection.on("connect", () => console.info(`[payments] checking payments from ${QUEUE}`));
  state.connection.on("connect-failed", (error: Error) => console.warn(`[payments] RabbitMQ unreachable (${error.message}); checks will resume`));
  state.connection.on("error", () => {});
}
