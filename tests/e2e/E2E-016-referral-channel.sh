#!/usr/bin/env bash
# E2E-016 — Third-party referral channel (community-app referral / drts_pays_partner)
#
# Surface chain:
#   Platform Admin (referral_channel entry + revenue-share rate)
#   -> Partner Ingress s2s handoff (durable partner-user -> passenger identity link)
#   -> Partner-scoped referral reads (statements / usage / revenue / dashboard)
#   -> Referral settlement (partner_referral, drts_pays_partner) evidence
#
# Pass criteria (E2E-016):
#   1. The seeded referral_channel entry `referral-demo-community` is discoverable
#      and typed as referral_channel.
#   2. Its active revenue-share rule is a 15% percent rule settling
#      partner_referral / drts_pays_partner.
#   3. partner/ingress/handoff binds a partnerUserRef to a STABLE drtsPassengerId
#      (same ref -> same passenger; durable s2s identity link) and returns a
#      partner-realm bearer session for actorType referral_passenger.
#   4. The partner-scoped referral statement exposes the seeded 2026-06 attribution:
#      GMV 150000, partner share 22500 (15%), tripCount 2, activeRiders 2.
#   5. usage / revenue / dashboard reads expose the same 2026-06 attribution.
#
# This is a hard scenario (no longer a gated probe): the referral handoff + portal
# reads are runtime-verified end to end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-016"
ENTRY_SLUG="${E2E_REFERRAL_ENTRY_SLUG:-referral-demo-community}"
PARTNER_ID="${E2E_REFERRAL_PARTNER_ID:-partner-referral-demo-001}"
PARTNER_PROGRAM_ID="${E2E_REFERRAL_PARTNER_PROGRAM_ID:-program-referral-community}"
TENANT_ID="${E2E_REFERRAL_TENANT_ID:-tenant-demo-001}"
PERIOD="${E2E_REFERRAL_PERIOD:-2026-06}"
PARTNER_USER_REF="${E2E_REFERRAL_PARTNER_USER_REF:-e2e-referral-user-${E2E_RUN_ID:-local}}"
EXPECTED_GMV_MINOR=150000
EXPECTED_SHARE_MINOR=22500

fail() { log_fail "$1"; exit 1; }

# ── LEG 1 — Platform Admin: referral channel entry + revenue-share rate ─────────
log_surface "Platform Admin — referral channel registry"
switch_actor "platform_admin" "e2e-platform-admin-016"

log_step "1.1 — GET /partner/entries/:slug (referral channel entry)"
http_call GET "/partner/entries/${ENTRY_SLUG}"
assert_status "200"
ENTRY_TYPE=$(json_get_first ".data.partnerType" ".data.partner_type")
[[ "$ENTRY_TYPE" == "referral_channel" ]] || \
  fail "Expected referral_channel entry, got '${ENTRY_TYPE:-<empty>}'"
chain_set "referral" "entrySlug" "$ENTRY_SLUG"
save_evidence "$SCENARIO" "platform_admin" "entrySlug" "$ENTRY_SLUG"
save_evidence "$SCENARIO" "platform_admin" "partnerType" "$ENTRY_TYPE"

log_step "1.2 — GET /platform-admin/referral-rates (active revenue-share rule)"
http_call GET "/platform-admin/referral-rates?entrySlug=${ENTRY_SLUG}"
assert_status "200"
RULE=$(echo "$RESP_BODY" | jq -c --arg s "$ENTRY_SLUG" \
  '[.data.items[] | select((.partnerEntrySlug // .partner_entry_slug) == $s)][0] // {}' 2>/dev/null || echo '{}')
RATE_TYPE=$(echo "$RULE" | jq -r '(.rateType // .rate_type) // empty')
RATE_VALUE=$(echo "$RULE" | jq -r '(.value) // empty')
RATE_DIR=$(echo "$RULE" | jq -r '(.settlementDirection // .settlement_direction) // empty')
RATE_CHANNEL=$(echo "$RULE" | jq -r '(.channelKey // .channel_key) // empty')
[[ "$RATE_TYPE" == "percent" ]]            || fail "Expected percent rate, got '${RATE_TYPE:-<empty>}'"
[[ "$RATE_VALUE" == "15" ]]                || fail "Expected rate value 15, got '${RATE_VALUE:-<empty>}'"
[[ "$RATE_DIR" == "drts_pays_partner" ]]   || fail "Expected drts_pays_partner, got '${RATE_DIR:-<empty>}'"
[[ "$RATE_CHANNEL" == "partner_referral" ]] || fail "Expected partner_referral channel, got '${RATE_CHANNEL:-<empty>}'"
save_evidence "$SCENARIO" "platform_admin" "rateType" "$RATE_TYPE"
save_evidence "$SCENARIO" "platform_admin" "rateValue" "$RATE_VALUE"
log_ok "Referral revenue-share rule confirmed: ${RATE_VALUE}% ${RATE_TYPE} (drts_pays_partner / partner_referral)"

# ── LEG 2 — Partner Ingress: s2s handoff + durable identity binding ─────────────
log_surface "Partner Ingress — s2s handoff identity binding"
switch_actor "platform_admin" "e2e-platform-admin-016"

log_step "2.1 — POST /platform-admin/partner-entries/:slug/credentials/issue"
ISSUE_FIXTURE=$(mktemp /tmp/drts-e2e-016-cred-XXXXXX.json)
printf '%s\n' '{"rotationReason":"E2E-016 referral handoff"}' > "$ISSUE_FIXTURE"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/issue" "$ISSUE_FIXTURE"
assert_status "200|201"
PARTNER_KEY=$(json_get_first ".data.plaintextKey" ".data.plaintext_key")
[[ -n "$PARTNER_KEY" ]] || fail "Credential issue returned no plaintext key: ${RESP_BODY}"

log_step "2.2 — POST /partner/ingress/handoff (first bind)"
HANDOFF_FIXTURE=$(mktemp /tmp/drts-e2e-016-handoff-XXXXXX.json)
printf '%s\n' "{\"entrySlug\":\"${ENTRY_SLUG}\",\"apiKey\":\"${PARTNER_KEY}\",\"partnerUserRef\":\"${PARTNER_USER_REF}\",\"consentScope\":\"referral_attribution\"}" > "$HANDOFF_FIXTURE"
http_call POST "/partner/ingress/handoff" "$HANDOFF_FIXTURE"
assert_status "200|201"
HANDOFF_TOKEN=$(json_get_first ".data.accessToken" ".data.access_token")
PASSENGER_ID_1=$(json_get_first ".data.drtsPassengerId" ".data.drts_passenger_id")
HANDOFF_ACTOR=$(json_get_first ".data.identity.actorType" ".data.identity.actor_type")
HANDOFF_REALM=$(json_get ".data.identity.realm")
HANDOFF_ENTRY=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")
[[ -n "$HANDOFF_TOKEN" ]]                     || fail "Handoff returned no access token: ${RESP_BODY}"
[[ -n "$PASSENGER_ID_1" ]]                    || fail "Handoff returned no drtsPassengerId: ${RESP_BODY}"
[[ "$HANDOFF_ACTOR" == "referral_passenger" ]] || fail "Expected referral_passenger identity, got '${HANDOFF_ACTOR:-<empty>}'"
[[ "$HANDOFF_REALM" == "partner" ]]           || fail "Expected partner realm, got '${HANDOFF_REALM:-<empty>}'"
[[ "$HANDOFF_ENTRY" == "$ENTRY_SLUG" ]]       || fail "Handoff bound to wrong entry: '${HANDOFF_ENTRY:-<empty>}'"

log_step "2.3 — POST /partner/ingress/handoff (re-bind same partnerUserRef → durable passenger)"
http_call POST "/partner/ingress/handoff" "$HANDOFF_FIXTURE"
assert_status "200|201"
PASSENGER_ID_2=$(json_get_first ".data.drtsPassengerId" ".data.drts_passenger_id")
[[ "$PASSENGER_ID_1" == "$PASSENGER_ID_2" ]] || \
  fail "Identity binding not durable: first='${PASSENGER_ID_1}', second='${PASSENGER_ID_2}'"
chain_set "referral" "drtsPassengerId" "$PASSENGER_ID_1"
save_evidence "$SCENARIO" "ingress" "drtsPassengerId" "$PASSENGER_ID_1"
save_evidence "$SCENARIO" "ingress" "partnerUserRef" "$PARTNER_USER_REF"
log_ok "Durable s2s identity link: ${PARTNER_USER_REF} → ${PASSENGER_ID_1}"

# ── LEG 3 — Partner-scoped referral reads (using the handoff bearer session) ─────
log_surface "Channel Partner — referral usage / revenue / settlement"
# The referral portal reads require the CHANNEL PARTNER identity
# (actorType=partner_api_key, realm=partner, partnerEntrySlug) — not the handoff
# passenger bearer. Present it via bootstrap headers, mirroring E2E-008.
switch_actor "partner_api_key" "referral-channel-partner-016" "$TENANT_ID"
export E2E_REALM="partner"
export E2E_PARTNER_ID="$PARTNER_ID"
export E2E_PARTNER_PROGRAM_ID="$PARTNER_PROGRAM_ID"
export E2E_PARTNER_ENTRY_SLUG="$ENTRY_SLUG"
E2E_EXTRA_SCOPES="billing:read"

log_step "3.1 — GET /partner/referral/statements/:period (settlement evidence)"
http_call GET "/partner/referral/statements/${PERIOD}"
assert_status "200"
STMT_CHANNEL=$(json_get_first ".data.channelKey" ".data.channel_key")
STMT_DIR=$(json_get ".data.direction")
STMT_GMV=$(json_get_first ".data.totals.gmv.amountMinor" ".data.totals.gmv.amount_minor")
STMT_SHARE=$(json_get_first ".data.totals.shareTotal.amountMinor" ".data.totals.share_total.amount_minor")
STMT_TRIPS=$(json_get_first ".data.totals.tripCount" ".data.totals.trip_count")
STMT_RIDERS=$(json_get_first ".data.totals.activeRiderCount" ".data.totals.active_rider_count")
[[ "$STMT_CHANNEL" == "partner_referral" ]]   || fail "Statement channel not partner_referral: '${STMT_CHANNEL:-<empty>}'"
[[ "$STMT_DIR" == "drts_pays_partner" ]]       || fail "Statement direction not drts_pays_partner: '${STMT_DIR:-<empty>}'"
[[ "$STMT_GMV" == "$EXPECTED_GMV_MINOR" ]]     || fail "Statement GMV expected ${EXPECTED_GMV_MINOR}, got '${STMT_GMV:-<empty>}'"
[[ "$STMT_SHARE" == "$EXPECTED_SHARE_MINOR" ]] || fail "Statement share expected ${EXPECTED_SHARE_MINOR}, got '${STMT_SHARE:-<empty>}'"
[[ "$STMT_TRIPS" == "2" ]]                     || fail "Statement tripCount expected 2, got '${STMT_TRIPS:-<empty>}'"
[[ "$STMT_RIDERS" == "2" ]]                    || fail "Statement activeRiders expected 2, got '${STMT_RIDERS:-<empty>}'"
save_evidence "$SCENARIO" "settlement" "gmvMinor" "$STMT_GMV"
save_evidence "$SCENARIO" "settlement" "shareMinor" "$STMT_SHARE"
save_evidence "$SCENARIO" "settlement" "period" "$PERIOD"
log_ok "Referral settlement: GMV ${STMT_GMV} → partner share ${STMT_SHARE} (15%) for ${PERIOD}"

log_step "3.2 — GET /partner/referral/statements (scoped list incl. the period)"
http_call GET "/partner/referral/statements"
assert_status "200"
SCOPED_OK=$(echo "$RESP_BODY" | jq -r --arg s "$ENTRY_SLUG" --arg p "$PERIOD" \
  '((.data.items | length) >= 1)
   and (all(.data.items[]; (.partnerEntrySlug // .partner_entry_slug) == $s))
   and (any(.data.items[]; (.period // .periodMonth // .period_month) == $p))' 2>/dev/null || echo false)
[[ "$SCOPED_OK" == "true" ]] || fail "Statement list not scoped to ${ENTRY_SLUG} / missing ${PERIOD}: ${RESP_BODY}"

log_step "3.3 — GET /partner/referral/usage (per-period attribution)"
http_call GET "/partner/referral/usage"
assert_status "200"
USAGE_OK=$(echo "$RESP_BODY" | jq -r --arg p "$PERIOD" \
  'any(.data.items[]; (.period // .periodMonth // .period_month) == $p)' 2>/dev/null || echo false)
[[ "$USAGE_OK" == "true" ]] || fail "Usage missing attributed period ${PERIOD}: ${RESP_BODY}"

log_step "3.4 — GET /partner/referral/revenue (per-period share)"
http_call GET "/partner/referral/revenue"
assert_status "200"
echo "$RESP_BODY" | grep -q "$EXPECTED_SHARE_MINOR" || \
  fail "Revenue read does not expose partner share ${EXPECTED_SHARE_MINOR}: ${RESP_BODY}"

log_step "3.5 — GET /partner/referral/dashboard?periodMonth=:period"
http_call GET "/partner/referral/dashboard?periodMonth=${PERIOD}"
assert_status "200"
echo "$RESP_BODY" | grep -q "$EXPECTED_GMV_MINOR" || \
  fail "Dashboard does not reflect GMV ${EXPECTED_GMV_MINOR}: ${RESP_BODY}"
echo "$RESP_BODY" | grep -q "$EXPECTED_SHARE_MINOR" || \
  fail "Dashboard does not reflect share ${EXPECTED_SHARE_MINOR}: ${RESP_BODY}"

echo ""
log_ok "E2E-016 complete — third-party referral channel verified end to end for ${ENTRY_SLUG} (${PERIOD})."
echo -e "Evidence log: ${EVIDENCE_FILE:-<none>}"
