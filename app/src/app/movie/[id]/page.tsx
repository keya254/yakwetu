import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Play, Star } from "lucide-react";
import { MovieViewTracker } from "@/components/analytics/movie-view-tracker";
import { MobileBuyBar, PurchaseCard } from "@/components/checkout/purchase-card";
import { MovieRow } from "@/components/movie/movie-row";
import { Poster } from "@/components/movie/poster";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { VideoBox } from "@/components/video/video-box";
import { getSession } from "@/lib/auth";
import { getMovie, getSimilar } from "@/lib/catalog/queries";
import { getMoreLikeThis } from "@/lib/catalog/recommended";
import { purchaseState } from "@/lib/purchase";
import { formatRuntime, genreLabel } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/movie/[id]">): Promise<Metadata> {
  const movie = await getMovie((await params).id);
  return { title: movie?.title ?? "Film not found" };
}

export default async function MoviePage({ params }: PageProps<"/movie/[id]">) {
  const { id } = await params;
  // Open to everyone: a shared film link should show the film. Playing it
  // asks a signed-out viewer to sign up (the VideoBox's dialog).
  const [session, movie] = await Promise.all([getSession(), getMovie(id)]);
  if (!movie) notFound();
  const [similar, purchase] = await Promise.all([
    session ? getMoreLikeThis(session.user.id, movie).then((row) => row.movies) : getSimilar(movie.id, movie.genres),
    purchaseState(session?.user.id ?? null, movie.id),
  ]);

  const facts = [movie.year, formatRuntime(movie.runtimeMin), movie.rated].filter(Boolean);
  const genres = movie.genres.filter((genre) => genre !== "short");

  return (
    <>
      <SiteHeader />
      <MovieViewTracker movieId={movie.id} title={movie.title} priceKes={movie.priceKes} genres={movie.genres} />
      <main className="flex-1 pb-28 lg:pb-16">
        <section className="relative isolate overflow-hidden border-b border-border">
          {movie.posterUrl && (
            <Image src={movie.posterUrl} alt="" fill priority sizes="100vw" className="-z-10 scale-110 object-cover opacity-20 blur-3xl" />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
          <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 py-10 sm:px-6 md:grid-cols-[220px_1fr] lg:grid-cols-[240px_1fr_340px] lg:gap-10 lg:px-8 lg:py-14">
            <Poster
              title={movie.title}
              posterUrl={movie.posterUrl}
              year={movie.year}
              priority
              sizes="240px"
              className="hidden rounded-lg ring-1 ring-foreground/10 md:block md:w-full"
            />

            <div className="min-w-0">
              <div className="flex items-end gap-4">
                {/* Phones: a small poster beside the title (the big one shows from md up). */}
                <Poster title={movie.title} posterUrl={movie.posterUrl} year={movie.year} sizes="96px" className="w-24 shrink-0 rounded-md ring-1 ring-foreground/10 md:hidden" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
                  <h1 className="mt-2 text-3xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-5xl">{movie.title}</h1>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {genres.map((genre) => (
                  <Badge key={genre} variant="secondary" className="font-normal">
                    {genreLabel(genre)}
                  </Badge>
                ))}
                {movie.imdbRating && (
                  <span className="ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="size-3.5 fill-primary text-primary" />
                    <span className="tabular-nums">{movie.imdbRating.toFixed(1)}</span> IMDb
                  </span>
                )}
              </div>

              {movie.plot && (
                // Phones: four lines, the rest on tap, so the price isn't pushed off the screen.
                <details className="group mt-6 max-w-[62ch]">
                  <summary className="cursor-pointer list-none leading-relaxed text-foreground/90 [&::-webkit-details-marker]:hidden">
                    <span className="line-clamp-4 group-open:line-clamp-none md:line-clamp-none">{movie.plot}</span>
                    <span className="mt-1 inline-block text-sm text-primary group-open:hidden md:hidden">More</span>
                  </summary>
                </details>
              )}

              <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                {movie.director && <Fact label="Director" value={movie.director} />}
                {movie.actors.length > 0 && <Fact label="Starring" value={movie.actors.join(", ")} />}
                {movie.languages.length > 0 && <Fact label="Language" value={movie.languages.join(", ")} />}
                {movie.countries.length > 0 && <Fact label="Country" value={movie.countries.join(", ")} />}
              </dl>

              {movie.youtubeId && (
                <a href="#trailer" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  <Play className="size-4 fill-current" /> Watch the trailer
                </a>
              )}
            </div>

            {/* The decision box: beside the title on desktop (and sticky), right under it on phones. */}
            <PurchaseCard
              movie={{ id: movie.id, title: movie.title, priceKes: movie.priceKes, runtimeMin: movie.runtimeMin, languages: movie.languages }}
              state={purchase}
              signedIn={Boolean(session)}
              className="md:col-span-2 lg:sticky lg:top-24 lg:col-span-1"
            />
          </div>
        </section>

        {movie.youtubeId && (
          <section id="trailer" className="mx-auto max-w-5xl scroll-mt-24 px-4 pt-12 sm:px-6 lg:px-8">
            <h2 className="mb-4 text-xl font-bold sm:text-2xl">Trailer</h2>
            <VideoBox movieId={movie.id} videoId={movie.youtubeId} title={movie.title} signedIn={Boolean(session)} />
          </section>
        )}

        <div className="mt-14">
          <MovieRow title="More like this" movies={similar} />
        </div>
      </main>
      <MobileBuyBar movie={{ id: movie.id, title: movie.title, priceKes: movie.priceKes, runtimeMin: movie.runtimeMin, languages: movie.languages }} state={purchase} signedIn={Boolean(session)} />
      <SiteFooter />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
