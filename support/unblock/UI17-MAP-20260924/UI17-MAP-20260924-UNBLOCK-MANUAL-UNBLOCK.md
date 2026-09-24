# UI17-MAP-20260924 Unblock Diagnosis

## Issue
The parent task `UI17-MAP-20260924` is blocked because the required map UI interaction test suites (`tenant-map-booking-ui.spec.ts`, `partner-map-booking-ui.spec.ts`, `concierge-map-booking-ui.spec.ts`) are excluded from the `ui-route-e2e` job in `ci-integ.yml`. As noted by the reviewer (Codex):
> "Thus a green E2E aggregate cannot establish required map interactions. Supervisor must coordinate an authorized hosted selector/workflow scope and owner must record same-candidate command/run/job/artifact and pass/fail/skip. No local servers."

## Resolution
Currently, `ci-integ.yml`'s `ui-route-e2e` uses `playwright.deterministic-route-suite.config.ts`, which explicitly runs only `deterministic-route-suite.spec.ts`. Modifying CI execution scopes or creating new automated workflows for these specific maps tests requires explicit coordination from the Supervisor to authorize the correct hosted workflow scope. 
This artifact documents the exact condition blocking the parent task.

## Next Step for Parent Task
Supervisor must authorize and coordinate a hosted map selector/workflow scope. Once available, the owner must trigger this hosted workflow on the locked candidate and provide the run/job/artifact evidence for reviewer acceptance.

## Repair 2026-09-24

Reviewer: Codex
Review Source/SHA: 38efa7481e17be5125d3382f1b1f91fc19808519

### Findings & Resolutions
1. **U1 [P2: missing PR delivery evidence]**: Branch was pushed but no pull request was created.
   *Resolution*: Created the task-scoped PR via `gh pr create` and verified the remote head matches the candidate SHA.
2. **U2 [P2: parent routing and unresolved disposition absent from machine truth]**: The helper completed without explicitly recording the parent task's unresolved disposition (`resolved_parent_status`, `resolved_parent_next`, `resolved_parent_waiting_for`) into machine truth metadata, which would incorrectly default to `todo`.
   *Resolution*: Recorded `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Supervisor`, and `resolved_parent_next="Supervisor must coordinate hosted map selector/workflow scope"` via Python orchestration API to ensure the disposition is preserved correctly before merge.

### Commands & Results
* Updated metadata via `ai_status` orchestration API: Success.
* Created PR via `gh pr create`: Success.
