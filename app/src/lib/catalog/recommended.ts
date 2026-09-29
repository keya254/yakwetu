import "server-only";
import { getMoviesByIds, getSimilar, type MovieCardData } from "@/lib/catalog/queries";
import { prisma } from "@/lib/prisma";
import { getRecommendations } from "@/lib/recs";

/** Fewer than this many usable picks and a row looks broken; fall back instead. */
const MIN_ROW = 4;

export interface RecommendedRow {
  movies: MovieCardData[];
  /** Whether sinema-recs chose these, or the plain catalog query did. */
  source: "recs" | "catalog";
}

/**
 * "For you" on /browse. Null when the recommender can't help — unavailable,
 * or a brand-new viewer it can only rank by popularity (Trending already shows
 * that) — so the page simply leaves the row out and shows the regular rows.
 */
export async function getForYou(viewerId: string, limit = 12): Promise<MovieCardData[] | null> {
  const result = await getRecommendations(viewerId, { mode: "home", limit });
  if (!result || result.fallback === "cold_start") return null;
  const movies = await getMoviesByIds(result.picks.map((pick) => pick.movieId));
  return movies.length >= MIN_ROW ? movies : null;
}

/**
 * "More like this" on a movie page: close titles from the recommender, or
 * titles sharing a genre when it is unavailable. Never includes the movie itself.
 */
export async function getMoreLikeThis(viewerId: string, movie: { id: string; genres: string[] }, limit = 8): Promise<RecommendedRow> {
  const result = await getRecommendations(viewerId, { mode: "browse", anchor: movie.id, exclude: [movie.id], limit });
  if (result) {
    const movies = await getMoviesByIds(result.picks.map((pick) => pick.movieId).filter((id) => id !== movie.id));
    if (movies.length >= MIN_ROW) return { movies, source: "recs" };
  }
  return { movies: await getSimilar(movie.id, movie.genres, limit), source: "catalog" };
}

/** A viewer's library: every film they own, newest purchase first, with what they paid and when. */
export async function getLibrary(viewerId: string) {
  const owned = await prisma.entitlement.findMany({ where: { userId: viewerId }, orderBy: { createdAt: "desc" }, take: 60 });
  if (owned.length === 0) return [];
  const [movies, payments] = await Promise.all([
    getMoviesByIds(owned.map((row) => row.movieId)),
    prisma.payment.findMany({
      where: { reference: { in: [...new Set(owned.map((row) => row.reference))] } },
      select: { reference: true, amountKes: true, channel: true, order: { select: { movieIds: true, discountKes: true } } },
    }),
  ]);
  return owned.flatMap((row) => {
    const movie = movies.find((item) => item.id === row.movieId);
    if (!movie) return [];
    const payment = payments.find((item) => item.reference === row.reference);
    return [
      {
        movie,
        purchasedAt: row.createdAt,
        reference: row.reference,
        // An order of several films: show this film's share of what was paid.
        paidKes: payment ? Math.round(payment.amountKes / Math.max(payment.order.movieIds.length, 1)) : null,
        discounted: Boolean(payment?.order.discountKes),
        channel: payment?.channel ?? null,
      },
    ];
  });
}

/**
 * "Because you bought X": the recommender's `next` picks after their latest
 * purchase, leaving out what they own. Null when there's nothing to anchor on
 * or not enough to fill a row.
 */
export async function getBecauseYouBought(viewerId: string): Promise<{ anchorTitle: string; movies: MovieCardData[] } | null> {
  const owned = await prisma.entitlement.findMany({ where: { userId: viewerId }, orderBy: { createdAt: "desc" }, select: { movieId: true } });
  const latest = owned[0];
  if (!latest) return null;
  const anchor = await prisma.movie.findUnique({ where: { id: latest.movieId }, select: { title: true, genres: true } });
  if (!anchor) return null;
  const exclude = owned.map((row) => row.movieId);
  const result = await getRecommendations(viewerId, { mode: "next", anchor: latest.movieId, exclude, limit: 12 });
  let movies = result ? await getMoviesByIds(result.picks.map((pick) => pick.movieId).filter((id) => !exclude.includes(id))) : [];
  if (movies.length < MIN_ROW) movies = (await getSimilar(latest.movieId, anchor.genres, 12)).filter((movie) => !exclude.includes(movie.id));
  return movies.length >= MIN_ROW ? { anchorTitle: anchor.title, movies } : null;
}
