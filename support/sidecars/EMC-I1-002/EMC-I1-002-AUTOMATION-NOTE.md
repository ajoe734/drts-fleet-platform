# EMC-I1-002 Automation Note

**Task:** `EMC-I1-002`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Date:** `2026-04-22`

## Scope

This note records the repo-controlled automation expansion for the phone-booking to compliance-export chain.

The new executable anchor is:

- `tests/e2e/E2E-003-phone-booking-compliance-export.sh`

## What Is Now Automated

The script verifies the repo-owned parts of the chain end to end:

1. `POST /api/callcenter/sessions` opens a booking call session.
2. `POST /api/call-center/orders` creates the phone booking and preserves `callId` lineage.
3. `GET /api/orders/:orderId/dispatch-trace` confirms `callcenter.order_created`.
4. `POST /api/reports/jobs` with `jobType=dispatch_recording_index` exports the phone order and checks the explicit `missingRecording` flag.
5. `POST /api/filing-packages/generate` verifies immutable filing-package generation and signed artifact metadata.

## Optional Callback Leg

When `E2E_ENABLE_CTI_CALLBACK=1`, the same script also exercises the repo-owned callback endpoint:

- `POST /api/callcenter/sessions/:callId/recording-callback`

That branch verifies the order transitions away from `recording_pending` and the exported report row flips to `missingRecording=false`.

## Explicit Non-Automated Boundary

The script does **not** claim live telephony integration. The following remain environment-gated:

- real inbound CTI session origination
- telephony-vendor recording delivery
- any staging scheduler dependency outside direct API invocation

This keeps the external CTI gate explicit while still turning the repo-controlled compliance path into repeatable evidence.

## Endpoint Reality Note

The current repo route for phone booking creation is:

- `POST /api/call-center/orders`

Several older UAT notes summarize the flow as `POST /api/callcenter/bookings`, but the executable backend/controller and shared client use `call-center/orders`. New automation follows the implemented route to avoid false negatives.
