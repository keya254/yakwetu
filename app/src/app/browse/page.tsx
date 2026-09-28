import type { Metadata } from "next";
import { MovieRow } from "@/components/movie/movie-row";
import { TrendingRow } from "@/components/movie/trending-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth";
import { getByGenre, getMadeInKenya, getNewReleases, getTrending } from "@/lib/catalog/queries";
import { firstName } from "@/lib/format";

export const metadata: Metadata = { title: "Browse" };

export default async function BrowsePage() {
  const session = await requireSession("/browse");
  const [trending, kenya, fresh, drama, thriller, comedy] = await Promise.all([
    getTrending(10),
    getMadeInKenya(),
    getNewReleases(),
    getByGenre("drama"),
    getByGenre("thriller"),
    getByGenre("comedy"),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-2 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Karibu, {firstName(session.user.name)}.</h1>
          <p className="mt-2 text-muted-foreground">Pick a film. Pay once, it’s yours to watch.</p>
        </div>
        <div className="mt-8 space-y-12">
          <TrendingRow movies={trending} />
          <MovieRow title="Made in Kenya" movies={kenya} />
          <MovieRow title="New releases" movies={fresh} />
          <MovieRow title="Drama" movies={drama} />
          <MovieRow title="Thrillers" movies={thriller} />
          <MovieRow title="Comedy" movies={comedy} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
