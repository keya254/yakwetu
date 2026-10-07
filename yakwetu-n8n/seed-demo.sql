-- Yakwetu demo seed data
-- Applied automatically:
--   - on first DB volume create (docker-entrypoint-initdb.d/02-seed-demo.sql)
--   - on demand via: docker compose run --rm sinema-seed
-- Safe to re-run: deletes previous demo_* rows then inserts fresh fixtures.
--
-- Manual (optional):
--   psql "host=localhost port=15433 user=sinema dbname=sinema" -f yakwetu-n8n/seed-demo.sql
--
-- What you get:
--   A) 3 abandoned sessions (idle 50–90 min) → YKW-02 abandonment scanner
--   B) 1 failed checkout session + dropoff → ready for payment rescue attribution
--   C) 1 purchased + watch_complete taste profile → YKW-04 upsell history
--   Plus browse history so AI nudges have titles to reference.

BEGIN;

DELETE FROM nudges WHERE user_id LIKE 'demo_%';
DELETE FROM dropoffs WHERE user_id LIKE 'demo_%';
DELETE FROM events WHERE user_id LIKE 'demo_%';
DELETE FROM sessions WHERE user_id LIKE 'demo_%';
DELETE FROM users WHERE user_id LIKE 'demo_%';

-- ---------------------------------------------------------------------------
-- Demo viewers — placeholder phones (not real numbers)
-- ---------------------------------------------------------------------------
INSERT INTO users (user_id, name, phone, email, channel_pref, created_at, last_seen) VALUES
  ('demo_wanjiku', 'Wanjiku Mwangi',  '+254700000001', 'wanjiku@example.com',  'sms', NOW() - INTERVAL '7 days', NOW() - INTERVAL '1 hour'),
  ('demo_otieno',  'Otieno Okoth',    '+254700000002', 'otieno@example.com',   'sms', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 hours'),
  ('demo_aisha',   'Aisha Hassan',    '+254700000003', 'aisha@example.com',    'sms', NOW() - INTERVAL '3 days', NOW() - INTERVAL '50 minutes'),
  ('demo_brian',   'Brian Kamau',     '+254700000004', 'brian@example.com',    'sms', NOW() - INTERVAL '2 days', NOW() - INTERVAL '10 minutes'),
  ('demo_faith',   'Faith Wambui',    '+254700000001', 'faith@example.com',    'sms', NOW() - INTERVAL '1 day',  NOW() - INTERVAL '30 minutes');

-- ---------------------------------------------------------------------------
-- Scenario A — abandoned browse / checkout (YKW-02 picks these up)
-- Idle > 45 min, recovered=false, nudge_count < 2
-- ---------------------------------------------------------------------------
INSERT INTO sessions (
  session_id, user_id, state, recovered, nudge_count, last_nudge_at,
  last_activity, last_movie_id, last_movie_title, last_genre, last_price
) VALUES
  ('demo_sess_abandon_1', 'demo_wanjiku', 'checkout', false, 0, NULL,
   NOW() - INTERVAL '55 minutes', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150),
  ('demo_sess_abandon_2', 'demo_otieno',  'browsing', false, 0, NULL,
   NOW() - INTERVAL '70 minutes', 'katana', 'Katana', 'Coastal Thriller', 140),
  ('demo_sess_abandon_3', 'demo_aisha',   'failed',   false, 1, NOW() - INTERVAL '25 hours',
   NOW() - INTERVAL '90 minutes', 'sauti-ya-mtaa', 'Sauti ya Mtaa', 'Music Drama', 120);

-- Browse history for AI personalization
INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, ts) VALUES
  ('demo_wanjiku', 'demo_sess_abandon_1', 'browse', 'kifaru',          'Kifaru',            'Wildlife Doc',    130, NOW() - INTERVAL '3 hours'),
  ('demo_wanjiku', 'demo_sess_abandon_1', 'browse', 'matatu-diaries',  'The Matatu Diaries','Comedy',          100, NOW() - INTERVAL '2 hours'),
  ('demo_wanjiku', 'demo_sess_abandon_1', 'browse', 'nairobi-nights',  'Nairobi Nights',    'Crime Drama',     150, NOW() - INTERVAL '60 minutes'),
  ('demo_wanjiku', 'demo_sess_abandon_1', 'checkout_start', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150, NOW() - INTERVAL '55 minutes'),

  ('demo_otieno', 'demo_sess_abandon_2', 'browse', 'dhahabu', 'Dhahabu', 'Romance', 110, NOW() - INTERVAL '4 hours'),
  ('demo_otieno', 'demo_sess_abandon_2', 'browse', 'wazi',    'Wazi',    'Psych Thriller', 140, NOW() - INTERVAL '3 hours'),
  ('demo_otieno', 'demo_sess_abandon_2', 'browse', 'katana',  'Katana',  'Coastal Thriller', 140, NOW() - INTERVAL '70 minutes'),

  ('demo_aisha', 'demo_sess_abandon_3', 'browse', 'sauti-ya-mtaa', 'Sauti ya Mtaa', 'Music Drama', 120, NOW() - INTERVAL '2 hours'),
  ('demo_aisha', 'demo_sess_abandon_3', 'checkout_start', 'sauti-ya-mtaa', 'Sauti ya Mtaa', 'Music Drama', 120, NOW() - INTERVAL '95 minutes'),
  ('demo_aisha', 'demo_sess_abandon_3', 'payment_failed', 'sauti-ya-mtaa', 'Sauti ya Mtaa', 'Music Drama', 120, NOW() - INTERVAL '90 minutes');

UPDATE events SET failure_reason = 'Insufficient balance'
WHERE user_id = 'demo_aisha' AND event_type = 'payment_failed';

INSERT INTO dropoffs (user_id, session_id, movie_id, failure_class, ts) VALUES
  ('demo_aisha', 'demo_sess_abandon_3', 'sauti-ya-mtaa', 'insufficient_funds', NOW() - INTERVAL '90 minutes');

INSERT INTO nudges (user_id, session_id, scenario, channel, message, sent_at, converted) VALUES
  ('demo_aisha', 'demo_sess_abandon_3', 'payment_failed', 'sms',
   'Pole Aisha — no money left your account. Sauti ya Mtaa is still waiting. Tap to retry.',
   NOW() - INTERVAL '25 hours', false);

-- ---------------------------------------------------------------------------
-- Scenario B — fresh payment failure (Brian)
-- ---------------------------------------------------------------------------
INSERT INTO sessions (
  session_id, user_id, state, recovered, nudge_count,
  last_activity, last_movie_id, last_movie_title, last_genre, last_price
) VALUES
  ('demo_sess_payfail', 'demo_brian', 'failed', false, 0,
   NOW() - INTERVAL '5 minutes', 'baraka', 'Baraka ya Bibi', 'Family Drama', 115);

INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, failure_reason, ts) VALUES
  ('demo_brian', 'demo_sess_payfail', 'browse', 'baraka', 'Baraka ya Bibi', 'Family Drama', 115, NULL, NOW() - INTERVAL '20 minutes'),
  ('demo_brian', 'demo_sess_payfail', 'checkout_start', 'baraka', 'Baraka ya Bibi', 'Family Drama', 115, NULL, NOW() - INTERVAL '8 minutes'),
  ('demo_brian', 'demo_sess_payfail', 'payment_failed', 'baraka', 'Baraka ya Bibi', 'Family Drama', 115, 'Wrong M-Pesa PIN entered', NOW() - INTERVAL '5 minutes');

INSERT INTO dropoffs (user_id, session_id, movie_id, failure_class, ts) VALUES
  ('demo_brian', 'demo_sess_payfail', 'baraka', 'wrong_pin', NOW() - INTERVAL '5 minutes');

-- ---------------------------------------------------------------------------
-- Scenario C — purchased + watched (Faith)
-- ---------------------------------------------------------------------------
INSERT INTO sessions (
  session_id, user_id, state, recovered, nudge_count,
  last_activity, last_movie_id, last_movie_title, last_genre, last_price
) VALUES
  ('demo_sess_upsell', 'demo_faith', 'purchased', true, 0,
   NOW() - INTERVAL '30 minutes', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150);

INSERT INTO events (user_id, session_id, event_type, movie_id, movie_title, genre, price_kes, ts) VALUES
  ('demo_faith', 'demo_sess_upsell', 'browse', 'wazi', 'Wazi', 'Psych Thriller', 140, NOW() - INTERVAL '2 days'),
  ('demo_faith', 'demo_sess_upsell', 'browse', 'katana', 'Katana', 'Coastal Thriller', 140, NOW() - INTERVAL '1 day'),
  ('demo_faith', 'demo_sess_upsell', 'browse', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150, NOW() - INTERVAL '3 hours'),
  ('demo_faith', 'demo_sess_upsell', 'payment_success', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150, NOW() - INTERVAL '2 hours'),
  ('demo_faith', 'demo_sess_upsell', 'watch_complete', 'nairobi-nights', 'Nairobi Nights', 'Crime Drama', 150, NOW() - INTERVAL '30 minutes');

COMMIT;

\echo '=== Demo seed loaded ==='
SELECT user_id, name, phone FROM users WHERE user_id LIKE 'demo_%' ORDER BY user_id;
SELECT session_id, user_id, state, recovered, last_movie_title,
       ROUND(EXTRACT(EPOCH FROM (NOW() - last_activity))/60) AS idle_minutes
FROM sessions WHERE user_id LIKE 'demo_%' ORDER BY last_activity;
