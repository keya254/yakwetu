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

function main() {
  if (!PROJECT_ID || !PROJECT_TOKEN) throw new Error("Set PROJECT_ID and POSTHOG_KEY in .env");
  const dir = join(process.cwd(), "n8n", "workflows");
  mkdirSync(dir, { recursive: true });
  for (const [file, workflow] of [
    ["audiences", audiences],
    ["daily-digest", digest],
    ["ops-guard", opsGuard],
    ["journeys", journeys],
  ] as const) {
    writeFileSync(join(dir, `${file}.json`), `${JSON.stringify(workflow, null, 2)}\n`);
    console.log(`✓ n8n/workflows/${file}.json · ${workflow.nodes.length} nodes · ${workflow.name}`);
  }
}

main();
