'use strict';

/**
 * Idempotent schema upgrades. Safe to run repeatedly on existing volumes.
 */
const { pool } = require('./db');

const STEPS = [
  // Core tables first (no FK deps between these beyond users)
  `CREATE TABLE IF NOT EXISTS users (
    user_id        TEXT PRIMARY KEY,
    name           TEXT,
    phone          TEXT,
    email          TEXT,
    password_hash  TEXT,
    channel_pref   TEXT DEFAULT 'sms',
    auth_providers TEXT DEFAULT 'otp',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    last_seen      TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_providers TEXT DEFAULT 'otp'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_pref TEXT DEFAULT 'sms'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`,

  `CREATE TABLE IF NOT EXISTS events (
    id             BIGSERIAL PRIMARY KEY,
    user_id        TEXT,
    session_id     TEXT,
    event_type     TEXT NOT NULL,
    movie_id       TEXT,
    movie_title    TEXT,
    genre          TEXT,
    price_kes      NUMERIC,
    failure_reason TEXT,
    ts             TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    session_id       TEXT PRIMARY KEY,
    user_id          TEXT,
    state            TEXT DEFAULT 'browsing',
    recovered        BOOLEAN DEFAULT false,
    nudge_count      INT DEFAULT 0,
    last_nudge_at    TIMESTAMPTZ,
    last_activity    TIMESTAMPTZ DEFAULT NOW(),
    last_movie_id    TEXT,
    last_movie_title TEXT,
    last_genre       TEXT,
    last_price       NUMERIC
  )`,

  `CREATE TABLE IF NOT EXISTS nudges (
    id           BIGSERIAL PRIMARY KEY,
    user_id      TEXT,
    session_id   TEXT,
    scenario     TEXT,
    channel      TEXT,
    message      TEXT,
    sent_at      TIMESTAMPTZ DEFAULT NOW(),
    converted    BOOLEAN DEFAULT false,
    converted_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS dropoffs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       TEXT,
    session_id    TEXT,
    movie_id      TEXT,
    failure_class TEXT,
    ts            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS otp_codes (
    id          BIGSERIAL PRIMARY KEY,
    channel     TEXT NOT NULL,
    destination TEXT NOT NULL,
    code        TEXT NOT NULL,
    purpose     TEXT NOT NULL DEFAULT 'login',
    name        TEXT,
    payload     JSONB DEFAULT '{}',
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS event_outbox (
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
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
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
  )`,

  `CREATE TABLE IF NOT EXISTS payments (
    id           BIGSERIAL PRIMARY KEY,
    order_id     TEXT,
    user_id      TEXT,
    reference    TEXT UNIQUE,
    amount_kes   NUMERIC,
    status       TEXT,
    channel      TEXT,
    raw          JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS entitlements (
    user_id      TEXT NOT NULL,
    movie_id     TEXT NOT NULL,
    order_id     TEXT,
    price_kes    NUMERIC,
    unlocked_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, movie_id)
  )`,

  `CREATE TABLE IF NOT EXISTS crm_notes (
    id         BIGSERIAL PRIMARY KEY,
    user_id    TEXT NOT NULL,
    body       TEXT NOT NULL,
    author     TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS crm_tasks (
    id           BIGSERIAL PRIMARY KEY,
    user_id      TEXT,
    session_id   TEXT,
    title        TEXT NOT NULL,
    body         TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    due_at       TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`,

  // Indexes (ignore if already exist)
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_otp_dest ON otp_codes(destination, purpose)`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON event_outbox (published_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_notes_user ON crm_notes(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status, due_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, event_type, ts)`,

  `CREATE TABLE IF NOT EXISTS offer_links (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    order_id      TEXT,
    scenario      TEXT,
    step          TEXT,
    movie_ids     TEXT[],
    discount_pct  INT DEFAULT 0,
    code          TEXT,
    total_kes     NUMERIC,
    url           TEXT,
    expires_at    TIMESTAMPTZ,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_offer_links_user ON offer_links(user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS user_recommendations (
    user_id       TEXT PRIMARY KEY,
    mode          TEXT,
    anchor        TEXT,
    headline      TEXT,
    items         JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_recs_updated ON user_recommendations(updated_at DESC)`,
];

async function migrate() {
  const client = await pool.connect();
  const ok = [];
  const failed = [];
  try {
    for (const sql of STEPS) {
      const label = sql.replace(/\s+/g, ' ').slice(0, 72);
      try {
        await client.query(sql);
        ok.push(label);
      } catch (e) {
        // 42P07 duplicate_table, 42710 duplicate_object — fine
        if (e.code === '42P07' || e.code === '42710' || e.code === '23505') {
          ok.push(label + ' (exists)');
          continue;
        }
        failed.push({ label, code: e.code, message: e.message });
        console.warn('migrate skip:', e.code, e.message, '—', label);
      }
    }

    // Verify critical tables
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('otp_codes','event_outbox','orders','users','auth_sessions')
    `);
    const have = new Set(rows.map((r) => r.tablename));
    const need = ['otp_codes', 'event_outbox', 'orders', 'users', 'auth_sessions'];
    const missing = need.filter((t) => !have.has(t));
    if (missing.length) {
      throw new Error('migrate incomplete, still missing: ' + missing.join(', '));
    }
    console.log('schema migrate: ok —', need.join(', '));
    return { ok: true, tables: [...have], failed };
  } finally {
    client.release();
  }
}

module.exports = { migrate };
