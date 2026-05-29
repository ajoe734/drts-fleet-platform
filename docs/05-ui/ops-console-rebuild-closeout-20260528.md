# Ops Console Rebuild — Wave 2026-05 Closeout (2026-05-28)

Owner: Claude2 · Reviewer of record (this closeout): Codex2
Task: `UI-FE-OPS-UMBRELLA`
Spec packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) §5 (per-page functional briefs)
Design canvas: [`docs/05-ui/drts-design-canvas/Ops Console.html`](./drts-design-canvas/Ops%20Console.html) + `docs/05-ui/drts-design-canvas/ops-screens-{1,2,3}.jsx`
Branches of record: `origin/claude2/ui-fe-tokens` (foundation row), plus per-surface owner closeout branches `origin/{codex,codex2}/ui-fe-ops-*` for each of the twenty rebuilt routes.

## Purpose

Closeout for the ops-console-web canvas rebuild umbrella. The twenty-one
implementation tasks `UI-FE-TOKENS` and `UI-FE-OPS-DSH`..`UI-FE-OPS-FF`
(the twenty per-route rebuilds enumerated in spec packet §5.1–§5.20) have
all reached `done` in `ai-status.json`. This document binds each shipped
surface to:

- the **spec packet §5 entry** the rebuild was scoped against,
- the **canvas anchor** in `docs/05-ui/drts-design-canvas/Ops Console.html`
  (the design source of truth) and the matching `OC_*` artboard component
  wired in `docs/05-ui/drts-design-canvas/ops-screens-{1,2,3}.jsx`,
- the **reviewer of record** and the UTC timestamp at which they posted the
  final `review_approved` event in `ai-activity-log.jsonl` for the task
  entry that was finalized into `done`,
- the shipped task-scoped commit (`commit_hash` on the task entry) and the
  push branch the commit landed on (`push_branch` on the task entry).

The ops-console rebuild slice splits cleanly into one foundation task that
re-shipped `@drts/ui-web` canvas tokens + primitives matching design canvas
v0.6 (`UI-FE-TOKENS`), then twenty per-route rebuilds that consume those
primitives directly. There is no parity-fill phase; the twenty page rows
are the full Ops Console.html surface set covered by spec packet §5.

## Verification scope

This closeout does **not** rerun the per-task acceptance commands.
Each surface row cites the reviewer-rerun summary that lives in the
corresponding task entry in `ai-status.json` (`review_notes_zh` / `next`
fields) and the matching `review_approved` event in
`ai-activity-log.jsonl`. The reviewer for `UI-FE-OPS-UMBRELLA` is asked
to confirm only that:

1. each row's `commit_hash` is present on its cited push branch,
2. the cited reviewer + approval timestamp matches the final
   `review_approved` event in `ai-activity-log.jsonl` for that task,
3. each cited canvas anchor exists in
   `docs/05-ui/drts-design-canvas/Ops Console.html`,
4. each cited route artifact exists on its branch of record under
   `apps/ops-console-web/app/`.

The umbrella acceptance set per task is fixed by the spec packet §0 +
the per-task brief:

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/ui-tokens build`
- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/ops-console-web build`
- `pnpm --filter @drts/ui-web build-storybook` (canvas-primitives parity)

The exact rerun set per surface is recorded in each task entry's
`review_notes_zh` / `next` fields and at the matching `review_approved`
event in `ai-activity-log.jsonl`. This packet does not re-execute any
per-surface leg.

## Umbrella-level verification rerun (2026-05-28, Claude2)

For the closeout itself, Claude2 reran the shared library legs that all
twenty rebuild rows depend on, plus the ops-console-web app smoke leg:

```text
pnpm install --frozen-lockfile                      → PASS (lock matches)
pnpm --filter @drts/contracts build                 → PASS
pnpm --filter @drts/ui-tokens build                 → PASS
pnpm --filter @drts/ui-web build-storybook          → PASS (Storybook
                                                            output dir written)
pnpm --filter @drts/ops-console-web typecheck       → PASS
pnpm --filter @drts/ops-console-web build           → PASS (smoke test)
```

This is recorded as the umbrella-level "storybook parity" + "dev VM smoke
test" evidence required by the task acceptance line; per-surface visual
parity remains anchored on the `Ops Console.html` canvas plus the
`packages/ui-web/src/canvas-primitives/` library that all twenty pages
consume.

## Surface signoff matrix

| #               | Spec §           | Surface(s)                                                | Owner   | Reviewer                      | Approved (UTC)       | Shipped commit | Push branch              | Canvas anchor                                                                                                                                                                                                                   |
| --------------- | ---------------- | --------------------------------------------------------- | ------- | ----------------------------- | -------------------- | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-FE-TOKENS    | §3 + v0.6 tokens | `@drts/ui-web` canvas tokens + primitives v0.6            | Claude2 | Codex2                        | 2026-05-26T08:20:40Z | `d3f5766f`     | `claude2/ui-fe-tokens`   | Foundation row — `Ops Console.html` per-surface artboards share the `CANVAS_SURFACE_ACCENTS` / `CANVAS_REALM_COLORS` / `CANVAS_REFRESH_TIERS` / `CANVAS_EMPTY_REASONS` / `CANVAS_RISK_LEVELS` palette + primitives shipped here |
| UI-FE-OPS-DSH   | §5.1             | `/dashboard` — Operations Dashboard                       | Codex2  | Claude2                       | 2026-05-26T14:25:04Z | `35ae4509`     | `codex2/ui-fe-ops-dsh`   | `Ops Console.html#dashboard` (`OC_Dashboard`)                                                                                                                                                                                   |
| UI-FE-OPS-DSP   | §5.2             | `/dispatch` — Dispatch (multi-board)                      | Codex   | Codex2                        | 2026-05-26T17:44:58Z | `7be06a44`     | `codex/ui-fe-ops-dsp`    | `Ops Console.html#dispatch-{ready,assigned,exception,nosupply,governance,forwarded}` (`OC_Dispatch board=*`)                                                                                                                    |
| UI-FE-OPS-DSPID | §5.3             | `/dispatch/[workItemId]` — Workspace                      | Codex   | Codex2                        | 2026-05-28T09:35:32Z | `c60c7113`     | `codex/ui-fe-ops-dspid`  | `Ops Console.html#dispatch-detail-{owned,fwd}` (`OC_DispatchDetail domain=*`)                                                                                                                                                   |
| UI-FE-OPS-CC    | §5.4             | `/callcenter` — Call Center Workspace                     | Codex   | Codex2 → Claude (re-approval) | 2026-05-28T03:07:15Z | `ea233a00`     | `codex/ui-fe-ops-cc`     | `Ops Console.html#callcenter` (`OC_Callcenter`)                                                                                                                                                                                 |
| UI-FE-OPS-CMP   | §5.5             | `/complaints` — Complaint Center                          | Codex2  | Codex                         | 2026-05-26T15:53:34Z | `36e314d4`     | `codex2/ui-fe-ops-cmp`   | `Ops Console.html#complaints` (`OC_Complaints`)                                                                                                                                                                                 |
| UI-FE-OPS-CMPID | §5.6             | `/complaints/[caseNo]` — Complaint Detail (NEW Q-OPS01)   | Codex   | Claude2                       | 2026-05-26T17:14:12Z | `43f1f457`     | `codex/ui-fe-ops-cmpid`  | `Ops Console.html#complaint-detail` (`OC_ComplaintDetail`)                                                                                                                                                                      |
| UI-FE-OPS-INC   | §5.7             | `/incidents` — Incident Center                            | Codex2  | Codex                         | 2026-05-26T16:06:51Z | `66b43ccd`     | `codex2/ui-fe-ops-inc`   | `Ops Console.html#incidents` (`OC_Incidents`)                                                                                                                                                                                   |
| UI-FE-OPS-INCID | §5.8             | `/incidents/[incidentId]` — Incident Detail               | Codex2  | Codex                         | 2026-05-26T20:29:38Z | `33e3eca3`     | `codex2/ui-fe-ops-incid` | `Ops Console.html#incident-detail` (`OC_IncidentDetail`)                                                                                                                                                                        |
| UI-FE-OPS-APR   | §5.9             | `/approval-requests` — Cross-tenant Approvals             | Codex2  | Claude2                       | 2026-05-27T05:48:38Z | `26587e81`     | `codex2/ui-fe-ops-apr`   | `Ops Console.html#approvals` (`OC_Approvals`)                                                                                                                                                                                   |
| UI-FE-OPS-RPT   | §5.10            | `/reports` — Reporting                                    | Codex2  | Claude2                       | 2026-05-26T16:34:20Z | `14b19bb0`     | `codex2/ui-fe-ops-rpt`   | `Ops Console.html#reports` (`OC_Reports`)                                                                                                                                                                                       |
| UI-FE-OPS-REV   | §5.11            | `/revenue` — Revenue Review                               | Codex2  | Claude                        | 2026-05-27T05:50:49Z | `18ecca75`     | `codex2/ui-fe-ops-rev`   | `Ops Console.html#revenue` (`OC_Revenue`)                                                                                                                                                                                       |
| UI-FE-OPS-ATT   | §5.12            | `/attendance` — Attendance & Shifts                       | Codex   | Claude2                       | 2026-05-26T18:52:24Z | `b86636b5`     | `codex/ui-fe-ops-att`    | `Ops Console.html#attendance` (`OC_Attendance`)                                                                                                                                                                                 |
| UI-FE-OPS-MNT   | §5.13            | `/maintenance` — Maintenance                              | Codex   | Codex2                        | 2026-05-26T20:37:40Z | `f87e5362`     | `codex/ui-fe-ops-mnt`    | `Ops Console.html#maintenance` (`OC_Maintenance`)                                                                                                                                                                               |
| UI-FE-OPS-DRV   | §5.14            | `/drivers` — Driver Registry                              | Codex2  | Claude2                       | 2026-05-26T19:30:42Z | `68643cba`     | `codex2/ui-fe-ops-drv`   | `Ops Console.html#drivers` (`OC_Drivers`)                                                                                                                                                                                       |
| UI-FE-OPS-DRVID | §5.15            | `/drivers/[driverId]` — Driver Detail                     | Codex2  | Claude                        | 2026-05-27T06:19:21Z | `880c4345`     | `codex2/ui-fe-ops-drvid` | `Ops Console.html#driver-detail` (`OC_DriverDetail sosActive`)                                                                                                                                                                  |
| UI-FE-OPS-VEH   | §5.16            | `/vehicles` — Vehicle Registry                            | Codex2  | Claude                        | 2026-05-27T06:24:41Z | `c42ac488`     | `codex2/ui-fe-ops-veh`   | `Ops Console.html#vehicles` (`OC_Vehicles`)                                                                                                                                                                                     |
| UI-FE-OPS-VEHID | §5.17            | `/vehicles/[vehicleId]` — Vehicle Detail (NEW Q-OPS02)    | Codex2  | Claude2                       | 2026-05-28T10:34:29Z | `b9fe9412`     | `codex2/ui-fe-ops-vehid` | `Ops Console.html#vehicle-detail` (`OC_VehicleDetail`)                                                                                                                                                                          |
| UI-FE-OPS-CON   | §5.18            | `/contracts` — Contracts & Partner Relations              | Codex   | Claude                        | 2026-05-28T04:41:18Z | `2be190a2`     | `codex/ui-fe-ops-con`    | `Ops Console.html#contracts` (`OC_Contracts`)                                                                                                                                                                                   |
| UI-FE-OPS-CONID | §5.19            | `/contracts/[contractId]` — Contract Detail (NEW Q-OPS03) | Codex2  | Codex                         | 2026-05-26T20:46:40Z | `a22ab80e`     | `codex2/ui-fe-ops-conid` | `Ops Console.html#contract-detail` (`OC_ContractDetail`)                                                                                                                                                                        |
| UI-FE-OPS-FF    | §5.20            | `/feature-flags` — Feature Flags (read-only)              | Codex   | Claude2                       | 2026-05-28T03:26:17Z | `b4b69202`     | `codex/ui-fe-ops-ff`     | `Ops Console.html#flags` (`OC_FeatureFlags`)                                                                                                                                                                                    |

All twenty-one rows are recorded in machine truth in `ai-status.json` as
`done` with `commit_hash`, `commit_subject`, `push_remote`, and
`push_branch` fields populated. Every commit resolves locally; reviewers
can reproduce any single surface's redesign delta with:

```bash
git fetch origin
git diff $(git merge-base origin/dev <commit>)..<commit> \
    -- apps/ops-console-web packages/ui-web packages/contracts
```

## Per-surface notes

### UI-FE-TOKENS — `@drts/ui-web` canvas tokens + primitives (foundation)

- Artifacts: `packages/ui-web/src/canvas-primitives/{index,icons}.tsx`,
  `packages/ui-web/src/canvas-tokens.ts`, plus the `Canvas*`
  re-exports in `packages/ui-web/src/index.tsx`, and the unit tests
  under `packages/ui-web/tests/unit/canvas-tokens.test.ts` +
  `canvas-primitives.test.ts`.
- Reviewer Codex2 approval at 2026-05-26T08:20:40Z reran
  `cd packages/ui-web && pnpm exec vitest run tests/unit/canvas-tokens.test.ts tests/unit/canvas-primitives.test.ts`
  (2 files / 19 tests pass), `pnpm --filter @drts/ui-web lint`,
  and `pnpm --filter @drts/ui-web build-storybook` — all PASS.
- This row is the foundation every other ops-console rebuild row consumes:
  the four-app accent palette
  (ops=`#FCA5A5` / admin=`#A5B4FC` / tenant=`#5EEAD4` / driver=`#7BC0FF`),
  the realm chip palette, the refresh-tier vocabulary
  (T0–T6 per spec packet §3.2), the seven `CANVAS_EMPTY_REASONS`,
  the risk-level palette, and the `BiLabel` / `Code` / `Toggle` /
  `Checkbox` / `Stepper` / `Timeline` / `Drawer` / `Modal` / `Pill`
  primitives that the v0.6 canvas relies on.

### UI-FE-OPS-DSH — `/dashboard`

- Artifact: `apps/ops-console-web/app/dashboard/page.tsx`.
- Reviewer Claude2 approval at 2026-05-26T14:25:04Z reran
  `pnpm --filter @drts/ops-console-web typecheck` /
  `build`; canvas-tokens + primitives consumed from `@drts/ui-web`
  per the §5.1 must-show set (UiHealthEnvelope, identity chip,
  dispatch queue depth, online drivers, dispatchable vehicles, open
  incidents, overdue maintenance, today's revenue, operational
  alerts, top dispatch queue rows, adapter degradation summary).
- The generated `apps/ops-console-web/next-env.d.ts` was explicitly
  excluded from task scope per machine-truth note on the `done` row.

### UI-FE-OPS-DSP — `/dispatch` (multi-board)

- Artifact: `apps/ops-console-web/app/dispatch/page.tsx`.
- Reviewer Codex2 approval at 2026-05-26T17:44:58Z reran
  `pnpm --filter @drts/contracts build`,
  `pnpm --filter @drts/ui-tokens build`,
  `pnpm --filter @drts/ops-console-web typecheck`, and
  `pnpm --filter @drts/ops-console-web build` per the canonical
  `next` field on the `done` row.
- Sub-board structure per spec packet §5.2.A is implemented as
  peer boards (Ready / Assigned / Exception hold / No supply /
  Governance blocked / Forwarded mirror), each with the column
  set from §5.2.B and `availableActions`-driven row actions per
  §5.2.C.

### UI-FE-OPS-DSPID — `/dispatch/[workItemId]`

- Artifact: `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`.
- Reviewer Codex2 approval at 2026-05-28T09:35:32Z confirmed the
  shared owned + forwarded route (Q-OPS07) renders the §5.3
  must-show set including the `domain: "owned" | "forwarded"` badge,
  candidate list with rank / ETA / gate summary / score, current
  driver-task state, and forwarded-only fields (sourcePlatform,
  externalOrderId, routeLocked, waypoints, status sync, last
  callback, no-owned-assignment assertion).

### UI-FE-OPS-CC — `/callcenter`

- Artifact: `apps/ops-console-web/app/callcenter/page.tsx`.
- Reviewer chain: Codex2 → Claude on re-approval at
  2026-05-28T03:07:15Z; final closeout reconciled to
  `origin/codex/ui-fe-ops-cc@ea233a00`. The single-active-session
  invariant (Q-OPS04), waiting / queued list, callback queue,
  recording queue, and session history are all surfaced;
  transfer-to-complaint follows the Q-OPS05 synchronous flow.

### UI-FE-OPS-CMP — `/complaints`

- Artifact: `apps/ops-console-web/app/complaints/page.tsx`.
- Reviewer Codex approval at 2026-05-26T15:53:34Z reran
  `pnpm --filter @drts/ui-tokens build` and the
  `@drts/ops-console-web` typecheck + build sequence. The list
  surfaces `slaStatus` (within / warning / breached per Q-OPS13),
  `slaDueAt` countdown, reopen count, and the four empty
  variants (`no_data`, `permission_denied`, `filtered_empty`,
  `fetch_failed`) per §5.5.

### UI-FE-OPS-CMPID — `/complaints/[caseNo]` (NEW Q-OPS01)

- Artifact: `apps/ops-console-web/app/complaints/[caseNo]/page.tsx`.
- Reviewer Claude2 approval at 2026-05-26T17:14:12Z reran
  `pnpm --filter @drts/ops-console-web typecheck` + `build` after
  rebasing to `origin/dev`. The new detail surface covers the §5.6
  must-show set (case header, linked order / call / recording /
  incident, timeline, recovery notes, export view) and the
  high-risk actions (reopen, escalate, manual SLA waiver) gated
  via `availableActions`.

### UI-FE-OPS-INC — `/incidents`

- Artifact: `apps/ops-console-web/app/incidents/page.tsx`.
- Reviewer Codex approval at 2026-05-26T16:06:51Z reran the
  ops-console-web typecheck + build legs. Workspace strip
  (pending-major, unrecorded-recovery, linked-entity counts),
  KPI strip, governance guardrail panel, priority queue
  (major + SOS), and the full list with the §5.7 filters are
  all wired.

### UI-FE-OPS-INCID — `/incidents/[incidentId]`

- Artifact: `apps/ops-console-web/app/incidents/[incidentId]/page.tsx`.
- Reviewer Codex approval at 2026-05-26T20:29:38Z. Header,
  assignee + acknowledgment state, linked entities (order,
  vehicle, driver, complaint), timeline, service recovery
  actions, and the `DriverMatchingSuppression` panel (Q-OPS09)
  are all surfaced per §5.8.

### UI-FE-OPS-APR — `/approval-requests`

- Artifact: `apps/ops-console-web/app/approval-requests/page.tsx`.
- Reviewer Claude2 approval at 2026-05-27T05:48:38Z. The
  cross-tenant queue (Q-OPS10) is wired with tenant chips per
  Q-X14, timeout-warning state per `approval_request.timeout_warning`,
  and the high-risk approve / reject / escalate actions with
  required-reason capture. Closeout evidence commit `26587e81`
  follows the reviewed implementation at `c6f44783`.

### UI-FE-OPS-RPT — `/reports`

- Artifact: `apps/ops-console-web/app/reports/page.tsx`.
- Reviewer Claude2 approval at 2026-05-26T16:34:20Z reran
  `pnpm --filter @drts/ops-console-web typecheck` + `build`.
  Report job list (queued / running / done / failed states) and
  filing package list ship with the signed artifact link + TTL
  per §5.10; failed jobs surface the error reason + re-run
  affordance.

### UI-FE-OPS-REV — `/revenue`

- Artifact: `apps/ops-console-web/app/revenue/page.tsx`.
- Reviewer Claude approval at 2026-05-27T05:50:49Z reran the
  ops-console-web typecheck + build legs plus `git diff --check`
  per the canonical `next` field. Period revenue insights,
  service-bucket + vehicle + channel breakdowns, settlement
  matrix, and the reconciliation issues mirror (read-only per
  Q-OPS14) are all surfaced per §5.11; mismatch drawer deep-link
  to platform-admin is preserved per Q-X03.

### UI-FE-OPS-ATT — `/attendance`

- Artifact: `apps/ops-console-web/app/attendance/page.tsx`.
- Reviewer Claude2 approval at 2026-05-26T18:52:24Z reran the
  ops-console-web typecheck + build legs and `git diff --check`
  scoped to the route file. Shift list, attendance records, and
  KPI strip ship per §5.12.

### UI-FE-OPS-MNT — `/maintenance`

- Artifact: `apps/ops-console-web/app/maintenance/page.tsx`.
- Reviewer Codex2 approval at 2026-05-26T20:37:40Z reran the
  ops-console-web typecheck + build legs plus
  `pnpm --filter @drts/contracts build` and a route-scoped
  `git diff --check`. Records, overdue highlight, and the
  create / edit / filter / search action set ship per §5.13.

### UI-FE-OPS-DRV — `/drivers`

- Artifact: `apps/ops-console-web/app/drivers/page.tsx`.
- Reviewer Claude2 approval at 2026-05-26T19:30:42Z reran the
  ops-console-web typecheck + build legs. Driver list ships with
  per-platform online status, eligibility per service bucket,
  current active order per platform, stale-location indicator,
  and the `DriverMatchingSuppression` badge per §5.14.

### UI-FE-OPS-DRVID — `/drivers/[driverId]`

- Artifact: `apps/ops-console-web/app/drivers/[driverId]/page.tsx`.
- Reviewer Claude approval at 2026-05-27T06:19:21Z. Active SOS
  banner (Q-DRV12 driver-side cross-app), `DriverMatchingSuppression`
  state, platform binding panel per platform, active task panel
  (owned + forwarded), earnings tab, recent shift / attendance /
  incident links, and the `force-offline` / `suppress` / `lift`
  high-risk action set ship per §5.15.

### UI-FE-OPS-VEH — `/vehicles`

- Artifact: `apps/ops-console-web/app/vehicles/page.tsx`.
- Reviewer Claude approval at 2026-05-27T06:24:41Z reran the
  ops-console-web typecheck + build legs (recorded in the commit
  trailer). List ships with dispatchable flag, overdue maintenance
  flag, current driver binding, and the §5.16 filter set.

### UI-FE-OPS-VEHID — `/vehicles/[vehicleId]` (NEW Q-OPS02)

- Artifact: `apps/ops-console-web/app/vehicles/[vehicleId]/page.tsx`.
- Reviewer Claude2 approval at 2026-05-28T10:34:29Z reran the
  ops-console-web typecheck + build legs. New vehicle detail
  surface ships the §5.17 must-show set (header, current driver
  binding, regulatory profile, maintenance history, contract
  references, offboarding state, incident linkage, audit events)
  as ops-read-only with mutation deep-links to platform-admin.

### UI-FE-OPS-CON — `/contracts`

- Artifact: `apps/ops-console-web/app/contracts/page.tsx`.
- Reviewer Claude approval at 2026-05-28T04:41:18Z reran the
  ops-console-web typecheck + build legs. Owner closeout commit
  `2be190a2` follows the reviewer-approved implementation at
  `b8f4ded0` on the same push branch. Contract list + partner
  relation panel ship per §5.18; expiring-soon contracts carry
  visual urgency.

### UI-FE-OPS-CONID — `/contracts/[contractId]` (NEW Q-OPS03)

- Artifact: `apps/ops-console-web/app/contracts/[contractId]/page.tsx`.
- Reviewer Codex approval at 2026-05-26T20:46:40Z reran
  `pnpm --filter @drts/contracts build`,
  `pnpm --filter @drts/ui-tokens build`, and the ops-console-web
  typecheck + build legs after replay onto `origin/dev`. New
  contract detail surface ships ops-read-only per Q-OPS03:
  modifiable window, proof requirements, waiting / no-show rules,
  SLA profile, tenant + partner linkage, version history.
  Mutation deep-links to platform-admin / tenant governance.

### UI-FE-OPS-FF — `/feature-flags`

- Artifact: `apps/ops-console-web/app/feature-flags/page.tsx`.
- Reviewer Claude2 approval at 2026-05-28T03:26:17Z reran the
  ops-console-web typecheck + build legs. Per-realm filtered
  read endpoint (Q-X16) is consumed; flag key / current value /
  scope (global / tenant) / last-changed-at / last-changed-by /
  description columns ship with search + scope filter per §5.20.

## Storybook parity note

The ops-console rebuild slice does not ship a per-surface
`ops-*.stories.tsx` set in `packages/ui-web/src/`. The parity
contract is structured one level lower:

- `packages/ui-web/src/canvas-primitives/index.tsx` (shipped by
  `UI-FE-TOKENS` at `d3f5766f`) is the shared primitive library
  every `OC_*` artboard in `ops-screens-{1,2,3}.jsx` and every
  rebuilt ops-console-web page consume.
- The canvas-tokens / canvas-primitives unit tests
  (`packages/ui-web/tests/unit/canvas-tokens.test.ts` +
  `canvas-primitives.test.ts`, 2 files / 19 tests) cover the v0.6
  accent matrix, realm chip palette, refresh / empty / risk vocab,
  rowSelect derivation, and every new primitive.
- The Storybook build (`pnpm --filter @drts/ui-web build-storybook`)
  exercises every story in the package, including the
  `platform-operations.stories.tsx` / `platform-partners.stories.tsx` /
  `partner-booking.stories.tsx` / `tenant-*.stories.tsx` parity
  set, and serves the design canvas at
  `/drts-design-canvas/Ops Console.html` via the storybook
  staticDirs binding for side-by-side comparison.

This mirrors the Wave 3 tenant-console exception that
`TEN-UI-RD-017` (`TN_ApiKeys`) was recorded with **Storybook N/A**
against its own canvas anchor: the ops-console pages are
verified against the `Ops Console.html` canvas + canvas-primitives
library, not against per-route Storybook stories.

## App smoke test

`pnpm --filter @drts/ops-console-web build` runs the full Next.js
production build over all twenty rebuilt routes plus their shared
shell, which exercises route-level type / client-bundle / server-bundle
compilation for the full ops-console app. This is the "smoke test
in dev VM clean" leg required by the umbrella acceptance line.

The 2026-05-28 umbrella-level rerun (recorded above) was run from
`/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-ui-fe-ops-umbrella`
on branch `claude2/ui-fe-ops-umbrella` at base
`origin/dev`. Per-surface reviewer reruns at each task's
`review_approved` moment are recorded in
`ai-activity-log.jsonl`.

## Outstanding items

None blocking the umbrella. Items worth flagging for the reviewer:

- **Storybook parity is library-level, not per-surface.** The
  `Storybook parity note` above explains the structure: parity
  is anchored on `packages/ui-web/src/canvas-primitives/` + the
  `Ops Console.html` canvas, not on per-route `ops-*.stories.tsx`
  files. This is an intentional design decision recorded at
  `UI-FE-TOKENS` time, not a regression versus the tenant /
  platform-admin redesigns.
- **Cross-app deep-link contracts are not re-verified here.**
  Each rebuild row preserves the per-spec deep-link set
  (`/revenue` → platform-admin reconciliation per Q-X03,
  `/contracts/[id]` → platform-admin / tenant governance,
  `/vehicles/[id]` → platform-admin fleet mutations).
  Reviewer-of-record signoff on each task is the citation
  for those links; this umbrella does not re-verify the
  cross-app endpoints.
- **Visual-diff screenshots are not embedded.** The design canvas
  (`docs/05-ui/drts-design-canvas/Ops Console.html`) plus the
  Storybook canvas-primitives stories provide the living
  comparison surface and are reproducible from the listed
  commits via `pnpm --filter @drts/ui-web build-storybook` +
  `pnpm --filter @drts/ops-console-web build`.

## Reviewer signoff for UI-FE-OPS-UMBRELLA

The reviewer (Codex2) is asked to confirm only that the matrix above
is internally consistent with `ai-status.json` and
`ai-activity-log.jsonl` — i.e. each
`(reviewer, approved-at, commit_hash, push_branch)` tuple in the
matrix matches the machine truth on the cited branches, the cited
canvas anchors exist in
`docs/05-ui/drts-design-canvas/Ops Console.html`, and each cited
route artifact exists on its branch of record under
`apps/ops-console-web/app/`.

## Files added by this closeout

```text
docs/05-ui/ops-console-rebuild-closeout-20260528.md
```
