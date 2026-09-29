import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { emitServerEvent } from "@/lib/events/server";
import { prisma } from "@/lib/prisma";

/**
 * The player says "finished". The server decides whether it counts:
 * the viewer owns the film, and genuinely watched at least 30% of it (so
 * scrubbing to the end isn't a watch). The first counted finish per viewer and
 * film emits watch.completed: the recommender's strongest signal, and the
 * trigger for the post-watch upsell (YKW 04).
 */
const MIN_WATCHED_SHARE = 0.3;
const bodySchema = z.object({
  movieId: z.string().min(1).max(120),
  watchedSec: z.number().min(0).max(86_400),
  durationSec: z.number().min(1).max(86_400),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { movieId, watchedSec, durationSec } = parsed.data;

  const entitlement = await prisma.entitlement.findUnique({ where: { userId_movieId: { userId: session.user.id, movieId } } });
  if (!entitlement) return NextResponse.json({ error: "You don't own this film." }, { status: 403 });
  if (watchedSec < durationSec * MIN_WATCHED_SHARE) return NextResponse.json({ counted: false, reason: "not enough of it was watched" });

  // Only the first counted finish flips completedAt (the updateMany guard makes it race-safe).
  const { count } = await prisma.entitlement.updateMany({
    where: { userId: session.user.id, movieId, completedAt: null },
    data: { completedAt: new Date() },
  });
  if (count === 1) {
    await emitServerEvent("watch.completed", session.user.id, {
      movieId,
      progress: 1,
      watchedMs: Math.round(watchedSec * 1000),
      durationSec: Math.round(durationSec),
    });
  }
  return NextResponse.json({ counted: true, first: count === 1 });
}
