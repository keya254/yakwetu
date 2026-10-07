# Yakwetu — B2C Conversion & Re-Engagement Engine

Pay-per-title African film storefront with SMS/email journeys: **Vite React storefront** + **API** (auth, Paystack, outbox) + **RabbitMQ** + **n8n** + **Postgres**. Analytics are first-party via Admin CRM.

## Quick start

```bash
# set secrets in your shell or a local .env (gitignored) — see Environment below
docker compose up -d --build
docker compose run --rm sinema-seed   # optional: demo fixtures
```

| Service | URL |
|---------|-----|
| Storefront | http://localhost:18080 |
| Admin CRM | http://localhost:18080/admin |
| Demo Lab | http://localhost:18080/demo-lab.html |
| API | http://localhost:13001 |
| n8n | http://localhost:15678 |
| RabbitMQ mgmt | http://localhost:25673 (`sinema` / `change-me`) |
| Postgres | localhost:15433 (`sinema` / `change-me`) |

Containers: `sinema-web`, `sinema-api`, `sinema-flows`, `sinema-broker`, `sinema-db`, `sinema-seed`. Network: `sinema-net`.

## Environment

Create a local `.env` next to `docker-compose.yml` (never commit it). Minimum useful set:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | DB password (default `change-me`) |
| `RABBITMQ_PASSWORD` | Broker password (default `change-me`) |
| `N8N_ENCRYPTION_KEY` | Stable n8n secret |
| `ADMIN_TOKEN` / `INTERNAL_API_KEY` | Admin + internal API auth |
| `ADMIN_PHONE` / `ADMIN_EMAIL` | CRM OTP destination |
| `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` | Checkout |
| `AT_USERNAME` / `AT_API_KEY` / `AT_SENDER_ID` | SMS (Africa's Talking) |
| `RESEND_API_KEY` / `RESEND_FROM` | Email |
| `OPENROUTER_API_KEY` | AI nudge copy (optional) |
| `STOREFRONT_URL` | Public storefront base (default `http://localhost:18080`) |

Host ports are overridable: `WEB_PORT`, `API_PORT`, `FLOWS_PORT`, `DB_PORT`, `BROKER_PORT`, `BROKER_MGMT_PORT`.

Paystack webhook (when exposed publicly): `https://<your-host>/api/paystack/webhook`.

## n8n after first boot

1. Open http://localhost:15678  
2. Credentials: Postgres host `sinema-db`, RabbitMQ host `sinema-broker` / vhost `sinema`  
3. Import workflows under `yakwetu-n8n/workflows/v2/`  
4. Optional legacy flows in `yakwetu-n8n/workflows/`

## Auth & channels

- Password signup/signin (email and/or phone)
- OTP via SMS (Kenya `+254…`) or email (Resend)
- Channel pref: `sms` | `email` | `both`

## Event pipeline

Browser / Demo Lab → `POST /api/events` → Postgres `events` + `event_outbox` → RabbitMQ → n8n → SMS/email.  
Dashboards: `/admin` (funnel, top films, nudges).

## License / contributors

Private or public — add collaborators on GitHub as needed. Do not commit secrets; use `.env` locally only.
