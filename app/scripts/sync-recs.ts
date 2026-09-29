/**
 * Pushes the storefront catalog to sinema-recs, so the recommender ranks
 * exactly the films we sell, under the same ids.
 *
 *   pnpm recs:sync
 *
 * Creates or updates every storefront movie (recs re-embeds a title whose
 * text changed), then switches off recs titles the storefront doesn't sell.
 * Switched off, not deleted: past signals on them still count towards taste.
 * Run after `pnpm catalog:seed`.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const base = process.env.RECS_API_URL;
const key = process.env.RECS_API_KEY;
// Film links the recommender hands out (SMS nudges): the public address when there is one.
const storefrontUrl = (process.env.PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

async function recs(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: { "x-api-key": key!, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; data?: unknown; message?: string };
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${body.message ?? ""}`);
  return body.data;
}

async function main() {
  if (!base || !key) throw new Error("Set RECS_API_URL and RECS_API_KEY in .env");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: process.env.DATABASE_SCHEMA ?? "storefront" }),
  });
  const movies = await prisma.movie.findMany({ orderBy: { id: "asc" } });
  await prisma.$disconnect();

  let pushed = 0;
  for (const movie of movies) {
    const data = (await recs(`/v1/movies/${encodeURIComponent(movie.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        title: movie.title,
        synopsis: movie.plot.slice(0, 5000),
        kind: "film",
        genres: movie.genres,
        languages: movie.languages,
        year: movie.year,
        runtimeMin: movie.runtimeMin ?? 0,
        priceKes: movie.priceKes,
        isNewRelease: movie.isNewRelease,
        posterUrl: movie.posterUrl,
        pageUrl: `${storefrontUrl}/movie/${movie.id}`,
        active: true,
      }),
    })) as { genres: string[]; embedded: boolean };
    pushed++;
    const dropped = movie.genres.filter((genre) => !data.genres.includes(genre));
    console.log(`✓ ${movie.id}${data.embedded ? "" : " · not embedded yet"}${dropped.length ? ` · genres recs doesn't know: ${dropped.join(", ")}` : ""}`);
  }

  const ours = new Set(movies.map((movie) => movie.id));
  const theirs = (await recs("/v1/movies")) as { id: string; title: string; active: boolean }[];
  const stale = theirs.filter((movie) => movie.active && !ours.has(movie.id));
  for (const movie of stale) {
    await recs(`/v1/movies/${encodeURIComponent(movie.id)}`, { method: "PUT", body: JSON.stringify({ title: movie.title, active: false }) });
  }

  console.log(`\nPushed ${pushed} titles to ${base}; switched off ${stale.length} the storefront doesn't sell.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
