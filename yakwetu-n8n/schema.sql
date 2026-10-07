-- Yakwetu Re-Engagement Engine — Postgres schema
-- Applied on first Postgres boot via docker-entrypoint-initdb.d.
-- For existing volumes, sinema-seed also applies migrate-v2.sql.

CREATE TABLE IF NOT EXISTS users (
  user_id        TEXT PRIMARY KEY,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  password_hash  TEXT,
  channel_pref   TEXT DEFAULT 'sms',   -- sms | email | both
  auth_providers TEXT DEFAULT 'otp',   -- otp | password | otp,password
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone
  ON users (phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users (lower(email)) WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT REFERENCES users(user_id),
  session_id     TEXT,
  event_type     TEXT NOT NULL,
  movie_id       TEXT,
  movie_title    TEXT,
  genre          TEXT,
  price_kes      NUMERIC,
  failure_reason TEXT,
  ts             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, event_type, ts);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);

CREATE TABLE IF NOT EXISTS sessions (
  session_id       TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(user_id),
  state            TEXT DEFAULT 'browsing',
  recovered        BOOLEAN DEFAULT false,
  nudge_count      INT DEFAULT 0,
  last_nudge_at    TIMESTAMPTZ,
  last_activity    TIMESTAMPTZ DEFAULT NOW(),
  last_movie_id    TEXT,
  last_movie_title TEXT,
  last_genre       TEXT,
  last_price       NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_sessions_abandon ON sessions(state, recovered, last_activity);

CREATE TABLE IF NOT EXISTS nudges (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT REFERENCES users(user_id),
  session_id   TEXT,
  scenario     TEXT,
  channel      TEXT,
  message      TEXT,
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  converted    BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dropoffs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT,
  session_id    TEXT,
  movie_id      TEXT,
  failure_class TEXT,
  ts            TIMESTAMPTZ DEFAULT NOW()
);

-- Auth -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT NOT NULL,          -- sms | email
  destination TEXT NOT NULL,
  code        TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login', -- login | signup | admin
  name        TEXT,
  payload     JSONB DEFAULT '{}',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_dest ON otp_codes(destination, purpose);

-- Event outbox → RabbitMQ ------------------------------------------------
CREATE TABLE IF NOT EXISTS event_outbox (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  exchange     TEXT NOT NULL DEFAULT 'yakwetu.events',
  routing_key  TEXT NOT NULL,
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempts     INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON event_outbox (published_at, created_at)
  WHERE published_at IS NULL;

-- Orders / payments / entitlements --------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  movie_id        TEXT,
  movie_title     TEXT,
  genre           TEXT,
  session_id      TEXT,
  price_kes       NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open', -- open | paid | failed | abandoned | expired
  paystack_ref    TEXT,
  failure_reason  TEXT,
  abandon_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_abandon
  ON orders(status, abandon_at) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paystack
  ON orders(paystack_ref) WHERE paystack_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id           BIGSERIAL PRIMARY KEY,
  order_id     TEXT REFERENCES orders(id),
  user_id      TEXT,
  reference    TEXT UNIQUE,
  amount_kes   NUMERIC,
  status       TEXT,
  channel      TEXT,          -- card | mobile_money | …
  raw          JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id      TEXT NOT NULL,
  movie_id     TEXT NOT NULL,
  order_id     TEXT,
  price_kes    NUMERIC,
  unlocked_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

-- CRM --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_notes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  author     TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_user ON crm_notes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT,
  session_id  TEXT,
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'open', -- open | done | cancelled
  due_at      TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status, due_at);
