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
  /** trailer today; "film" is reserved for owners watching the film itself (planned). */
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
  track(name, { ...properties, mode });
}
