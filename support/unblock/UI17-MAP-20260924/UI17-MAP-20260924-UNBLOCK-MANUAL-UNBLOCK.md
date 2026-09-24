# UI17-MAP-20260924 Unblock Diagnosis

## Issue
The parent task `UI17-MAP-20260924` is blocked because the required map UI interaction test suites (`tenant-map-booking-ui.spec.ts`, `partner-map-booking-ui.spec.ts`, `concierge-map-booking-ui.spec.ts`) are excluded from the `ui-route-e2e` job in `ci-integ.yml`. As noted by the reviewer (Codex):
> "Thus a green E2E aggregate cannot establish required map interactions. Supervisor must coordinate an authorized hosted selector/workflow scope and owner must record same-candidate command/run/job/artifact and pass/fail/skip. No local servers."

## Resolution
Currently, `ci-integ.yml`'s `ui-route-e2e` uses `playwright.deterministic-route-suite.config.ts`, which explicitly runs only `deterministic-route-suite.spec.ts`. Modifying CI execution scopes or creating new automated workflows for these specific maps tests requires explicit coordination from the Supervisor to authorize the correct hosted workflow scope. 
This artifact documents the exact condition blocking the parent task.

## Next Step for Parent Task
Supervisor must authorize and coordinate a hosted map selector/workflow scope. Once available, the owner must trigger this hosted workflow on the locked candidate and provide the run/job/artifact evidence for reviewer acceptance.
