"use client";

import type { BrowserEventType } from "@/lib/events/catalog";

/**
 * Browser side of event capture. `track()` never blocks the UI and never
 * throws; events are batched to /api/events (our own domain, so ad blockers
 * leave it alone).
 *
 * Nothing is dropped on a bad connection: the queue lives in localStorage
 * until the relay answers 202, so events recorded offline, or while the
 * server is down, go out on the next flush or the next visit. When the tab
 * is hidden or closed, what's left goes by sendBeacon, which the browser
 * delivers even as the page unloads. Every event has its own uuid, so a
 * batch that is sent twice is stored once.
 */

interface QueuedEvent {
  id: string;
  type: BrowserEventType;
  occurredAt: string;
  path: string;
  referrer: string;
  properties: Record<string, unknown>;
}

const ENDPOINT = "/api/events";
const STORAGE_KEY = "ykw_event_queue";
const SESSION_KEY = "ykw_session_id";
const BATCH = 50;
const MAX_QUEUED = 500;
const FLUSH_DELAY_MS = 1_000;

let queue: QueuedEvent[] | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let failures = 0;
let listening = false;

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Non-secure contexts (http on a LAN address) lack randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UUIDv7 (time-ordered): the only session id format PostHog accepts for its session analytics. */
function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode or blocked site data: the queue lives in memory only
  }
}

function load(): QueuedEvent[] {
  if (queue) return queue;
  try {
    const saved = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "[]") as unknown;
    queue = Array.isArray(saved) ? (saved as QueuedEvent[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function persist(): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    // full or blocked: keep going in memory
  }
}

function sessionId(): string | undefined {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    // A session from before the switch to v7 gets a fresh id.
    if (!id || id[14] !== "7") {
      id = uuidv7();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

function remove(sent: QueuedEvent[]): void {
  const ids = new Set(sent.map((event) => event.id));
  queue = load().filter((event) => !ids.has(event.id));
  persist();
}

function schedule(delay = FLUSH_DELAY_MS): void {
  clearTimeout(timer);
  timer = setTimeout(() => void flushEvents(), delay);
}

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const leave = () => beaconFlush();
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && leave());
  window.addEventListener("online", () => void flushEvents());
  // Anything left from an earlier visit.
  if (load().length) schedule(2_000);
}

/** Sends everything queued, in batches. Resolves when done (or when the relay is unreachable). */
export function flushEvents(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    clearTimeout(timer);
    while (load().length) {
      const batch = load().slice(0, BATCH);
      let status = 0;
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId(), events: batch }),
          keepalive: true,
        });
        status = response.status;
      } catch {
        status = 0; // offline or the server is down
      }
      if (status === 202 || status === 400) {
        // 400 means a malformed batch; resending it would fail forever.
        remove(batch);
        failures = 0;
        continue;
      }
      failures++;
      schedule(Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5)));
      break;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** The page is going away: hand the queue to the browser, which sends it after unload. */
function beaconFlush(): void {
  const pending = load();
  if (!pending.length || typeof navigator.sendBeacon !== "function") return;
  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    const queued = navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify({ sessionId: sessionId(), events: batch })], { type: "text/plain" }));
    if (queued) remove(batch);
  }
}

/**
 * Records an event. `urgent` sends at once by beacon: for the last event on a
 * page (leaving a film), which would otherwise wait for the next visit.
 */
export function track(type: BrowserEventType, properties: Record<string, unknown> = {}, options: { urgent?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  try {
    listen();
    const events = load();
    events.push({
      id: uuid(),
      type,
      occurredAt: new Date().toISOString(),
      path: window.location.pathname + window.location.search,
      referrer: document.referrer,
      properties,
    });
    if (events.length > MAX_QUEUED) events.splice(0, events.length - MAX_QUEUED); // keep the newest
    persist();
    if (options.urgent) beaconFlush();
    else schedule(events.length >= 20 ? 0 : FLUSH_DELAY_MS);
  } catch {
    // capture must never break the page
  }
}
