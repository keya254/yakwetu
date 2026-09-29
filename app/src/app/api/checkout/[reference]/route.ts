import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { settlePayment } from "@/lib/payments/service";

/**
 * Where the browser asks "did it go through?" after Paystack's popup. The
 * answer comes from Paystack's verify API via settlePayment, so it's the same
 * idempotent path a webhook or the delayed check would take, whichever comes
 * first.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/checkout/[reference]">) {
  const { reference } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const payment = await prisma.payment.findUnique({ where: { reference }, select: { userId: true } });
  if (!payment || payment.userId !== session.user.id) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  try {
    const settlement = await settlePayment(reference, "return");
    return NextResponse.json({ status: settlement.status, movieIds: settlement.movieIds, failureReason: settlement.failureReason, duplicate: settlement.duplicate });
  } catch (error) {
    console.error("[checkout] verify failed", error);
    // Paystack or the DB is unreachable: the delayed check will settle it; tell the viewer we're still confirming.
    return NextResponse.json({ status: "pending", movieIds: [], failureReason: null, duplicate: false }, { status: 202 });
  }
}
