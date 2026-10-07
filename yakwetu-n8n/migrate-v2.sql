-- Idempotent upgrades for existing Postgres volumes (run by sinema-seed).
-- Critical tables first; unique indexes last (wrapped) so dirty demo data
-- cannot abort before otp_codes / event_outbox / orders exist.

CREATE TABLE IF NOT EXISTS users (
  user_id        TEXT PRIMARY KEY,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  password_hash  TEXT,
  channel_pref   TEXT DEFAULT 'sms',
  auth_providers TEXT DEFAULT 'otp',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_providers TEXT DEFAULT 'otp';
ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_pref TEXT DEFAULT 'sms';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT NOT NULL,
  destination TEXT NOT NULL,
  code        TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login',
  name        TEXT,
  payload     JSONB DEFAULT '{}',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_dest ON otp_codes(destination, purpose);

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

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  movie_id        TEXT,
  movie_title     TEXT,
  genre           TEXT,
  session_id      TEXT,
  price_kes       NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  paystack_ref    TEXT,
  failure_reason  TEXT,
  abandon_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_abandon
  ON orders(status, abandon_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS payments (
  id           BIGSERIAL PRIMARY KEY,
  order_id     TEXT,
  user_id      TEXT,
  reference    TEXT UNIQUE,
  amount_kes   NUMERIC,
  status       TEXT,
  channel      TEXT,
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

CREATE TABLE IF NOT EXISTS crm_notes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  author     TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_user ON crm_notes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT,
  session_id   TEXT,
  title        TEXT NOT NULL,
  body         TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  due_at       TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status, due_at);

-- Unique indexes last — skip if existing rows collide (common with demo seed re-runs)
DO $$ BEGIN
  CREATE UNIQUE INDEX idx_users_phone
    ON users (phone) WHERE phone IS NOT NULL AND phone <> '';
EXCEPTION WHEN unique_violation OR duplicate_table THEN
  RAISE NOTICE 'skip idx_users_phone: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_users_email
    ON users (lower(email)) WHERE email IS NOT NULL AND email <> '';
EXCEPTION WHEN unique_violation OR duplicate_table THEN
  RAISE NOTICE 'skip idx_users_email: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_orders_paystack
    ON orders(paystack_ref) WHERE paystack_ref IS NOT NULL;
EXCEPTION WHEN unique_violation OR duplicate_table THEN
  RAISE NOTICE 'skip idx_orders_paystack: %', SQLERRM;
END $$;
