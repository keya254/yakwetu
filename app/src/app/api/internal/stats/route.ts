import { NextResponse } from "next/server";
import { internalRequestAllowed } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

/**
 * For n8n (the daily digest, and the "Ask Yakwetu" staff assistant): the money
 * figures, from the storefront's own tables. PostHog is for behaviour;
 * revenue, failures and recovery come from here, where payments are recorded
 * only after Paystack verified them.
 *
 *   GET /api/internal/stats?days=7
 */
export async function GET(request: Request) {
  if (!internalRequestAllowed(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 1), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000);
  const before = new Date(since.getTime() - days * 86_400_000);

  const [paid, paidBefore, byStatus, failures, byChannel, nudges, entitlements] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "succeeded", duplicate: false, paidAt: { gte: since } }, _sum: { amountKes: true }, _count: true }),
    prisma.payment.aggregate({ where: { status: "succeeded", duplicate: false, paidAt: { gte: before, lt: since } }, _sum: { amountKes: true }, _count: true }),
    prisma.payment.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.payment.groupBy({ by: ["failureReason"], where: { status: "failed", createdAt: { gte: since } }, _count: true }),
    prisma.payment.groupBy({ by: ["channel"], where: { status: "succeeded", paidAt: { gte: since } }, _count: true, _sum: { amountKes: true } }),
    prisma.nudge.groupBy({ by: ["scenario"], where: { createdAt: { gte: since } }, _count: { _all: true, openedAt: true, convertedAt: true }, _sum: { revenueKes: true } }),
    prisma.entitlement.groupBy({ by: ["movieId"], where: { createdAt: { gte: since } }, _count: true, orderBy: { _count: { movieId: "desc" } }, take: 5 }),
  ]);
  const titles = await prisma.movie.findMany({ where: { id: { in: entitlements.map((row) => row.movieId) } }, select: { id: true, title: true } });

  return NextResponse.json({
    periodDays: days,
    revenueKes: paid._sum.amountKes ?? 0,
    revenueKesPrevious: paidBefore._sum.amountKes ?? 0,
    paymentsSucceeded: paid._count,
    paymentsSucceededPrevious: paidBefore._count,
    paymentsByStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
    failuresByReason: Object.fromEntries(failures.map((row) => [row.failureReason ?? "unknown", row._count])),
    paidByChannel: byChannel.map((row) => ({ channel: row.channel ?? "unknown", payments: row._count, revenueKes: row._sum.amountKes ?? 0 })),
    nudgesByScenario: nudges.map((row) => ({
      scenario: row.scenario,
      sent: row._count._all,
      opened: row._count.openedAt,
      converted: row._count.convertedAt,
      recoveredKes: row._sum.revenueKes ?? 0,
    })),
    topFilmsSold: entitlements.map((row) => ({ title: titles.find((movie) => movie.id === row.movieId)?.title ?? row.movieId, copies: row._count })),
  });
}
