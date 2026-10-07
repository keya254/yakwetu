-- Yakwetu MVP verification queries
-- Usage:
--   docker compose exec -T sinema-db psql -U sinema -d sinema -f - < yakwetu-n8n/verify.sql
-- Or paste into: docker compose exec sinema-db psql -U sinema -d sinema

\echo '=== Session funnel ==='
SELECT state, COUNT(*) FROM sessions GROUP BY state ORDER BY state;

\echo '=== Nudge ROI by scenario / channel ==='
SELECT scenario, channel, COUNT(*) AS sent,
       SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS recovered,
       ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS recovery_pct
FROM nudges
GROUP BY scenario, channel
ORDER BY scenario, channel;

\echo '=== Top payment drop-off causes ==='
SELECT failure_class, COUNT(*) AS n
FROM dropoffs
GROUP BY failure_class
ORDER BY n DESC;

\echo '=== Last 20 events ==='
SELECT event_type, user_id, movie_title, failure_reason, ts
FROM events
ORDER BY ts DESC
LIMIT 20;

\echo '=== Unrecovered sessions (abandonment candidates) ==='
SELECT session_id, user_id, state, last_movie_title, nudge_count, last_activity
FROM sessions
WHERE recovered = false
  AND state IN ('browsing', 'checkout', 'failed')
ORDER BY last_activity DESC
LIMIT 20;
