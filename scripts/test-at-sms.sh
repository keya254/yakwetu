#!/usr/bin/env bash
# Smoke-test Africa's Talking SMS using the same contract as n8n workflows.
# Required env: AT_USERNAME, AT_API_KEY, AT_SENDER_ID
# Optional: AT_API_URL, TO (+254...), MESSAGE
set -euo pipefail

: "${AT_USERNAME:?set AT_USERNAME (live app username, or sandbox)}"
: "${AT_API_KEY:?set AT_API_KEY}"
: "${AT_SENDER_ID:?set AT_SENDER_ID (registered shortcode / alphanumeric)}"

AT_API_URL="${AT_API_URL:-https://api.africastalking.com/version1/messaging}"
TO="${TO:-+254702846542}"
MESSAGE="${MESSAGE:-Yakwetu AT test — payment received. You can watch now.}"

curl -sS -X POST "$AT_API_URL" \
  -H "apiKey: ${AT_API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=${AT_USERNAME}" \
  --data-urlencode "to=${TO}" \
  --data-urlencode "message=${MESSAGE}" \
  --data-urlencode "from=${AT_SENDER_ID}" \
  --data-urlencode "bulkSMSMode=1"
echo
