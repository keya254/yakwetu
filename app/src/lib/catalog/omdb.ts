/**
 * OMDb client. Only the seed script calls it; pages read the Postgres cache.
 * https://www.omdbapi.com/ — free keys allow 1,000 requests a day.
 */

export interface OmdbTitle {
  imdbId: string;
  title: string;
  year: number | null;
  genres: string[];
  languages: string[];
  countries: string[];
  plot: string;
  director: string | null;
  actors: string[];
  runtimeMin: number | null;
  rated: string | null;
  imdbRating: number | null;
  posterUrl: string | null;
}

type Raw = Record<string, string> & { Response: "True" | "False"; Error?: string };

const list = (value: string | undefined) =>
  !value || value === "N/A" ? [] : value.split(",").map((part) => part.trim()).filter(Boolean);
const text = (value: string | undefined) => (!value || value === "N/A" ? null : value);
const int = (value: string | undefined) => {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
};

export async function fetchOmdbTitle(imdbId: string, apiKey: string): Promise<OmdbTitle> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "full");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`OMDb answered ${response.status} for ${imdbId}`);
  const raw = (await response.json()) as Raw;
  if (raw.Response !== "True") throw new Error(`OMDb: ${raw.Error ?? "not found"} (${imdbId})`);

  const rating = Number(raw.imdbRating);
  return {
    imdbId,
    title: raw.Title ?? imdbId,
    year: int(raw.Year),
    genres: list(raw.Genre).map((genre) => genre.toLowerCase()),
    languages: list(raw.Language),
    countries: list(raw.Country),
    plot: text(raw.Plot) ?? "",
    director: text(raw.Director),
    actors: list(raw.Actors),
    runtimeMin: int(raw.Runtime),
    rated: text(raw.Rated),
    imdbRating: Number.isFinite(rating) ? rating : null,
    posterUrl: text(raw.Poster),
  };
}
