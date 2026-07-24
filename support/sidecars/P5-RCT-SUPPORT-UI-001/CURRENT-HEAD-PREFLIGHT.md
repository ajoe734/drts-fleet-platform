# P5-RCT-SUPPORT-UI-001 Current-Head Preflight

- Task: `P5-COM-UI-03` / `P5-RCT-SUPPORT-UI-001`
- Branch: `codex/p5-rct-support-ui-001`
- Required baseline: `c5df24a41ba8ed9c790649719dd731b560cde6fd`
- Status: `implementation_complete_upstream_producer_blocked`
- Evidence date: `2026-07-24`

## Delivered production read flow

- Dedicated authenticated API:
  - `GET /api/platform-admin/multi-taxi/certificates`
  - `GET /api/platform-admin/multi-taxi/certificates/:certificateId`
- Search supports receipt ID, receipt number, order ID, and an existing
  `record.tripId`.
- The API reads the existing
  `reporting.multi_taxi_electronic_receipts` authority created by migration
  `V0056`; it does not create a second certificate store.
- Legal fields are projected from the existing receipt row and its `record`
  payload: plate, pickup/dropoff time, duration, route, distance, fare, toll,
  service phone, authority complaint phone, issue time, and version.
- Missing legal values remain `null` at the API and render as `未取得` in the
  UI. Missing toll is not rendered as zero.
- Platform Admin uses the existing `platform` realm and `foundation:read`
  scope. A denied API read renders the dedicated `access_denied` state without
  certificate data.
- The feature-owned routes are:
  - `/multi-taxi-certificates`
  - `/multi-taxi-certificates/[certificateId]`
- The UI covers `available`, `generating`, `unavailable`, `failed`,
  `access_denied`, and `superseded`.
- HTML/PDF links only appear when an `available` receipt actually contains the
  corresponding existing URL.
- Regeneration is always disabled with
  `certificate_regeneration_command_pending`; no write endpoint or invented
  action was added.

## Guardrails confirmed

This task does not modify:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`
- `apps/api/src/modules/reporting-filing/**`
- `apps/passenger-web/**`
- shared Platform Admin navigation, shell, or global translations

The API module is feature-owned under
`apps/api/src/modules/certificate-support/`. The only shared registration
change is importing that module from `apps/api/src/app.module.ts`.

## Automated verification

| Check                           | Result                   |
| ------------------------------- | ------------------------ |
| API full Vitest                 | `129 files / 873 passed` |
| Platform Admin workspace Vitest | `1 file / 11 passed`     |
| Certificate Support Playwright  | `7 passed`               |
| API typecheck                   | passed                   |
| Platform Admin typecheck        | passed                   |
| API lint                        | passed                   |
| Platform Admin lint             | passed                   |
| API production build            | passed                   |
| Platform Admin production build | passed                   |

Playwright uses controlled API responses and is not represented as live
production evidence. It verifies:

- search and detail flow;
- legal-field rendering;
- regeneration remains disabled;
- six-state behavior;
- 404 `unavailable`;
- 500 `failed`;
- 403 `access_denied`;
- responsive desktop and 390 px layouts.

## Screenshots

- `screenshots/01-search-desktop.png`
- `screenshots/02-available-detail-desktop.png`
- `screenshots/03-state-catalog-mobile.png`
- `screenshots/04-generating.png`
- `screenshots/05-unavailable.png`
- `screenshots/06-failed.png`
- `screenshots/07-access-denied.png`
- `screenshots/08-superseded.png`

The screenshots were visually inspected after fixing narrow-card state-grid
clipping and the feature route's mobile layout.

## True production blockers

1. The current repository has no production writer or generation worker that
   inserts completed-trip certificates into
   `reporting.multi_taxi_electronic_receipts`. The only runtime references are
   the existing Passenger read and this support read.
2. No production component currently persists responsive HTML/PDF artifact
   URLs, certificate state/version, supersession, or every legal field in the
   receipt `record`. The UI correctly shows unavailable values instead of
   fabricating them.
3. Certificate regeneration has no canonical command and intentionally remains
   disabled command-pending.
4. Live environment verification requires migrated database access, a real
   populated receipt, and authenticated Platform Admin deployment. No push or
   deploy is part of this task.

The support search/detail implementation is complete for its read authority.
End-to-end certificate availability is blocked by the upstream `P5-RCT-001`
producer/artifact pipeline, not by this UI route.
