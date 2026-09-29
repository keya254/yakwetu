/**
 * Builds the Yakwetu dashboards in PostHog from code, so they can be rebuilt,
 * reviewed and changed like the rest of the app. Idempotent: an insight or
 * dashboard with the same name is updated, not duplicated.
 *
 *   pnpm posthog:setup
 *
 * Needs POSTHOG_PERSONAL_API_KEY (scopes: insight, dashboard, cohort write;
 * query, person read) and PROJECT_ID in .env.
 *
 * The questions each dashboard answers:
 *   Business pulse     are more people coming, signing up and watching?
 *   Funnel             where do we lose people between landing and watching?
 *   Content & genres   what do people want? (to license and promote)
 *   Recommender        does "For you" earn its place against plain rows?
 *   Audiences          who are our viewers by taste (set nightly by n8n)? + taste cohorts
 */
import "dotenv/config";

const API = "https://us.posthog.com/api";
const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.PROJECT_ID;

type Json = Record<string, unknown>;

async function posthog<T = Json>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}/projects/${project}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function all<T extends { name: string }>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}limit=200`;
  while (next) {
    const page: { results: T[]; next: string | null } = await posthog(next);
    out.push(...page.results);
    next = page.next ? page.next.replace(`${API}/projects/${project}`, "") : null;
  }
  return out;
}

// ── Query builders (PostHog's insight query schema) ─────────────────────

const LAST_30 = { date_from: "-30d" };
const event = (name: string, extra: Json = {}) => ({ kind: "EventsNode", event: name, name, ...extra });

function trends(
  series: Json[],
  options: { breakdown?: string; breakdownType?: "event" | "person"; display?: string; formula?: string; interval?: string; currentPerson?: boolean } = {},
): Json {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series,
      interval: options.interval ?? "day",
      dateRange: LAST_30,
      ...(options.breakdown
        ? { breakdownFilter: { breakdown: options.breakdown, breakdown_type: options.breakdownType ?? "event", breakdown_limit: 12 } }
        : {}),
      trendsFilter: { display: options.display ?? "ActionsLineGraph", ...(options.formula ? { formula: options.formula } : {}) },
      filterTestAccounts: false,
      // The project reads person properties as they were at each event. Taste is set nightly, after the
      // events it describes, so taste charts read the person's *current* profile instead.
      ...(options.currentPerson ? { modifiers: { personsOnEventsMode: "person_id_override_properties_joined" } } : {}),
    },
  };
}

/** A table straight from HogQL: for questions about people rather than events. */
function hogqlTable(sql: string): Json {
  return { kind: "DataTableNode", source: { kind: "HogQLQuery", query: sql.replace(/\s+/g, " ").trim() } };
}

function funnel(steps: Json[], windowHours: number, breakdown?: string): Json {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps,
      dateRange: LAST_30,
      funnelsFilter: { funnelWindowInterval: windowHours, funnelWindowIntervalUnit: "hour", funnelVizType: "steps" },
      ...(breakdown ? { breakdownFilter: { breakdown, breakdown_type: "event" } } : {}),
      filterTestAccounts: false,
    },
  };
}

function retention(): Json {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "RetentionQuery",
      dateRange: { date_from: "-8w" },
      retentionFilter: {
        period: "Week",
        totalIntervals: 8,
        targetEntity: { id: "movie.viewed", name: "movie.viewed", type: "events" },
        returningEntity: { id: "movie.viewed", name: "movie.viewed", type: "events" },
        retentionType: "retention_first_time",
      },
    },
  };
}

interface InsightSpec {
  name: string;
  description: string;
  query: Json;
}

const DASHBOARDS: { name: string; description: string; insights: InsightSpec[] }[] = [
  {
    name: "Yakwetu · Business pulse",
    description: "Are more people coming, signing up and watching? Daily, last 30 days.",
    insights: [
      { name: "Daily active viewers", description: "Unique people with a page view each day.", query: trends([event("$pageview", { math: "dau" })]) },
      { name: "Sign-ups per day", description: "New accounts (recorded server-side, can't be ad-blocked).", query: trends([event("user.signed_up")], { display: "ActionsBar" }) },
      { name: "Film views vs trailer plays", description: "Interest (film page opened) against intent (trailer started).", query: trends([event("movie.viewed"), event("video.started")]) },
      {
        name: "n8n at work: nudges, digests, alerts",
        description: "What the n8n workflows did: welcome nudges prepared, daily digests sent, pipeline alerts and recoveries, audience syncs.",
        query: trends([event("nudge.prepared"), event("digest.sent"), event("ops.alert"), event("ops.recovered"), event("audiences.synced")], { display: "ActionsBar" }),
      },
      { name: "Weekly return rate", description: "Of people who first viewed a film in a week, how many came back to view another in later weeks.", query: retention() },
    ],
  },
  {
    name: "Yakwetu · Funnel",
    description: "Where do we lose people between landing and watching (and, once Paystack is in, paying)?",
    insights: [
      {
        name: "Landing → trailer watched",
        description: "Each step's drop-off. Within one day.",
        query: funnel([event("$pageview"), event("movie.viewed"), event("video.play_clicked"), event("video.started"), event("video.completed")], 24),
      },
      {
        name: "Sign-up gate: prompt → account → watching",
        description: "What the sign-up wall costs: of viewers asked to sign up when pressing play, how many did, and then watched. Within one hour.",
        query: funnel([event("video.auth_prompted"), event("user.signed_up"), event("video.started")], 1),
      },
      {
        name: "Film page → trailer, by genre",
        description: "Which genres turn a visit into a trailer play.",
        query: funnel([event("movie.viewed"), event("video.started")], 1, "primaryGenre"),
      },
    ],
  },
  {
    name: "Yakwetu · Content & genres",
    description: "What do people want? For licensing and what to put on the home page.",
    insights: [
      { name: "Film views by genre", description: "Film pages opened, by the film's primary genre.", query: trends([event("movie.viewed")], { breakdown: "primaryGenre", display: "ActionsBarValue" }) },
      { name: "Viewers by genre", description: "Unique people per genre: breadth of interest, not repeat visits.", query: trends([event("movie.viewed", { math: "dau" })], { breakdown: "primaryGenre", display: "ActionsBarValue" }) },
      {
        name: "Trailer completion rate by genre (%)",
        description: "Trailers watched to the end ÷ trailers started. High = the trailer sells the film.",
        query: trends([event("video.completed"), event("video.started")], { breakdown: "primaryGenre", display: "ActionsBarValue", formula: "A / B * 100" }),
      },
      {
        name: "Average time on a film page by genre (s)",
        description: "Visible seconds before leaving the film page (background tabs excluded).",
        query: trends([event("movie.left", { math: "avg", math_property: "dwellMs" })], { breakdown: "primaryGenre", display: "ActionsBarValue", formula: "A / 1000" }),
      },
      { name: "Top films by views", description: "The titles people open most.", query: trends([event("movie.viewed")], { breakdown: "movieTitle", display: "ActionsBarValue" }) },
      { name: "Top films by trailer plays", description: "The titles people actually press play on.", query: trends([event("video.started")], { breakdown: "movieTitle", display: "ActionsBarValue" }) },
    ],
  },
  {
    name: "Yakwetu · Audiences",
    description: "Who our viewers are by taste. Person properties come from the recommender, copied nightly by n8n (YKW · Audiences).",
    insights: [
      {
        name: "Audience size by favourite genre",
        description: "Every viewer the recommender has profiled, by favourite genre, active this month or not. Counts people, not events.",
        query: hogqlTable(`SELECT properties.favoriteGenre AS favourite_genre, count() AS viewers,
            sum(toInt(properties.trailersWatched)) AS trailers_watched, sum(toInt(properties.filmsOwned)) AS films_owned
          FROM persons WHERE properties.favoriteGenre IS NOT NULL
          GROUP BY favourite_genre ORDER BY viewers DESC`),
      },
      {
        name: "Viewers by favourite genre",
        description: "Unique people active in the period, by the favourite genre the recommender learned for them.",
        query: trends([event("$pageview", { math: "dau" })], { breakdown: "favoriteGenre", breakdownType: "person", display: "ActionsBarValue", currentPerson: true }),
      },
      {
        name: "Trailer plays by viewer taste",
        description: "Do drama lovers only play dramas? Trailer plays split by the viewer's favourite genre.",
        query: trends([event("video.started")], { breakdown: "favoriteGenre", breakdownType: "person", display: "ActionsBarValue", currentPerson: true }),
      },
      {
        name: "What each taste watches",
        description: "Trailer plays by the film's genre, for comparison with the chart above: where tastes cross over.",
        query: trends([event("video.started")], { breakdown: "primaryGenre", display: "ActionsBarValue" }),
      },
    ],
  },
  {
    name: "Yakwetu · Recommender",
    description: "Does 'For you' (sinema-recs) earn its place against the plain catalogue rows?",
    insights: [
      { name: "Film taps by row", description: "Which row a film was opened from: For you, Trending, Made in Kenya, More like this…", query: trends([event("movie.clicked")], { breakdown: "row", display: "ActionsBarValue" }) },
      { name: "Film taps by row over time", description: "Share of taps per row, day by day.", query: trends([event("movie.clicked")], { breakdown: "row", display: "ActionsAreaGraph" }) },
      { name: "Tap position within a row", description: "How far along a row people tap: 1 = first card. Low numbers mean the order matters.", query: trends([event("movie.clicked")], { breakdown: "position", display: "ActionsBarValue" }) },
    ],
  },
];

/** Taste cohorts, on the favoriteGenre person property that n8n syncs nightly. For filters and targeting. */
const COHORTS: { name: string; genre: string }[] = [
  { name: "Drama lovers", genre: "drama" },
  { name: "Thriller fans", genre: "thriller" },
  { name: "Comedy fans", genre: "comedy" },
  { name: "Romance fans", genre: "romance" },
  { name: "Family audience", genre: "family" },
  { name: "Crime & action fans", genre: "crime" },
  { name: "Documentary viewers", genre: "documentary" },
];

async function syncCohorts() {
  const existing = await all<{ id: number; name: string; deleted?: boolean }>("/cohorts/");
  for (const cohort of COHORTS) {
    const body = {
      name: cohort.name,
      description: `Viewers whose favourite genre (learned by sinema-recs, synced nightly by n8n) is ${cohort.genre}.`,
      filters: { properties: { type: "AND", values: [{ type: "AND", values: [{ key: "favoriteGenre", type: "person", value: [cohort.genre], operator: "exact" }] }] } },
    };
    const found = existing.find((item) => item.name === cohort.name && !item.deleted);
    if (found) await posthog(`/cohorts/${found.id}/`, { method: "PATCH", body });
    else await posthog("/cohorts/", { method: "POST", body });
  }
  console.log(`✓ Cohorts: ${COHORTS.map((cohort) => cohort.name).join(", ")}`);
}

async function main() {
  if (!key || !project) throw new Error("Set POSTHOG_PERSONAL_API_KEY and PROJECT_ID in .env");

  const existingDashboards = await all<{ id: number; name: string; deleted?: boolean }>("/dashboards/");
  const existingInsights = await all<{ id: number; name: string; short_id: string; deleted?: boolean }>("/insights/?basic=true");

  for (const dashboard of DASHBOARDS) {
    const found = existingDashboards.find((item) => item.name === dashboard.name && !item.deleted);
    const { id: dashboardId } = found
      ? await posthog<{ id: number }>(`/dashboards/${found.id}/`, { method: "PATCH", body: { description: dashboard.description, pinned: true } })
      : await posthog<{ id: number }>("/dashboards/", { method: "POST", body: { name: dashboard.name, description: dashboard.description, pinned: true } });

    for (const insight of dashboard.insights) {
      const body = { name: insight.name, description: insight.description, query: insight.query, dashboards: [dashboardId], saved: true };
      const match = existingInsights.find((item) => item.name === insight.name && !item.deleted);
      if (match) await posthog(`/insights/${match.id}/`, { method: "PATCH", body });
      else await posthog("/insights/", { method: "POST", body });
    }
    console.log(`✓ ${dashboard.name}: ${dashboard.insights.length} insights → https://us.posthog.com/project/${project}/dashboard/${dashboardId}`);
  }
  await syncCohorts();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
