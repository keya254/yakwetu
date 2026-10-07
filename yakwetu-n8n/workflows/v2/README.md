# Yakwetu n8n workflows · v2

Aligned with this repo’s stack:

| Piece | How workflows use it |
|---|---|
| **Frontend → API** | Storefront `/api/*` → `sinema-api` (Postgres + outbox) |
| **RabbitMQ** | API publishes → queues → n8n triggers |
| **OpenRouter** | Personalises SMS/email copy in 02 / 03 / 04 / journeys (`OPENROUTER_*` on **n8n**) |
| **SMS / Email** | Sent **once by paystack-api** when the event is ingested (email preferred, SMS fallback). RabbitMQ still feeds n8n for optional OpenRouter copy — n8n does **not** send again. |

```
Browser / Demo Lab
  → POST /api/events (paystack-api)
  → Postgres events + event_outbox
  → RabbitMQ yakwetu.events
  → n8n YKW 02 / 03 / 04 / journeys
  → OpenRouter (copy) → /api/internal/notify → SMS and/or email
```

## Import order (n8n) — customer story only

1. Credential **RabbitMQ**: host `sinema-broker`, port `5672`, user/pass from env, **vhost `sinema`**
2. Import & activate these **four** (replace old copies):
   - `ykw-02-abandonment-v2.json` — cart abandon
   - `ykw-03-payment-rescue-v2.json` — failed pay + PONA10
   - `ykw-04-post-purchase-upsell-v2.json` — upsell + last call
   - `journeys.json` — welcome + after-watch
3. **Do not import** unless you need them:
   - `dual-channel-notify.json` — optional helper (main flows call notify API directly)
   - `ops-guard.json` / `daily-digest.json` / `ask-yakwetu.json` — ops/staff only
   - `audiences.json` — stub only (PostHog removed)
   - Root `workflows/ykw-01` … legacy `ykw-04` — old intake; keep inactive

## n8n environment (required)

```
YAKWETU_API_URL=http://sinema-api:3001
INTERNAL_API_KEY=<same as ADMIN_TOKEN>
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o-mini
STOREFRONT_URL=http://localhost:18080
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

Set `AT_*` and `RESEND_*` on **paystack-api** (not n8n) — workflows send via `/api/internal/notify`.

Optional ops workflows only:
```
RABBITMQ_MGMT_URL=http://sinema-broker:15672
RABBITMQ_VHOST=yakwetu
```

## Routing

| Event | Queue | Workflow | Message |
|---|---|---|---|
| `payment.abandoned` | `q.n8n.checkout-abandoned` | **ykw-02** | Cart left behind — finish checkout (discount) |
| `payment.failed` | `q.n8n.payment-failed` | **ykw-03** | Failed payment rescue + optional PONA10 |
| `purchase.confirmed` | `q.n8n.post-purchase` | **ykw-04** | Bundle / “what to watch next” after purchase |
| `user.signed_up` | `q.n8n.journeys` | **journeys** | Welcome + first-film pick |
| `watch_complete` | `q.n8n.journeys` | **journeys** | Recommendation after finishing a film |

## Channel rules

| Contacts / pref | What we send |
|---|---|
| email present (default) | **Email** (branded HTML) |
| no email, phone present | **SMS** |
| pref `sms` / `email` | That channel when contact exists |
| Explicit `channels: ['sms','email']` (Demo Lab dual ping / admin) | **Both** |

Every successful send is written to **`nudges`** + **`events` (`nudge_sent`)** for admin analytics.

## Customer issues covered

| Issue | Scenario | Workflow |
|---|---|---|
| New signup needs a first film | `journey_welcome` | Journeys |
| Left cart / checkout | `A_abandon` | YKW 02 |
| Payment failed (PIN, balance, timeout…) | `B_rescue` | YKW 03 |
| Still unpaid — incentive | `B_incentive` | YKW 03 |
| After purchase — next titles | `C_upsell` / `C_last_call` | YKW 04 |
| Finished watching — next title | `C_after_watch` | Journeys |
| Manual CRM follow-up | `admin_followup` | Admin |

See Admin → Overview → **Messaging coverage**.


## API used by workflows

All with header `x-internal-token: $INTERNAL_API_KEY`:

- `GET /api/internal/orders/:id`
- `POST /api/internal/nudges`
- `GET /api/internal/nudges/:id`
- `POST /api/internal/notify` — **email if present, else SMS** (uses paystack-api Resend + Africa's Talking)
- `GET /api/recs/:userId`
- `GET /api/internal/users/:id`
- `GET /api/internal/viewers/:id`
- `GET /api/internal/stats?days=1`

Workflows send nudges via `/api/internal/notify` (same path as Demo Lab dual ping). Do **not** call Resend/AT from n8n env — set `RESEND_*` / `AT_*` on **paystack-api**.

## Do not use

- Old ngrok / sslip / Neon / PostHog hosts  
- `FORWARD_EVENTS_TO_N8N=1` + YKW-01 (duplicates intake)  
- Vhost `/` for RabbitMQ (must be `yakwetu`)
