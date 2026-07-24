# MTX-AUTH-UI-001 Fleet B Handoff

## Status

`verified_current_head`

Fleet B resumed the existing implementation and reconciled it onto the merged
requirements baseline. The clean integration branch adds authenticated runtime
evidence and fixes the create-draft selection race exposed by that browser flow.

## Delivered Surfaces

| Screen ID        | Production surface                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `MTX-AUTH-UI-01` | Registry search, status filter, deterministic sort, effective-window warning, loading, and empty state              |
| `MTX-AUTH-UI-02` | Canonical detail, lifecycle source, fare/service-area/effective-window fields, audit timestamps, and vehicle counts |
| `MTX-AUTH-UI-03` | Create/edit draft, field and summary validation, and unsaved-change guard                                           |
| `MTX-AUTH-UI-04` | Activate/suspend dialog using a fresh authorization and vehicle API preview with a required reason                  |
| `MTX-AUTH-UI-05` | Current/history vehicle list, search/filter/counts, validation, and add flow                                        |
| `MTX-AUTH-UI-06` | Session, permission, stale/conflict, validation, unavailable, and retryable request states                          |

All six views remain in the existing
`apps/platform-admin-web/app/multi-taxi-authorizations/` route and carry explicit
`data-screen-id` mappings.

## Command Boundary

Live canonical commands remain limited to create draft, update draft, activate,
suspend, and add vehicle. Revoke, restore, delete, vehicle suspend, and vehicle
remove are visible only as disabled `command pending` controls; no request path
for those commands was added.

Action availability is derived from the latest server status and the server
revalidates the command. The current API has platform-realm enforcement but does
not return a finer per-record `availableActions` descriptor; a server 403 fails
closed into the permission/capability-change state.

## Verification

| Check                              | Result                         |
| ---------------------------------- | ------------------------------ |
| Platform Admin authorization tests | `11 passed`                    |
| Root authorization contract tests  | `6 passed`                     |
| API package regression tests       | `128 files / 863 tests passed` |
| Platform Admin typecheck           | passed                         |
| Platform Admin ESLint              | passed                         |
| Prettier check                     | passed                         |
| `git diff --check`                 | passed                         |
| Authenticated Playwright flow      | `1 passed`                     |

Authenticated runtime screenshots are archived under `screenshots/` for the
registry, detail, draft validation, vehicles, lifecycle confirmation, and 403
permission state. No deployment or publication was performed.
