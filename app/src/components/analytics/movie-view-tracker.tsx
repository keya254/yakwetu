"use client";

import { useEffect } from "react";
import { track } from "@/lib/events/client";

interface MovieViewTrackerProps {
  movieId: string;
  title: string;
  priceKes: number;
  genres: string[];
}

/**
 * movie.viewed when a film page opens, movie.left when the viewer leaves it,
 * with the time the page was actually visible (a background tab isn't
 * interest). The recommender turns both into signals.
 */
export function MovieViewTracker({ movieId, title, priceKes, genres }: MovieViewTrackerProps) {
  // A refresh hands down a new genres array; key on its contents so it doesn't count as a new view.
  const genresKey = genres.join(",");

  useEffect(() => {
    // Deferred a tick: React's development double-mount unmounts before it fires,
    // so it neither counts twice nor sends a 0 ms movie.left.
    let viewed = false;
    const timer = setTimeout(() => {
      viewed = true;
      track("movie.viewed", { movieId, title, priceKes, genres: genresKey ? genresKey.split(",") : [] });
    }, 0);

    let visibleMs = 0;
    let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    let left = false;

    const pause = () => {
      if (visibleSince !== null) visibleMs += performance.now() - visibleSince;
      visibleSince = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") visibleSince = performance.now();
      else pause();
    };
    const leave = () => {
      clearTimeout(timer);
      if (left || !viewed) return;
      left = true;
      pause();
      track("movie.left", { movieId, dwellMs: Math.round(visibleMs) }, { urgent: true });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      leave(); // navigating to another page inside the app
    };
  }, [movieId, title, priceKes, genresKey]);

  return null;
}
