# Yakwetu n8n engine

Four importable workflows + Postgres schema for the B2C conversion &
re-engagement engine. Local stack lives at the **repo root** (`docker compose up`).

## Files

| File | What it does |
|---|---|
| `workflows/ykw-01-event-intake.json` | Webhook `POST /webhook/yakwetu-event`. Validates events, upserts users, logs everything, keeps session state, routes to B & C, attributes recovered revenue. |
| `workflows/ykw-02-abandonment-recovery.json` | Scenario A. Every 15 min finds sessions idle 45 min–72 h with no purchase, respects EAT quiet hours (21:00–08:00), AI WhatsApp nudge + SMS fallback. |
| `workflows/ykw-03-payment-rescue.json` | Scenario B. On `payment_failed`: classify failure, instant WhatsApp, wait 2 h, then SMS incentive (`PONA10`) if unrecovered. |
| `workflows/ykw-04-post-watch-upsell.json` | Scenario C. On `watch_complete`: wait, AI genre bundle email, WhatsApp last-call 24 h later if no purchase. |
| `schema.sql` | Tables: `users`, `events`, `sessions`, `nudges`, `dropoffs` + analytics queries. Auto-mounted on first Postgres boot via Docker Compose. |

## Setup from repo root

```bash
cp .env.example .env          # set AT_API_KEY at minimum
docker compose up -d
```

Then in n8n (http://localhost:5678):

1. **Credentials** — Postgres (`host: yakwetu-db`, same user/db/password as `.env`), OpenAI, Twilio, SMTP; optional Google Sheets.
2. **Import** all four JSONs from `workflows/`.
3. **Wire** YKW-01 Execute Workflow nodes → YKW-03 and YKW-04 (IDs blank after import).
4. **Activate** YKW-01 and YKW-02 (03/04 must be saved/active).
5. Storefront http://localhost:8080 → settings bar → `http://localhost:5678`.

Deep links in messages use `STOREFRONT_URL` from `.env` (default `http://localhost:8080`). For phone taps from WhatsApp, point that at an ngrok URL for port 8080 and restart n8n.

### Credential checklist

- [ ] Postgres credential on all Postgres nodes (`host` = `yakwetu-db` inside Compose)
- [ ] OpenAI on AI nodes in YKW-02 / 03 / 04
- [ ] `OPENROUTER_API_KEY` on n8n (AI nodes call OpenRouter — no OpenAI credential)
- [ ] `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER_ID=AFTKNG` on n8n (SMS primary — no Twilio WhatsApp)
- [ ] SMTP credential on YKW-04 **Send Email Offer**
- [ ] YKW-01 → YKW-03 and YKW-01 → YKW-04 workflow links set
- [ ] Storefront webhook base saved

## Demo wait overrides

| Node | Change for live demo |
|------|----------------------|
| YKW-02 Schedule Trigger | 15 min → **1** min |
| YKW-02 SQL idle threshold | `45 minutes` → **`1 minute`** |
| YKW-03 **Wait 2 Hours** | → **2 minutes** |
| YKW-04 **Wait After Credits** / **Wait 24h** | → **1–3 minutes** |

## Event contract

```json
{
  "event_type": "browse | signup | checkout_start | payment_failed | payment_success | watch_complete",
  "user_id": "u_1024",
  "name": "Wanjiku Mwangi",
  "phone": "+2547XXXXXXXX",
  "email": "viewer@example.com",
  "session_id": "sess_abc123",
  "movie_id": "nairobi-nights",
  "movie_title": "Nairobi Nights",
  "genre": "Crime Drama",
  "price_kes": 150,
  "failure_reason": "Insufficient balance (only on payment_failed)"
}
```

## Verification

### Channels

| Check | Expected |
|-------|----------|
| Browse on storefront | n8n YKW-01 execution; row in `events` |
| Simulate payment fail | SMS rescue within seconds (Africa's Talking, sender AFTKNG) |
| Leave unrecovered 2h (or demo wait) | SMS with `PONA10` (Africa's Talking) |
| Finish watching | Upsell email (SMTP), then WhatsApp reminder if no buy |

### SQL (from host)

```bash
docker compose exec postgres psql -U yakwetu -d yakwetu
```

```sql
-- Funnel
SELECT state, COUNT(*) FROM sessions GROUP BY state;

-- Nudge ROI
SELECT scenario, channel, COUNT(*) AS sent,
       SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS recovered,
       ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS recovery_pct
FROM nudges GROUP BY scenario, channel ORDER BY scenario;

-- Drop-off causes
SELECT failure_class, COUNT(*) FROM dropoffs GROUP BY failure_class ORDER BY 2 DESC;

-- Recent events
SELECT event_type, movie_title, ts FROM events ORDER BY ts DESC LIMIT 20;
```

After a successful payment following a nudge: `sessions.recovered = true` and matching `nudges.converted = true` (purchase within 72 h of nudge).

## Production swaps

- Dummy checkout → M-Pesa Daraja STK Push (`payment_failed` / `payment_success` already mirror Daraja-style fields).
- Twilio sandbox → WhatsApp Business Cloud API + approved templates.
- Resume deep link → signed single-use token.
- Wait-node holds → queue-based re-checks at higher volume.
