import "server-only";
import { getMoviesByIds, getSimilar, type MovieCardData } from "@/lib/catalog/queries";
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
