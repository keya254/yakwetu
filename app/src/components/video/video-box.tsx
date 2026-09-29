"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Loader2, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { cn } from "@/lib/utils";
import { trackVideo, type VideoEventName } from "@/lib/video/events";
import { describeYouTubeError, loadYouTubeApi, PlayerState, type YTPlayer } from "@/lib/video/youtube";

interface VideoBoxProps {
  movieId: string;
  videoId: string;
  title: string;
  signedIn: boolean;
  className?: string;
}

type Phase = "idle" | "loading" | "playing" | "buffering" | "paused" | "ended" | "error";

const MILESTONES = [25, 50, 75, 90];
const HIDE_CONTROLS_MS = 2500;
/** How long a play request gets before we treat it as blocked by the browser's autoplay rules. */
const AUTOPLAY_GRACE_MS = 1500;

/**
 * Our own player around a YouTube video: YouTube's controls, title bar and
 * end-screen suggestions are hidden, and the box draws its own. That keeps the
 * viewer on the film instead of on YouTube, and puts every play, pause, seek
 * and milestone through one place (`trackVideo`) we can capture later.
 *
 * Signed-out viewers get the sign-up dialog when they press play; once in,
 * the video starts without a second press.
 *
 * Edge cases handled on purpose:
 * - Autoplay with sound blocked (mobile, iOS low-power): retry muted with a
 *   "Tap for sound" chip; if even that is refused, let taps reach YouTube's
 *   own frame, which always may start playback.
 * - iPhone Safari has no element fullscreen: fall back to a fixed full-window
 *   player.
 * - Embedding refused, video removed, API script blocked: say so, with a
 *   link to YouTube and a retry.
 * - Watched time counts only played seconds, so scrubbing to the end isn't a
 *   "completed" watch.
 */
export function VideoBox({ movieId, videoId, title, signedIn, className }: VideoBoxProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [windowFullscreen, setWindowFullscreen] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [needsDirectTap, setNeedsDirectTap] = useState(false);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [signedInHere, setSignedInHere] = useState(false);
  const [thumb, setThumb] = useState<"maxresdefault" | "hqdefault">("maxresdefault");

  const authed = signedIn || signedInHere;
  const fullscreen = nativeFullscreen || windowFullscreen;
  const active = phase === "playing" || phase === "buffering";

  // Playback bookkeeping that must not re-render: read by the ticker and the event callbacks.
  const session = useRef({ started: false, wasPaused: false, watched: 0, lastPos: 0, milestones: new Set<number>() });
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const authedRef = useRef(authed);
  useEffect(() => {
    authedRef.current = authed;
  }, [authed]);

  const emit = useCallback(
    (name: VideoEventName, extra: { percent?: number; errorCode?: number; positionSec?: number } = {}) => {
      const player = playerRef.current;
      trackVideo({
        name,
        movieId,
        videoId,
        durationSec: round(player?.getDuration?.() ?? 0),
        watchedSec: round(session.current.watched),
        signedIn: authedRef.current,
        ...extra,
        // A seek reports where it landed; the player only catches up a moment later.
        positionSec: round(extra.positionSec ?? player?.getCurrentTime?.() ?? 0),
      });
    },
    [movieId, videoId],
  );

  // ── Controls visibility ────────────────────────────────────────────────
  // Paused or loading, the controls always show (see showControls); playing, they hide after a still moment.
  const poke = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_MS);
  }, []);

  // ── Ticker: playhead, buffer, watched time, milestones ─────────────────
  useEffect(() => {
    if (phase === "idle" || phase === "error") return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      const pos = player.getCurrentTime();
      const total = player.getDuration();
      const s = session.current;
      if (player.getPlayerState() === PlayerState.PLAYING) {
        const step = pos - s.lastPos;
        // Normal playback moves < 1.5 s between ticks, even at 2×; bigger jumps are seeks.
        if (step > 0 && step < 1.5) s.watched += step;
        if (total > 0) {
          for (const milestone of MILESTONES) {
            if (!s.milestones.has(milestone) && (pos / total) * 100 >= milestone) {
              s.milestones.add(milestone);
              emit("video_progress", { percent: milestone });
            }
          }
        }
      }
      s.lastPos = pos;
      setPosition(pos);
      if (total > 0) setDuration(total);
      setBuffered(player.getVideoLoadedFraction());
    }, 250);
    return () => clearInterval(id);
  }, [phase, emit]);

  // ── Player lifecycle ───────────────────────────────────────────────────
  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      playerRef.current?.destroy();
      playerRef.current = null;
      document.body.style.removeProperty("overflow");
    },
    [],
  );

  const exitFullscreen = useCallback(() => {
    if (fullscreenElement()) void exitNativeFullscreen();
    setWindowFullscreen(false);
    document.body.style.removeProperty("overflow");
  }, []);

  const start = useCallback(async () => {
    const existing = playerRef.current;
    if (existing) {
      existing.playVideo();
      return;
    }
    setError(null);
    setPhase("loading");

    let YT;
    try {
      YT = await loadYouTubeApi();
    } catch {
      setPhase("error");
      setError({ message: "We couldn't load the player. Check your connection (or ad blocker) and try again.", retry: true });
      return;
    }
    if (!mountRef.current) return;

    // YouTube replaces this element with its iframe, so it's made here rather
    // than by React, which would otherwise fight it for the node.
    const target = document.createElement("div");
    mountRef.current.replaceChildren(target);

    let autoplayCheck: ReturnType<typeof setTimeout> | undefined;
    playerRef.current = new YT.Player(target, {
      host: "https://www.youtube-nocookie.com",
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1, // our own keys, below
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1, // iPhone: play in the box, not in iOS's own player
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: ({ target: player }) => {
          setDuration(player.getDuration());
          setVolume(player.getVolume());
          setMuted(player.isMuted());
          player.playVideo();
          // Browsers may refuse sound without a gesture inside the frame. Try muted, then hand taps to YouTube.
          autoplayCheck = setTimeout(() => {
            if (isRunning(player)) return;
            player.mute();
            setMuted(true);
            setSoundBlocked(true);
            player.playVideo();
            autoplayCheck = setTimeout(() => {
              if (isRunning(player)) return;
              setNeedsDirectTap(true);
              setPhase("paused");
            }, AUTOPLAY_GRACE_MS);
          }, AUTOPLAY_GRACE_MS);
        },
        onStateChange: ({ data }) => {
          const s = session.current;
          if (data === PlayerState.PLAYING) {
            clearTimeout(autoplayCheck);
            setNeedsDirectTap(false);
            setPhase("playing");
            poke();
            if (!s.started) {
              s.started = true;
              emit("video_started");
            } else if (s.wasPaused) {
              emit("video_resumed");
            }
            s.wasPaused = false;
          } else if (data === PlayerState.BUFFERING) {
            setPhase((current) => (current === "loading" ? current : "buffering"));
          } else if (data === PlayerState.PAUSED) {
            setPhase("paused");
            if (s.started) {
              s.wasPaused = true;
              emit("video_paused");
            }
          } else if (data === PlayerState.ENDED) {
            setPhase("ended");
            emit("video_completed");
            exitFullscreen();
          }
        },
        onError: ({ data }) => {
          clearTimeout(autoplayCheck);
          setPhase("error");
          setError({ message: describeYouTubeError(data), retry: false });
          emit("video_error", { errorCode: data });
        },
      },
    });
  }, [videoId, emit, exitFullscreen, poke]);

  function onPlayPressed() {
    emit("video_play_clicked");
    if (!authed) {
      emit("video_auth_prompted");
      setAuthOpen(true);
      return;
    }
    start();
  }

  function onSignedIn() {
    setSignedInHere(true);
    setAuthOpen(false);
    router.refresh(); // header and rows catch up; this box keeps its state
    start();
  }

  function retry() {
    playerRef.current?.destroy();
    playerRef.current = null;
    start();
  }

  function replay() {
    const player = playerRef.current;
    if (!player) return;
    session.current = { started: false, wasPaused: false, watched: 0, lastPos: 0, milestones: new Set() };
    player.seekTo(0, true);
    player.playVideo();
  }

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return onPlayPressed();
    if (phase === "ended") return replay();
    if (active) player.pauseVideo();
    else player.playVideo();
  }

  function seekTo(seconds: number) {
    const player = playerRef.current;
    if (!player || !duration) return;
    const to = Math.min(Math.max(seconds, 0), duration - 0.25);
    player.seekTo(to, true);
    session.current.lastPos = to; // a jump, not watching
    setPosition(to);
    emit("video_seeked", { positionSec: to });
  }

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) {
      player.unMute();
      if (player.getVolume() === 0) player.setVolume(50);
      setVolume(player.getVolume());
      setMuted(false);
      setSoundBlocked(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }

  function changeVolume(value: number) {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(value);
    setVolume(value);
    if (value > 0 && player.isMuted()) {
      player.unMute();
      setMuted(false);
      setSoundBlocked(false);
    }
    if (value === 0) {
      player.mute();
      setMuted(true);
    }
  }

  // ── Fullscreen ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => setNativeFullscreen(fullscreenElement() === containerRef.current && containerRef.current !== null);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  async function toggleFullscreen() {
    if (fullscreen) return exitFullscreen();
    const element = containerRef.current as FullscreenElement | null;
    if (!element) return;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(element);
        // Phones: turn the film sideways where the browser allows it.
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {});
        return;
      } catch {
        // fall through to the in-page version
      }
    }
    setWindowFullscreen(true);
    document.body.style.overflow = "hidden";
  }

  // ── Input ──────────────────────────────────────────────────────────────
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (authOpen || event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case " ":
      case "k":
        togglePlay();
        break;
      case "f":
        void toggleFullscreen();
        break;
      case "m":
        toggleMute();
        break;
      case "ArrowLeft":
        seekTo(position - 5);
        break;
      case "ArrowRight":
        seekTo(position + 5);
        break;
      case "Escape":
        if (windowFullscreen) exitFullscreen();
        else return;
        break;
      default:
        return;
    }
    event.preventDefault();
    poke();
  }

  function onSurfacePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    // Touch: first tap shows the controls; the centre button plays and pauses.
    if (event.pointerType === "touch" && active && !controlsVisible) return poke();
    togglePlay();
    poke();
  }

  const showControls = phase !== "idle" && phase !== "error" && phase !== "ended" && (controlsVisible || !active);

  return (
    <div
      ref={containerRef}
      tabIndex={phase === "idle" ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => event.pointerType === "mouse" && active && poke()}
      className={cn(
        "group/video relative overflow-hidden bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
        fullscreen ? "flex items-center justify-center" : "rounded-xl ring-1 ring-foreground/10",
        windowFullscreen && "fixed inset-0 z-[100] rounded-none",
        active && !controlsVisible && "cursor-none",
        className,
      )}
    >
      <div className={cn("relative aspect-video", fullscreen ? "w-[min(100vw,177.78dvh)]" : "w-full")}>
        {/* The YouTube frame. Taps never reach it (so YouTube's own overlays stay shut) unless autoplay needs them. */}
        <div ref={mountRef} className={cn("absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full", !needsDirectTap && "[&_iframe]:pointer-events-none")} />

        {/* Interaction surface over the frame. */}
        {phase !== "idle" && phase !== "error" && phase !== "ended" && !needsDirectTap && (
          <div className="absolute inset-0" onPointerUp={onSurfacePointerUp} onDoubleClick={() => void toggleFullscreen()} />
        )}

        {/* Cover: before the first play and after the end. */}
        {(phase === "idle" || phase === "ended" || phase === "error") && (
          <div className="absolute inset-0">
            <Image
              src={`https://i.ytimg.com/vi/${videoId}/${thumb}.jpg`}
              alt=""
              fill
              loading="eager"
              sizes="(min-width: 1024px) 672px, 100vw"
              className={cn("object-cover", phase !== "idle" && "opacity-40")}
              onError={() => setThumb("hqdefault")}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          </div>
        )}

        {phase === "idle" && (
          <button
            type="button"
            onClick={onPlayPressed}
            onPointerEnter={() => authed && void loadYouTubeApi().catch(() => {})}
            className="group/play absolute inset-0 flex flex-col items-center justify-center gap-3 text-white outline-none"
            aria-label={authed ? `Play ${title}` : `Sign up to play ${title}`}
          >
            <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 transition-transform duration-150 group-hover/play:scale-105 group-focus-visible/play:ring-4 group-focus-visible/play:ring-primary/50 group-active/play:scale-95 sm:size-20">
              <Play className="ml-1 size-7 fill-current sm:size-8" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-left sm:p-5">
              <span className="min-w-0">
                <span className="block text-xs font-medium tracking-wide text-white/70 uppercase">Trailer</span>
                <span className="block truncate text-base font-semibold sm:text-lg">{title}</span>
              </span>
              {!authed && <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">Free account to watch</span>}
            </span>
          </button>
        )}

        {(phase === "loading" || phase === "buffering") && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-10 animate-spin text-white/90" aria-label="Loading" />
          </div>
        )}

        {needsDirectTap && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
            <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">Tap the video to start</span>
          </div>
        )}

        {soundBlocked && active && (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/85"
          >
            <VolumeX className="size-4" /> Tap for sound
          </button>
        )}

        {phase === "ended" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
            <p className="text-sm text-white/70">That was the trailer for</p>
            <p className="text-xl font-bold sm:text-2xl">{title}</p>
            <button
              type="button"
              onClick={replay}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/25"
            >
              <RotateCcw className="size-4" /> Watch again
            </button>
          </div>
        )}

        {phase === "error" && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <p className="max-w-sm text-sm sm:text-base">{error.message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {error.retry && (
                <button type="button" onClick={retry} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Try again
                </button>
              )}
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/25"
              >
                Watch on YouTube
              </a>
            </div>
          </div>
        )}

        {/* Centre play/pause, for touch (where the surface tap only shows controls) and for clarity when paused. */}
        {showControls && phase !== "loading" && !needsDirectTap && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={active ? "Pause" : "Play"}
            className={cn(
              "absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity duration-150 sm:size-16",
              active && "opacity-0 [@media(hover:none)]:opacity-100",
            )}
          >
            {active ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
          </button>
        )}

        {/* Bottom bar: only once there is a player to control. */}
        {phase !== "idle" && phase !== "error" && phase !== "ended" && (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-200 sm:px-4 sm:pb-3",
              showControls ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <SeekBar position={position} duration={duration} buffered={buffered} onSeek={seekTo} onScrub={poke} />
            <div className="mt-1 flex items-center gap-1 sm:gap-2">
              <ControlButton label={active ? "Pause (k)" : "Play (k)"} onClick={togglePlay}>
                {active ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
              </ControlButton>
              <ControlButton label={muted ? "Unmute (m)" : "Mute (m)"} onClick={toggleMute}>
                {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </ControlButton>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="Volume"
                className="hidden w-20 accent-primary sm:block [@media(hover:none)]:hidden"
              />
              <span className="ml-1 text-xs text-white/85 tabular-nums sm:text-sm">
                {formatTime(position)}
                <span className="text-white/50"> / {formatTime(duration)}</span>
              </span>
              <span className="ml-auto" />
              <ControlButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={() => void toggleFullscreen()}>
                {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </ControlButton>
            </div>
          </div>
        )}
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onSignedIn={onSignedIn} reason={`Create a free account to watch ${title}. It takes a few seconds.`} />
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full text-white/90 transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/** Drag or tap anywhere on the bar; a tall invisible hit area keeps it usable with a thumb. */
function SeekBar({
  position,
  duration,
  buffered,
  onSeek,
  onScrub,
}: {
  position: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
  onScrub: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  // Read by the handlers: pointerdown and pointerup can land before React re-renders.
  const scrubbing = useRef(false);
  const shown = scrub ?? (duration ? position / duration : 0);

  function fractionAt(clientX: number) {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
      onPointerDown={(event) => {
        if (!duration) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId); // keep scrubbing when the finger drifts off the bar
        } catch {
          // no live pointer to capture (synthetic events); scrubbing still works while over the bar
        }
        scrubbing.current = true;
        setScrub(fractionAt(event.clientX));
        onScrub();
      }}
      onPointerMove={(event) => {
        if (!scrubbing.current) return;
        setScrub(fractionAt(event.clientX));
        onScrub();
      }}
      onPointerUp={(event) => {
        if (!scrubbing.current) return;
        scrubbing.current = false;
        onSeek(fractionAt(event.clientX) * duration);
        setScrub(null);
      }}
      onPointerCancel={() => {
        scrubbing.current = false;
        setScrub(null);
      }}
      className="group/seek relative flex h-5 cursor-pointer touch-none items-center focus-visible:outline-none"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 group-hover/seek:h-1.5 group-focus-visible/seek:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${buffered * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${shown * 100}%` }} />
      </div>
      <div
        className={cn(
          "absolute size-3.5 -translate-x-1/2 rounded-full bg-primary shadow transition-transform duration-150",
          scrub === null ? "scale-0 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 [@media(hover:none)]:scale-100" : "scale-110",
        )}
        style={{ left: `${shown * 100}%` }}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
}

function exitNativeFullscreen(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  return (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc) ?? Promise.resolve();
}

function isRunning(player: YTPlayer): boolean {
  const state = player.getPlayerState();
  return state === PlayerState.PLAYING || state === PlayerState.BUFFERING;
}

function round(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
