-- Yakwetu Re-Engagement Engine — Postgres schema
-- Run once against the same Postgres your n8n uses (or any demo DB)

CREATE TABLE IF NOT EXISTS users (
  user_id      TEXT PRIMARY KEY,
  name         TEXT,
  phone        TEXT,
  email        TEXT,
  channel_pref TEXT DEFAULT 'sms',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT REFERENCES users(user_id),
  session_id     TEXT,
  event_type     TEXT NOT NULL,          -- signup | browse | checkout_start | payment_failed | payment_success | watch_complete
  movie_id       TEXT,
  movie_title    TEXT,
  genre          TEXT,
  price_kes      NUMERIC,
  failure_reason TEXT,
  ts             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, event_type, ts);

CREATE TABLE IF NOT EXISTS sessions (
  session_id       TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(user_id),
  state            TEXT DEFAULT 'browsing',   -- browsing | checkout | failed | purchased
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
  scenario     TEXT,        -- browse_abandon | payment_failed | payment_failed_incentive | post_watch_upsell
  channel      TEXT,        -- whatsapp | sms | email
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
  failure_class TEXT,       -- insufficient_funds | wrong_pin | timeout_or_cancel | limit_exceeded | generic
  ts            TIMESTAMPTZ DEFAULT NOW()
);

-- Handy demo queries -------------------------------------------------------
-- Abandonment funnel:
--   SELECT state, COUNT(*) FROM sessions GROUP BY state;
-- Nudge ROI:
--   SELECT scenario, channel, COUNT(*) sent,
--          SUM(CASE WHEN converted THEN 1 ELSE 0 END) recovered,
--          ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END)/COUNT(*),1) AS recovery_pct
--   FROM nudges GROUP BY scenario, channel ORDER BY scenario;
-- Top drop-off causes:
--   SELECT failure_class, COUNT(*) FROM dropoffs GROUP BY failure_class ORDER BY 2 DESC;
