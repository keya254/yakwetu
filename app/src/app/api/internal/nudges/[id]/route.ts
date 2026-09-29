import { NextResponse } from "next/server";
import { internalRequestAllowed } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

/** For n8n: has this nudge been opened or paid through yet? (reminder steps check before sending) */
export async function GET(request: Request, ctx: RouteContext<"/api/internal/nudges/[id]">) {
  if (!internalRequestAllowed(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await ctx.params;
  const nudge = await prisma.nudge.findUnique({ where: { id } });
  if (!nudge) return NextResponse.json({ error: "nudge not found" }, { status: 404 });
  const owned = await prisma.entitlement.count({ where: { userId: nudge.userId, movieId: { in: nudge.movieIds } } });
  return NextResponse.json({
    id: nudge.id,
    scenario: nudge.scenario,
    opened: Boolean(nudge.openedAt),
    converted: Boolean(nudge.convertedAt),
    expired: nudge.expiresAt < new Date(),
    ownsAll: owned === nudge.movieIds.length,
  });
}
