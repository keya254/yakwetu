import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MovieRow } from "@/components/movie/movie-row";
import { Poster } from "@/components/movie/poster";
import { TrendingRow } from "@/components/movie/trending-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getMadeInKenya, getMovie, getNewReleases, getTrending } from "@/lib/catalog/queries";
import { formatKes, formatRuntime, genreLabel } from "@/lib/format";

export default async function LandingPage() {
  const [session, trending, kenya, fresh] = await Promise.all([getSession(), getTrending(10), getMadeInKenya(), getNewReleases()]);
  const lead = trending[0] ? await getMovie(trending[0].id) : null;
  const signedIn = Boolean(session);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero: the pitch on the left, this week's #1 on the right. */}
        <section className="relative isolate overflow-hidden border-b border-border">
          {lead?.posterUrl && (
            <Image
              src={lead.posterUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="-z-10 scale-110 object-cover opacity-[0.14] blur-3xl"
            />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-background/60 to-background" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
            <div className="max-w-xl">
              <p className="text-sm font-medium text-primary">Kenyan & pan-African cinema</p>
              <h1 className="mt-4 text-5xl leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl">
                Our stories.
                <br />
                Pay per title.
              </h1>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
                Films from Nairobi to Lagos, from {formatKes(49)}. No subscription — buy the film you want and watch it
                tonight.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="active:scale-[0.97]">
                  <Link href={signedIn ? "/browse" : "/sign-up"}>
                    {signedIn ? "Go to your films" : "Join free"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <a href="#trending">See what’s trending</a>
                </Button>
              </div>
            </div>

            {lead && (
              <Link
                href={`/movie/${lead.id}`}
                className="group/lead mx-auto flex w-full max-w-sm items-end gap-5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring lg:ml-auto"
              >
                <Poster
                  title={lead.title}
                  posterUrl={lead.posterUrl}
                  year={lead.year}
                  priority
                  sizes="220px"
                  className="w-44 shrink-0 rounded-lg ring-1 ring-foreground/10 transition-[box-shadow] duration-150 group-hover/lead:ring-foreground/30 sm:w-52"
                />
                <div className="min-w-0 pb-1">
                  <p className="text-xs font-medium tracking-wide text-primary uppercase">#1 this week</p>
                  <p className="font-heading mt-2 text-2xl leading-tight font-bold tracking-tight">{lead.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {[lead.year, lead.genres[0] && genreLabel(lead.genres[0]), formatRuntime(lead.runtimeMin)].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-3 text-sm font-medium tabular-nums">{formatKes(lead.priceKes)}</p>
                </div>
              </Link>
            )}
          </div>
        </section>

        <div className="space-y-14 py-14">
          <TrendingRow movies={trending} />
          <MovieRow title="Made in Kenya" description="From Nairobi's streets to the shores of Lake Victoria." movies={kenya} />
          <MovieRow title="New releases" description="Just landed on Yakwetu." movies={fresh} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
