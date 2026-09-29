/**
 * What the VideoBox reports about playback. One place to send it from, so
 * wiring PostHog (behaviour) and the RabbitMQ publisher (watch_completed for
 * Scenario C) later means changing `trackVideo` only, not the player.
 *
 * For now each event is dispatched on `window` as a "yakwetu:video"
 * CustomEvent and logged in development.
 */

export type VideoEventName =
  | "video_play_clicked"
  | "video_auth_prompted"
  | "video_started"
  | "video_paused"
  | "video_resumed"
  | "video_seeked"
  | "video_progress"
  | "video_completed"
  | "video_error";

export interface VideoEvent {
  name: VideoEventName;
  movieId: string;
  videoId: string;
  /** Where the playhead is, in seconds. */
  positionSec: number;
  durationSec: number;
  /** Seconds actually played, not scrubbed past: what separates a watch from a skim. */
  watchedSec: number;
  /** video_progress only: the milestone reached (25, 50, 75, 90). */
  percent?: number;
  signedIn: boolean;
  /** video_error only: YouTube's error code. */
  errorCode?: number;
  occurredAt: string;
}

export function trackVideo(event: Omit<VideoEvent, "occurredAt">): void {
  const full: VideoEvent = { ...event, occurredAt: new Date().toISOString() };
  if (process.env.NODE_ENV === "development") console.debug("[video]", full.name, full);
  window.dispatchEvent(new CustomEvent<VideoEvent>("yakwetu:video", { detail: full }));
}
