# Stage 1 operational browser acceptance

`operations/verification/run-operational-browser-acceptance.sh` is the release-blocking browser
gate for S1F-UIX-001. It does not start local servers and it refuses to run
without `DRTS_CANDIDATE_SHA` plus deployed URLs for every active/retired surface.

The gate keeps the ordinary route/viewport suite separate from operational
acceptance. A route returning 200 is availability evidence only.

`tests/e2e/fixtures/operational-browser-journeys.json` is an intentionally
non-executable coverage template. Before a release rerun, provide a separate
candidate-specific manifest through `DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE`.
Every operation in that manifest must supply its browser control selector,
expected browser request, returned-ID path and API readback URL/state path. Each mutation
must record the request/result ID and API or database readback state in
`test-results/operational-browser/operational-browser-evidence.json`. The
candidate SHA, URL, actor scope, operation and readback state must be retained
with the release evidence. Its top-level `candidateSha` must exactly equal
`DRTS_CANDIDATE_SHA`; every active route, mutation response and readback must
return the same SHA in `x-drts-candidate-sha`. This prevents one URL from
silently serving a different deploy.

Enabled buttons require `data-drt-operation`; intentionally non-operational
controls must be disabled or annotated with `data-drt-non-operational` and a
visible `data-drt-non-operational-reason`. The gate fails on fixture/degraded fallback wording, unlabelled
enabled controls, and anything other than 404 for the paused Partner Booking
routes or retired Concierge route.

Example invocation:

```bash
DRTS_CANDIDATE_SHA=<git-sha> \
DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE=/secure/evidence/candidate-journeys.json \
DRTS_DEV_REFERRAL_EMBED_BASE_URL=https://... \
DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL=https://... \
DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL=https://... \
DRTS_DEV_PLATFORM_ADMIN_BASE_URL=https://... \
DRTS_DEV_TENANT_CONSOLE_BASE_URL=https://... \
DRTS_DEV_BANK_CONSOLE_BASE_URL=https://... \
DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL=https://... \
DRTS_DEV_PARTNER_BOOKING_BASE_URL=https://... \
DRTS_DEV_CONCIERGE_BASE_URL=https://... \
operations/verification/run-operational-browser-acceptance.sh
```
