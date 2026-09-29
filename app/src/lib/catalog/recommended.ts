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

/** "My films": what the viewer owns, the one they watched last first, then newest purchases. */
export async function getMyFilms(viewerId: string): Promise<MovieCardData[]> {
  const owned = await prisma.entitlement.findMany({
    where: { userId: viewerId },
    orderBy: [{ lastWatchedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { movieId: true },
    take: 20,
  });
  return getMoviesByIds(owned.map((row) => row.movieId));
}

/**
 * "Because you watched X": the recommender's `next` picks after the film they
 * finished (or last opened) most recently. Films they own are left out. Null
 * when there's nothing to anchor on or not enough to fill a row.
 */
export async function getBecauseYouWatched(viewerId: string): Promise<{ anchorTitle: string; movies: MovieCardData[] } | null> {
  const last = await prisma.entitlement.findFirst({
    where: { userId: viewerId, OR: [{ completedAt: { not: null } }, { lastWatchedAt: { not: null } }] },
    orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { lastWatchedAt: { sort: "desc", nulls: "last" } }],
    select: { movieId: true },
  });
  if (!last) return null;
  const [anchor, owned] = await Promise.all([
    prisma.movie.findUnique({ where: { id: last.movieId }, select: { title: true, genres: true } }),
    prisma.entitlement.findMany({ where: { userId: viewerId }, select: { movieId: true } }),
  ]);
  if (!anchor) return null;
  const exclude = owned.map((row) => row.movieId);
  const result = await getRecommendations(viewerId, { mode: "next", anchor: last.movieId, exclude, limit: 12 });
  let movies = result ? await getMoviesByIds(result.picks.map((pick) => pick.movieId).filter((id) => !exclude.includes(id))) : [];
  if (movies.length < MIN_ROW) movies = (await getSimilar(last.movieId, anchor.genres, 12)).filter((movie) => !exclude.includes(movie.id));
  return movies.length >= MIN_ROW ? { anchorTitle: anchor.title, movies } : null;
}
