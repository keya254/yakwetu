import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Poster } from "@/components/movie/poster";
import type { MovieCardData } from "@/lib/catalog/queries";
import { formatKes, genreLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MovieCardProps {
  movie: MovieCardData;
  className?: string;
  priority?: boolean;
  /** Which row it sits in, for movie.clicked (read by EventTracker from the data- attributes). */
  track?: { row: string; position: number };
}

/**
 * Poster first, then just enough to decide: title, year and lead genre, price.
 * Hover only lifts the border — the poster is already doing the work.
 */
export function MovieCard({ movie, className, priority, track }: MovieCardProps) {
  const genre = movie.genres.find((g) => g !== "short") ?? movie.genres[0];
  return (
    <Link
      href={`/movie/${movie.id}`}
      data-track-movie={movie.id}
      data-track-row={track?.row}
      data-track-position={track?.position}
      className={cn("group/movie block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Card className="gap-0 py-0 ring-foreground/8 transition-shadow duration-150 group-hover/movie:ring-foreground/25">
        <div className="relative">
          <Poster title={movie.title} posterUrl={movie.posterUrl} year={movie.year} priority={priority} sizes="(min-width: 640px) 184px, 152px" />
          {movie.isNewRelease && (
            <span className="absolute top-2 left-2 rounded-sm bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-foreground backdrop-blur">
              New
            </span>
          )}
        </div>
        <CardContent className="space-y-1 px-3 pt-2.5 pb-3">
          <p className="truncate text-sm font-medium text-foreground">{movie.title}</p>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              {[movie.year, genre && genreLabel(genre)].filter(Boolean).join(" · ")}
            </span>
            <span className="shrink-0 font-medium text-primary tabular-nums">{formatKes(movie.priceKes)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
