import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveNudgeToken } from "@/lib/nudges";
import { paystackConfigured } from "@/lib/payments/paystack";
import { CheckoutError, createCheckout } from "@/lib/payments/service";

/**
 * Starts a checkout. The body names films only; the server prices them,
 * creates the order and our payment reference, and opens the Paystack
 * transaction. The browser gets an access code for Paystack's popup, never an
 * amount it could change.
 */
const bodySchema = z.union([
  z.object({ movieIds: z.array(z.string().min(1).max(120)).min(1).max(5) }),
  // From a nudge link (/c/<token>): films, discount and attribution come from the signed nudge, not the body.
  z.object({ nudgeToken: z.string().min(10).max(200) }),
]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to buy films." }, { status: 401 });
  if (!paystackConfigured()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a film to buy." }, { status: 400 });

  let request_: Parameters<typeof createCheckout>[0] = { user: { id: session.user.id, email: session.user.email }, movieIds: [] };
  if ("nudgeToken" in parsed.data) {
    const resolved = await resolveNudgeToken(parsed.data.nudgeToken);
    if (resolved.state !== "valid") {
      const message = resolved.state === "used" ? "This offer has already been used." : resolved.state === "expired" ? "This offer has expired." : "This link isn't valid.";
      return NextResponse.json({ error: message, code: `offer_${resolved.state}` }, { status: 410 });
    }
    if (resolved.nudge.userId !== session.user.id) return NextResponse.json({ error: "This offer was sent to a different account." }, { status: 403 });
    request_ = {
      ...request_,
      movieIds: resolved.nudge.movieIds,
      nudgeId: resolved.nudge.id,
      ...(resolved.nudge.discountPct ? { discount: { pct: resolved.nudge.discountPct, code: resolved.nudge.code ?? `NUDGE-${resolved.nudge.scenario}` } } : {}),
    };
  } else {
    request_.movieIds = parsed.data.movieIds;
  }

  try {
    const checkout = await createCheckout(request_);
    return NextResponse.json({ ...checkout, publicKey: process.env.PAYSTACK_PUBLIC_KEY });
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[checkout]", error);
    return NextResponse.json({ error: "Something went wrong starting your payment." }, { status: 500 });
  }
}
