import type { ReactNode } from "react";
import { MovieCard } from "@/components/movie/movie-card";
import type { MovieCardData } from "@/lib/catalog/queries";

interface MovieRowProps {
  title: string;
  description?: string;
  movies: MovieCardData[];
  action?: ReactNode;
  id?: string;
}

/** A titled, horizontally scrolling row. The cut-off last card signals there is more. */
export function MovieRow({ title, description, movies, action, id }: MovieRowProps) {
  if (movies.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="no-scrollbar mt-4 overflow-x-auto">
        <ul className="mx-auto flex max-w-7xl snap-x gap-4 px-4 pb-2 sm:px-6 lg:px-8">
          {movies.map((movie) => (
            <li key={movie.id} className="w-38 shrink-0 snap-start sm:w-46">
              <MovieCard movie={movie} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
