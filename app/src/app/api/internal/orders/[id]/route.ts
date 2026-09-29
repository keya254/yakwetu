import { NextResponse } from "next/server";
import { internalRequestAllowed } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

/**
 * For n8n: everything a rescue or abandoned-checkout workflow needs about one
 * order, in one call: is it paid yet, what's in it, what does the viewer
 * already own, and how to reach them (first name and phone). n8n never needs
 * database access for commerce.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/internal/orders/[id]">) {
  if (!internalRequestAllowed(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({ where: { id }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const [user, films, owned, nudges] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.userId }, select: { id: true, name: true, phone: true } }),
    prisma.movie.findMany({ where: { id: { in: order.movieIds } }, select: { id: true, title: true, priceKes: true, genres: true } }),
    prisma.entitlement.findMany({ where: { userId: order.userId, movieId: { in: order.movieIds } }, select: { movieId: true } }),
    prisma.nudge.count({ where: { orderId: order.id } }),
  ]);
  const payment = order.payments[0];

  return NextResponse.json({
    order: { id: order.id, status: order.status, paid: order.status === "paid", movieIds: order.movieIds, totalKes: order.totalKes, createdAt: order.createdAt },
    latestPayment: payment ? { reference: payment.reference, status: payment.status, failureReason: payment.failureReason, channel: payment.channel } : null,
    user: user ? { id: user.id, firstName: user.name.trim().split(/\s+/)[0] || "there", phone: user.phone } : null,
    films,
    ownedMovieIds: owned.map((row) => row.movieId),
    ownsAll: owned.length === order.movieIds.length,
    nudgesSent: nudges,
  });
}
