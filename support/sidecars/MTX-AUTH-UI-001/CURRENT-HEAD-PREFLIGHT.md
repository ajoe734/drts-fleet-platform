# MTX-AUTH-UI-001 Current-Head Preflight

- **Task:** `MTX-AUTH-UI-001`
- **Fleet:** B
- **Authoritative head:** `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
- **Current `origin/dev`:** `2711c366f2e103ae9556d5afaf4558dfd9b0bb4c`
- **Resumed branch:** `origin/gemini/mtx-auth-ui-001` at
  `b05dc3f4ad7b54c9890d484e79c9d273400eb236`
  **Reconciliation:** the authoritative head was merged into the resumed branch;
  the three existing implementation commits remain in its ancestry.

## Acceptance Classification

| Acceptance item                                               | Initial       | Post-delta    | Evidence / remaining boundary                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MTX-AUTH-UI-01` registry                                     | `partial`     | `verified`    | Search, status filter, three deterministic sort modes, approved-record expiry warning, loading, and empty-filter states are implemented and covered by behavior/contract tests.                                                             |
| `MTX-AUTH-UI-02` detail                                       | `partial`     | `verified`    | Canonical identity, plan, fare, service areas, effective window, audit timestamps, lifecycle source, and current/history vehicle counts are rendered from API records.                                                                      |
| `MTX-AUTH-UI-03` draft editor                                 | `partial`     | `verified`    | Create/update preserve canonical API wiring; required/date/window field validation, summary errors, and unsaved-change handling are implemented.                                                                                            |
| `MTX-AUTH-UI-04` lifecycle confirmation                       | `partial`     | `verified`    | The modal refreshes authorization and vehicle APIs before opening, rechecks server status, displays only server values, requires a reason, and submits the canonical action.                                                                |
| `MTX-AUTH-UI-05` authorized vehicles                          | `partial`     | `verified`    | Current/history classification, search/filter, counts, add validation, and command-pending controls are implemented.                                                                                                                        |
| `MTX-AUTH-UI-06` conflict / permission states                 | `partial`     | `verified`    | Typed 401, 403, 404/unavailable, 409/stale/conflict, validation, and retryable request classification has behavioral coverage.                                                                                                              |
| Six Screen IDs mapped to production surfaces                  | `partial`     | `verified`    | `MTX-AUTH-UI-01..06` are explicit `data-screen-id` values and asserted by app/root contract tests.                                                                                                                                          |
| Status/capability matrix                                      | `partial`     | `verified`    | Live actions use the latest server status and the server revalidates each command. The API still exposes platform-realm authorization rather than a finer `availableActions` descriptor; 403 changes fail closed into the permission state. |
| Conflict and 403 behavior tests                               | `partial`     | `verified`    | Pure behavior tests assert session, permission, stale conflict, unavailable, and validation classification.                                                                                                                                 |
| Unsupported action boundary                                   | `implemented` | `verified`    | No revoke, restore, delete, vehicle suspend/remove request path exists; visible disabled controls explain `command pending`.                                                                                                                |
| Loading, empty, stale, unavailable, session/capability change | `partial`     | `verified`    | Dedicated semantics and retry control are implemented; form state is not reset by error handling.                                                                                                                                           |
| Responsive 1440/1280/1024 and keyboard operation              | `partial`     | `implemented` | Responsive breakpoints, native labeled controls, focusable buttons, and modal dialog semantics pass typecheck/lint. Browser screenshot evidence remains outstanding.                                                                        |
| Registry/detail/draft/vehicles/confirmation/state screenshots | `missing`     | `missing`     | Capture in a review runtime with authenticated canonical API fixtures; no static image is treated as runtime proof.                                                                                                                         |

## Command Boundary

| Command                   | Classification    | Basis                                                             |
| ------------------------- | ----------------- | ----------------------------------------------------------------- |
| create draft              | `implemented`     | Canonical POST route exists.                                      |
| update draft              | `implemented`     | Canonical PUT route exists and server rejects non-draft state.    |
| activate                  | `implemented`     | Canonical POST route exists and server owns lifecycle validation. |
| suspend                   | `implemented`     | Canonical POST route exists and server owns lifecycle validation. |
| add vehicle               | `implemented`     | Canonical POST route exists.                                      |
| revoke / restore / delete | `blocked_command` | No approved command, capability, audit, and tests.                |
| vehicle suspend / remove  | `blocked_command` | No approved command, capability, audit, and tests.                |

## Baseline Verification

- Source reconciliation and Git ancestry: `verified`.
- Offline dependency restoration completed without changing the lockfile.
- Platform Admin authorization tests: `11 passed`.
- Root authorization contract tests: `6 passed`.
- API package regression tests, including multi-taxi service/controller:
  `128 files / 863 tests passed`.
- Platform Admin typecheck, ESLint, Prettier, and `git diff --check`: `verified`.
- External provider/device evidence: not applicable.
