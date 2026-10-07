# Yakwetu n8n engine

Importable workflows + Postgres schema for the B2C conversion & re-engagement engine.
Run the stack from the **repo root** (`docker compose up`).

## Files

| Path | What it does |
|---|---|
| `workflows/v2/` | RabbitMQ-triggered journeys + dual-channel notify (preferred) |
| `workflows/ykw-01…04.json` | Legacy webhook-based flows |
| `schema.sql` | Tables: `users`, `events`, `sessions`, `nudges`, `dropoffs`, … |
| `seed-demo.sql` | Demo fixtures (placeholder phones) |
| `migrate-v2.sql` | Schema migrations for existing volumes |

## Setup

```bash
# from repo root — set AT_*, RESEND_*, OPENROUTER_*, ADMIN_* in .env (gitignored)
docker compose up -d --build
docker compose run --rm sinema-seed
```

Then in n8n (http://localhost:15678):

1. **Credentials** — Postgres host `sinema-db`, RabbitMQ host `sinema-broker` / vhost `sinema`
2. **Import** JSONs from `workflows/v2/`
3. **Activate** the workflows you need

Deep links use `STOREFRONT_URL` (default `http://localhost:18080`).

### Credential checklist

- [ ] Postgres (`host` = `sinema-db`)
- [ ] RabbitMQ (`host` = `sinema-broker`, vhost `sinema`)
- [ ] `OPENROUTER_API_KEY` on n8n (optional AI copy)
- [ ] `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` for SMS
- [ ] `RESEND_API_KEY` / `RESEND_FROM` for email (or SMTP where used)

## Demo event shape

```json
{
  "event": "browse",
  "user_id": "demo_wanjiku",
  "phone": "+2547XXXXXXXX",
  "email": "viewer@example.com",
  "movie_id": "nairobi-half-life",
  "movie_title": "Nairobi Half Life"
}
```
