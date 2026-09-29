import { track } from "@/lib/events/client";

/**
 * What the VideoBox reports about playback. The player calls `trackVideo`
 * only; this sends it through the event pipeline (relay → outbox →
 * RabbitMQ yakwetu.activity → PostHog and the recommender).
 */

export type VideoEventName =
  | "video.play_clicked"
  | "video.auth_prompted"
  | "video.started"
  | "video.paused"
  | "video.resumed"
  | "video.seeked"
  | "video.progress"
  | "video.completed"
  | "video.error";

export interface VideoEvent {
  name: VideoEventName;
  /** trailer: anyone, on the film page. film: an owner on /watch (feeds taste and Scenario C). */
  mode?: "trailer" | "film";
  movieId: string;
  videoId: string;
  /** Where the playhead is, in seconds. */
  positionSec: number;
  durationSec: number;
  /** Seconds actually played, not scrubbed past: what separates a watch from a skim. */
  watchedSec: number;
  /** video.progress only: the milestone reached (25, 50, 75, 90). */
  percent?: number;
  signedIn: boolean;
  /** video.error only: YouTube's error code. */
  errorCode?: number;
}

export function trackVideo({ name, mode = "trailer", ...properties }: VideoEvent): void {
  if (process.env.NODE_ENV === "development") console.debug("[video]", mode, name, properties);
  if (mode === "trailer") return track(name, properties);

  // Watching the film itself: started and milestones become watch.* (the recommender's
  // watch signals); finishing goes to the server, which checks it and emits watch.completed.
  if (name === "video.started") return track("watch.started", properties);
  if (name === "video.progress") {
    return track("watch.progress", { ...properties, progress: (properties.percent ?? 0) / 100, watchedMs: Math.round(properties.watchedSec * 1000) });
  }
  if (name === "video.completed") {
    void fetch("/api/watch/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ movieId: properties.movieId, watchedSec: properties.watchedSec, durationSec: properties.durationSec }),
      keepalive: true,
    }).catch(() => undefined);
    return;
  }
  track(name, { ...properties, mode });
}
