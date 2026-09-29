import "server-only";
import { errorSummary } from "@/lib/events/outbox";
import { settlePayment } from "@/lib/payments/service";
import { prisma } from "@/lib/prisma";

/**
 * Drains the webhook inbox. Each stored webhook that names one of our
 * payments is settled through settlePayment, which re-verifies with Paystack:
 * the webhook says "look at this reference", Paystack's verify says what
 * happened. Rows are claimed with SKIP LOCKED and a lease, like the outbox, so
 * several instances (or a crashed one) never double-process or lose one.
 */

const TABLE = `"${process.env.DATABASE_SCHEMA ?? "storefront"}"."payment_webhook"`;
const BATCH = 20;
const MAX_ATTEMPTS = 10;
const PAYMENT_EVENTS = new Set(["charge.success", "charge.failed", "charge.abandoned", "paymentrequest.success", "paymentrequest.failed"]);

export async function processInbox(): Promise<number> {
  // Lease: attempts is bumped on claim, and a claimed row isn't picked again for a minute.
  const rows = await prisma.$queryRawUnsafe<{ id: string; event: string; reference: string | null }[]>(
    `UPDATE ${TABLE} SET "attempts" = "attempts" + 1, "lastError" = 'processing'
      WHERE "id" IN (
        SELECT "id" FROM ${TABLE}
         WHERE "processedAt" IS NULL AND "attempts" < $1
           AND ("lastError" IS DISTINCT FROM 'processing' OR "receivedAt" < now() - interval '1 minute')
         ORDER BY "receivedAt" LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING "id", "event", "reference"`,
    MAX_ATTEMPTS,
    BATCH,
  );

  for (const row of rows) {
    try {
      let note: string | null = null;
      if (!PAYMENT_EVENTS.has(row.event) || !row.reference) {
        note = `ignored: ${row.event}`;
      } else if (!(await prisma.payment.findUnique({ where: { reference: row.reference }, select: { reference: true } }))) {
        note = "ignored: not one of our references";
      } else {
        await settlePayment(row.reference, "webhook");
      }
      await prisma.paymentWebhook.update({ where: { id: row.id }, data: { processedAt: new Date(), lastError: note } });
    } catch (error) {
      await prisma.paymentWebhook.update({ where: { id: row.id }, data: { lastError: errorSummary(error).slice(0, 500) } });
    }
  }
  return rows.length;
}
