/**
 * Writes the Yakwetu n8n workflows to n8n/workflows/*.json (importable in
 * n8n: Workflows → Import from file). They're generated from code so the
 * logic is reviewable, diffable and rebuilt the same way every time.
 *
 *   pnpm n8n:build
 *
 * Only the PostHog *project* token is embedded (write-only, public by design:
 * PostHog puts it in every website's JavaScript). Every real secret is an n8n
 * credential you attach after importing; nodes that need one say which.
 *
 * The workflows, and the business question each answers:
 *   YKW · Audiences     who are our viewers by taste?        (nightly → PostHog profiles)
 *   YKW · Daily digest  how did yesterday go, and what next?  (07:00 → email)
 *   YKW · Ops guard     is the event pipeline healthy?        (every 3 h → email on change)
 *   YKW · Journeys      did a new viewer find a film?         (q.n8n.journeys → recs → SMS)
 *   YKW · Payment rescue    a payment failed: win it back     (q.n8n.payment-failed → Paystack verify → SMS → incentive)
 *   YKW · Abandoned checkout  never paid: bring them back    (q.n8n.checkout-abandoned → recs bundle → SMS)
 *
 * The commerce workflows reuse the storefront team's rescue logic (their
 * yakwetu-n8n YKW-02/03: failure classes, "Pole!" copy, PONA10, EAT quiet
 * hours). Their workflows are left untouched; these are separate.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RECS = process.env.RECS_API_URL ?? "https://3-226-65-199.sslip.io";
const RABBIT_UI = "https://rabbitmq.3-226-65-199.sslip.io";
const POSTHOG_APP = "https://us.posthog.com";
const POSTHOG_INGEST = "https://us.i.posthog.com";
const PROJECT_ID = process.env.PROJECT_ID ?? "";
const PROJECT_TOKEN = process.env.POSTHOG_KEY ?? "";
const DIGEST_TO = process.env.DIGEST_EMAIL ?? "brian@learnitpal.com";
const AT_USERNAME = process.env.AT_USERNAME ?? "sandbox";
/** The storefront's public address (ngrok now, the real domain later): n8n Cloud calls its internal API. */
const SITE = (process.env.PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Credentials that already exist in the n8n workspace (referenced by id, never copied). */
const EXISTING = {
  rabbitmq: { id: "0XUkvX0FdyyHYkKN", name: "RabbitMQ account" },
  gmail: { id: "nf01MA1vhcwQsDZV", name: "Gmail account" },
};

type Node = Record<string, unknown> & { name: string };
interface Workflow {
  name: string;
  nodes: Node[];
  connections: Record<string, { main: { node: string; type: "main"; index: number }[][] }>;
  settings: Record<string, unknown>;
}

function node(name: string, type: string, typeVersion: number, position: [number, number], parameters: Record<string, unknown>, extra: Record<string, unknown> = {}): Node {
  return { id: randomUUID(), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra };
}

function sticky(content: string, position: [number, number], width = 420, height = 260, color = 7): Node {
  return node(`Note ${randomUUID().slice(0, 6)}`, "stickyNote", 1, position, { content, width, height, color });
}

/** Wires outputs: link("A", "B") or link("A", "B", outputIndex). */
function wire(pairs: [string, string, number?][]): Workflow["connections"] {
  const connections: Workflow["connections"] = {};
  for (const [from, to, output = 0] of pairs) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= output) connections[from].main.push([]);
    connections[from].main[output].push({ node: to, type: "main", index: 0 });
  }
  return connections;
}

const headerAuth = { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" };
const SETTINGS = { executionOrder: "v1", timezone: "Africa/Nairobi", saveManualExecutions: true, callerPolicy: "workflowsFromSameOwner" };

function posthogBatch(name: string, position: [number, number], batchExpression: string): Node {
  return node(name, "httpRequest", 4.2, position, {
    method: "POST",
    url: `${POSTHOG_INGEST}/batch/`,
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ api_key: '${PROJECT_TOKEN}', batch: ${batchExpression} }) }}`,
    options: {},
  });
}

function hogql(name: string, position: [number, number], sql: string): Node {
  return node(
    name,
    "httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: `${POSTHOG_APP}/api/projects/${PROJECT_ID}/query/`,
      ...headerAuth,
      sendBody: true,
      specifyBody: "json",
      jsonBody: JSON.stringify({ query: { kind: "HogQLQuery", query: sql.replace(/\s+/g, " ").trim() } }),
      options: {},
    },
    { notes: "Credential: Header Auth 'PostHog personal (read)': Authorization = Bearer <POSTHOG_PERSONAL_API_KEY>", notesInFlow: true },
  );
}

// ── YKW · Audiences ──────────────────────────────────────────────────────

const audiences: Workflow = {
  name: "YKW · Audiences — taste → PostHog profiles (nightly)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## Who are our viewers by taste?\nEvery night at 02:00 this copies what the recommender (sinema-recs) has learned about each active viewer onto their **PostHog person profile**: favourite genre, top three genres, trailers watched, films owned and completed.\n\nPostHog can then cut every dashboard by taste, and the cohorts *Drama lovers*, *Thriller fans*… stay current for targeting.\n\n**One execution a night**, however many viewers: one read, one batched write.",
      [-80, -340],
      460,
      300,
      4,
    ),
    node("Every night at 02:00", "scheduleTrigger", 1.2, [0, 0], { rule: { interval: [{ field: "cronExpression", expression: "0 2 * * *" }] } }),
    node(
      "Active viewers' taste (sinema-recs)",
      "httpRequest",
      4.2,
      [240, 0],
      {
        url: `${RECS}/v1/viewers`,
        ...headerAuth,
        sendQuery: true,
        queryParameters: { parameters: [{ name: "activeWithinDays", value: "30" }, { name: "limit", value: "1000" }] },
        options: {},
      },
      { notes: "Credential: Header Auth 'Sinema recs API': x-api-key = <RECS_API_KEY>", notesInFlow: true },
    ),
    node("Build profile updates", "code", 2, [480, 0], {
      jsCode: `// One PostHog $set per viewer, plus a summary event for the run.
const viewers = $input.first().json.data?.viewers ?? [];
const syncedAt = new Date().toISOString();
const byGenre = {};
const batch = viewers.map((viewer) => {
  const genre = viewer.favoriteGenre ?? 'unknown';
  byGenre[genre] = (byGenre[genre] ?? 0) + 1;
  return {
    event: '$set',
    distinct_id: viewer.viewerId,
    properties: {
      $set: {
        favoriteGenre: genre,
        topGenres: viewer.topGenres,
        trailersWatched: viewer.trailersWatched,
        filmsOwned: viewer.filmsOwned,
        filmsCompleted: viewer.filmsCompleted,
        tasteSyncedAt: syncedAt,
      },
      $lib: 'n8n-audiences',
    },
  };
});
batch.push({ event: 'audiences.synced', distinct_id: 'n8n-audiences', properties: { viewers: viewers.length, byGenre, $lib: 'n8n-audiences' } });
return [{ json: { viewers: viewers.length, byGenre, batch } }];`,
    }),
    posthogBatch("Update PostHog profiles", [720, 0], "$json.batch"),
  ],
  connections: wire([
    ["Every night at 02:00", "Active viewers' taste (sinema-recs)"],
    ["Active viewers' taste (sinema-recs)", "Build profile updates"],
    ["Build profile updates", "Update PostHog profiles"],
  ]),
};

// ── YKW · Daily digest ───────────────────────────────────────────────────

const digest: Workflow = {
  name: "YKW · Daily digest — last 24h in plain words (07:00)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## How did the last day go, and what should we do?\nAt 07:00 (Nairobi) this asks PostHog for the last 24 hours against the 24 before, turns the numbers into a short read (who came, what they watched, where they dropped off, one thing to act on) and emails it.\n\nThe dashboards hold the detail; this is what an owner reads over breakfast.",
      [-80, -340],
      460,
      280,
      4,
    ),
    node("Every day at 07:00", "scheduleTrigger", 1.2, [0, 0], { rule: { interval: [{ field: "cronExpression", expression: "0 7 * * *" }] } }),
    hogql(
      "Headline numbers (PostHog)",
      [240, 0],
      `SELECT
         uniqIf(person_id, event = '$pageview' AND timestamp > now() - INTERVAL 24 HOUR) AS viewers,
         uniqIf(person_id, event = '$pageview' AND timestamp <= now() - INTERVAL 24 HOUR) AS viewers_prev,
         countIf(event = 'user.signed_up' AND timestamp > now() - INTERVAL 24 HOUR) AS signups,
         countIf(event = 'user.signed_up' AND timestamp <= now() - INTERVAL 24 HOUR) AS signups_prev,
         countIf(event = 'movie.viewed' AND timestamp > now() - INTERVAL 24 HOUR) AS film_views,
         countIf(event = 'movie.viewed' AND timestamp <= now() - INTERVAL 24 HOUR) AS film_views_prev,
         countIf(event = 'video.started' AND timestamp > now() - INTERVAL 24 HOUR) AS trailer_starts,
         countIf(event = 'video.completed' AND timestamp > now() - INTERVAL 24 HOUR) AS trailer_completions,
         countIf(event = 'video.auth_prompted' AND timestamp > now() - INTERVAL 24 HOUR) AS signup_prompts
       FROM events
       WHERE timestamp > now() - INTERVAL 48 HOUR`,
    ),
    hogql(
      "Genres (PostHog)",
      [480, 0],
      `SELECT properties.primaryGenre AS genre, countIf(event = 'movie.viewed') AS views,
              countIf(event = 'video.started') AS trailers, uniq(person_id) AS viewers
       FROM events
       WHERE event IN ('movie.viewed', 'video.started') AND timestamp > now() - INTERVAL 24 HOUR AND properties.primaryGenre IS NOT NULL
       GROUP BY genre ORDER BY views DESC LIMIT 6`,
    ),
    hogql(
      "Films (PostHog)",
      [720, 0],
      `SELECT properties.movieTitle AS film, countIf(event = 'movie.viewed') AS views, countIf(event = 'video.started') AS trailers
       FROM events
       WHERE event IN ('movie.viewed', 'video.started') AND timestamp > now() - INTERVAL 24 HOUR AND properties.movieTitle IS NOT NULL
       GROUP BY film ORDER BY views DESC LIMIT 5`,
    ),
    node("Write the digest", "code", 2, [960, 0], {
      jsCode: `// Numbers → a short, plain read. Columns come back in SELECT order.
const rows = (name) => $(name).first().json;
const head = rows('Headline numbers (PostHog)');
const h = Object.fromEntries(head.columns.map((column, i) => [column, head.results[0]?.[i] ?? 0]));
const genres = rows('Genres (PostHog)').results.map(([genre, views, trailers, viewers]) => ({ genre, views, trailers, viewers }));
const films = rows('Films (PostHog)').results.map(([film, views, trailers]) => ({ film, views, trailers }));

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const delta = (now, prev) => (prev ? \`\${now >= prev ? '▲' : '▼'} \${Math.abs(pct(now - prev, prev))}%\` : now ? 'new' : '—');
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown');

// One thing to act on: the weakest step, or the genre people look at but don't press play on.
const steps = [
  { label: 'film page → trailer', rate: pct(h.trailer_starts, h.film_views), n: h.film_views },
  { label: 'trailer → watched to the end', rate: pct(h.trailer_completions, h.trailer_starts), n: h.trailer_starts },
  { label: 'sign-up prompt → account', rate: pct(h.signups, h.signup_prompts), n: h.signup_prompts },
].filter((step) => step.n > 0);
const weakest = [...steps].sort((a, b) => a.rate - b.rate)[0];
const browsedNotPlayed = genres.filter((g) => g.views >= 3).sort((a, b) => pct(a.trailers, a.views) - pct(b.trailers, b.views))[0];
let action = 'Not enough traffic yet to call anything. Share a few film links and check tomorrow.';
if (browsedNotPlayed && pct(browsedNotPlayed.trailers, browsedNotPlayed.views) < 30) {
  action = \`\${title(browsedNotPlayed.genre)} gets looked at but rarely played (\${pct(browsedNotPlayed.trailers, browsedNotPlayed.views)}% of views start a trailer). Try stronger posters or a better trailer for those titles.\`;
} else if (weakest) {
  action = \`The weakest step was \${weakest.label} at \${weakest.rate}%. That's where to look first.\`;
}

const lines = [
  \`Viewers: \${h.viewers} (\${delta(h.viewers, h.viewers_prev)})\`,
  \`Sign-ups: \${h.signups} (\${delta(h.signups, h.signups_prev)})\`,
  \`Film pages opened: \${h.film_views} (\${delta(h.film_views, h.film_views_prev)})\`,
  \`Trailers started: \${h.trailer_starts}, watched to the end: \${h.trailer_completions}\`,
  ...steps.map((step) => \`Conversion, \${step.label}: \${step.rate}%\`),
];
const genreLine = genres.length ? genres.map((g) => \`\${title(g.genre)} \${g.views}\`).join(' · ') : 'No film views yet';
const filmLine = films.length ? films.map((f) => \`\${f.film} (\${f.views})\`).join(', ') : '—';

const subject = \`Yakwetu · last 24h: \${h.viewers} viewers, \${h.signups} sign-ups, top genre \${title(genres[0]?.genre ?? '—')}\`;
const li = (s) => \`<li>\${s}</li>\`;
const html = \`<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 8px">Yakwetu Sinema · the last 24 hours</h2>
<ul>\${lines.map(li).join('')}</ul>
<p><b>Genres people opened:</b> \${genreLine}</p>
<p><b>Most-opened films:</b> \${filmLine}</p>
<p style="padding:10px 12px;background:#fff4e0;border-radius:8px"><b>One thing to act on:</b> \${action}</p>
<p style="color:#777;font-size:12px">Dashboards: ${POSTHOG_APP}/project/${PROJECT_ID}/dashboard · Sent by n8n (YKW · Daily digest)</p>
</div>\`;
return [{ json: { subject, html, text: [...lines, 'Genres: ' + genreLine, 'Films: ' + filmLine, 'Act on: ' + action].join('\\n'), headline: h, genres, films, action } }];`,
    }),
    node(
      "Email the digest",
      "gmail",
      2.1,
      [1200, 0],
      { sendTo: DIGEST_TO, subject: "={{ $json.subject }}", emailType: "html", message: "={{ $json.html }}", options: { appendAttribution: false } },
      { credentials: { gmailOAuth2: EXISTING.gmail }, webhookId: randomUUID() },
    ),
    posthogBatch(
      "Record the digest in PostHog",
      [1200, 200],
      "[{ event: 'digest.sent', distinct_id: 'n8n-digest', properties: { ...$json.headline, action: $json.action, $lib: 'n8n-digest' } }]",
    ),
  ],
  connections: wire([
    ["Every day at 07:00", "Headline numbers (PostHog)"],
    ["Headline numbers (PostHog)", "Genres (PostHog)"],
    ["Genres (PostHog)", "Films (PostHog)"],
    ["Films (PostHog)", "Write the digest"],
    ["Write the digest", "Email the digest"],
    ["Write the digest", "Record the digest in PostHog"],
  ]),
};

// ── YKW · Ops guard ──────────────────────────────────────────────────────

const opsGuard: Workflow = {
  name: "YKW · Ops guard — RabbitMQ health (every 3 h)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## Is the event pipeline healthy?\nEvery 3 hours, reads every queue's depth from the RabbitMQ management API (read-only `monitor` user) and checks:\n- any **parking queue (DLQ)** holding messages;\n- a queue that must always have a consumer and has none (recommender, PostHog forwarder);\n- a backlog building up.\n\nIt emails only when the picture **changes** (new problem, or all clear), so a known issue doesn't mail you every run. Replay parked messages from the RabbitMQ UI: Queues → *.dlq → Move messages.",
      [-80, -380],
      460,
      320,
      3,
    ),
    node("Every 3 hours", "scheduleTrigger", 1.2, [0, 0], { rule: { interval: [{ field: "hours", hoursInterval: 3 }] } }),
    node(
      "Queue depths (RabbitMQ API)",
      "httpRequest",
      4.2,
      [240, 0],
      {
        url: `${RABBIT_UI}/api/queues/yakwetu`,
        authentication: "genericCredentialType",
        genericAuthType: "httpBasicAuth",
        sendQuery: true,
        queryParameters: { parameters: [{ name: "columns", value: "name,messages,messages_ready,messages_unacknowledged,consumers" }] },
        options: {},
      },
      { notes: "Credential: Basic Auth 'RabbitMQ monitor': user monitor, password <RABBITMQ_MONITOR_PASSWORD>", notesInFlow: true },
    ),
    node("Find problems", "code", 2, [480, 0], {
      jsCode: `// Queues must have a consumer; parking queues must be empty; nothing should pile up.
const queues = $input.all().map((item) => item.json);
const mustConsume = ['q.recs.signals', 'q.analytics'];
const problems = [];
for (const q of queues) {
  if (q.name.endsWith('.dlq') && q.messages > 0) problems.push({ key: 'dlq:' + q.name, text: \`\${q.messages} message(s) parked in \${q.name}\` });
  if (mustConsume.includes(q.name) && q.consumers === 0) problems.push({ key: 'noconsumer:' + q.name, text: \`\${q.name} has no consumer: events are queuing, not being processed\` });
  if (!q.name.endsWith('.dlq') && q.messages_ready > 1000) problems.push({ key: 'backlog:' + q.name, text: \`\${q.name} backlog: \${q.messages_ready} waiting\` });
}
// Mail only on change. Static data persists between production runs of this workflow.
const state = $getWorkflowStaticData('global');
const fingerprint = problems.map((p) => p.key).sort().join('|');
const changed = fingerprint !== (state.fingerprint ?? '');
state.fingerprint = fingerprint;
const summary = problems.length ? problems.map((p) => '• ' + p.text).join('\\n') : 'All queues healthy: every consumer connected, parking queues empty.';
return [{ json: { notify: changed, healthy: problems.length === 0, problems, summary, queues: queues.map((q) => \`\${q.name}: \${q.messages} (\${q.consumers} consumer)\`) } }];`,
    }),
    node("Anything new?", "if", 2.2, [720, 0], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: randomUUID(), leftValue: "={{ $json.notify }}", rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    }),
    node(
      "Email the team",
      "gmail",
      2.1,
      [960, -100],
      {
        sendTo: DIGEST_TO,
        subject: "={{ $json.healthy ? 'Yakwetu pipeline: all clear' : 'Yakwetu pipeline: needs attention' }}",
        emailType: "text",
        message: `={{ $json.summary + '\\n\\nQueues:\\n' + $json.queues.join('\\n') + '\\n\\nRabbitMQ UI: ${RABBIT_UI}' }}`,
        options: { appendAttribution: false },
      },
      { credentials: { gmailOAuth2: EXISTING.gmail }, webhookId: randomUUID() },
    ),
    posthogBatch(
      "Record it in PostHog",
      [960, 100],
      "[{ event: $json.healthy ? 'ops.recovered' : 'ops.alert', distinct_id: 'n8n-ops-guard', properties: { problems: $json.problems.map((p) => p.text), $lib: 'n8n-ops-guard' } }]",
    ),
  ],
  connections: wire([
    ["Every 3 hours", "Queue depths (RabbitMQ API)"],
    ["Queue depths (RabbitMQ API)", "Find problems"],
    ["Find problems", "Anything new?"],
    ["Anything new?", "Email the team"],
    ["Anything new?", "Record it in PostHog"],
  ]),
};

// ── YKW · Journeys ───────────────────────────────────────────────────────

const journeys: Workflow = {
  name: "YKW · Journeys — welcome & first watch (q.n8n.journeys)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## Did a new viewer find a film?\nFed by **q.n8n.journeys**: only business moments, never page views (those go to PostHog in code, not through n8n).\n\n**Sign-up →** wait 10 min → ask the recommender what they've done. Already played a trailer? Done. Otherwise → the recommender picks one film for them → look up their name and phone (Neon, read-only) → write a short SMS → send (Africa's Talking) → record the nudge in PostHog, so the funnel shows whether nudged viewers come back.\n\nThe SMS node is **disabled** until you switch it on: the Africa's Talking account is live, and each message costs airtime.",
      [-80, -420],
      520,
      360,
      4,
    ),
    node(
      "Business moments (RabbitMQ)",
      "rabbitmqTrigger",
      1,
      [0, 0],
      { queue: "q.n8n.journeys", options: { acknowledge: "executionFinishesSuccessfully", jsonParseBody: true, onlyContent: true, parallelMessages: 5 } },
      { credentials: { rabbitmq: EXISTING.rabbitmq } },
    ),
    node("Which moment?", "switch", 3.2, [240, 0], {
      mode: "expression",
      numberOutputs: 2,
      output: "={{ $json.type === 'user.signed_up' ? 0 : 1 }}",
    }),
    node("Give them 10 minutes", "wait", 1.1, [480, -100], { amount: 10, unit: "minutes" }, { webhookId: randomUUID() }),
    node("Finished a film (Scenario C, next)", "noOp", 1, [480, 140], {}),
    node(
      "What have they done? (sinema-recs)",
      "httpRequest",
      4.2,
      [720, -100],
      {
        url: `={{ '${RECS}/v1/viewers/' + encodeURIComponent($('Business moments (RabbitMQ)').item.json.userId) }}`,
        ...headerAuth,
        // A viewer with no activity yet answers 404: that's "hasn't done anything", not an error.
        options: { response: { response: { neverError: true } } },
      },
      { notes: "Credential: Header Auth 'Sinema recs API': x-api-key = <RECS_API_KEY>", notesInFlow: true },
    ),
    node("Played anything yet?", "if", 2.2, [960, -100], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ ($json.data?.movies ?? []).some((m) => !['none', 'viewed', 'bounce', 'notInterested'].includes(m.engagement?.kind)) }}",
            rightValue: "",
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    }),
    node("Engaged on their own: done", "noOp", 1, [1200, -240], {}),
    node(
      "Pick one film for them (sinema-recs)",
      "httpRequest",
      4.2,
      [1200, 0],
      {
        url: `={{ '${RECS}/v1/recs/' + encodeURIComponent($('Business moments (RabbitMQ)').item.json.userId) }}`,
        ...headerAuth,
        sendQuery: true,
        // log=true: the recommender records the pick, so it won't nudge the same film again straight away.
        queryParameters: { parameters: [{ name: "mode", value: "home" }, { name: "limit", value: "1" }, { name: "log", value: "true" }] },
        options: {},
      },
      { notes: "Credential: Header Auth 'Sinema recs API'", notesInFlow: true },
    ),
    node(
      "Name & phone (Neon, read-only)",
      "postgres",
      2.5,
      [1440, 0],
      {
        operation: "executeQuery",
        query: 'SELECT name, phone FROM storefront."user" WHERE id = $1',
        options: { queryReplacement: "={{ $('Business moments (RabbitMQ)').item.json.userId }}" },
      },
      { notes: "Credential: Postgres 'Neon read-only' (the n8n_reader role; see the setup guide)", notesInFlow: true, alwaysOutputData: true },
    ),
    node("Write the SMS", "code", 2, [1680, 0], {
      jsCode: `// Facts only, under 160 characters: first name, the recommender's pick, a link.
const event = $('Business moments (RabbitMQ)').first().json;
const pick = $('Pick one film for them (sinema-recs)').first().json.data?.items?.[0];
const person = $input.first().json ?? {};
const first = (person.name ?? '').trim().split(/\\s+/)[0] || 'there';
let message = pick
  ? \`Hi \${first}, welcome to Yakwetu Sinema! Start with \${pick.title} (\${(pick.genres ?? [])[0] ?? 'film'}), KES \${pick.priceKes}. Trailer: \${pick.pageUrl}\`
  : \`Hi \${first}, welcome to Yakwetu Sinema! Browse Kenyan and African films from KES 49: http://localhost:3000/browse\`;
if (message.length > 160) message = message.slice(0, 157) + '...';
return [{ json: { userId: event.userId, phone: person.phone ?? null, message, movieId: pick?.movieId ?? null, reason: pick?.reason ?? null } }];`,
    }),
    node("Has a phone?", "if", 2.2, [1920, 0], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: randomUUID(), leftValue: "={{ $json.phone }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    }),
    node(
      "Send SMS (Africa's Talking)",
      "httpRequest",
      4.2,
      [2160, -100],
      {
        method: "POST",
        url: "https://api.africastalking.com/version1/messaging",
        ...headerAuth,
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Accept", value: "application/json" }] },
        sendBody: true,
        contentType: "form-urlencoded",
        bodyParameters: {
          parameters: [
            { name: "username", value: AT_USERNAME },
            { name: "to", value: "={{ $json.phone }}" },
            { name: "message", value: "={{ $json.message }}" },
            ...(process.env.AT_SENDER_ID ? [{ name: "from", value: process.env.AT_SENDER_ID }] : []),
            { name: "bulkSMSMode", value: "1" },
          ],
        },
        options: {},
      },
      { disabled: true, notes: "Disabled on purpose (live account, costs airtime). Credential: Header Auth 'Africa's Talking': apiKey = <AT_API_KEY>", notesInFlow: true },
    ),
    posthogBatch(
      "Record the nudge in PostHog",
      [2400, 0],
      "[{ event: 'nudge.prepared', distinct_id: $('Write the SMS').item.json.userId, properties: { journey: 'welcome', movieId: $('Write the SMS').item.json.movieId, reason: $('Write the SMS').item.json.reason, channel: $('Write the SMS').item.json.phone ? 'sms' : 'none', $lib: 'n8n-journeys' } }]",
    ),
  ],
  connections: wire([
    ["Business moments (RabbitMQ)", "Which moment?"],
    ["Which moment?", "Give them 10 minutes", 0],
    ["Which moment?", "Finished a film (Scenario C, next)", 1],
    ["Give them 10 minutes", "What have they done? (sinema-recs)"],
    ["What have they done? (sinema-recs)", "Played anything yet?"],
    ["Played anything yet?", "Engaged on their own: done", 0],
    ["Played anything yet?", "Pick one film for them (sinema-recs)", 1],
    ["Pick one film for them (sinema-recs)", "Name & phone (Neon, read-only)"],
    ["Name & phone (Neon, read-only)", "Write the SMS"],
    ["Write the SMS", "Has a phone?"],
    ["Has a phone?", "Send SMS (Africa's Talking)", 0],
    ["Has a phone?", "Record the nudge in PostHog", 1],
    ["Send SMS (Africa's Talking)", "Record the nudge in PostHog"],
  ]),
};


// ── Commerce helpers ─────────────────────────────────────────────────────

const internalNotes = { notes: "Credential: Header Auth 'Yakwetu internal API': x-internal-key = <INTERNAL_API_KEY> (yakwetu/app/.env)", notesInFlow: true };
const skipNgrokWarning = { sendHeaders: true, headerParameters: { parameters: [{ name: "ngrok-skip-browser-warning", value: "1" }] } };

function getOrder(name: string, position: [number, number], orderIdExpression: string): Node {
  return node(name, "httpRequest", 4.2, position, { url: `={{ '${SITE}/api/internal/orders/' + ${orderIdExpression} }}`, ...headerAuth, ...skipNgrokWarning, options: {} }, internalNotes);
}

function createNudgeNode(name: string, position: [number, number], bodyExpression: string): Node {
  return node(
    name,
    "httpRequest",
    4.2,
    position,
    { method: "POST", url: `${SITE}/api/internal/nudges`, ...headerAuth, ...skipNgrokWarning, sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify(${bodyExpression}) }}`, options: {} },
    internalNotes,
  );
}

function sendSms(name: string, position: [number, number], toExpression: string, messageExpression: string): Node {
  return node(
    name,
    "httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: "https://api.africastalking.com/version1/messaging",
      ...headerAuth,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Accept", value: "application/json" }] },
      sendBody: true,
      contentType: "form-urlencoded",
      bodyParameters: {
        parameters: [
          { name: "username", value: AT_USERNAME },
          { name: "to", value: `={{ ${toExpression} }}` },
          { name: "message", value: `={{ ${messageExpression} }}` },
          // The team's registered sender ID: without it Africa's Talking uses its default
          // shortcode, which lines with promotions blocked (DND) refuse as UserInBlacklist.
          ...(process.env.AT_SENDER_ID ? [{ name: "from", value: process.env.AT_SENDER_ID }] : []),
          { name: "bulkSMSMode", value: "1" },
        ],
      },
      options: {},
    },
    { notes: "Credential: Header Auth 'Africa's Talking': apiKey = <AT_API_KEY>. Sends to the viewer's own phone.", notesInFlow: true },
  );
}

function ifTrue(name: string, position: [number, number], expression: string): Node {
  return node(name, "if", 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{ id: randomUUID(), leftValue: `={{ ${expression} }}`, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  });
}

const nudgeSentEvent = (scenario: string, step: string, nudge: string, extra = "") =>
  `[{ event: 'nudge.sent', distinct_id: ${nudge}.userId, properties: { scenario: '${scenario}', step: '${step}', nudgeId: ${nudge}.nudgeId, orderId: ${nudge}.orderId, movieIds: ${nudge}.movieIds, totalKes: ${nudge}.totalKes, discountPct: ${nudge}.discountPct, channel: 'sms'${extra}, $lib: 'n8n-commerce' } }]`;

// ── YKW · Payment rescue (Scenario B) ────────────────────────────────────

const paymentRescue: Workflow = {
  name: "YKW · Payment rescue — Scenario B (q.n8n.payment-failed)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## A payment failed. Win it back, without ever telling a payer it failed.\nFed by **q.n8n.payment-failed** (the storefront publishes `payment.failed` only after Paystack's verify said so).\n\n1. **Ask Paystack again**: M-Pesa timeouts often settle late. Paid after all? Stop.\n2. Order, viewer and films from the storefront; skip if paid, owned, or no phone.\n3. **Resume link** to the *same* order (signed, one use, 24 h), then an SMS written for the failure class (storefront team's copy: insufficient funds, wrong PIN, timeout, limit), with one alternative way to pay.\n4. Wait 2 min (demo; 2 h live). Still unpaid? One **PONA10** incentive (10%, 1 h), then stop. The storefront caps it at 2 messages per order.\n\nPaying through either link credits this workflow: **KES recovered, Scenario B**.",
      [-80, -460],
      560,
      400,
      4,
    ),
    node(
      "Payment failed (RabbitMQ)",
      "rabbitmqTrigger",
      1,
      [0, 0],
      { queue: "q.n8n.payment-failed", options: { acknowledge: "executionFinishesSuccessfully", jsonParseBody: true, onlyContent: true, parallelMessages: 5 } },
      { credentials: { rabbitmq: EXISTING.rabbitmq } },
    ),
    node(
      "Paid after all? (Paystack verify)",
      "httpRequest",
      4.2,
      [240, 0],
      {
        url: "={{ 'https://api.paystack.co/transaction/verify/' + encodeURIComponent($json.properties.reference) }}",
        ...headerAuth,
        options: { response: { response: { neverError: true } } },
      },
      { notes: "Credential: Header Auth 'Paystack secret (test)': Authorization = Bearer <PAYSTACK_SECRET_KEY>", notesInFlow: true },
    ),
    ifTrue("Settled after all?", [480, 0], "$json.data?.status === 'success'"),
    node("Paid: no message (storefront settles it)", "noOp", 1, [720, -160], {}),
    getOrder("Order & viewer (storefront)", [720, 60], "$('Payment failed (RabbitMQ)').item.json.properties.orderId"),
    ifTrue("Worth a message?", [960, 60], "!$json.order.paid && !$json.ownsAll && Boolean($json.user?.phone)"),
    node("Nothing to send", "noOp", 1, [1200, 220], {}),
    createNudgeNode(
      "Resume link (storefront)",
      [1200, -20],
      "{ userId: $json.user.id, scenario: 'B', step: 'first', movieIds: $json.order.movieIds, orderId: $json.order.id, discountPct: 0, ttlMinutes: 1440 }",
    ),
    ifTrue("Link created?", [1440, -20], "$json.status === 'created'"),
    node("Capped or not needed", "noOp", 1, [1680, 140], {}),
    node("Write the rescue SMS", "code", 2, [1680, -100], {
      jsCode: `// The storefront team's failure classes and tone, with our signed resume link.
const failed = $('Payment failed (RabbitMQ)').first().json;
const info = $('Order & viewer (storefront)').first().json;
const link = $input.first().json;
const first = info.user.firstName;
const title = link.films.map((f) => f.title).join(' + ');
const kes = 'KES ' + link.totalKes;
const copy = {
  insufficient_funds: \`Pole \${first}, your M-Pesa balance was short for \${title} (\${kes}). Top up and tap to finish, it's saved: \${link.url}\`,
  wrong_pin: \`Pole \${first}, the M-Pesa PIN didn't go through for \${title}. Tap to try again: \${link.url}\`,
  timeout_or_cancel: \`Pole \${first}, the M-Pesa prompt for \${title} timed out. Tap when your phone's ready: \${link.url}\`,
  limit_exceeded: \`Pole \${first}, \${title} (\${kes}) went over your M-Pesa limit. Tap to pay by card or Till instead: \${link.url}\`,
};
const reason = failed.properties.reason ?? 'declined';
// Every message offers one alternative way to pay (the brief), after the resume link.
const message = copy[reason] ?? \`Pole \${first}, your payment for \${title} didn't go through. Tap to try again, or pay by M-Pesa or card: \${link.url}\`;
return [{ json: { ...link, userId: info.user.id, orderId: info.order.id, phone: info.user.phone, firstName: first, title, reason, message } }];`,
    }),
    sendSms("Send rescue SMS (Africa's Talking)", [1920, -100], "$json.phone", "$json.message"),
    posthogBatch("Record: rescue sent", [2160, -100], nudgeSentEvent("B", "first", "$('Write the rescue SMS').item.json", ", reason: $('Write the rescue SMS').item.json.reason")),
    node("Wait 2 minutes (demo; 2 h live)", "wait", 1.1, [2400, -100], { amount: 2, unit: "minutes" }, { webhookId: randomUUID() }),
    getOrder("Paid yet? (storefront)", [2640, -100], "$('Write the rescue SMS').item.json.orderId"),
    ifTrue("Still unpaid?", [2880, -100], "!$json.order.paid && !$json.ownsAll"),
    node("Recovered: done", "noOp", 1, [3120, 60], {}),
    createNudgeNode(
      "PONA10 link (storefront)",
      [3120, -180],
      "{ userId: $('Write the rescue SMS').item.json.userId, scenario: 'B', step: 'incentive', movieIds: $json.order.movieIds, orderId: $json.order.id, discountPct: 10, code: 'PONA10', ttlMinutes: 60 }",
    ),
    ifTrue("Incentive allowed?", [3360, -180], "$json.status === 'created'"),
    node("Write the incentive SMS", "code", 2, [3600, -260], {
      jsCode: `const rescue = $('Write the rescue SMS').first().json;
const link = $input.first().json;
const message = \`Still want \${rescue.title}, \${rescue.firstName}? Code PONA10: KES \${link.totalKes} (10% off) for the next hour: \${link.url}\`;
return [{ json: { ...link, userId: rescue.userId, orderId: rescue.orderId, phone: rescue.phone, message } }];`,
    }),
    sendSms("Send incentive SMS (Africa's Talking)", [3840, -260], "$json.phone", "$json.message"),
    posthogBatch("Record: incentive sent", [4080, -260], nudgeSentEvent("B", "incentive", "$('Write the incentive SMS').item.json", ", code: 'PONA10'")),
  ],
  connections: wire([
    ["Payment failed (RabbitMQ)", "Paid after all? (Paystack verify)"],
    ["Paid after all? (Paystack verify)", "Settled after all?"],
    ["Settled after all?", "Paid: no message (storefront settles it)", 0],
    ["Settled after all?", "Order & viewer (storefront)", 1],
    ["Order & viewer (storefront)", "Worth a message?"],
    ["Worth a message?", "Resume link (storefront)", 0],
    ["Worth a message?", "Nothing to send", 1],
    ["Resume link (storefront)", "Link created?"],
    ["Link created?", "Write the rescue SMS", 0],
    ["Link created?", "Capped or not needed", 1],
    ["Write the rescue SMS", "Send rescue SMS (Africa's Talking)"],
    ["Send rescue SMS (Africa's Talking)", "Record: rescue sent"],
    ["Record: rescue sent", "Wait 2 minutes (demo; 2 h live)"],
    ["Wait 2 minutes (demo; 2 h live)", "Paid yet? (storefront)"],
    ["Paid yet? (storefront)", "Still unpaid?"],
    ["Still unpaid?", "PONA10 link (storefront)", 0],
    ["Still unpaid?", "Recovered: done", 1],
    ["PONA10 link (storefront)", "Incentive allowed?"],
    ["Incentive allowed?", "Write the incentive SMS", 0],
    ["Write the incentive SMS", "Send incentive SMS (Africa's Talking)"],
    ["Send incentive SMS (Africa's Talking)", "Record: incentive sent"],
  ]),
};

// ── YKW · Abandoned checkout (Scenario A) ────────────────────────────────

const abandonedCheckout: Workflow = {
  name: "YKW · Abandoned checkout — Scenario A (q.n8n.checkout-abandoned)",
  settings: SETTINGS,
  nodes: [
    sticky(
      "## Opened checkout, never paid. Bring them back with a better offer.\nFed by **q.n8n.checkout-abandoned**: the storefront publishes `payment.abandoned` when Paystack still shows nothing paid after the abandonment window (RabbitMQ timers re-check every 2 min).\n\n1. **Quiet hours** 21:00–08:00 Nairobi (storefront team's rule): wait until 08:00.\n2. Order and viewer; skip if paid since, owned, or no phone.\n3. **The recommender** picks the closest film to what was in the cart (`browse` mode, anchored on it).\n4. **Bundle**: cart film + that pick at 20% off (10% off the single film if there's no pick), priced by the storefront, signed link, 1 h.\n5. SMS, then `nudge.sent` in PostHog.\n\nPaying through the link credits **KES recovered, Scenario A**.",
      [-80, -460],
      560,
      400,
      4,
    ),
    node(
      "Checkout abandoned (RabbitMQ)",
      "rabbitmqTrigger",
      1,
      [0, 0],
      { queue: "q.n8n.checkout-abandoned", options: { acknowledge: "executionFinishesSuccessfully", jsonParseBody: true, onlyContent: true, parallelMessages: 5 } },
      { credentials: { rabbitmq: EXISTING.rabbitmq } },
    ),
    node("Quiet hours? (EAT)", "code", 2, [240, 0], {
      jsCode: `// Storefront team's rule: no messages 21:00–08:00 Nairobi. Inside it, wait until 08:00.
const event = $input.first().json;
const now = new Date();
const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Nairobi' }).format(now));
const quiet = hour >= 21 || hour < 8;
let waitUntil = null;
if (quiet) {
  const hoursToEight = (8 - hour + 24) % 24 || 24;
  const eight = new Date(now.getTime() + hoursToEight * 3600_000);
  eight.setUTCMinutes(0, 0, 0);
  waitUntil = eight.toISOString();
}
return [{ json: { ...event, quiet, waitUntil } }];`,
    }),
    ifTrue("Inside quiet hours?", [480, 0], "$json.quiet"),
    node("Wait until 08:00", "wait", 1.1, [720, -140], { resume: "specificTime", dateTime: "={{ $json.waitUntil }}" }, { webhookId: randomUUID() }),
    getOrder("Order & viewer (storefront)", [960, 0], "$('Checkout abandoned (RabbitMQ)').item.json.properties.orderId"),
    ifTrue("Worth a message?", [1200, 0], "!$json.order.paid && !$json.ownsAll && Boolean($json.user?.phone)"),
    node("Nothing to send", "noOp", 1, [1440, 160], {}),
    node(
      "Closest film to the cart (sinema-recs)",
      "httpRequest",
      4.2,
      [1440, -80],
      {
        url: `={{ '${RECS}/v1/recs/' + encodeURIComponent($json.user.id) }}`,
        ...headerAuth,
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: "mode", value: "browse" },
            { name: "anchor", value: "={{ $json.order.movieIds[0] }}" },
            { name: "exclude", value: "={{ $json.order.movieIds.join(',') }}" },
            { name: "limit", value: "3" },
            { name: "log", value: "true" },
          ],
        },
        options: { response: { response: { neverError: true } } },
      },
      { notes: "Credential: Header Auth 'Sinema recs API'. If the recommender is down, the offer is the cart film alone.", notesInFlow: true },
    ),
    node("Build the bundle", "code", 2, [1680, -80], {
      jsCode: `// Cart film + the recommender's closest pick at 20% off; the cart film alone at 10% if there's no pick.
const info = $('Order & viewer (storefront)').first().json;
const picks = $input.first().json?.data?.items ?? [];
const pick = picks.find((item) => !info.order.movieIds.includes(item.movieId) && !info.ownedMovieIds.includes(item.movieId));
const movieIds = pick ? [info.order.movieIds[0], pick.movieId] : info.order.movieIds;
return [{ json: { userId: info.user.id, orderId: info.order.id, movieIds, discountPct: pick ? 20 : 10, pick: pick ? { title: pick.title, reason: pick.reason, genres: pick.genres } : null } }];`,
    }),
    createNudgeNode("Offer link (storefront)", [1920, -80], "{ userId: $json.userId, scenario: 'A', step: 'first', movieIds: $json.movieIds, discountPct: $json.discountPct, ttlMinutes: 60 }"),
    ifTrue("Link created?", [2160, -80], "$json.status === 'created'"),
    node("Capped or not needed", "noOp", 1, [2400, 80], {}),
    node("Write the SMS", "code", 2, [2400, -160], {
      jsCode: `const info = $('Order & viewer (storefront)').first().json;
const link = $input.first().json;
const [cart, extra] = link.films;
const first = info.user.firstName;
const message = extra
  ? \`\${first}, \${cart.title} is still waiting. Get it with \${extra.title} for KES \${link.totalKes} (\${link.discountPct}% off), next hour only: \${link.url}\`
  : \`\${first}, \${cart.title} is still waiting: KES \${link.totalKes} (\${link.discountPct}% off) for the next hour: \${link.url}\`;
return [{ json: { ...link, userId: info.user.id, orderId: info.order.id, phone: info.user.phone, message } }];`,
    }),
    sendSms("Send SMS (Africa's Talking)", [2640, -160], "$json.phone", "$json.message"),
    posthogBatch("Record: offer sent", [2880, -160], nudgeSentEvent("A", "first", "$('Write the SMS').item.json")),
  ],
  connections: wire([
    ["Checkout abandoned (RabbitMQ)", "Quiet hours? (EAT)"],
    ["Quiet hours? (EAT)", "Inside quiet hours?"],
    ["Inside quiet hours?", "Wait until 08:00", 0],
    ["Inside quiet hours?", "Order & viewer (storefront)", 1],
    ["Wait until 08:00", "Order & viewer (storefront)"],
    ["Order & viewer (storefront)", "Worth a message?"],
    ["Worth a message?", "Closest film to the cart (sinema-recs)", 0],
    ["Worth a message?", "Nothing to send", 1],
    ["Closest film to the cart (sinema-recs)", "Build the bundle"],
    ["Build the bundle", "Offer link (storefront)"],
    ["Offer link (storefront)", "Link created?"],
    ["Link created?", "Write the SMS", 0],
    ["Link created?", "Capped or not needed", 1],
    ["Write the SMS", "Send SMS (Africa's Talking)"],
    ["Send SMS (Africa's Talking)", "Record: offer sent"],
  ]),
};

function main() {
  if (!PROJECT_ID || !PROJECT_TOKEN) throw new Error("Set PROJECT_ID and POSTHOG_KEY in .env");
  const dir = join(process.cwd(), "n8n", "workflows");
  mkdirSync(dir, { recursive: true });
  for (const [file, workflow] of [
    ["audiences", audiences],
    ["daily-digest", digest],
    ["ops-guard", opsGuard],
    ["journeys", journeys],
    ["payment-rescue", paymentRescue],
    ["abandoned-checkout", abandonedCheckout],
  ] as const) {
    writeFileSync(join(dir, `${file}.json`), `${JSON.stringify(workflow, null, 2)}\n`);
    console.log(`✓ n8n/workflows/${file}.json · ${workflow.nodes.length} nodes · ${workflow.name}`);
  }
}

main();
