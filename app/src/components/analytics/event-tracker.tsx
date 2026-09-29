"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/events/client";

/**
 * Site-wide capture, mounted once in the root layout:
 * - page.viewed on every navigation (client-side route changes included);
 * - movie.clicked for any element marked data-track-movie (the film cards),
 *   through one delegated listener, so the cards stay server components.
 */
export function EventTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Deferred a tick: React's development double-mount cancels the first one, so a view counts once.
    const timer = setTimeout(() => track("page.viewed", { path: pathname, title: document.title }), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const card = (event.target as Element | null)?.closest<HTMLElement>("[data-track-movie]");
      if (!card) return;
      const { trackMovie, trackRow, trackPosition } = card.dataset;
      track("movie.clicked", {
        movieId: trackMovie,
        row: trackRow,
        position: trackPosition ? Number(trackPosition) : undefined,
        from: window.location.pathname,
      });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
