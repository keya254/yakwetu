#!/usr/bin/env bash
# Fire live demo events at YKW-01 so you can test workflows without the storefront.
#
# Usage:
#   export N8N_URL=http://localhost:15678   # or http://localhost:15678
#   export DEMO_PHONE=
#   ./scripts/fire-demo-events.sh [scenario]
#
# scenario: all | browse | abandon-setup | payfail | paysuccess | watch | (default: all)

set -euo pipefail

N8N_URL="${N8N_URL:-http://localhost:15678}"
WEBHOOK="${N8N_URL%/}/webhook/yakwetu-event"
PHONE="${DEMO_PHONE:-}"
EMAIL="${DEMO_EMAIL:-wanjiku@example.com}"
SCENARIO="${1:-all}"

post() {
  local payload="$1"
  echo "→ POST $WEBHOOK"
  echo "  $payload"
  curl -sS -X POST "$WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "$payload" | tee /dev/stderr
  echo
  echo
}

browse_burst() {
  local uid="$1" sid="$2" name="$3"
  post "{\"event_type\":\"browse\",\"user_id\":\"$uid\",\"name\":\"$name\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$sid\",\"movie_id\":\"kifaru\",\"movie_title\":\"Kifaru\",\"genre\":\"Wildlife Doc\",\"price_kes\":130}"
  post "{\"event_type\":\"browse\",\"user_id\":\"$uid\",\"name\":\"$name\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$sid\",\"movie_id\":\"matatu-diaries\",\"movie_title\":\"The Matatu Diaries\",\"genre\":\"Comedy\",\"price_kes\":100}"
  post "{\"event_type\":\"browse\",\"user_id\":\"$uid\",\"name\":\"$name\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$sid\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150}"
}

case "$SCENARIO" in
  browse|all)
    echo "=== Browse trail (feeds AI history) ==="
    browse_burst "live_tester" "live_sess_$(date +%s)" "Live Tester"
    [[ "$SCENARIO" == browse ]] && exit 0
    ;;&
  payfail|all)
    echo "=== Scenario B — payment_failed (triggers YKW-03 instantly) ==="
    SID="live_payfail_$(date +%s)"
    post "{\"event_type\":\"checkout_start\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150}"
    post "{\"event_type\":\"payment_failed\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150,\"failure_reason\":\"Insufficient balance\"}"
    echo "Expect WhatsApp rescue within seconds if Twilio + YKW-01→03 wired."
    [[ "$SCENARIO" == payfail ]] && exit 0
    ;;&
  paysuccess|all)
    echo "=== payment_success (attribution / recovery) ==="
    SID="live_paysuccess_$(date +%s)"
    post "{\"event_type\":\"checkout_start\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"katana\",\"movie_title\":\"Katana\",\"genre\":\"Coastal Thriller\",\"price_kes\":140}"
    post "{\"event_type\":\"payment_success\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"katana\",\"movie_title\":\"Katana\",\"genre\":\"Coastal Thriller\",\"price_kes\":140}"
    [[ "$SCENARIO" == paysuccess ]] && exit 0
    ;;&
  watch|all)
    echo "=== Scenario C — watch_complete (triggers YKW-04) ==="
    SID="live_watch_$(date +%s)"
    post "{\"event_type\":\"payment_success\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150}"
    post "{\"event_type\":\"watch_complete\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150}"
    echo "Expect upsell email after YKW-04 wait (shorten Wait After Credits for demos)."
    [[ "$SCENARIO" == watch ]] && exit 0
    ;;&
  abandon-setup)
    echo "=== Abandonment setup — browse + checkout, then IDLE ==="
    echo "After this, wait past YKW-02 idle threshold (45 min prod / 1 min if you edited SQL)."
    SID="live_abandon_$(date +%s)"
    browse_burst "live_tester" "$SID" "Live Tester"
    post "{\"event_type\":\"checkout_start\",\"user_id\":\"live_tester\",\"name\":\"Live Tester\",\"phone\":\"$PHONE\",\"email\":\"$EMAIL\",\"session_id\":\"$SID\",\"movie_id\":\"nairobi-nights\",\"movie_title\":\"Nairobi Nights\",\"genre\":\"Crime Drama\",\"price_kes\":150}"
    echo "Session $SID created. Do NOT send payment_success. Wait for YKW-02 schedule."
    exit 0
    ;;
esac

echo "Done. Check n8n Executions +:"
echo "  SELECT state, COUNT(*) FROM sessions GROUP BY state;"
echo "  SELECT * FROM nudges ORDER BY sent_at DESC LIMIT 10;"
