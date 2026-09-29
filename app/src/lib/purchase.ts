import "server-only";
import { nudgeToken, priceOffer } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

/**
 * What the purchase card needs to know about one viewer and one film, in one
 * place: do they own it (and since when), have they finished it, is there a
 * live offer waiting for them (a nudge they haven't used), and can we reach
 * them by SMS if a payment fails.
 */
export interface PurchaseState {
  owned: boolean;
  ownedSince: Date | null;
  completed: boolean;
  hasPhone: boolean;
  offer: { url: string; totalKes: number; subtotalKes: number; discountPct: number; expiresAt: Date } | null;
}

export async function purchaseState(userId: string | null, movieId: string): Promise<PurchaseState> {
  if (!userId) return { owned: false, ownedSince: null, completed: false, hasPhone: false, offer: null };

  const [entitlement, user, nudge] = await Promise.all([
    prisma.entitlement.findUnique({ where: { userId_movieId: { userId, movieId } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    // A single-film offer for exactly this film, still open.
    prisma.nudge.findFirst({
      where: { userId, movieIds: { equals: [movieId] }, convertedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { discountPct: "desc" },
    }),
  ]);

  let offer: PurchaseState["offer"] = null;
  if (!entitlement && nudge && nudge.discountPct > 0) {
    const priced = await priceOffer(userId, nudge.movieIds, nudge.discountPct);
    offer = { url: `/c/${nudgeToken(nudge.id)}`, totalKes: priced.totalKes, subtotalKes: priced.subtotalKes, discountPct: nudge.discountPct, expiresAt: nudge.expiresAt };
  }

  return {
    owned: Boolean(entitlement),
    ownedSince: entitlement?.createdAt ?? null,
    completed: Boolean(entitlement?.completedAt),
    hasPhone: Boolean(user?.phone),
    offer,
  };
}
