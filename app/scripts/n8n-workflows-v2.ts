/**
 * The storefront team's YKW 02/03/04 rebuilt on our system (v2), the digest
 * v2 and "Ask Yakwetu". Imported by build-n8n-workflows.ts.
 *
 * What changes from their originals: RabbitMQ triggers instead of a webhook
 * and 15-minute Postgres scans; the storefront API (orders, signed nudge
 * links, caps, attribution) and PostHog instead of their session/event
 * tables; Paystack verify before any "failed" message; AI copy that code
 * checks before it's sent. What stays: their scenarios, failure classes, tone
 * ("Pole!"), PONA10, the bundle-and-reminder shape, and their names.
 */
import { randomUUID } from "node:crypto";
import * as code from "./n8n-code";

type Node = Record<string, unknown> & { name: string };
type ConnectionType = "main" | "ai_languageModel" | "ai_outputParser" | "ai_tool" | "ai_memory";
type Connections = Record<string, Partial<Record<ConnectionType, { node: string; type: ConnectionType; index: number }[][]>>>;
export interface Workflow {
  name: string;
  nodes: Node[];
  connections: Connections;
  settings: Record<string, unknown>;
}

export interface V2Config {
  site: string;
  recs: string;
  posthogApp: string;
  posthogIngest: string;
  projectId: string;
  projectToken: string;
  digestTo: string;
  atUsername: string;
  atSenderId?: string;
}

/** Credentials already in the n8n workspace, referenced by id (never copied). */
const CREDS = {
  rabbitmq: { rabbitmq: { id: "0XUkvX0FdyyHYkKN", name: "RabbitMQ account" } },
  internal: { httpHeaderAuth: { id: "8xVhWQpGmgkd32mG", name: "Yakwetu Internal Api Key" } },
  recs: { httpHeaderAuth: { id: "FCJ9jxToPVMeaOvM", name: "Sinema recs API" } },
  sms: { httpHeaderAuth: { id: "YQE2SdNTmX1gcmbM", name: "Africastalking API KEY" } },
  paystack: { httpHeaderAuth: { id: "bYa7w7Nx6KOyl0Zr", name: "Paystack secret" } },
  posthogRead: { httpHeaderAuth: { id: "ZRYWNG9VSqlxkAvj", name: "PostHog personal (read)" } },
  gmail: { gmailOAuth2: { id: "nf01MA1vhcwQsDZV", name: "Gmail account" } },
};

const SETTINGS = { executionOrder: "v1", timezone: "Africa/Nairobi", saveManualExecutions: true, callerPolicy: "workflowsFromSameOwner" };
const headerAuth = { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" };
const skipNgrokWarning = { sendHeaders: true, headerParameters: { parameters: [{ name: "ngrok-skip-browser-warning", value: "1" }] } };

function node(name: string, type: string, typeVersion: number, position: [number, number], parameters: Record<string, unknown>, extra: Record<string, unknown> = {}): Node {
  return { id: randomUUID(), name, type, typeVersion, position, parameters, ...extra };
}
const base = (type: string) => `n8n-nodes-base.${type}`;
const lc = (type: string) => `@n8n/n8n-nodes-langchain.${type}`;

function sticky(content: string, position: [number, number], width = 560, height = 400, color = 4): Node {
  return node(`Note ${randomUUID().slice(0, 6)}`, base("stickyNote"), 1, position, { content, width, height, color });
}

/** [from, to, outputIndex?, connectionType?] */
function wire(pairs: [string, string, number?, ConnectionType?][]): Connections {
  const connections: Connections = {};
  for (const [from, to, output = 0, type = "main"] of pairs) {
    connections[from] ??= {};
    const lanes = (connections[from][type] ??= []);
    while (lanes.length <= output) lanes.push([]);
    lanes[output].push({ node: to, type, index: 0 });
  }
  return connections;
}

function ifTrue(name: string, position: [number, number], expression: string): Node {
  return node(name, base("if"), 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{ id: randomUUID(), leftValue: `={{ ${expression} }}`, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  });
}

function codeNode(name: string, position: [number, number], fn: () => unknown): Node {
  return node(name, base("code"), 2, position, { jsCode: code.codeOf(fn) });
}

function waitUntil(name: string, position: [number, number], expression: string): Node {
  return node(name, base("wait"), 1.1, position, { resume: "specificTime", dateTime: `={{ ${expression} }}` }, { webhookId: randomUUID() });
}

function waitFor(name: string, position: [number, number], amount: number, unit: "minutes" | "hours"): Node {
  return node(name, base("wait"), 1.1, position, { amount, unit }, { webhookId: randomUUID() });
}

export function buildV2(config: V2Config): [string, Workflow][] {
  const trigger = (name: string, queue: string, position: [number, number] = [0, 0]) =>
    node(name, base("rabbitmqTrigger"), 1, position, { queue, options: { acknowledge: "executionFinishesSuccessfully", jsonParseBody: true, onlyContent: true, parallelMessages: 5 } }, { credentials: CREDS.rabbitmq });

  const getOrder = (name: string, position: [number, number], orderIdExpression: string) =>
    node(name, base("httpRequest"), 4.2, position, { url: `={{ '${config.site}/api/internal/orders/' + ${orderIdExpression} }}`, ...headerAuth, ...skipNgrokWarning, options: {} }, { credentials: CREDS.internal });

  const internalPost = (name: string, position: [number, number], path: string, bodyExpression: string) =>
    node(
      name,
      base("httpRequest"),
      4.2,
      position,
      { method: "POST", url: `${config.site}${path}`, ...headerAuth, ...skipNgrokWarning, sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify(${bodyExpression}) }}`, options: {} },
      { credentials: CREDS.internal },
    );

  const internalGet = (name: string, position: [number, number], urlExpression: string) =>
    node(name, base("httpRequest"), 4.2, position, { url: `={{ ${urlExpression} }}`, ...headerAuth, ...skipNgrokWarning, options: {} }, { credentials: CREDS.internal });

  const recsPick = (name: string, position: [number, number], mode: "browse" | "next", anchorExpression: string, excludeExpression: string, limit: number) =>
    node(
      name,
      base("httpRequest"),
      4.2,
      position,
      {
        url: `={{ '${config.recs}/v1/recs/' + encodeURIComponent($('Order & viewer (storefront)').item.json.user.id) }}`,
        ...headerAuth,
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: "mode", value: mode },
            { name: "anchor", value: `={{ ${anchorExpression} }}` },
            { name: "exclude", value: `={{ ${excludeExpression} }}` },
            { name: "limit", value: String(limit) },
            { name: "log", value: "true" },
          ],
        },
        options: { response: { response: { neverError: true } } },
      },
      { credentials: CREDS.recs, notes: "If the recommender is down this answers empty and the offer falls back to the cart film alone.", notesInFlow: true },
    );

  const sendSms = (name: string, position: [number, number]) =>
    node(
      name,
      base("httpRequest"),
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
            { name: "username", value: config.atUsername },
            { name: "to", value: "={{ $json.phone }}" },
            { name: "message", value: "={{ $json.message }}" },
            ...(config.atSenderId ? [{ name: "from", value: config.atSenderId }] : []),
            { name: "bulkSMSMode", value: "1" },
          ],
        },
        options: {},
      },
      { credentials: CREDS.sms },
    );

  const posthogBatch = (name: string, position: [number, number], batchExpression: string) =>
    node(name, base("httpRequest"), 4.2, position, {
      method: "POST",
      url: `${config.posthogIngest}/batch/`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ api_key: '${config.projectToken}', batch: ${batchExpression} }) }}`,
      options: {},
    });

  const nudgeSent = (name: string, position: [number, number], scenario: string, step: string, extra = "") =>
    posthogBatch(
      name,
      position,
      `[{ event: 'nudge.sent', distinct_id: $json.userId, properties: { scenario: '${scenario}', step: '${step}', nudgeId: $json.nudgeId, movieIds: $json.movieIds, totalKes: $json.totalKes, discountPct: $json.discountPct, aiUsed: $json.aiUsed ?? false, fallbackReason: $json.fallbackReason ?? null, channel: 'sms'${extra}, $lib: 'n8n-commerce' } }]`,
    );

  /**
   * AI copy: a Basic LLM Chain with an OpenAI model and a structured output
   * parser ({ message }). If the model fails, the chain continues with an error
   * and the guard node sends the template instead. The facts are the only
   * input; the AI never chooses films, prices or links.
   */
  const aiCopy = (chainName: string, position: [number, number], system: string, prompt: string): Node[] => [
    node(
      chainName,
      lc("chainLlm"),
      1.7,
      position,
      { promptType: "define", text: `=${prompt}`, hasOutputParser: true, messages: { messageValues: [{ message: system }] } },
      { onError: "continueRegularOutput", notes: "Credential: attach your OpenAI credential on the model below (gpt-4o-mini).", notesInFlow: true },
    ),
    node(`${chainName} · model`, lc("lmChatOpenAi"), 1.2, [position[0] - 40, position[1] + 200], {
      model: { __rl: true, value: "gpt-4o-mini", mode: "list", cachedResultName: "gpt-4o-mini" },
      options: { temperature: 0.7, maxTokens: 120, timeout: 20000 },
    }),
    node(`${chainName} · parser`, lc("outputParserStructured"), 1.2, [position[0] + 140, position[1] + 200], {
      schemaType: "fromJson",
      jsonSchemaExample: JSON.stringify({ message: "Pole Wanjiku, the M-Pesa prompt for Supa Modo timed out. Tap when your phone's ready:" }, null, 2),
    }),
  ];
  const aiWires = (chainName: string): [string, string, number?, ConnectionType?][] => [
    [`${chainName} · model`, chainName, 0, "ai_languageModel"],
    [`${chainName} · parser`, chainName, 0, "ai_outputParser"],
  ];

  const SMS_RULES =
    "Rules: at most 110 characters. Warm, plain Kenyan English (a little Swahili like 'Pole' or 'Karibu' is fine). Use only the facts given: never invent a film, price, discount or deadline. Mention the price only if given, exactly as given. No links, no emojis, no hashtags; the link is added after your message. End so the link reads naturally after it (e.g. end with 'Tap:' or 'here:').";

  // ── YKW 03 v2: Payment Failure Rescue ─────────────────────────────────
  const rescueChain = "AI: troubleshooting copy";
  const rescue: Workflow = {
    name: "YKW 03 — Payment Failure Rescue · v2 (RabbitMQ)",
    settings: SETTINGS,
    nodes: [
      sticky(
        "## YKW 03 v2: Payment failure rescue\nThe storefront team's scenario (failure classes, \"Pole\" tone, PONA10) on our plumbing:\n\n- **RabbitMQ** `q.n8n.payment-failed`: the storefront publishes `payment.failed` only after Paystack verify said so. No webhook, no polling.\n- **Paystack verify again** first: M-Pesa often settles late. Paid? Stop. Never tell a payer it failed.\n- **Send window** 07:00–21:00 Nairobi (held, not dropped, outside it).\n- **Signed resume link** to the *same* order (one use, 24 h); caps (2 per order, 20 per viewer/day) enforced by the storefront.\n- **AI copy** (gpt-4o-mini) from facts only, **checked by code**: too long, a link, or a wrong price → their template instead.\n- Still unpaid after 2 min (demo; 2 h live) → one **PONA10** (10%, 1 h). Paying through either link credits *KES recovered · B*.",
        [-80, -500],
      ),
      trigger("Payment failed (RabbitMQ)", "q.n8n.payment-failed"),
      node(
        "Paid after all? (Paystack verify)",
        base("httpRequest"),
        4.2,
        [240, 0],
        { url: "={{ 'https://api.paystack.co/transaction/verify/' + encodeURIComponent($json.properties.reference) }}", ...headerAuth, options: { response: { response: { neverError: true } } } },
        { credentials: CREDS.paystack },
      ),
      ifTrue("Settled after all?", [480, 0], "$json.data?.status === 'success'"),
      node("Paid: no message", base("noOp"), 1, [720, -160], {}),
      getOrder("Order & viewer (storefront)", [720, 60], "$('Payment failed (RabbitMQ)').item.json.properties.orderId"),
      ifTrue("Worth a message?", [960, 60], "!$json.order.paid && !$json.ownsAll && Boolean($json.user?.phone)"),
      node("Nothing to send", base("noOp"), 1, [1200, 220], {}),
      codeNode("Send window (07:00–21:00)", [1200, -20], code.rescueWindow),
      ifTrue("Outside the window?", [1440, -20], "$json.holdUntilWindow"),
      waitUntil("Hold until the window opens", [1680, -160], "$json.sendAt"),
      internalPost(
        "Resume link (storefront)",
        [1920, -20],
        "/api/internal/nudges",
        "{ userId: $('Order & viewer (storefront)').item.json.user.id, scenario: 'B', step: 'first', movieIds: $('Order & viewer (storefront)').item.json.order.movieIds, orderId: $('Order & viewer (storefront)').item.json.order.id, discountPct: 0, ttlMinutes: 1440 }",
      ),
      ifTrue("Link created?", [2160, -20], "$json.status === 'created'"),
      node("Capped or not needed", base("noOp"), 1, [2400, 140], {}),
      codeNode("Rescue facts", [2400, -100], code.rescueFacts),
      ...aiCopy(
        rescueChain,
        [2640, -100],
        `You write one SMS for a viewer whose payment for a film just failed on Yakwetu Sinema, a Kenyan pay-per-film store. Help them finish. ${SMS_RULES}`,
        "First name: {{ $json.firstName }}\nFilm: {{ $json.title }}\nWhat went wrong: {{ $json.reason }}\nWhat to suggest: {{ $json.strategy }}\nPrice: KES {{ $json.totalKes }}",
      ),
      codeNode("Guard the copy", [2880, -100], code.guardRescueCopy),
      sendSms("Send rescue SMS (Africa's Talking)", [3120, -100]),
      nudgeSent("Record: rescue sent", [3360, -100], "B", "first", ", reason: $json.reason"),
      waitFor("Wait 2 minutes (demo; 2 h live)", [3600, -100], 2, "minutes"),
      getOrder("Paid yet? (storefront)", [3840, -100], "$('Rescue facts').item.json.orderId"),
      ifTrue("Still unpaid?", [4080, -100], "!$json.order.paid && !$json.ownsAll"),
      node("Recovered: done", base("noOp"), 1, [4320, 60], {}),
      internalPost(
        "PONA10 link (storefront)",
        [4320, -180],
        "/api/internal/nudges",
        "{ userId: $('Rescue facts').item.json.userId, scenario: 'B', step: 'incentive', movieIds: $json.order.movieIds, orderId: $json.order.id, discountPct: 10, code: 'PONA10', ttlMinutes: 60 }",
      ),
      ifTrue("Incentive allowed?", [4560, -180], "$json.status === 'created'"),
      codeNode("Write the incentive SMS", [4800, -260], code.rescueIncentive),
      sendSms("Send incentive SMS (Africa's Talking)", [5040, -260]),
      nudgeSent("Record: incentive sent", [5280, -260], "B", "incentive", ", code: 'PONA10'"),
    ],
    connections: wire([
      ["Payment failed (RabbitMQ)", "Paid after all? (Paystack verify)"],
      ["Paid after all? (Paystack verify)", "Settled after all?"],
      ["Settled after all?", "Paid: no message", 0],
      ["Settled after all?", "Order & viewer (storefront)", 1],
      ["Order & viewer (storefront)", "Worth a message?"],
      ["Worth a message?", "Send window (07:00–21:00)", 0],
      ["Worth a message?", "Nothing to send", 1],
      ["Send window (07:00–21:00)", "Outside the window?"],
      ["Outside the window?", "Hold until the window opens", 0],
      ["Outside the window?", "Resume link (storefront)", 1],
      ["Hold until the window opens", "Resume link (storefront)"],
      ["Resume link (storefront)", "Link created?"],
      ["Link created?", "Rescue facts", 0],
      ["Link created?", "Capped or not needed", 1],
      ["Rescue facts", rescueChain],
      ...aiWires(rescueChain),
      [rescueChain, "Guard the copy"],
      ["Guard the copy", "Send rescue SMS (Africa's Talking)"],
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

  // ── YKW 02 v2: Browse & Cart Abandonment Recovery ─────────────────────
  const offerChain = "AI: personalise the nudge";
  const abandonment: Workflow = {
    name: "YKW 02 — Browse & Cart Abandonment Recovery · v2 (RabbitMQ)",
    settings: SETTINGS,
    nodes: [
      sticky(
        "## YKW 02 v2: Abandoned checkout\nThe storefront team's scenario, without the 15-minute Postgres scan:\n\n- **RabbitMQ** `q.n8n.checkout-abandoned`: the storefront publishes `payment.abandoned` when Paystack still shows nothing paid after the window (RabbitMQ timers re-check every 2 min). Each checkout has its own timer; nothing scans.\n- **Send window 15:00–21:00** Nairobi, when people unwind and watch; outside it, held until 15:00.\n- Skip if paid since, owned, or no phone.\n- **The recommender** picks the closest film to the cart; bundle at 20% off (10% off the cart film alone without a pick). The **storefront prices it** and signs the link (1 h).\n- **AI copy** from facts only, checked by code; template if it fails.\n\nPaying through the link credits *KES recovered · A*.",
        [-80, -500],
      ),
      trigger("Checkout abandoned (RabbitMQ)", "q.n8n.checkout-abandoned"),
      codeNode("Send window (15:00–21:00)", [240, 0], code.offerWindow),
      ifTrue("Outside the window?", [480, 0], "$json.holdUntilWindow"),
      waitUntil("Hold until 15:00", [720, -140], "$json.sendAt"),
      getOrder("Order & viewer (storefront)", [960, 0], "$('Checkout abandoned (RabbitMQ)').item.json.properties.orderId"),
      ifTrue("Worth a message?", [1200, 0], "!$json.order.paid && !$json.ownsAll && Boolean($json.user?.phone)"),
      node("Nothing to send", base("noOp"), 1, [1440, 160], {}),
      recsPick("Closest film to the cart (sinema-recs)", [1440, -80], "browse", "$json.order.movieIds[0]", "$json.order.movieIds.join(',')", 3),
      codeNode("Build the bundle", [1680, -80], code.abandonedBundle),
      internalPost("Offer link (storefront)", [1920, -80], "/api/internal/nudges", "{ userId: $json.userId, scenario: 'A', step: 'first', movieIds: $json.movieIds, discountPct: $json.discountPct, ttlMinutes: 60 }"),
      ifTrue("Link created?", [2160, -80], "$json.status === 'created'"),
      node("Capped or not needed", base("noOp"), 1, [2400, 80], {}),
      codeNode("Offer facts", [2400, -160], code.abandonedFacts),
      ...aiCopy(
        offerChain,
        [2640, -160],
        `You write one SMS to bring back a viewer who opened checkout on Yakwetu Sinema, a Kenyan pay-per-film store, but didn't pay. Make the offer tempting and specific. ${SMS_RULES}`,
        "First name: {{ $json.firstName }}\nFilm in their cart: {{ $json.cartTitle }}\nPaired film (may be empty): {{ $json.pickTitle }}\nWhy it's paired: {{ $json.pickReason }}\nBundle price: KES {{ $json.totalKes }} ({{ $json.discountPct }}% off)\nOffer ends: in 1 hour",
      ),
      codeNode("Guard the copy", [2880, -160], code.guardOfferCopy),
      sendSms("Send SMS (Africa's Talking)", [3120, -160]),
      nudgeSent("Record: offer sent", [3360, -160], "A", "first"),
    ],
    connections: wire([
      ["Checkout abandoned (RabbitMQ)", "Send window (15:00–21:00)"],
      ["Send window (15:00–21:00)", "Outside the window?"],
      ["Outside the window?", "Hold until 15:00", 0],
      ["Outside the window?", "Order & viewer (storefront)", 1],
      ["Hold until 15:00", "Order & viewer (storefront)"],
      ["Order & viewer (storefront)", "Worth a message?"],
      ["Worth a message?", "Closest film to the cart (sinema-recs)", 0],
      ["Worth a message?", "Nothing to send", 1],
      ["Closest film to the cart (sinema-recs)", "Build the bundle"],
      ["Build the bundle", "Offer link (storefront)"],
      ["Offer link (storefront)", "Link created?"],
      ["Link created?", "Offer facts", 0],
      ["Link created?", "Capped or not needed", 1],
      ["Offer facts", offerChain],
      ...aiWires(offerChain),
      [offerChain, "Guard the copy"],
      ["Guard the copy", "Send SMS (Africa's Talking)"],
      ["Send SMS (Africa's Talking)", "Record: offer sent"],
    ]),
  };

  // ── YKW 04 v2: Post-Purchase Upsell ───────────────────────────────────
  const upsellChain = "AI: build the bundle offer";
  const upsell: Workflow = {
    name: "YKW 04 — Post-Purchase Upsell · v2 (RabbitMQ)",
    settings: SETTINGS,
    nodes: [
      sticky(
        "## YKW 04 v2: Post-purchase upsell\nThe storefront team's post-watch upsell. For now a purchase ends in confetti (no in-app player), so it follows the purchase:\n\n- **RabbitMQ** `q.n8n.post-purchase` ← `purchase.confirmed` (written in the same transaction as the payment).\n- **Give them tonight** to watch, then the next **15:00–21:00** window (DEMO: 2 min; switch it off in the node).\n- **The recommender's `next` mode**, anchored on the film they bought, minus what they own → a two-film bundle at 20% off, priced and signed by the storefront (24 h).\n- **AI copy** from facts only, checked by code.\n- **Last call** after 3 min (demo; 24 h live) only if the link wasn't used and they don't already own the films.",
        [-80, -500],
      ),
      trigger("Purchase confirmed (RabbitMQ)", "q.n8n.post-purchase"),
      codeNode("Give them tonight", [240, 0], code.afterTheyWatch),
      waitUntil("Wait until the next evening", [480, 0], "$json.sendAt"),
      getOrder("Order & viewer (storefront)", [720, 0], "$('Purchase confirmed (RabbitMQ)').item.json.properties.orderId"),
      ifTrue("Reachable?", [960, 0], "Boolean($json.user?.phone)"),
      node("No phone: skip", base("noOp"), 1, [1200, 160], {}),
      recsPick("What to watch next (sinema-recs)", [1200, -80], "next", "$json.order.movieIds[0]", "$json.ownedMovieIds.concat($json.order.movieIds).join(',')", 4),
      codeNode("Pick the bundle", [1440, -80], code.upsellBundle),
      ifTrue("Anything to offer?", [1680, -80], "$json.hasPicks"),
      node("Nothing new to offer", base("noOp"), 1, [1920, 80], {}),
      internalPost("Bundle link (storefront)", [1920, -160], "/api/internal/nudges", "{ userId: $json.userId, scenario: 'C', step: 'first', movieIds: $json.movieIds, discountPct: 20, ttlMinutes: 1440 }"),
      ifTrue("Link created?", [2160, -160], "$json.status === 'created'"),
      node("Capped", base("noOp"), 1, [2400, 0], {}),
      codeNode("Upsell facts", [2400, -240], code.upsellFacts),
      ...aiCopy(
        upsellChain,
        [2640, -240],
        `You write one SMS to a viewer who just bought a film on Yakwetu Sinema, a Kenyan pay-per-film store, suggesting what to watch next as a bundle. ${SMS_RULES}`,
        "First name: {{ $json.firstName }}\nThey bought: {{ $json.boughtTitle }} ({{ $json.genre }})\nSuggested next: {{ $json.pickTitles.join(' and ') }}\nBundle price: KES {{ $json.totalKes }} ({{ $json.discountPct }}% off)",
      ),
      codeNode("Guard the copy", [2880, -240], code.guardUpsellCopy),
      sendSms("Send upsell SMS (Africa's Talking)", [3120, -240]),
      nudgeSent("Record: upsell sent", [3360, -240], "C", "first"),
      waitFor("Wait 3 minutes (demo; 24 h live)", [3600, -240], 3, "minutes"),
      internalGet("Used yet? (storefront)", [3840, -240], `'${config.site}/api/internal/nudges/' + $('Guard the copy').item.json.nudgeId`),
      ifTrue("Still open?", [4080, -240], "!$json.converted && !$json.ownsAll && !$json.expired"),
      node("Bought: done", base("noOp"), 1, [4320, -80], {}),
      codeNode("Write the last call", [4320, -320], code.upsellReminder),
      sendSms("Send last call (Africa's Talking)", [4560, -320]),
      nudgeSent("Record: last call sent", [4800, -320], "C", "reminder"),
    ],
    connections: wire([
      ["Purchase confirmed (RabbitMQ)", "Give them tonight"],
      ["Give them tonight", "Wait until the next evening"],
      ["Wait until the next evening", "Order & viewer (storefront)"],
      ["Order & viewer (storefront)", "Reachable?"],
      ["Reachable?", "What to watch next (sinema-recs)", 0],
      ["Reachable?", "No phone: skip", 1],
      ["What to watch next (sinema-recs)", "Pick the bundle"],
      ["Pick the bundle", "Anything to offer?"],
      ["Anything to offer?", "Bundle link (storefront)", 0],
      ["Anything to offer?", "Nothing new to offer", 1],
      ["Bundle link (storefront)", "Link created?"],
      ["Link created?", "Upsell facts", 0],
      ["Link created?", "Capped", 1],
      ["Upsell facts", upsellChain],
      ...aiWires(upsellChain),
      [upsellChain, "Guard the copy"],
      ["Guard the copy", "Send upsell SMS (Africa's Talking)"],
      ["Send upsell SMS (Africa's Talking)", "Record: upsell sent"],
      ["Record: upsell sent", "Wait 3 minutes (demo; 24 h live)"],
      ["Wait 3 minutes (demo; 24 h live)", "Used yet? (storefront)"],
      ["Used yet? (storefront)", "Still open?"],
      ["Still open?", "Write the last call", 0],
      ["Still open?", "Bought: done", 1],
      ["Write the last call", "Send last call (Africa's Talking)"],
      ["Send last call (Africa's Talking)", "Record: last call sent"],
    ]),
  };

  // ── Daily digest v2 (HTML email report) ───────────────────────────────
  const hogql = (name: string, position: [number, number], sql: string) =>
    node(
      name,
      base("httpRequest"),
      4.2,
      position,
      {
        method: "POST",
        url: `${config.posthogApp}/api/projects/${config.projectId}/query/`,
        ...headerAuth,
        sendBody: true,
        specifyBody: "json",
        jsonBody: JSON.stringify({ query: { kind: "HogQLQuery", query: sql.replace(/\s+/g, " ").trim() } }),
        options: {},
      },
      { credentials: CREDS.posthogRead },
    );

  const digest: Workflow = {
    name: "YKW · Daily digest — business report email (07:00)",
    settings: SETTINGS,
    nodes: [
      sticky(
        "## Daily digest: a business report in your inbox\nAt 07:00 Nairobi:\n- **PostHog** (behaviour): viewers, sign-ups, film views, trailers, checkouts; genres; top films. Last 24 h against the 24 before.\n- **Storefront** (money, Paystack-verified): revenue, payments by status, failure reasons, nudges sent → opened → paid and **KES recovered** per scenario.\n- **n8n HTML node** renders the report (email-safe tables); Gmail sends it; PostHog records `digest.sent`.\n\nNo made-up numbers: an empty section says \"No data yet\".",
        [-80, -460],
        520,
        340,
      ),
      node("Every day at 07:00", base("scheduleTrigger"), 1.2, [0, 0], { rule: { interval: [{ field: "cronExpression", expression: "0 7 * * *" }] } }),
      hogql(
        "Headline numbers (PostHog)",
        [240, 0],
        `SELECT
           uniqIf(person_id, event = '$pageview' AND timestamp > now() - INTERVAL 24 HOUR) AS viewers,
           uniqIf(person_id, event = '$pageview' AND timestamp <= now() - INTERVAL 24 HOUR) AS viewers_prev,
           countIf(event = 'user.signed_up' AND timestamp > now() - INTERVAL 24 HOUR) AS signups,
           countIf(event = 'user.signed_up' AND timestamp <= now() - INTERVAL 24 HOUR) AS signups_prev,
           countIf(event = 'movie.viewed' AND timestamp > now() - INTERVAL 24 HOUR) AS film_views,
           countIf(event = 'video.started' AND timestamp > now() - INTERVAL 24 HOUR) AS trailer_starts,
           countIf(event = 'checkout.started' AND timestamp > now() - INTERVAL 24 HOUR) AS checkouts
         FROM events WHERE timestamp > now() - INTERVAL 48 HOUR`,
      ),
      hogql(
        "Genres (PostHog)",
        [480, 0],
        `SELECT properties.primaryGenre AS genre, countIf(event = 'movie.viewed') AS views, countIf(event = 'video.started') AS trailers, uniq(person_id) AS viewers
         FROM events WHERE event IN ('movie.viewed', 'video.started') AND timestamp > now() - INTERVAL 24 HOUR AND properties.primaryGenre IS NOT NULL
         GROUP BY genre ORDER BY views DESC LIMIT 6`,
      ),
      hogql(
        "Films (PostHog)",
        [720, 0],
        `SELECT properties.movieTitle AS film, countIf(event = 'movie.viewed') AS views, countIf(event = 'video.started') AS trailers
         FROM events WHERE event IN ('movie.viewed', 'video.started') AND timestamp > now() - INTERVAL 24 HOUR AND properties.movieTitle IS NOT NULL
         GROUP BY film ORDER BY views DESC LIMIT 5`,
      ),
      internalGet("Money (storefront)", [960, 0], `'${config.site}/api/internal/stats?days=1'`),
      codeNode("Report data", [1200, 0], code.digestData),
      node("Render the report (HTML)", base("html"), 1.2, [1440, 0], { operation: "generateHtmlTemplate", html: DIGEST_TEMPLATE }),
      node(
        "Email the report",
        base("gmail"),
        2.1,
        [1680, -80],
        { sendTo: config.digestTo, subject: "={{ $('Report data').item.json.subject }}", emailType: "html", message: "={{ $json.html }}", options: { appendAttribution: false } },
        { credentials: CREDS.gmail, webhookId: randomUUID() },
      ),
      posthogBatch("Record the digest in PostHog", [1680, 120], "[{ event: 'digest.sent', distinct_id: 'n8n-digest', properties: { ...$('Report data').item.json.headline, $lib: 'n8n-digest' } }]"),
    ],
    connections: wire([
      ["Every day at 07:00", "Headline numbers (PostHog)"],
      ["Headline numbers (PostHog)", "Genres (PostHog)"],
      ["Genres (PostHog)", "Films (PostHog)"],
      ["Films (PostHog)", "Money (storefront)"],
      ["Money (storefront)", "Report data"],
      ["Report data", "Render the report (HTML)"],
      ["Render the report (HTML)", "Email the report"],
      ["Render the report (HTML)", "Record the digest in PostHog"],
    ]),
  };

  // ── Ask Yakwetu: analytics for sales reps and staff ───────────────────
  const ask: Workflow = {
    name: "YKW · Ask Yakwetu — staff analytics assistant (chat)",
    settings: SETTINGS,
    nodes: [
      sticky(
        "## Ask Yakwetu: plain-language analytics for the team\nSales reps and staff ask questions in a chat (\"How many films did we sell this week?\", \"Which genres are growing?\", \"How much did the rescue SMS recover?\") and get numbers, not dashboards.\n\n- **Chat Trigger** (hosted chat page; only signed-in n8n users).\n- **AI Agent** (gpt-4o-mini) with two tools:\n  - `query_behaviour`: HogQL on PostHog with a **read-only** key (it cannot change anything).\n  - `sales_summary`: revenue, payments, failures and recovery from the storefront (Paystack-verified: the source of truth for money).\n- **Memory** keeps the last few turns, so follow-ups work (\"and last week?\").\n\nThe agent is told the event schema and must answer from tool results only.",
        [-80, -520],
        560,
        380,
      ),
      node("Staff chat", lc("chatTrigger"), 1.1, [0, 0], {
        public: true,
        mode: "hostedChat",
        authentication: "n8nUserAuth",
        initialMessages: "Habari! I'm the Yakwetu analyst.\nAsk me about sales, films, genres, payments or how much our nudges recovered.",
        options: { title: "Ask Yakwetu", subtitle: "Sales and viewing analytics for the team", inputPlaceholder: "e.g. Top genres this week?" },
      }, { webhookId: randomUUID() }),
      node("Analyst", lc("agent"), 2.2, [320, 0], { promptType: "auto", options: { systemMessage: ANALYST_PROMPT, maxIterations: 6 } }),
      node("Analyst · model", lc("lmChatOpenAi"), 1.2, [180, 240], {
        model: { __rl: true, value: "gpt-4o-mini", mode: "list", cachedResultName: "gpt-4o-mini" },
        options: { temperature: 0.1, timeout: 30000 },
      }),
      node("Analyst · memory", lc("memoryBufferWindow"), 1.3, [340, 260], { contextWindowLength: 8 }),
      node(
        "query_behaviour",
        lc("toolHttpRequest"),
        1.1,
        [500, 260],
        {
          toolDescription:
            "Run one read-only HogQL SELECT on Yakwetu's PostHog events and persons (viewing and shopping behaviour). Input: the SQL. Use single quotes for strings, always a time filter and LIMIT 50 or less.",
          method: "POST",
          url: `${config.posthogApp}/api/projects/${config.projectId}/query/`,
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendBody: true,
          specifyBody: "json",
          jsonBody: '{"query":{"kind":"HogQLQuery","query":"{sql}"}}',
          placeholderDefinitions: { values: [{ name: "sql", description: "A HogQL SELECT with single-quoted strings, a timestamp filter and LIMIT ≤ 50", type: "string" }] },
          optimizeResponse: true,
        },
        { credentials: CREDS.posthogRead },
      ),
      node(
        "sales_summary",
        lc("toolHttpRequest"),
        1.1,
        [660, 260],
        {
          toolDescription:
            "Money figures from the storefront (Paystack-verified): revenue, payments by status, failure reasons, M-Pesa vs card, nudges sent/opened/paid and KES recovered per scenario, top films sold. Input: days, the period length (1 = last 24 h, 7 = last week).",
          method: "GET",
          url: `${config.site}/api/internal/stats?days={days}`,
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          specifyHeaders: "keypair",
          parametersHeaders: { values: [{ name: "ngrok-skip-browser-warning", valueProvider: "fieldValue", value: "1" }] },
          placeholderDefinitions: { values: [{ name: "days", description: "Period in days, 1 to 90", type: "number" }] },
        },
        { credentials: CREDS.internal },
      ),
    ],
    connections: wire([
      ["Staff chat", "Analyst"],
      ["Analyst · model", "Analyst", 0, "ai_languageModel"],
      ["Analyst · memory", "Analyst", 0, "ai_memory"],
      ["query_behaviour", "Analyst", 0, "ai_tool"],
      ["sales_summary", "Analyst", 0, "ai_tool"],
    ]),
  };

  return [
    ["ykw-02-abandonment-v2", abandonment],
    ["ykw-03-payment-rescue-v2", rescue],
    ["ykw-04-post-purchase-upsell-v2", upsell],
    ["daily-digest", digest],
    ["ask-yakwetu", ask],
  ];
}

const ANALYST_PROMPT = `You are the Yakwetu Sinema analyst. Yakwetu sells African films pay-per-title in KES (M-Pesa or card via Paystack). Staff and sales reps ask you questions; answer with numbers from your tools, never from memory or guesses.

Tools:
- sales_summary(days): money, from the storefront. Use it for revenue, sales, payments, failures, M-Pesa vs card, nudges and KES recovered, top films sold. It is the source of truth for money.
- query_behaviour(sql): read-only HogQL on PostHog for behaviour.

PostHog schema (table events: event, timestamp, person_id, distinct_id, properties.*; table persons: id, properties.*):
- page views: event = '$pageview' (properties.$pathname)
- film pages: 'movie.viewed' (properties.movieId, movieTitle, primaryGenre, genres, priceKes)
- film card taps: 'movie.clicked' (properties.row = which row, position)
- trailers: 'video.started', 'video.progress' (properties.percent), 'video.completed' (properties.watchedSec)
- sign-up wall: 'video.auth_prompted', then 'user.signed_up'
- checkout: 'checkout.started', 'checkout.cancelled', 'payment.submitted', 'payment.failed' (properties.reason), 'payment.abandoned', 'payment.succeeded' (properties.amountKes, channel, primaryGenre, movieTitle, nudgeScenario), 'purchase.confirmed'
- nudges: 'nudge.sent' (properties.scenario A/B/C, step), 'nudge.opened'
- persons: properties.favoriteGenre, topGenres, filmsOwned, trailersWatched

Rules:
1. Every HogQL query is a single SELECT with a timestamp filter (e.g. timestamp > now() - INTERVAL 7 DAY) and LIMIT 50 or less. Strings in single quotes. Never write to anything.
2. "Watched" means trailers started or completed (the in-app player plays trailers today); say so when it matters.
3. Answer in 2–5 short lines: the number(s) first, the period, then one practical insight for sales or marketing. Use KES and thousands separators.
4. If a tool fails or returns nothing, say what you couldn't get. Don't invent numbers.`;

const DIGEST_TEMPLATE = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width" /><title>Yakwetu daily report</title></head>
<body style="margin:0;padding:0;background:#f6efe4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f1a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe4;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#1f1a14;padding:20px 24px;color:#fff">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f5a524">Yakwetu Sinema</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">Daily report · {{ $json.date }}</div>
    <div style="font-size:13px;color:#cfc4b3;margin-top:2px">Last 24 hours, against the 24 before</div>
  </td></tr>
  <tr><td style="padding:16px 16px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8">
      <tr>
        <td style="background:#fbf6ee;border-radius:10px;padding:12px"><div style="font-size:12px;color:#8a7d6a">Viewers</div><div style="font-size:22px;font-weight:700">{{ $json.viewers }}</div><div style="font-size:12px">{{ $json.viewersDelta }}</div></td>
        <td style="background:#fbf6ee;border-radius:10px;padding:12px"><div style="font-size:12px;color:#8a7d6a">Sign-ups</div><div style="font-size:22px;font-weight:700">{{ $json.signups }}</div><div style="font-size:12px">{{ $json.signupsDelta }}</div></td>
        <td style="background:#fbf6ee;border-radius:10px;padding:12px"><div style="font-size:12px;color:#8a7d6a">Revenue</div><div style="font-size:22px;font-weight:700">{{ $json.revenue }}</div><div style="font-size:12px">{{ $json.revenueDelta }}</div></td>
        <td style="background:#fff4e0;border-radius:10px;padding:12px"><div style="font-size:12px;color:#8a7d6a">Recovered by nudges</div><div style="font-size:22px;font-weight:700;color:#c2410c">{{ $json.recovered }}</div><div style="font-size:12px;color:#8a7d6a">SMS → paid</div></td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 24px">
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Funnel</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
      <tr style="color:#8a7d6a;font-size:12px"><td style="padding:6px 12px">Step</td><td style="padding:6px 12px;text-align:right">Count</td><td style="padding:6px 12px;text-align:right">Conversion</td></tr>
      {{ $json.funnelRows }}
    </table>
  </td></tr>
  <tr><td style="padding:8px 24px">
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Payments</div>
    <div style="font-size:14px">Paid <b>{{ $json.paid }}</b> · failed <b>{{ $json.failed }}</b> · abandoned <b>{{ $json.abandoned }}</b></div>
    <div style="font-size:13px;color:#8a7d6a;margin-top:4px">Why they failed: {{ $json.failureLine }}</div>
  </td></tr>
  <tr><td style="padding:8px 24px">
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Nudges (n8n)</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
      <tr style="color:#8a7d6a;font-size:12px"><td style="padding:6px 12px">Scenario</td><td style="padding:6px 12px;text-align:right">Sent</td><td style="padding:6px 12px;text-align:right">Opened</td><td style="padding:6px 12px;text-align:right">Paid</td><td style="padding:6px 12px;text-align:right">Recovered</td></tr>
      {{ $json.nudgeRows }}
    </table>
  </td></tr>
  <tr><td style="padding:8px 24px">
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Genres</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
      <tr style="color:#8a7d6a;font-size:12px"><td style="padding:6px 12px">Genre</td><td style="padding:6px 12px;text-align:right">Views</td><td style="padding:6px 12px;text-align:right">Trailers</td><td style="padding:6px 12px;text-align:right">Viewers</td></tr>
      {{ $json.genreRows }}
    </table>
  </td></tr>
  <tr><td style="padding:8px 24px">
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Top films</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
      <tr style="color:#8a7d6a;font-size:12px"><td style="padding:6px 12px">Film</td><td style="padding:6px 12px;text-align:right">Views</td><td style="padding:6px 12px;text-align:right">Trailers</td></tr>
      {{ $json.filmRows }}
    </table>
  </td></tr>
  <tr><td style="padding:16px 24px">
    <div style="background:#fff4e0;border-radius:10px;padding:14px 16px;font-size:14px"><b>One thing to act on:</b> {{ $json.action }}</div>
  </td></tr>
  <tr><td style="padding:4px 24px 22px;font-size:12px;color:#8a7d6a">Behaviour from PostHog · money from the storefront (Paystack-verified) · sent by n8n</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
