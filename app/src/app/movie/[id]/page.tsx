import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { MovieRow } from "@/components/movie/movie-row";
import { Poster } from "@/components/movie/poster";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { getMovie } from "@/lib/catalog/queries";
import { getMoreLikeThis } from "@/lib/catalog/recommended";
import { formatKes, formatRuntime, genreLabel } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/movie/[id]">): Promise<Metadata> {
  const movie = await getMovie((await params).id);
  return { title: movie?.title ?? "Film not found" };
}

export default async function MoviePage({ params }: PageProps<"/movie/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/movie/${id}`);
  const movie = await getMovie(id);
  if (!movie) notFound();
  const similar = await getMoreLikeThis(session.user.id, movie);

  const facts = [movie.year, formatRuntime(movie.runtimeMin), movie.rated].filter(Boolean);
  const genres = movie.genres.filter((genre) => genre !== "short");

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-16">
        <section className="relative isolate overflow-hidden border-b border-border">
          {movie.posterUrl && (
            <Image src={movie.posterUrl} alt="" fill priority sizes="100vw" className="-z-10 scale-110 object-cover opacity-20 blur-3xl" />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[260px_1fr] lg:px-8 lg:py-16">
            <Poster title={movie.title} posterUrl={movie.posterUrl} year={movie.year} priority sizes="260px" className="w-52 rounded-lg ring-1 ring-foreground/10 md:w-full" />
            <div className="max-w-2xl">
              <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
              <h1 className="mt-2 text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-5xl">{movie.title}</h1>
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

              <p className="mt-6 text-2xl font-bold text-primary tabular-nums">{formatKes(movie.priceKes)}</p>
              <p className="text-sm text-muted-foreground">One payment. Yours to watch, no subscription.</p>

              {movie.plot && <p className="mt-8 max-w-[65ch] leading-relaxed text-foreground/90">{movie.plot}</p>}

              <dl className="mt-8 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {movie.director && <Fact label="Director" value={movie.director} />}
                {movie.actors.length > 0 && <Fact label="Starring" value={movie.actors.join(", ")} />}
                {movie.languages.length > 0 && <Fact label="Language" value={movie.languages.join(", ")} />}
                {movie.countries.length > 0 && <Fact label="Country" value={movie.countries.join(", ")} />}
              </dl>
            </div>
          </div>
        </section>

        <div className="mt-12">
          <MovieRow title="More like this" movies={similar.movies} />
        </div>
      </main>
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
