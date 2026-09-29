import { NextResponse } from "next/server";
import { z } from "zod";
import { createNudge, internalRequestAllowed } from "@/lib/nudges";

/**
 * For n8n: create a nudge and get its signed link and price. Business rules
 * (caps, ownership, paid orders, discount ceiling) are applied here; a nudge
 * that breaks one comes back as { status: "skipped", reason } with 200, so the
 * workflow can branch on it instead of failing.
 */
const bodySchema = z.object({
  userId: z.string().min(1).max(120),
  scenario: z.enum(["A", "B", "C", "welcome"]),
  step: z.string().max(40).optional(),
  movieIds: z.array(z.string().min(1).max(120)).min(1).max(5),
  orderId: z.string().max(120).nullish(),
  discountPct: z.number().int().min(0).max(100).optional(),
  code: z.string().max(40).nullish(),
  message: z.string().max(480).nullish(),
  ttlMinutes: z.number().int().min(5).max(10_080).optional(),
});

export async function POST(request: Request) {
  if (!internalRequestAllowed(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid nudge", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  return NextResponse.json(await createNudge(parsed.data));
}
