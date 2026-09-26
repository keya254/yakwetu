# Yakwetu — B2C Conversion & Re-Engagement Engine

Domain: **https://yakwetu.dontire.com** (storefront) · **https://n8n.yakwetu.dontire.com** (n8n)

## Dokploy (production)

`docker-compose.yml` is Dokploy-shaped: prefixed services, `expose` (no host ports),
external `dokploy-network`, env from Dokploy Environment tab.

### Domains in Dokploy UI

| Domain | Service | Port |
|--------|---------|------|
| `yakwetu.dontire.com` | `yakwetu-storefront` | `80` |
| `n8n.yakwetu.dontire.com` | `yakwetu-n8n` | `5678` |

Do not add Traefik labels in Compose — Dokploy manages them.

### Environment (Dokploy → Environment)

Set at least:

- `N8N_ENCRYPTION_KEY` (stable secret)
- `POSTGRES_PASSWORD` (**change from default** — DB is publishable externally)
- `POSTGRES_PUBLISH_PORT` (default `15432` — host port for external Postgres clients)
- `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY`
- `OPENROUTER_API_KEY` (AI copy via OpenRouter; optional `OPENROUTER_MODEL`)
- `AT_API_KEY` / `AT_USERNAME` / `AT_SENDER_ID=AFTKNG` (SMS is the primary channel)
- Defaults already match the domain: `STOREFRONT_URL`, `WEBHOOK_URL`, `N8N_HOST`

**External Postgres** (TablePlus / `psql` / Metabase):

| Field | Value |
|-------|--------|
| Host | VPS public IP (or `yakwetu.dontire.com` if DNS points at the same box) |
| Port | `POSTGRES_PUBLISH_PORT` (default `15432`) |
| User | `POSTGRES_USER` |
| Password | `POSTGRES_PASSWORD` |
| Database | `POSTGRES_DB` |

Open that port in the VPS firewall / security group. Prefer a strong password; remove the `ports:` block under `yakwetu-db` if you want the DB internal-only again.

Full list: [`.env.example`](.env.example).

Paystack webhook: `https://yakwetu.dontire.com/api/paystack/webhook`  
(`charge.success`, `charge.failed`)

### n8n after first deploy

1. Open https://n8n.yakwetu.dontire.com  
2. Credentials: Postgres host **`yakwetu-db`**, port `5432`, same `POSTGRES_*`  
3. Import workflows under `yakwetu-n8n/workflows/` · wire YKW-01 → 03/04 · activate  
4. Storefront on yakwetu.dontire.com auto-targets n8n (or paste the n8n URL in the settings bar)

## Local development

```bash
cp .env.example .env
# fill Paystack / AT keys; for local use localhost URLs (see comments in .env.example)
docker compose -f docker-compose.dev.yml up -d --build
```

| Service | URL |
|---------|-----|
| Storefront | http://localhost:8080 |
| n8n | http://localhost:5678 |
| Paystack API | http://localhost:3001 (`/api/*` also on storefront) |
| Postgres | localhost:5433 |

## Paystack

With keys set, checkout uses Paystack Popup. Demo buttons remain for forced fail/success.

## Demo wait overrides / verification

See [`yakwetu-n8n/README.md`](yakwetu-n8n/README.md) and [`yakwetu-n8n/verify.sql`](yakwetu-n8n/verify.sql).

## Layout

```
app/                     Storefront HTML (baked into yakwetu-storefront image)
deploy/
  Dockerfile.storefront
  nginx-storefront.conf  # proxies /api → yakwetu-paystack-api
services/paystack-api/
yakwetu-n8n/             schema + workflows
docker-compose.yml       Dokploy / production
docker-compose.dev.yml   Local ports
.env.example
```
