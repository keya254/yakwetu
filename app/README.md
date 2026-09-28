# Yakwetu Sinema — storefront

The viewer-facing site: landing page with this week's trending films, email
and password accounts, and a catalog of Kenyan and pan-African films priced
per title in KES. It is where the events that drive the n8n re-engagement
workflows will come from.

Next.js 16 (App Router, Turbopack) · shadcn/ui (Radix, Tailwind 4) ·
better-auth · Prisma 7 on Neon Postgres · OMDb for film metadata.

## Run it

```bash
pnpm install              # also generates the Prisma client
cp .env.example .env      # OMDb key, Neon URLs, auth secret
pnpm db:deploy            # create/upgrade the storefront schema
pnpm catalog:seed         # fetch the curated films from OMDb into Postgres
pnpm dev                  # http://localhost:3000
```

## What's here

| Route | Access | |
|---|---|---|
| `/` | public | Hero with this week's #1, ranked **Trending** row, Made in Kenya, New releases |
| `/sign-up`, `/sign-in` | signed out | Email + password (and optional phone, normalised to `+254…` for SMS). No email verification; signed in straight away |
| `/browse` | signed in | Trending, Made in Kenya, New releases, Drama, Thrillers, Comedy |
| `/movie/[id]` | signed in | Poster, facts, plot, cast, price, "More like this" |
| `/api/auth/*` | — | better-auth |

Signed-out visitors to `/browse` or `/movie/*` go to sign-in and come back
afterwards (`?next=`).

## Data

Everything lives in the **`storefront`** schema of the team's Neon database
(sinema-recs uses `recs` in the same database). Apply migrations with
`pnpm db:deploy` only.

| Table | |
|---|---|
| `user`, `session`, `account`, `verification` | better-auth. `user.phone` is ours |
| `movie` | Curated catalog with cached OMDb metadata, price, trending rank |

The catalog is `src/lib/catalog/curated.ts`: 42 titles by IMDb id, with our
price and trending order. Ids match sinema-recs for titles in both, so signals
line up across the two services. `pnpm catalog:seed` fetches only what is
missing or a week old (`--force` refetches all) and drops poster links Amazon
no longer serves; those titles get a typographic poster instead.

## Design

Warm cinema dark: charcoal and cream, one saffron accent for actions, prices
and focus; the posters carry the colour. Bricolage Grotesque for display,
Geist for text. Tokens are in `src/app/globals.css`.

## Next

Event capture (view, like, watchlist, watch progress, checkout) to the
database, PostHog and n8n; Paystack checkout; recommendations from
sinema-recs in a "For you" row.
