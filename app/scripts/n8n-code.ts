/**
 * The JavaScript that runs inside n8n Code nodes, written as real functions so
 * it's type-checked, linted and readable. build-n8n-workflows.ts takes each
 * function's body (codeOf) and puts it in the node. Inside n8n, `$`, `$input`
 * and `$getWorkflowStaticData` are globals; here they're declared, not defined.
 *
 * Every function must be self-contained: no imports, no closures over module
 * scope. Constants a node needs are declared inside it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
declare const $: (node: string) => { first: () => { json: any }; item: { json: any } };
declare const $input: { first: () => { json: any }; all: () => { json: any }[] };

/**
 * The body of one of this file's functions, as plain JavaScript for a Code node.
 * Taken from the source text through TypeScript's transpiler (types stripped,
 * formatting and comments kept), not from Function.prototype.toString, which
 * under tsx is minified and wrapped in __name() helpers n8n doesn't have.
 */
export function codeOf(fn: () => unknown): string {
  const js = ts.transpileModule(readFileSync(fileURLToPath(import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;
  const file = ts.createSourceFile("n8n-code.js", js, ts.ScriptTarget.ES2022, true);
  const found = file.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === fn.name);
  if (!found?.body) throw new Error(`n8n-code: no function named ${fn.name}`);
  const body = js.slice(found.body.getStart(file) + 1, found.body.end - 1).replace(/^\n/, "").trimEnd();
  const indent = Math.min(...body.split("\n").filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length));
  return body
    .split("\n")
    .map((line) => line.slice(indent))
    .join("\n");
}

// ── Send windows ─────────────────────────────────────────────────────────
// Offers (abandoned checkout, post-purchase): 15:00–21:00 Nairobi, when people
// unwind and watch. Payment rescue: 07:00–21:00, because they were paying
// minutes ago; waiting until the evening would lose them. Outside a window the
// message is held (a Wait node until sendAt), never dropped. n8n holds the
// execution, so nothing polls.

export function offerWindow() {
  const OPEN = 15;
  const CLOSE = 21;
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour) + Number(parts.minute) / 60;
  let waitMinutes = 0;
  if (hour < OPEN) waitMinutes = Math.ceil((OPEN - hour) * 60);
  else if (hour >= CLOSE) waitMinutes = Math.ceil((24 - hour + OPEN) * 60);
  return [
    {
      json: {
        ...$input.first().json,
        sendWindow: `${OPEN}:00–${CLOSE}:00 Nairobi`,
        holdUntilWindow: waitMinutes > 0,
        waitMinutes,
        sendAt: new Date(now.getTime() + waitMinutes * 60_000).toISOString(),
      },
    },
  ];
}

export function rescueWindow() {
  const OPEN = 7;
  const CLOSE = 21;
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour) + Number(parts.minute) / 60;
  let waitMinutes = 0;
  if (hour < OPEN) waitMinutes = Math.ceil((OPEN - hour) * 60);
  else if (hour >= CLOSE) waitMinutes = Math.ceil((24 - hour + OPEN) * 60);
  return [
    {
      json: {
        ...$input.first().json,
        sendWindow: `${OPEN}:00–${CLOSE}:00 Nairobi`,
        holdUntilWindow: waitMinutes > 0,
        waitMinutes,
        sendAt: new Date(now.getTime() + waitMinutes * 60_000).toISOString(),
      },
    },
  ];
}

/**
 * Post-purchase: give them tonight to watch, then upsell in the next offer
 * window. DEMO shortens it to a couple of minutes so it can be seen live.
 */
export function afterTheyWatch() {
  const DEMO = true;
  const DEMO_DELAY_MINUTES = 2;
  const OPEN = 15;
  const CLOSE = 21;
  const now = new Date();
  if (DEMO) {
    return [{ json: { ...$input.first().json, sendAt: new Date(now.getTime() + DEMO_DELAY_MINUTES * 60_000).toISOString(), demo: true } }];
  }
  // Tomorrow's window, at a random minute within its first hour (spreads the load).
  const nairobi = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Nairobi" }));
  const offset = now.getTime() - nairobi.getTime();
  const tomorrow = new Date(nairobi.getFullYear(), nairobi.getMonth(), nairobi.getDate() + 1, OPEN, Math.floor(Math.random() * 60));
  void CLOSE;
  return [{ json: { ...$input.first().json, sendAt: new Date(tomorrow.getTime() + offset).toISOString(), demo: false } }];
}

// ── Payment rescue (YKW 03 v2) ───────────────────────────────────────────

/**
 * Facts for the AI (and the template it falls back to). Failure classes and
 * strategies are the storefront team's (YKW 03 "Classify Failure"); the
 * storefront has already classified the reason from Paystack's answer.
 */
export function rescueFacts() {
  const failed = $("Payment failed (RabbitMQ)").first().json;
  const info = $("Order & viewer (storefront)").first().json;
  const link = $("Resume link (storefront)").first().json;
  const reason = failed.properties.reason ?? "declined";
  const strategies: Record<string, string> = {
    insufficient_funds: "top up M-Pesa and finish; the film is saved for them",
    wrong_pin: "the PIN didn't match; try again, it takes seconds",
    timeout_or_cancel: "the M-Pesa prompt timed out; try again when the phone is ready",
    limit_exceeded: "it went over the M-Pesa limit; pay by card or Till instead",
    declined: "the payment was declined; try again or use another way to pay",
  };
  const first = info.user.firstName;
  const title = link.films.map((film: { title: string }) => film.title).join(" + ");
  const fallbacks: Record<string, string> = {
    insufficient_funds: `Pole ${first}, your M-Pesa balance was short for ${title} (KES ${link.totalKes}). Top up and tap to finish, it's saved:`,
    wrong_pin: `Pole ${first}, the M-Pesa PIN didn't go through for ${title}. Tap to try again:`,
    timeout_or_cancel: `Pole ${first}, the M-Pesa prompt for ${title} timed out. Tap when your phone's ready:`,
    limit_exceeded: `Pole ${first}, ${title} went over your M-Pesa limit. Tap to pay by card or Till:`,
  };
  return [
    {
      json: {
        userId: info.user.id,
        orderId: info.order.id,
        phone: info.user.phone,
        firstName: first,
        title,
        reason,
        strategy: strategies[reason] ?? strategies.declined,
        totalKes: link.totalKes,
        url: link.url,
        nudgeId: link.nudgeId,
        movieIds: link.films.map((film: { id: string }) => film.id),
        discountPct: link.discountPct,
        // Every message offers one alternative way to pay (the brief), after the resume link.
        alternative: reason === "limit_exceeded" ? "" : " Or pay by card.",
        fallback: fallbacks[reason] ?? `Pole ${first}, your payment for ${title} didn't go through. Tap to try again:`,
      },
    },
  ];
}

/**
 * The AI writes; code decides whether to trust it. The message is used only if
 * it's short enough for an SMS with the link, has no link of its own, and
 * mentions no price other than the real one. Otherwise the template goes out.
 * The link (and the alternative way to pay) is always added by code.
 */
export function guardRescueCopy() {
  const facts = $("Rescue facts").first().json;
  const ai = $input.first().json ?? {};
  const text = String(ai.output?.message ?? ai.text ?? "").trim();
  let fallbackReason: string | null = null;
  if (!text) fallbackReason = ai.error ? "AI error" : "no AI answer";
  else if (text.length > 120) fallbackReason = "too long";
  else if (/https?:|www\.|\.com|\.app/i.test(text)) fallbackReason = "contains a link";
  else {
    const prices = [...text.matchAll(/KES\s?([\d,]+)/gi)].map((match) => Number(match[1].replace(/,/g, "")));
    if (prices.some((price) => price !== facts.totalKes)) fallbackReason = "wrong price";
  }
  const body = fallbackReason ? facts.fallback : text;
  return [{ json: { ...facts, message: `${body} ${facts.url}${facts.alternative}`.trim(), aiUsed: !fallbackReason, fallbackReason } }];
}

export function rescueIncentive() {
  const rescue = $("Guard the copy").first().json;
  const link = $input.first().json;
  const message = `Still want ${rescue.title}, ${rescue.firstName}? Code PONA10: KES ${link.totalKes} (10% off) for the next hour: ${link.url}`;
  return [{ json: { ...link, userId: rescue.userId, orderId: rescue.orderId, phone: rescue.phone, message } }];
}

// ── Abandoned checkout (YKW 02 v2) ───────────────────────────────────────

/** Cart film + the recommender's closest pick at 20% off; the cart film alone at 10% without a pick. */
export function abandonedBundle() {
  const info = $("Order & viewer (storefront)").first().json;
  const picks = $input.first().json?.data?.items ?? [];
  const pick = picks.find((item: { movieId: string }) => !info.order.movieIds.includes(item.movieId) && !info.ownedMovieIds.includes(item.movieId));
  const movieIds = pick ? [info.order.movieIds[0], pick.movieId] : info.order.movieIds;
  return [
    {
      json: {
        userId: info.user.id,
        orderId: info.order.id,
        movieIds,
        discountPct: pick ? 20 : 10,
        pick: pick ? { title: pick.title, reason: pick.reason, genres: pick.genres, why: pick.why ?? null } : null,
      },
    },
  ];
}

export function abandonedFacts() {
  const info = $("Order & viewer (storefront)").first().json;
  const bundle = $("Build the bundle").first().json;
  const link = $input.first().json;
  const [cart, extra] = link.films;
  const first = info.user.firstName;
  return [
    {
      json: {
        userId: info.user.id,
        orderId: info.order.id,
        phone: info.user.phone,
        firstName: first,
        cartTitle: cart.title,
        pickTitle: extra?.title ?? null,
        pickReason: bundle.pick?.why?.matchedGenres?.length ? `also ${bundle.pick.why.matchedGenres.join(", ")}` : (bundle.pick?.reason ?? null),
        totalKes: link.totalKes,
        discountPct: link.discountPct,
        url: link.url,
        nudgeId: link.nudgeId,
        movieIds: link.films.map((film: { id: string }) => film.id),
        alternative: "",
        fallback: extra
          ? `${first}, ${cart.title} is still waiting. Get it with ${extra.title} for KES ${link.totalKes} (${link.discountPct}% off), next hour only:`
          : `${first}, ${cart.title} is still waiting: KES ${link.totalKes} (${link.discountPct}% off) for the next hour:`,
      },
    },
  ];
}

export function guardOfferCopy() {
  const facts = $("Offer facts").first().json;
  const ai = $input.first().json ?? {};
  const text = String(ai.output?.message ?? ai.text ?? "").trim();
  let fallbackReason: string | null = null;
  if (!text) fallbackReason = ai.error ? "AI error" : "no AI answer";
  else if (text.length > 120) fallbackReason = "too long";
  else if (/https?:|www\.|\.com|\.app/i.test(text)) fallbackReason = "contains a link";
  else {
    const prices = [...text.matchAll(/KES\s?([\d,]+)/gi)].map((match) => Number(match[1].replace(/,/g, "")));
    if (prices.some((price) => price !== facts.totalKes)) fallbackReason = "wrong price";
  }
  const body = fallbackReason ? facts.fallback : text;
  return [{ json: { ...facts, message: `${body} ${facts.url}${facts.alternative ?? ""}`.trim(), aiUsed: !fallbackReason, fallbackReason } }];
}

// ── Post-purchase upsell (YKW 04 v2) ─────────────────────────────────────

/** The next two films they don't own, from the recommender's `next` mode, as a 20%-off bundle. */
export function upsellBundle() {
  const info = $("Order & viewer (storefront)").first().json;
  const picks = ($input.first().json?.data?.items ?? []).filter(
    (item: { movieId: string }) => !info.order.movieIds.includes(item.movieId) && !info.ownedMovieIds.includes(item.movieId),
  );
  const chosen = picks.slice(0, 2);
  return [
    {
      json: {
        userId: info.user.id,
        boughtTitle: info.films[0]?.title ?? "your film",
        boughtGenres: info.films[0]?.genres ?? [],
        movieIds: chosen.map((item: { movieId: string }) => item.movieId),
        hasPicks: chosen.length > 0,
        why: chosen[0]?.why ?? null,
      },
    },
  ];
}

export function upsellFacts() {
  const info = $("Order & viewer (storefront)").first().json;
  const bundle = $("Pick the bundle").first().json;
  const link = $input.first().json;
  const titles = link.films.map((film: { title: string }) => film.title);
  const first = info.user.firstName;
  return [
    {
      json: {
        userId: info.user.id,
        phone: info.user.phone,
        firstName: first,
        boughtTitle: bundle.boughtTitle,
        genre: bundle.boughtGenres[0] ?? "film",
        pickTitles: titles,
        totalKes: link.totalKes,
        discountPct: link.discountPct,
        url: link.url,
        nudgeId: link.nudgeId,
        movieIds: link.films.map((film: { id: string }) => film.id),
        alternative: "",
        fallback: `Loved ${bundle.boughtTitle}, ${first}? ${titles.join(" + ")}: KES ${link.totalKes} (${link.discountPct}% off) this week:`,
      },
    },
  ];
}

export function guardUpsellCopy() {
  const facts = $("Upsell facts").first().json;
  const ai = $input.first().json ?? {};
  const text = String(ai.output?.message ?? ai.text ?? "").trim();
  let fallbackReason: string | null = null;
  if (!text) fallbackReason = ai.error ? "AI error" : "no AI answer";
  else if (text.length > 120) fallbackReason = "too long";
  else if (/https?:|www\.|\.com|\.app/i.test(text)) fallbackReason = "contains a link";
  else {
    const prices = [...text.matchAll(/KES\s?([\d,]+)/gi)].map((match) => Number(match[1].replace(/,/g, "")));
    if (prices.some((price) => price !== facts.totalKes)) fallbackReason = "wrong price";
  }
  const body = fallbackReason ? facts.fallback : text;
  return [{ json: { ...facts, message: `${body} ${facts.url}`.trim(), aiUsed: !fallbackReason, fallbackReason } }];
}

export function upsellReminder() {
  const sent = $("Guard the copy").first().json;
  const message = `Last call, ${sent.firstName}: ${sent.pickTitles.join(" + ")} at KES ${sent.totalKes} ends soon: ${sent.url}`;
  return [{ json: { ...sent, message } }];
}

// ── Daily digest v2 ──────────────────────────────────────────────────────

/**
 * Numbers → the values the HTML template shows. Behaviour from PostHog,
 * money from the storefront (Paystack-verified). Rows are pre-rendered here
 * (a template can't loop); the layout and styling live in the HTML node.
 */
export function digestData() {
  const table = (name: string) => {
    const response = $(name).first().json;
    return (response.results ?? []).map((row: unknown[]) => Object.fromEntries((response.columns ?? []).map((column: string, i: number) => [column, row[i]])));
  };
  const head = table("Headline numbers (PostHog)")[0] ?? {};
  const genres = table("Genres (PostHog)");
  const films = table("Films (PostHog)");
  const money = $("Money (storefront)").first().json;

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const delta = (now: number, prev: number) => {
    if (!prev) return now ? '<span style="color:#16a34a">new</span>' : '<span style="color:#9ca3af">—</span>';
    const change = pct(now - prev, prev);
    return change >= 0 ? `<span style="color:#16a34a">▲ ${change}%</span>` : `<span style="color:#dc2626">▼ ${Math.abs(change)}%</span>`;
  };
  const kes = (value: number) => `KES ${Number(value || 0).toLocaleString("en-KE")}`;
  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const cap = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : "Unknown");
  const row = (cells: string[], bold = false) =>
    `<tr>${cells.map((cell, i) => `<td style="padding:8px 12px;border-bottom:1px solid #f1e7d8;${i ? "text-align:right;" : ""}${bold ? "font-weight:600;" : ""}">${cell}</td>`).join("")}</tr>`;
  const empty = (columns: number) => `<tr><td colspan="${columns}" style="padding:10px 12px;color:#9ca3af">No data yet</td></tr>`;

  const recovered = (money.nudgesByScenario ?? []).reduce((sum: number, s: { recoveredKes: number }) => sum + s.recoveredKes, 0);
  const funnel = [
    ["Film pages opened", head.film_views ?? 0],
    ["Trailers started", head.trailer_starts ?? 0],
    ["Checkouts started", head.checkouts ?? 0],
    ["Paid", money.paymentsSucceeded ?? 0],
  ];
  const funnelRows = funnel.map(([label, count], i) => row([String(label), String(count), i ? `${pct(Number(count), Number(funnel[i - 1][1]))}%` : ""])).join("");
  const genreRows = genres.length ? genres.map((g: any) => row([esc(cap(g.genre)), String(g.views), String(g.trailers), String(g.viewers)])).join("") : empty(4);
  const filmRows = films.length ? films.map((f: any) => row([esc(f.film), String(f.views), String(f.trailers)])).join("") : empty(3);
  const scenarioNames: Record<string, string> = { A: "A · Abandoned checkout", B: "B · Payment rescue", C: "C · Post-purchase", welcome: "Welcome" };
  const nudgeRows = (money.nudgesByScenario ?? []).length
    ? money.nudgesByScenario.map((s: any) => row([esc(scenarioNames[s.scenario] ?? s.scenario), String(s.sent), String(s.opened), String(s.converted), kes(s.recoveredKes)])).join("")
    : empty(5);
  const reasons = Object.entries(money.failuresByReason ?? {}) as [string, number][];
  const failureLine = reasons.length ? reasons.map(([reason, count]) => `${esc(reason.replace(/_/g, " "))} ${count}`).join(" · ") : "none";
  const status = money.paymentsByStatus ?? {};

  // One thing to act on: the weakest funnel step with traffic, or a genre looked at but rarely played.
  let action = "Not enough traffic yet to call anything. Share a few film links and check tomorrow.";
  const browsedNotPlayed = genres.filter((g: any) => g.views >= 3).sort((a: any, b: any) => pct(a.trailers, a.views) - pct(b.trailers, b.views))[0];
  const steps = funnel.slice(1).map(([label, count], i) => ({ label: `${funnel[i][0]} → ${label}`, rate: pct(Number(count), Number(funnel[i][1])), n: Number(funnel[i][1]) })).filter((s) => s.n > 0);
  const weakest = [...steps].sort((a, b) => a.rate - b.rate)[0];
  if (browsedNotPlayed && pct(browsedNotPlayed.trailers, browsedNotPlayed.views) < 30) {
    action = `${cap(browsedNotPlayed.genre)} is looked at but rarely played (${pct(browsedNotPlayed.trailers, browsedNotPlayed.views)}% of views start a trailer). Try stronger posters or trailers for those titles.`;
  } else if (weakest) {
    action = `The weakest step was ${weakest.label} at ${weakest.rate}%. Start there.`;
  }

  return [
    {
      json: {
        date: new Date().toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }),
        viewers: head.viewers ?? 0,
        viewersDelta: delta(head.viewers ?? 0, head.viewers_prev ?? 0),
        signups: head.signups ?? 0,
        signupsDelta: delta(head.signups ?? 0, head.signups_prev ?? 0),
        revenue: kes(money.revenueKes),
        revenueDelta: delta(money.revenueKes ?? 0, money.revenueKesPrevious ?? 0),
        recovered: kes(recovered),
        funnelRows,
        paid: status.succeeded ?? 0,
        failed: status.failed ?? 0,
        abandoned: status.abandoned ?? 0,
        failureLine,
        genreRows,
        filmRows,
        nudgeRows,
        action: esc(action),
        subject: `Yakwetu · ${kes(money.revenueKes)} revenue, ${head.viewers ?? 0} viewers, ${kes(recovered)} recovered`,
        // Recorded to PostHog (digest.sent) with the headline numbers.
        headline: { viewers: head.viewers ?? 0, signups: head.signups ?? 0, revenueKes: money.revenueKes ?? 0, recoveredKes: recovered, action },
      },
    },
  ];
}
