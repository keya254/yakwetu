import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MovieRow } from "@/components/movie/movie-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VideoBox } from "@/components/video/video-box";
import { getSession } from "@/lib/auth";
import { getMovie, getMoviesByIds } from "@/lib/catalog/queries";
import { formatRuntime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getRecommendations } from "@/lib/recs";

export async function generateMetadata({ params }: PageProps<"/watch/[id]">): Promise<Metadata> {
  const movie = await getMovie((await params).id);
  return { title: movie ? `Watching ${movie.title}` : "Watch" };
}

/**
 * Where owners watch. Not the trailer page: the player is in film mode, so
 * progress feeds the recommender's watch signals and a genuine finish
 * (server-checked) triggers the post-watch upsell. Below it, what to watch next,
 * from the recommender's `next` mode anchored on this film.
 */
export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/watch/${id}`)}`);

  const movie = await getMovie(id);
  if (!movie) notFound();
  const entitlement = await prisma.entitlement.findUnique({ where: { userId_movieId: { userId: session.user.id, movieId: movie.id } } });
  if (!entitlement) redirect(`/movie/${movie.id}`);
  await prisma.entitlement.update({ where: { userId_movieId: { userId: session.user.id, movieId: movie.id } }, data: { lastWatchedAt: new Date() } });

  const next = await getRecommendations(session.user.id, { mode: "next", anchor: movie.id, exclude: [movie.id], limit: 10 });
  const nextMovies = next ? await getMoviesByIds(next.picks.map((pick) => pick.movieId)) : [];

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
          <Link href={`/movie/${movie.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> {movie.title}
          </Link>
          <div className="mt-4">
            {movie.youtubeId ? (
              <VideoBox movieId={movie.id} videoId={movie.youtubeId} title={movie.title} signedIn mode="film" />
            ) : (
              <p className="rounded-xl bg-muted p-10 text-center text-muted-foreground">This film isn&rsquo;t available to stream yet.</p>
            )}
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{movie.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{[movie.year, formatRuntime(movie.runtimeMin), movie.director].filter(Boolean).join(" · ")}</p>
        </div>
        {nextMovies.length > 0 && (
          <div className="mt-12">
            <MovieRow title={`Because you watched ${movie.title}`} movies={nextMovies} />
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
