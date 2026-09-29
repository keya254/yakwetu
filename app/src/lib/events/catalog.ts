/**
 * Every event the storefront captures: its name (also the RabbitMQ routing
 * key and the PostHog event name), the topic exchange it goes to, and whether
 * it is emitted today or planned.
 *
 * Exchanges, one per area of work:
 *   yakwetu.activity  what people do: pages, films, trailers, accounts, watching
 *   yakwetu.commerce  money: cart, checkout, payment, purchase
 *
 * Adding an event: add it here (the relay rejects unknown names), then emit
 * it with `track()` in the browser or `emitServerEvent()` on the server.
 * Keep names `<area>.<past_tense_verb>`; queues bind on those patterns
 * (movie.*, video.*, checkout.*, payment.succeeded, …).
 */

export type EventExchange = "yakwetu.activity" | "yakwetu.commerce";

interface EventSpec {
  exchange: EventExchange;
  /** Where it comes from. Server events can't be blocked or faked by the browser. */
  source: "browser" | "server";
  status: "live" | "planned";
  description: string;
}

// Generic over the source so its literal survives: BrowserEventType depends on it.
const activity = <S extends EventSpec["source"]>(source: S, description: string, status: EventSpec["status"] = "live") => ({
  exchange: "yakwetu.activity" as const,
  source,
  status,
  description,
});
const commerce = <S extends EventSpec["source"]>(source: S, description: string) => ({
  exchange: "yakwetu.commerce" as const,
  source,
  status: "planned" as EventSpec["status"],
  description,
});

export const EVENTS = {
  // ── Browsing ──
  "page.viewed": activity("browser", "Any page view: path, referrer, title."),
  "movie.viewed": activity("browser", "A film page opened: movieId, title, priceKes, genres."),
  "movie.left": activity("browser", "Left a film page: movieId, dwellMs (visible time only)."),
  "movie.clicked": activity("browser", "A film card tapped: movieId, row, position, from (page)."),

  // ── The VideoBox ──
  "video.play_clicked": activity("browser", "Play pressed: movieId, videoId, signedIn."),
  "video.auth_prompted": activity("browser", "Play pressed while signed out; sign-up dialog shown."),
  "video.started": activity("browser", "First frame played."),
  "video.paused": activity("browser", "Paused: positionSec, watchedSec."),
  "video.resumed": activity("browser", "Resumed after a pause."),
  "video.seeked": activity("browser", "Jumped to positionSec."),
  "video.progress": activity("browser", "Reached 25/50/75/90%: percent, watchedSec."),
  "video.completed": activity("browser", "Played to the end: watchedSec tells a watch from a skim."),
  "video.error": activity("browser", "Couldn't play: errorCode (YouTube)."),

  // ── Accounts ──
  "user.signed_up": activity("server", "Account created: method, hasPhone."),
  "user.signed_in": activity("server", "Signed in (also right after sign-up)."),
  "user.signed_out": activity("browser", "Signed out from the account menu."),

  // ── Watching a paid film (after the paywall) ──
  "watch.progress": activity("browser", "Paid film progress: movieId, progress, watchedMs.", "planned"),
  "watch.completed": activity("server", "Finished a paid film (server-checked).", "planned"),

  // ── Money ──
  "cart.added": commerce("browser", "Added to cart: cartId, movieIds, totalKes."),
  "checkout.started": commerce("server", "Checkout opened: cartId, movieIds, reference."),
  "payment.submitted": commerce("server", "Paystack transaction initialised: reference, channel."),
  "payment.failed": commerce("server", "Paystack says it failed: reference, reason."),
  "payment.succeeded": commerce("server", "Paystack confirmed: reference, amountKes, movieIds."),
  "purchase.confirmed": commerce("server", "Films unlocked for the viewer: movieIds."),
} as const satisfies Record<string, EventSpec>;

export type EventType = keyof typeof EVENTS;

export function isEventType(value: string): value is EventType {
  return Object.hasOwn(EVENTS, value);
}

/** Events the browser may send through the relay. Server events can't be posted from outside. */
export function isBrowserEvent(value: string): value is EventType {
  return isEventType(value) && EVENTS[value].source === "browser";
}

export function exchangeFor(type: EventType): EventExchange {
  return EVENTS[type].exchange;
}

/** Names the browser may `track()`: compile-time twin of isBrowserEvent. */
export type BrowserEventType = { [K in EventType]: (typeof EVENTS)[K]["source"] extends "browser" ? K : never }[EventType];
