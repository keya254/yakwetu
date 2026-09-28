import Link from "next/link";
import { Poster } from "@/components/movie/poster";
import type { MovieCardData } from "@/lib/catalog/queries";
import { formatKes } from "@/lib/format";

/**
 * The top ten, ranked. A big outlined numeral sits behind each poster: the
 * rank is the point of this row, so it gets the size.
 */
export function TrendingRow({ movies, title = "Trending this week" }: { movies: MovieCardData[]; title?: string }) {
  if (movies.length === 0) return null;
  return (
    <section id="trending" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">What viewers are buying right now.</p>
      </div>
      <div className="no-scrollbar mt-4 overflow-x-auto">
        <ol className="mx-auto flex max-w-7xl snap-x gap-2 px-4 pb-2 sm:px-6 lg:px-8">
          {movies.map((movie, index) => (
            <li key={movie.id} className="flex shrink-0 snap-start items-end">
              <span
                aria-hidden
                className="font-heading -mr-2 text-[7.5rem] leading-[0.8] font-extrabold tracking-tighter text-background select-none sm:text-[9rem]"
                style={{ WebkitTextStroke: "2px oklch(0.95 0.012 80 / 22%)" }}
              >
                {index + 1}
              </span>
              <Link
                href={`/movie/${movie.id}`}
                className="group/trend relative block w-32 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-36"
              >
                <Poster
                  title={movie.title}
                  posterUrl={movie.posterUrl}
                  year={movie.year}
                  priority={index < 4}
                  sizes="144px"
                  className="rounded-md ring-1 ring-foreground/10 transition-[box-shadow] duration-150 group-hover/trend:ring-foreground/30"
                />
                <span className="sr-only">
                  {index + 1}. {movie.title}, {formatKes(movie.priceKes)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
