#!/usr/bin/env bash
# Ad-hoc: create booking -> dispatch -> assign to drv-demo-001 on the target API,
# leaving the driver task in an actionable (assigned/pending) state. NOT a suite test.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/helpers.sh"
SCENARIO="DEV-SEED"
chain_init

WS=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ")
WE=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ")

switch_actor "tenant_admin" "e2e-tenant-admin-001" "${E2E_SEED_TENANT_ID}"
BF=$(mktemp); jq --arg ws "$WS" --arg we "$WE" \
  '.reservationWindowStart=$ws | .reservationWindowEnd=$we' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" > "$BF"
http_call POST "/tenant/bookings" "$BF"; assert_status "200|201"
BID=$(json_get_first ".data.bookingId" ".data.booking_id")
OID=$(json_get_first ".data.orderId" ".data.order_id")
echo ">>> bookingId=$BID orderId=$OID"

switch_actor "ops_user" "e2e-ops-001"
http_call POST "/orders/${OID}/dispatch" || true
DJ=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
if [[ -z "$DJ" ]]; then
  http_call GET "/dispatch/tasks"; assert_status "200"
  DJ=$(echo "$RESP_BODY" | jq -r --arg oid "$OID" '.data.items[] | select((.orderId // .order_id)==$oid) | (.dispatchJobId // .dispatch_job_id)' | head -1)
fi
echo ">>> dispatchJobId=$DJ"

AF=$(mktemp); jq --arg j "$DJ" --arg v "veh-demo-001" --arg d "drv-demo-001" \
  '.dispatchJobId=$j | .vehicleId=$v | .driverId=$d' \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$AF"
http_call POST "/dispatch/assign" "$AF"; assert_status "200|201"
TID=$(json_get_first ".data.taskId" ".data.task_id")
echo ">>> ASSIGNED taskId=$TID driver=drv-demo-001 (left pending, not accepted)"
rm -f "$BF" "$AF"
