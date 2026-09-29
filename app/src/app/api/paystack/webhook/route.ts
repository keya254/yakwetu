import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { processInbox } from "@/lib/payments/inbox";
import { validSignature } from "@/lib/payments/paystack";
import { prisma } from "@/lib/prisma";

/**
 * Paystack webhooks. Check the signature, store the raw event in the inbox,
 * answer 200. Processing happens after the response (and again from the
 * background loop if that fails), so Paystack never waits on our database or
 * on its own verify API.
 *
 * - Bad signature: 401, nothing stored.
 * - Database down: 500, and Paystack retries (for up to 72 hours).
 * - Same webhook twice: the id is a hash of the raw body, so it's stored once.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: { event?: string; data?: { reference?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  await prisma.paymentWebhook.createMany({
    data: [
      {
        id: createHash("sha256").update(raw).digest("hex"),
        event: body.event ?? "unknown",
        reference: body.data?.reference ?? null,
        payload: body as unknown as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });

  after(() => processInbox().catch((error: unknown) => console.warn("[paystack] inbox processing deferred:", error)));
  return NextResponse.json({ received: true });
}
