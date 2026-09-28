import "server-only";

/**
 * Client for sinema-recs, the recommendation server.
 *
 * Recommendations are an enhancement, never a dependency: every call has a
 * short timeout and answers null on any failure (not configured, down, slow,
 * bad response, nothing to recommend). Callers treat null as "use the plain
 * catalog query instead", so the storefront renders the same with the
 * recommender switched off.
 *
 * Recs only decides the order. Titles, posters and prices always come from
 * the storefront's own catalog, so a stale recs catalog can't show a wrong price.
 */

const TIMEOUT_MS = Number(process.env.RECS_TIMEOUT_MS ?? 1500);

export type RecsMode = "home" | "browse" | "rescue" | "next";

export interface RecsPick {
  movieId: string;
  reason: string;
}

export interface RecsResult {
  picks: RecsPick[];
  /** "cold_start": recs knows nothing about this viewer and ranked by popularity only. */
  fallback: string | null;
}

interface RecsResponse {
  success: boolean;
  data?: { items: { movieId: string; reason: string }[]; fallback: string | null };
}

export function recsConfigured(): boolean {
  return Boolean(process.env.RECS_API_URL && process.env.RECS_API_KEY);
}

export async function getRecommendations(
  viewerId: string,
  options: { mode: RecsMode; anchor?: string; limit?: number; exclude?: string[] },
): Promise<RecsResult | null> {
  if (!recsConfigured()) return null;

  const url = new URL(`/v1/recs/${encodeURIComponent(viewerId)}`, process.env.RECS_API_URL);
  url.searchParams.set("mode", options.mode);
  url.searchParams.set("limit", String(options.limit ?? 12));
  // The storefront only reads; logging (and the re-show cooldown it starts) is for n8n's nudges.
  url.searchParams.set("log", "false");
  if (options.anchor) url.searchParams.set("anchor", options.anchor);
  if (options.exclude?.length) url.searchParams.set("exclude", options.exclude.join(","));

  try {
    const response = await fetch(url, {
      headers: { "x-api-key": process.env.RECS_API_KEY! },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[recs] ${options.mode} answered ${response.status}; using the catalog fallback`);
      return null;
    }
    const body = (await response.json()) as RecsResponse;
    const items = body.data?.items ?? [];
    if (items.length === 0) return null;
    return { picks: items.map(({ movieId, reason }) => ({ movieId, reason })), fallback: body.data?.fallback ?? null };
  } catch (error) {
    const why = error instanceof Error && error.name === "TimeoutError" ? `no answer within ${TIMEOUT_MS}ms` : String(error);
    console.warn(`[recs] ${options.mode} unavailable (${why}); using the catalog fallback`);
    return null;
  }
}
