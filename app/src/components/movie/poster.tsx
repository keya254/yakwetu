import Image from "next/image";
import { cn } from "@/lib/utils";

interface PosterProps {
  title: string;
  posterUrl: string | null;
  year?: number | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/** A stable warm hue per title (amber through terracotta to plum), so fallbacks differ but stay on palette. */
function hueFor(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 15 + (hash % 60);
}

/**
 * A 2:3 poster. OMDb has no image for some African titles (or links to one
 * Amazon has removed), so the fallback is a typographic poster rather than
 * an empty box: the title set large in the display face on a warm panel.
 */
export function Poster({ title, posterUrl, year, className, sizes = "180px", priority = false }: PosterProps) {
  if (posterUrl) {
    return (
      <div className={cn("relative aspect-2/3 overflow-hidden bg-muted", className)}>
        <Image src={posterUrl} alt={`${title} poster`} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }

  const hue = hueFor(title);
  return (
    <div
      className={cn("@container relative flex aspect-2/3 flex-col justify-between overflow-hidden p-[8%]", className)}
      style={{
        background: `linear-gradient(160deg, oklch(0.42 0.09 ${hue}) 0%, oklch(0.26 0.05 ${hue}) 55%, oklch(0.19 0.02 ${hue}) 100%)`,
      }}
      role="img"
      aria-label={`${title} poster`}
    >
      <span className="text-[max(9px,6cqw)] font-medium tracking-[0.2em] text-foreground/60 uppercase">Yakwetu</span>
      <div>
        <span className="font-heading block text-[13cqw] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance text-foreground">
          {title}
        </span>
        {year && <span className="mt-[4%] block text-[max(10px,7cqw)] text-foreground/60 tabular-nums">{year}</span>}
      </div>
    </div>
  );
}
