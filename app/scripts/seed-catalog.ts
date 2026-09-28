/**
 * Fills storefront.movie from OMDb for every curated title.
 *
 *   pnpm catalog:seed          # fetch what is missing or older than a week
 *   pnpm catalog:seed --force  # refetch everything
 *
 * ~42 titles = ~42 OMDb requests, well inside the free 1,000/day.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CURATED, TRENDING_ORDER } from "../src/lib/catalog/curated";
import { fetchOmdbTitle } from "../src/lib/catalog/omdb";

const WEEK_MS = 7 * 24 * 3_600_000;

/** OMDb sometimes points at posters Amazon has since removed (404). Those become null, and the card shows its title panel. */
async function livePoster(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    return response.ok ? url : null;
  } catch {
    return url; // a network blip is not proof the poster is gone
  }
}

async function main() {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) throw new Error("Set OMDB_API_KEY in .env (free key: https://www.omdbapi.com/apikey.aspx)");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: process.env.DATABASE_SCHEMA ?? "storefront" }),
  });
  const force = process.argv.includes("--force");
  const currentYear = new Date().getFullYear();
  let fetched = 0;
  let skipped = 0;
  const failed: string[] = [];

  try {
    const existing = new Map(
      (await prisma.movie.findMany({ select: { id: true, omdbFetchedAt: true, posterUrl: true } })).map((movie) => [movie.id, movie]),
    );

    for (const curated of CURATED) {
      const rank = TRENDING_ORDER.indexOf(curated.id);
      const listing = {
        imdbId: curated.imdbId,
        priceKes: curated.priceKes,
        featured: curated.featured ?? false,
        trendingRank: rank === -1 ? null : rank + 1,
      };

      const cached = existing.get(curated.id);
      if (!force && cached?.omdbFetchedAt && Date.now() - cached.omdbFetchedAt.getTime() < WEEK_MS) {
        const posterUrl = await livePoster(cached.posterUrl);
        if (cached.posterUrl && !posterUrl) console.log(`  poster gone: ${curated.id}`);
        await prisma.movie.update({ where: { id: curated.id }, data: { ...listing, posterUrl } });
        skipped++;
        continue;
      }

      try {
        const omdb = await fetchOmdbTitle(curated.imdbId, apiKey);
        const data = {
          ...listing,
          title: omdb.title,
          year: omdb.year,
          genres: omdb.genres,
          languages: omdb.languages,
          countries: omdb.countries,
          plot: omdb.plot,
          director: omdb.director,
          actors: omdb.actors,
          runtimeMin: omdb.runtimeMin,
          rated: omdb.rated,
          imdbRating: omdb.imdbRating,
          posterUrl: await livePoster(omdb.posterUrl),
          isNewRelease: omdb.year !== null && omdb.year >= currentYear - 2,
          omdbFetchedAt: new Date(),
        };
        await prisma.movie.upsert({ where: { id: curated.id }, create: { id: curated.id, ...data }, update: data });
        fetched++;
        console.log(`✓ ${omdb.title} (${omdb.year ?? "?"}) — ${omdb.genres.join(", ")}${data.posterUrl ? "" : " · no poster"}`);
      } catch (error) {
        failed.push(`${curated.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nFetched ${fetched}, kept ${skipped} cached, ${failed.length} failed.`);
  for (const line of failed) console.log(`  ✗ ${line}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
