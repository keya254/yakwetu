import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const cardSelect = {
  id: true,
  title: true,
  year: true,
  genres: true,
  runtimeMin: true,
  priceKes: true,
  posterUrl: true,
  isNewRelease: true,
  imdbRating: true,
} satisfies Prisma.MovieSelect;

export type MovieCardData = Prisma.MovieGetPayload<{ select: typeof cardSelect }>;

export async function getTrending(limit = 10): Promise<MovieCardData[]> {
  return prisma.movie.findMany({
    where: { trendingRank: { not: null } },
    orderBy: { trendingRank: "asc" },
    take: limit,
    select: cardSelect,
  });
}

export async function getMadeInKenya(limit = 14): Promise<MovieCardData[]> {
  return prisma.movie.findMany({
    where: { featured: true },
    orderBy: [{ isNewRelease: "desc" }, { year: "desc" }],
    take: limit,
    select: cardSelect,
  });
}

export async function getByGenre(genre: string, limit = 14): Promise<MovieCardData[]> {
  return prisma.movie.findMany({
    where: { genres: { has: genre } },
    orderBy: [{ imdbRating: { sort: "desc", nulls: "last" } }, { year: "desc" }],
    take: limit,
    select: cardSelect,
  });
}

export async function getNewReleases(limit = 14): Promise<MovieCardData[]> {
  return prisma.movie.findMany({
    where: { isNewRelease: true },
    orderBy: { year: "desc" },
    take: limit,
    select: cardSelect,
  });
}

/** Posters for decorative walls (auth pages). */
export async function getPosterWall(limit = 12): Promise<{ id: string; title: string; posterUrl: string }[]> {
  const rows = await prisma.movie.findMany({
    where: { posterUrl: { not: null } },
    orderBy: [{ trendingRank: { sort: "asc", nulls: "last" } }, { year: "desc" }],
    take: limit,
    select: { id: true, title: true, posterUrl: true },
  });
  return rows.map((row) => ({ ...row, posterUrl: row.posterUrl! }));
}

/** One title, deduplicated per request (generateMetadata and the page both ask). */
export const getMovie = cache(async (id: string) => prisma.movie.findUnique({ where: { id } }));

/** Titles sharing a genre with this one, for "More like this" until the recommender is wired in. */
export async function getSimilar(id: string, genres: string[], limit = 8): Promise<MovieCardData[]> {
  if (genres.length === 0) return [];
  return prisma.movie.findMany({
    where: { id: { not: id }, genres: { hasSome: genres } },
    orderBy: [{ trendingRank: { sort: "asc", nulls: "last" } }, { imdbRating: { sort: "desc", nulls: "last" } }],
    take: limit,
    select: cardSelect,
  });
}

/** Cards for these ids, in the given order. Ids the catalog doesn't know are skipped. */
export async function getMoviesByIds(ids: string[]): Promise<MovieCardData[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.movie.findMany({ where: { id: { in: ids } }, select: cardSelect });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
