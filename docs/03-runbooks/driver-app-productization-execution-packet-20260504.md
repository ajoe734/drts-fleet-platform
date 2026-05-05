# Driver App Productization Execution Packet

**Date:** 2026-05-04  
**Mode:** `supervisor_managed_execution`  
**Design source:** `docs/02-architecture/driver-app-productization-design-plan-20260504.md`  
**Runtime scope:** `apps/driver-app`

## Purpose

This packet materializes the driver app productization design plan into
supervisor/autoworker execution tasks. It is intentionally operational: each task
has a bounded write scope, dependencies, expected outcome, and verification.

The product goal is to make the native driver app feel like a coherent
production mobile app rather than a set of functional prototype pages.

## Global Worker Rules

Every worker must:

1. Read `docs/02-architecture/driver-app-productization-design-plan-20260504.md`
   before editing runtime files.
2. Stay inside the assigned write scope.
3. Treat other workers as active in the repo. Do not revert unrelated edits.
4. Use shared UI primitives once `DRV-MAT-001` lands.
5. Keep touched runtime copy in Traditional Chinese unless it is a platform
   brand, a technical ID, or an API value that must remain raw.
6. Preserve existing driver identity, completion replay, heartbeat, proof, and
   trip action behavior unless the task explicitly scopes a behavior fix.
7. Run the required verification command(s) and report any blocker honestly.

## Dispatch Order

| Order | Task                         | Dispatch Note                                                |
| ----- | ---------------------------- | ------------------------------------------------------------ |
| 1     | `DRV-MAT-000`                | Supervisor/design freeze confirmation.                       |
| 2     | `DRV-MAT-001`                | Shared UI foundation; blocks all page rewrites.              |
| 3     | `DRV-MAT-002`                | Shell and workstation/home refactor.                         |
| 4     | `DRV-MAT-003`, `DRV-MAT-006` | Can run in parallel after foundation; disjoint files.        |
| 5     | `DRV-MAT-004`                | Trip workflow; wait for task badge/foundation.               |
| 6     | `DRV-MAT-005`                | SOS flow; wait for trip and foundation.                      |
| 7     | `DRV-MAT-007`, `DRV-MAT-008` | Platform and earnings; can run in parallel after foundation. |
| 8     | `DRV-MAT-009`                | Settings; waits for platform account component work.         |
| 9     | `DRV-MAT-010`                | End-to-end productization verification packet.               |

## Task Briefs

### `DRV-MAT-000` — Driver App Productization Design Freeze

**Owner lane:** supervisor / architecture  
**Write scope:** docs and task state only  
**Depends on:** none

Confirm that the route inventory, design contract, page specs, and task split in
the design plan are accepted as the execution baseline. This task should not
rewrite runtime code.

Acceptance:

- The design plan covers every `apps/driver-app/app` route.
- The design plan covers all current shared components under
  `apps/driver-app/components`.
- The materialized task graph in `ai-status.json` matches this execution
  packet.
- Any disagreement is routed back to supervisor before runtime workers begin.

Verification:

```bash
rg -n "DRV-MAT|/trip|/jobs|/settings" docs/02-architecture/driver-app-productization-design-plan-20260504.md
python3 scripts/ai_status.py audit doc-sync
```

### `DRV-MAT-001` — Shared UI Foundation

**Owner lane:** React Native UI foundation  
**Write scope:** `apps/driver-app/components/ui/*`, optional minimal
`apps/driver-app/app/_layout.tsx` integration  
**Depends on:** `DRV-MAT-000`
**Status: completed**

Create the reusable UI contract needed by all pages: tokens, screen frame,
headers, buttons, icon buttons, status chips, form fields, segmented control,
empty/error states, info tiles, list cards, and bottom action bar.

Acceptance:

- Shared tokens exist and use the design plan palette/spacing/radius/type scale.
- Shared components cover the list in design plan section 3.3.
- Components are typed and usable from Expo Router screens.
- No page-specific behavior changes are introduced beyond optional shell wiring.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-002` — Shell And Workstation Home

**Write scope:** `apps/driver-app/app/_layout.tsx`,
`apps/driver-app/app/onboarding.tsx`, `apps/driver-app/app/index.tsx`  
**Depends on:** `DRV-MAT-001`

Refactor the app shell and `/onboarding` into the canonical workstation/home
experience using shared UI primitives.

Acceptance:

- `/onboarding` ready, unprovisioned, and degraded states follow the page spec.
- Raw route headers are not visible.
- Primary navigation uses localized app shell controls, not blue text links.
- Unprovisioned devices cannot jump straight into `/jobs`.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts tests/unit/driver-identity-routing.test.ts
```

### `DRV-MAT-003` — Task Inbox Materialization

**Write scope:** `apps/driver-app/app/jobs.tsx`,
`apps/driver-app/components/platform-task-badge.tsx`  
**Depends on:** `DRV-MAT-001`

Productize `/jobs` into a proper task inbox with filters, summary, localized
badges, route-lock iconography, and task-card press affordances.

Acceptance:

- Client-side filters cover all, needs action, in progress, and platform closed.
- Task cards expose task id, order id, status, platform, service type, and route
  lock state without emoji.
- Footer text links are replaced by shared actions.
- `PlatformTaskBadge` no longer shows "Direct" as runtime copy.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-004` — Trip Workflow Command Center

**Write scope:** `apps/driver-app/app/trip.tsx`,
`apps/driver-app/components/route-display.tsx`  
**Depends on:** `DRV-MAT-001`, `DRV-MAT-003`

Refactor `/trip` into a command-center workflow: one primary action at a time,
clear route/metrics/compliance/proof sections, localized `RouteDisplay`, and
sticky action handling for the active task state.

Acceptance:

- Only the next valid local task action is presented as primary.
- Forwarded tasks do not expose local mutation actions.
- Route display runtime copy is Traditional Chinese.
- Completion proof requirements remain intact.
- Pending completion replay and stale-session reroute behavior are preserved.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/pending-completion-replay.test.ts tests/unit/use-pending-completion-replay.test.ts tests/unit/completion-proof.test.ts tests/unit/driver-location-heartbeat.test.ts
```

### `DRV-MAT-005` — SOS Incident Flow

**Write scope:** `apps/driver-app/app/incident.tsx`, optional shared confirm
helper under `apps/driver-app/components/ui/*`  
**Depends on:** `DRV-MAT-001`, `DRV-MAT-004`

Productize the SOS screen with shared danger controls and a required
confirmation step before sending a critical escalation.

Acceptance:

- SOS submit requires confirmation before `createIncident`.
- Submit/cancel/error states are clear and localized.
- Success still returns to `/trip`.
- Text-as-button controls are replaced by shared buttons.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-006` — Shift And Attendance Materialization

**Write scope:** `apps/driver-app/app/shift.tsx`  
**Depends on:** `DRV-MAT-001`

Refactor `/shift` and fix the correctness debt around hard-coded demo identity.

Acceptance:

- No `driver-demo-001` remains in `shift.tsx`.
- The page uses provisioned driver identity or a guarded unprovisioned state.
- Clock in/out use shared action buttons and stable active/offline layouts.
- Odometer validation blocks invalid numeric input before submit.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts
```

### `DRV-MAT-007` — Platform Presence And Binding

**Write scope:** `apps/driver-app/app/platform-presence.tsx`,
`apps/driver-app/components/platform-status-card.tsx`,
`apps/driver-app/components/platform-binding.tsx`  
**Depends on:** `DRV-MAT-001`

Unify platform status/account UX, remove duplicate card logic, localize platform
binding copy, and replace emoji/text controls with shared controls.

Acceptance:

- One canonical platform status/account component remains in use.
- Online/offline, eligibility, token expiry, re-auth, bind, and unbind copy is
  Traditional Chinese.
- Re-auth uses an icon button with accessibility label.
- Settings can reuse the same platform account component without English copy.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-008` — Earnings Dashboard Materialization

**Write scope:** `apps/driver-app/app/earnings.tsx`,
`apps/driver-app/components/earnings-by-platform.tsx`,
`apps/driver-app/lib/money.ts` only if formatting needs a safe extension  
**Depends on:** `DRV-MAT-001`

Refactor `/earnings` into a compact earnings dashboard with period segmented
control, KPI tiles, platform earnings rows, and statement rows.

Acceptance:

- KPI tiles show useful totals derived from fetched earnings/statements.
- Period switch uses shared `SegmentedControl`.
- Expand/collapse affordance uses icon controls, not text chevrons.
- Disabled, empty, loading, error, and refreshing states are covered.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-009` — Settings Materialization

**Write scope:** `apps/driver-app/app/settings.tsx`,
`apps/driver-app/components/platform-binding.tsx` integration only  
**Depends on:** `DRV-MAT-001`, `DRV-MAT-007`

Refactor settings into clear sections with shared form fields, dirty/save state,
validation, partial-load handling, and localized platform account management.

Acceptance:

- Profile, emergency contact, preferences, and platform accounts are visually
  separated and use shared fields.
- Save action reflects pristine, dirty, saving, saved, and error states.
- Existing partial load/save behavior remains.
- No English runtime copy remains in touched settings/platform binding surface.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MAT-010` — Productization Verification Pack

**Write scope:** docs/evidence only unless fixing defects discovered during
verification  
**Depends on:** `DRV-MAT-002`, `DRV-MAT-003`, `DRV-MAT-004`, `DRV-MAT-005`,
`DRV-MAT-006`, `DRV-MAT-007`, `DRV-MAT-008`, `DRV-MAT-009`

Produce route-by-route verification evidence for the productized driver app.

Acceptance:

- Each route has a checklist result for ready, empty/disabled, loading, and
  error/degraded states where applicable.
- Typecheck and tests are recorded.
- Emulator / Expo dev-client screenshot evidence is attached when the local
  environment permits it.
- Any blocked visual evidence is recorded with the exact blocker.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test
```

**Verification Status:**

- **Typecheck:** Completed successfully.
- **Tests:** 26 tests passed across 8 files.
- **Visual Evidence:** Blocked in the current environment. `adb devices` returns `adb: not found`, and `emulator -list-avds` returns `emulator: not found`, so emulator/Expo dev-client screenshots cannot be captured here.
- **Blockers:** Visual evidence capture is blocked by missing Android tooling in the local environment. See `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md` for the exact blocker transcript and route-by-route verification packet.

## Supervisor Notes

- `DRV-MAT-001` should be dispatched first after `DRV-MAT-000` is accepted.
- Do not dispatch broad page rewrites before the shared UI foundation exists.
- `DRV-MAT-003`, `DRV-MAT-006`, `DRV-MAT-007`, and `DRV-MAT-008` can run in
  parallel after `DRV-MAT-001` because their write scopes are disjoint.
- `DRV-MAT-004` is the riskiest runtime task; keep its reviewer strict about
  replay, proof, stale-session, and forwarded-task behavior.
- `DRV-MAT-010` should be the final gate before anyone claims the driver app
  productization wave is complete.
