#!/usr/bin/env bash
# E2E-019 — Fleet supply onboarding (API level)
#
# Source: docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §11.3
# Dependencies: SUP-BE-003 (fleet write API restore), SUP-BE-006 (approve-time
# canonical provisioning), SUP-BE-007 (supply readiness service).
#
# This scenario proves the full API-level chain:
#   1. Fleet partner self-service create/update/list/detail/upload/delete/submit/withdraw
#   2. Admin review state machine with revision loop and self-approval guard
#   3. Approve-time canonical driver/vehicle/contract/policy provisioning
#   4. Same-subject readiness=ready through the shared submission read-model

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-019"
FLEET_PARTNER_ID="${E2E_SUPPLY_FLEET_PARTNER_ID:-fleet-demo-001}"
READINESS_SCOPES="${E2E_SUPPLY_READINESS_SCOPES:-billing:read partner:entries:read}"
VALID_CHECKSUM_A="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
VALID_CHECKSUM_B="fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
VALID_CHECKSUM_C="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
VALID_CHECKSUM_D="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
VALID_CHECKSUM_E="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

TMP_FILES=()
cleanup() {
  local f
  for f in "${TMP_FILES[@]:-}"; do [[ -n "$f" ]] && rm -f "$f"; done
  return 0
}
trap cleanup EXIT

use_admin_actor() { switch_actor "platform_admin" "e2e-platform-admin-001"; }
use_actor_id() { switch_actor "platform_admin" "$1"; }
use_partner_actor() {
  switch_actor "partner_api_key" "e2e-fleet-partner-001"
  E2E_FLEET_PARTNER_ID="$FLEET_PARTNER_ID"
  E2E_EXTRA_SCOPES="$READINESS_SCOPES"
}

write_json() { # json
  local f
  f=$(mktemp)
  TMP_FILES+=("$f")
  printf '%s' "$1" > "$f"
  printf '%s' "$f"
}

post_json() { # path json
  http_call POST "$1" "$(write_json "$2")"
}

put_json() { # path json
  http_call PUT "$1" "$(write_json "$2")"
}

delete_json() { # path json
  http_call DELETE "$1" "$(write_json "$2")"
}

assert_error_code() { # expected
  local got
  got=$(json_get '.error.code')
  if [[ "$got" != "$1" ]]; then
    log_fail "Expected error code ${1}, got '${got}' (HTTP ${RESP_STATUS})"
    log_fail "Body: ${RESP_BODY}"
    return 1
  fi
  log_ok "Error contract ${1} (HTTP ${RESP_STATUS})"
}

read_portal_submission() { # submission-id
  use_partner_actor
  http_call GET "/fleet-partner/supply-submissions/$1"
  assert_status "200"
  PORTAL_SUB_STATUS=$(json_get '.data.submission.status')
  PORTAL_SUB_REV=$(json_get '.data.submission.revision_no')
}

read_admin_submission() { # submission-id
  use_admin_actor
  http_call GET "/admin/supply-review/submissions/$1"
  assert_status "200"
  ADMIN_SUB_STATUS=$(json_get '.data.status')
  ADMIN_SUB_REV=$(json_get '.data.revision_no')
  ADMIN_SUB_SUBMITTER=$(json_get '.data.submitted_by')
}

list_portal_submissions() {
  use_partner_actor
  http_call GET "/fleet-partner/supply-submissions"
  assert_status "200"
}

create_upload_url() { # submission-id revision document-type file-name
  use_partner_actor
  post_json \
    "/fleet-partner/supply-submissions/$1/documents/upload-url" \
    "{\"expectedRevisionNo\":$2,\"documentType\":\"$3\",\"originalFileName\":\"$4\",\"contentType\":\"application/pdf\"}"
  assert_status "200|201"
  DOC_OBJECT_KEY=$(json_get '.data.object_key')
  if [[ -z "$DOC_OBJECT_KEY" ]]; then
    log_fail "Upload URL response missing object_key"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

confirm_upload() { # submission-id revision document-type file-name checksum
  use_partner_actor
  post_json \
    "/fleet-partner/supply-submissions/$1/documents/confirm" \
    "{\"expectedRevisionNo\":$2,\"documentType\":\"$3\",\"objectKey\":\"${DOC_OBJECT_KEY}\",\"originalFileName\":\"$4\",\"contentType\":\"application/pdf\",\"fileSize\":1024,\"checksumSha256\":\"$5\",\"effectiveFrom\":\"2026-01-01\",\"effectiveUntil\":\"2027-12-31\"}"
  assert_status "200|201"
  DOC_ID=$(json_get '.data.document_id')
}

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-019 — Fleet supply onboarding (API level)${RESET}"
echo -e "${BOLD}  Fleet partner: ${FLEET_PARTNER_ID}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

log_surface "Fleet Partner Portal — driver write flow"
log_step "LEG 1 — create/update/list/detail/upload/delete/submit/resubmit/approve driver"

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/drivers" \
  '{"name":"E2E Driver Demo","mobile":"+886900111222","professionalDriverLicenseNo":"E2E-PDL-001","professionalDriverLicenseExpiry":"2027-12-31","taxiDriverRegistrationNo":"E2E-TAXI-001","taxiDriverRegistrationArea":"TPE","taxiDriverRegistrationExpiry":"2027-12-31","supportedServiceProductCodes":["taxi_realtime"],"preferredVehicleSubmissionId":null}'
assert_status "200|201"
DRIVER_SUB=$(json_get '.data.submission.submission_id')
if [[ -z "$DRIVER_SUB" ]]; then
  log_fail "Driver create response missing submission_id"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
log_ok "Created driver submission ${DRIVER_SUB}"
save_evidence "$SCENARIO" "fleet-partner" "driver_submission_id" "$DRIVER_SUB"

list_portal_submissions
DRIVER_IN_LIST=$(echo "$RESP_BODY" | jq -r --arg id "$DRIVER_SUB" \
  '[.data.items[]? | select(.submission.submission_id == $id)][0].submission.submission_id // empty')
[[ "$DRIVER_IN_LIST" == "$DRIVER_SUB" ]] || { log_fail "Driver submission missing from list"; exit 1; }
log_ok "GET /fleet-partner/supply-submissions returns created driver submission"

read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_STATUS" == "draft" ]] || { log_fail "Expected driver submission draft, got ${PORTAL_SUB_STATUS}"; exit 1; }
[[ "$PORTAL_SUB_REV" == "1" ]] || { log_fail "Expected driver revision 1, got ${PORTAL_SUB_REV}"; exit 1; }
log_ok "GET /fleet-partner/supply-submissions/${DRIVER_SUB} returns draft detail"

use_partner_actor
put_json \
  "/fleet-partner/supply-submissions/${DRIVER_SUB}/driver" \
  "{\"expectedRevisionNo\":1,\"name\":\"E2E Driver Demo Revised\",\"mobile\":\"+886900111223\",\"professionalDriverLicenseNo\":\"E2E-PDL-001\",\"professionalDriverLicenseExpiry\":\"2027-12-31\",\"taxiDriverRegistrationNo\":\"E2E-TAXI-001\",\"taxiDriverRegistrationArea\":\"TPE\",\"taxiDriverRegistrationExpiry\":\"2027-12-31\",\"supportedServiceProductCodes\":[\"taxi_realtime\"],\"preferredVehicleSubmissionId\":null}"
assert_status "200|201"
read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_REV" == "2" ]] || { log_fail "Expected driver revision 2 after update, got ${PORTAL_SUB_REV}"; exit 1; }
log_ok "PUT /driver advanced driver draft revision"

create_upload_url "$DRIVER_SUB" 2 "professional_driver_license" "driver-license.pdf"
confirm_upload "$DRIVER_SUB" 2 "professional_driver_license" "driver-license.pdf" "$VALID_CHECKSUM_A"
read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_REV" == "3" ]] || { log_fail "Expected driver revision 3 after first document, got ${PORTAL_SUB_REV}"; exit 1; }

create_upload_url "$DRIVER_SUB" 3 "taxi_driver_registration" "taxi-registration.pdf"
confirm_upload "$DRIVER_SUB" 3 "taxi_driver_registration" "taxi-registration.pdf" "$VALID_CHECKSUM_B"
read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_REV" == "4" ]] || { log_fail "Expected driver revision 4 after second document, got ${PORTAL_SUB_REV}"; exit 1; }

create_upload_url "$DRIVER_SUB" 4 "other" "driver-extra.pdf"
confirm_upload "$DRIVER_SUB" 4 "other" "driver-extra.pdf" "$VALID_CHECKSUM_C"
EXTRA_DRIVER_DOC_ID="$DOC_ID"
delete_json \
  "/fleet-partner/supply-submissions/${DRIVER_SUB}/documents/${EXTRA_DRIVER_DOC_ID}" \
  '{"expectedRevisionNo":5}'
assert_status "200|201"
[[ "$(json_get '.data.deleted')" == "true" ]] || { log_fail "Delete document did not return deleted=true"; exit 1; }
read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_REV" == "6" ]] || { log_fail "Expected driver revision 6 after delete, got ${PORTAL_SUB_REV}"; exit 1; }
log_ok "Document delete endpoint executed and advanced revision"

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/${DRIVER_SUB}/submit" \
  '{"expectedRevisionNo":6}'
assert_status "200|201"
[[ "$(json_get '.data.submission.status')" == "submitted" ]] || { log_fail "Driver submit did not reach submitted"; exit 1; }
log_ok "Driver submission submitted from fleet-partner portal"

read_admin_submission "$DRIVER_SUB"
post_json \
  "/admin/supply-review/submissions/${DRIVER_SUB}/start" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"initial_screening\",\"comment\":\"Driver review started\"}"
assert_status "200|201"
[[ "$(json_get '.data.status')" == "in_review" ]] || { log_fail "Driver start review did not reach in_review"; exit 1; }

read_admin_submission "$DRIVER_SUB"
post_json \
  "/admin/supply-review/submissions/${DRIVER_SUB}/request-revision" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"profile_clarification\",\"comment\":\"Please confirm updated mobile.\"}"
assert_status "200|201"
[[ "$(json_get '.data.status')" == "needs_revision" ]] || { log_fail "Driver request-revision did not reach needs_revision"; exit 1; }
log_ok "Driver review entered needs_revision"

read_portal_submission "$DRIVER_SUB"
use_partner_actor
put_json \
  "/fleet-partner/supply-submissions/${DRIVER_SUB}/driver" \
  "{\"expectedRevisionNo\":${PORTAL_SUB_REV},\"name\":\"E2E Driver Demo Final\",\"mobile\":\"+886900111224\",\"professionalDriverLicenseNo\":\"E2E-PDL-001\",\"professionalDriverLicenseExpiry\":\"2027-12-31\",\"taxiDriverRegistrationNo\":\"E2E-TAXI-001\",\"taxiDriverRegistrationArea\":\"TPE\",\"taxiDriverRegistrationExpiry\":\"2027-12-31\",\"supportedServiceProductCodes\":[\"taxi_realtime\"],\"preferredVehicleSubmissionId\":null}"
assert_status "200|201"
read_portal_submission "$DRIVER_SUB"
[[ "$PORTAL_SUB_REV" == "10" ]] || { log_fail "Expected driver revision 10 after resubmission update, got ${PORTAL_SUB_REV}"; exit 1; }

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/${DRIVER_SUB}/submit" \
  "{\"expectedRevisionNo\":${PORTAL_SUB_REV}}"
assert_status "200|201"
[[ "$(json_get '.data.submission.status')" == "submitted" ]] || { log_fail "Driver resubmit did not return submitted"; exit 1; }
log_ok "Driver submission resubmitted after revision request"

read_admin_submission "$DRIVER_SUB"
post_json \
  "/admin/supply-review/submissions/${DRIVER_SUB}/start" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"final_screening\",\"comment\":\"Driver revision reviewed\"}"
assert_status "200|201"
read_admin_submission "$DRIVER_SUB"
post_json \
  "/admin/supply-review/submissions/${DRIVER_SUB}/approve" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"all_documents_valid\",\"comment\":\"Driver approved\"}"
assert_status "200|201"
[[ "$(json_get '.data.status')" == "approved" ]] || { log_fail "Driver approve did not reach approved"; exit 1; }
CANON_DRIVER=$(json_get '.data.canonical_driver_id')
[[ -n "$CANON_DRIVER" && "$CANON_DRIVER" != "null" ]] || { log_fail "Driver approve missing canonical_driver_id"; exit 1; }
log_ok "Driver approval provisioned canonical driver ${CANON_DRIVER}"
chain_set "regulatory-registry" "canonical_driver_id" "$CANON_DRIVER"

use_admin_actor
post_json \
  "/admin/drivers/${CANON_DRIVER}/fleet-affiliations" \
  "{\"fleetPartnerId\":\"${FLEET_PARTNER_ID}\",\"affiliationType\":\"contracted_under\",\"effectiveFrom\":\"2026-06-21T00:00:00.000Z\",\"effectiveUntil\":null,\"driverGroupId\":null}"
assert_status "200|201"
log_ok "Canonical driver affiliated to fleet partner"

log_surface "Fleet Partner Portal — withdraw path"
log_step "LEG 2 — submit and withdraw a disposable driver submission"

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/drivers" \
  '{"name":"E2E Withdraw Demo","mobile":"+886900444555","professionalDriverLicenseNo":"E2E-PDL-WITHDRAW","professionalDriverLicenseExpiry":"2027-12-31","taxiDriverRegistrationNo":"E2E-TAXI-WITHDRAW","taxiDriverRegistrationArea":"TPE","taxiDriverRegistrationExpiry":"2027-12-31","supportedServiceProductCodes":["taxi_realtime"],"preferredVehicleSubmissionId":null}'
assert_status "200|201"
WITHDRAW_SUB=$(json_get '.data.submission.submission_id')
create_upload_url "$WITHDRAW_SUB" 1 "professional_driver_license" "withdraw-license.pdf"
confirm_upload "$WITHDRAW_SUB" 1 "professional_driver_license" "withdraw-license.pdf" "$VALID_CHECKSUM_A"
create_upload_url "$WITHDRAW_SUB" 2 "taxi_driver_registration" "withdraw-registration.pdf"
confirm_upload "$WITHDRAW_SUB" 2 "taxi_driver_registration" "withdraw-registration.pdf" "$VALID_CHECKSUM_B"
use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/${WITHDRAW_SUB}/submit" \
  '{"expectedRevisionNo":3}'
assert_status "200|201"
use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/${WITHDRAW_SUB}/withdraw" \
  '{"expectedRevisionNo":4}'
assert_status "200|201"
[[ "$(json_get '.data.submission.status')" == "withdrawn" ]] || { log_fail "Withdraw did not return withdrawn"; exit 1; }
log_ok "Withdraw endpoint executed on a submitted supply submission"

log_surface "Fleet Partner Portal + Admin Review — vehicle flow"
log_step "LEG 3 — create/update/upload/submit/approve vehicle with self-approval guard"

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/vehicles" \
  "{\"plateNo\":\"E2E-7788\",\"licenseType\":\"taxi\",\"brand\":\"Toyota\",\"model\":\"Sienta\",\"modelYear\":2024,\"seatCount\":5,\"doorCount\":5,\"color\":\"Silver\",\"luggageCapacity\":3,\"businessArea\":\"TPE\",\"supportedServiceProductCodes\":[\"taxi_realtime\"],\"airportTransferEligible\":false,\"fixedFareAllowed\":false,\"currentDriverSubmissionId\":\"${DRIVER_SUB}\"}"
assert_status "200|201"
VEHICLE_SUB=$(json_get '.data.submission.submission_id')
[[ -n "$VEHICLE_SUB" ]] || { log_fail "Vehicle create response missing submission_id"; exit 1; }
log_ok "Created vehicle submission ${VEHICLE_SUB}"
save_evidence "$SCENARIO" "fleet-partner" "vehicle_submission_id" "$VEHICLE_SUB"

use_partner_actor
put_json \
  "/fleet-partner/supply-submissions/${VEHICLE_SUB}/vehicle" \
  "{\"expectedRevisionNo\":1,\"plateNo\":\"E2E-7788\",\"licenseType\":\"taxi\",\"brand\":\"Toyota\",\"model\":\"Sienta Hybrid\",\"modelYear\":2024,\"seatCount\":5,\"doorCount\":5,\"color\":\"Silver\",\"luggageCapacity\":4,\"businessArea\":\"TPE\",\"supportedServiceProductCodes\":[\"taxi_realtime\"],\"airportTransferEligible\":false,\"fixedFareAllowed\":false,\"currentDriverSubmissionId\":\"${DRIVER_SUB}\"}"
assert_status "200|201"
read_portal_submission "$VEHICLE_SUB"
[[ "$PORTAL_SUB_REV" == "2" ]] || { log_fail "Expected vehicle revision 2 after update, got ${PORTAL_SUB_REV}"; exit 1; }

create_upload_url "$VEHICLE_SUB" 2 "vehicle_registration" "vehicle-registration.pdf"
confirm_upload "$VEHICLE_SUB" 2 "vehicle_registration" "vehicle-registration.pdf" "$VALID_CHECKSUM_C"
create_upload_url "$VEHICLE_SUB" 3 "insurance_policy" "vehicle-insurance.pdf"
confirm_upload "$VEHICLE_SUB" 3 "insurance_policy" "vehicle-insurance.pdf" "$VALID_CHECKSUM_D"
create_upload_url "$VEHICLE_SUB" 4 "fleet_participation_contract" "fleet-contract.pdf"
confirm_upload "$VEHICLE_SUB" 4 "fleet_participation_contract" "fleet-contract.pdf" "$VALID_CHECKSUM_E"
read_portal_submission "$VEHICLE_SUB"
[[ "$PORTAL_SUB_REV" == "5" ]] || { log_fail "Expected vehicle revision 5 after uploads, got ${PORTAL_SUB_REV}"; exit 1; }

use_partner_actor
post_json \
  "/fleet-partner/supply-submissions/${VEHICLE_SUB}/submit" \
  '{"expectedRevisionNo":5}'
assert_status "200|201"
[[ "$(json_get '.data.submission.status')" == "submitted" ]] || { log_fail "Vehicle submit did not reach submitted"; exit 1; }
log_ok "Vehicle submission submitted from fleet-partner portal"

read_admin_submission "$VEHICLE_SUB"
post_json \
  "/admin/supply-review/submissions/${VEHICLE_SUB}/start" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"manual_screening\",\"comment\":\"Vehicle review started\"}"
assert_status "200|201"
read_admin_submission "$VEHICLE_SUB"
use_actor_id "e2e-fleet-partner-001"
post_json \
  "/admin/supply-review/submissions/${VEHICLE_SUB}/approve" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"self_approval_probe\"}"
assert_status "403"
assert_error_code "REVIEWER_SELF_APPROVAL_DENIED"
log_ok "Reviewer self-approval guard enforced"

use_admin_actor
read_admin_submission "$VEHICLE_SUB"
post_json \
  "/admin/supply-review/submissions/${VEHICLE_SUB}/approve" \
  "{\"expectedRevisionNo\":${ADMIN_SUB_REV},\"reasonCode\":\"all_documents_valid\",\"comment\":\"Vehicle approved\"}"
assert_status "200|201"
[[ "$(json_get '.data.status')" == "approved" ]] || { log_fail "Vehicle approve did not reach approved"; exit 1; }
CANON_VEHICLE=$(json_get '.data.canonical_vehicle_id')
CANON_CONTRACT=$(json_get '.data.canonical_contract_id')
CANON_POLICY=$(json_get '.data.canonical_policy_id')
for pair in "vehicle:${CANON_VEHICLE}" "contract:${CANON_CONTRACT}" "policy:${CANON_POLICY}"; do
  kind="${pair%%:*}"; val="${pair#*:}"
  if [[ -z "$val" || "$val" == "null" ]]; then
    log_fail "Vehicle approval missing canonical ${kind} id"
    exit 1
  fi
done
log_ok "Vehicle approval provisioned canonical vehicle/contract/policy"
chain_set "regulatory-registry" "canonical_vehicle_id" "$CANON_VEHICLE"
chain_set "regulatory-registry" "canonical_contract_id" "$CANON_CONTRACT"
chain_set "regulatory-registry" "canonical_policy_id" "$CANON_POLICY"
save_evidence "$SCENARIO" "regulatory-registry" "canonical_vehicle_id" "$CANON_VEHICLE"

log_surface "Fleet Partner Portal — readiness"
log_step "LEG 4 — same-subject readiness=ready and portal scope guard"

use_partner_actor
http_call GET "/fleet-partner/readiness"
assert_status "200"
READY_DRIVER=$(echo "$RESP_BODY" | jq -r --arg id "$CANON_DRIVER" \
  '[.data.items[]? | select(.subject_id == $id and .state == "ready" and (.reason_codes | length == 0))][0].subject_id // empty')
READY_VEHICLE=$(echo "$RESP_BODY" | jq -r --arg id "$CANON_VEHICLE" \
  '[.data.items[]? | select(.subject_id == $id and .state == "ready" and (.reason_codes | length == 0))][0].subject_id // empty')
[[ "$READY_DRIVER" == "$CANON_DRIVER" ]] || { log_fail "Readiness list missing ready canonical driver ${CANON_DRIVER}"; exit 1; }
[[ "$READY_VEHICLE" == "$CANON_VEHICLE" ]] || { log_fail "Readiness list missing ready canonical vehicle ${CANON_VEHICLE}"; exit 1; }
log_ok "Readiness list includes the just-approved canonical driver and vehicle in ready state"

use_partner_actor
http_call GET "/fleet-partner/readiness/drivers/${CANON_DRIVER}"
assert_status "200"
[[ "$(json_get '.data.state')" == "ready" ]] || { log_fail "Driver readiness route did not return ready"; exit 1; }
[[ "$(json_get '.data.subject_id')" == "$CANON_DRIVER" ]] || { log_fail "Driver readiness route returned wrong subject"; exit 1; }

use_partner_actor
http_call GET "/fleet-partner/readiness/vehicles/${CANON_VEHICLE}"
assert_status "200"
[[ "$(json_get '.data.state')" == "ready" ]] || { log_fail "Vehicle readiness route did not return ready"; exit 1; }
[[ "$(json_get '.data.subject_id')" == "$CANON_VEHICLE" ]] || { log_fail "Vehicle readiness route returned wrong subject"; exit 1; }
log_ok "Per-subject readiness routes confirm same-subject ready terminal"

use_partner_actor
http_call GET "/fleet-partner/readiness/drivers/e2e-no-such-subject"
assert_status "404"
assert_error_code "READINESS_SUBJECT_NOT_FOUND"

use_partner_actor
E2E_EXTRA_SCOPES="partner:entries:read"
http_call GET "/fleet-partner/readiness"
assert_status "403"
assert_error_code "AUTH_SCOPE_DENIED"
log_ok "Readiness portal route enforces billing:read scope"

print_chain_summary
echo -e "\n${GREEN}${BOLD}E2E-019 fleet supply onboarding: full write/review/provision/readiness chain verified.${RESET}"
exit 0
