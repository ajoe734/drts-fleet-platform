# Ops Console Redesign — Wave 2 Closeout (2026-05-10)

Owner: Claude2 · Reviewer of record (this closeout): Claude
Task: `OPS-UI-RD-009`
Planning ref: [`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`](./drts-ui-redesign-workbreakdown-20260510.md)
Branch: `origin/feat/claude2-ui-redesign-foundation`

## Purpose

Wave 2 closeout for the ops-console-web redesign. The eight implementation
tasks `OPS-UI-RD-001`..`OPS-UI-RD-008` have all reached `done` in
`ai-status.json`. This document binds each shipped surface to:

- the **before** state (the page commit as it stood at the start of Wave 2,
  prior to the OPS-UI-RD-\* redesign commits),
- the **after** state (the shipped redesign commit on
  `origin/feat/claude2-ui-redesign-foundation`),
- the **canvas** anchor in `docs/05-ui/drts-design-canvas/Ops Console.html`
  (the design source of truth) and, where present, the matching parity
  Storybook story under `packages/ui-web/src/ops-*.stories.tsx`,
- the reviewer of record and the UTC timestamp at which they posted the final
  `review_approved` event in `ai-activity-log.jsonl`.

Where the brief says "三圖比對" (before / after / canvas) we capture the
references in text rather than embedding images: the design canvas is a live
`docs/05-ui/drts-design-canvas/Ops Console.html` artboard and the parity
Storybook stories are the living "after" target; both are reproducible from the
git tree at the listed commits.

## Verification scope

This closeout does **not** rerun the per-task acceptance commands. Each
surface row cites the reviewer rerun summary recorded in the corresponding
`OPS-UI-RD-00x` task entry in `ai-status.json` (see `review_notes_zh` and
`next` fields). The reviewer for OPS-UI-RD-009 is asked to confirm that:

1. each row's `commit_hash` is present on `origin/feat/claude2-ui-redesign-foundation`,
2. the cited reviewer + approval timestamp matches `ai-activity-log.jsonl`,
3. each cited canvas anchor exists in `docs/05-ui/drts-design-canvas/Ops Console.html`,
4. each cited Storybook parity story file exists in `packages/ui-web/src/`.

## Surface signoff matrix

| #             | Surface                                                       | Reviewer | Approved (UTC)       | Shipped commit                                               | Before commit                                         | Canvas anchor                                                                                                                            | Parity story                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------- | -------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPS-UI-RD-001 | Adopt new shell in ops-console-web                            | Codex2   | 2026-05-10T14:51:55Z | `cd10d83`                                                    | `abaf01e` (MGMT-UI-003 management shell adoption)     | `Ops Console.html#dashboard` (shell chrome)                                                                                              | _(shell only — `ManagementShell` composition exercised by `packages/ui-web/src/{tenant-shell,platform-shell}.stories.tsx`; primitives covered by `packages/ui-web/src/management-{primitives,sidebar,topbar}.stories.tsx`)_ |
| OPS-UI-RD-002 | Strip ad-hoc CSS, adopt ui-web primitives                     | Claude2  | 2026-05-10T16:13:46Z | `449e419`                                                    | `cd10d83` (post-shell baseline)                       | _(no anchor — global token cleanup)_                                                                                                     | _(token-level; covered by `packages/ui-web/src/*.stories.tsx`)_                                                                                                                                                             |
| OPS-UI-RD-003 | Dashboard redesign per OC_Dashboard                           | Codex2   | 2026-05-10T17:24:05Z | `675be25`                                                    | `4fc940c` (`OPS-UI-002` dispatch workspace baseline)  | `Ops Console.html#dashboard` (`OC_Dashboard`)                                                                                            | `packages/ui-web/src/ops-dashboard.stories.tsx`                                                                                                                                                                             |
| OPS-UI-RD-004 | Dispatch (owned + forwarded) redesign                         | Codex2   | 2026-05-10T18:20:26Z | `8f3efa2`                                                    | `09a06bd` (`OPS-UI-007` dispatch detail)              | `Ops Console.html#dispatch-flow` (`OC_DispatchOwned` / `OC_DispatchForwarded`)                                                           | _(uses ops-master-data + dispatch-view-model snapshot tests in app)_                                                                                                                                                        |
| OPS-UI-RD-005 | Callcenter redesign                                           | Codex    | 2026-05-10T17:52:18Z | `646696e`                                                    | `7c366b7` (`OPS-UI-008` callcenter session workspace) | `Ops Console.html#callcenter` (`OC_Callcenter`)                                                                                          | `packages/ui-web/src/ops-callcenter.stories.tsx`                                                                                                                                                                            |
| OPS-UI-RD-006 | Complaints + Incidents redesign                               | Codex    | 2026-05-10T20:01:46Z | `c97924a` (KPI fix) on top of `1d72fe3` (primitive adoption) | `f7a9bc1` (`OPS-UI-003` incident workflow pages)      | `Ops Console.html#callcenter` (`OC_Complaints`, `OC_Incidents`, `OC_IncidentDetail`)                                                     | `packages/ui-web/src/ops-incidents.stories.tsx`                                                                                                                                                                             |
| OPS-UI-RD-007 | Reports / Revenue / Attendance / Maintenance redesign         | Codex    | 2026-05-10T19:07:04Z | `e1c4965`                                                    | `b50181c` (`OPS-UI-004` reporting hardening)          | `Ops Console.html#reports`, `#revenue`, `#attendance`, `#maintenance` (`OC_Reports` / `OC_Revenue` / `OC_Attendance` / `OC_Maintenance`) | `packages/ui-web/src/ops-reporting.stories.tsx`                                                                                                                                                                             |
| OPS-UI-RD-008 | Master data (drivers / vehicles / contracts / flags) redesign | Codex    | 2026-05-10T18:05:44Z | `91f37c4`                                                    | `2a03c9f` (`OPS-UI-005` ops registries)               | `Ops Console.html#drivers`, `#vehicles`, `#contracts`, `#flags` (`OC_Drivers` / `OC_Vehicles` / `OC_Contracts` / `OC_Flags`)             | `packages/ui-web/src/ops-master-data.stories.tsx`                                                                                                                                                                           |

All eight rows ship on `origin/feat/claude2-ui-redesign-foundation`. The
"before" column lists the most recent page-bearing commit prior to the OPS-UI-RD
redesign commit so reviewers can `git diff <before>..<after> -- <artifact>` and
see the redesign delta in isolation.

## Per-surface notes

### OPS-UI-RD-001 — ManagementShell adoption

- Artifacts: `apps/ops-console-web/app/layout.tsx`,
  `apps/ops-console-web/components/sidebar.tsx`.
- Acceptance recorded as PASS for `pnpm --filter @drts/ops-console-web typecheck`,
  `pnpm --filter @drts/ops-console-web build`, and 14-route navigation parity
  (see `ai-status.json` task `next` field).
- Reviewer Codex2 final approval at 2026-05-10T14:51:55Z; owner closed at
  2026-05-10T14:57:09Z (commit `cd10d83`).

### OPS-UI-RD-002 — Strip ad-hoc CSS, adopt ui-web primitives

- Artifact: `apps/ops-console-web/app/globals.css` (no remaining `.admin-*`
  selectors; `grep -r '.admin-' apps/ops-console-web/app/globals.css` is empty).
- Reviewer Claude2 re-approved at 2026-05-10T16:13:46Z after an earlier owner
  progress reset; owner closed at 2026-05-10T16:18:24Z (commit `449e419`).
- Verification: `pnpm --filter @drts/ops-console-web typecheck`, `build`, `lint`,
  and `test` PASS per task `next` field.

### OPS-UI-RD-003 — Dashboard redesign per OC_Dashboard

- Artifact: `apps/ops-console-web/app/dashboard/page.tsx`.
- Storybook parity story `OpsDashboard/Built` with subtitle aligned to the
  shipped `t("dashboard.subtitle")` translation key (Codex2 audit at
  2026-05-10T17:24:05Z confirmed page translation, story source, and built
  Storybook asset all match).
- Final Storybook parity sweep was pulled into the same commit
  `675be25` to keep the dashboard before / after / canvas bundle consistent.

### OPS-UI-RD-004 — Dispatch (owned + forwarded) redesign

- Artifacts: `apps/ops-console-web/app/dispatch/page.tsx`,
  `dispatch-workflow.tsx`, `forwarded-order-board.tsx`.
- Authority semantics: owned / forwarded / override-governance / no-supply
  routed through `dispatch-view-model`; mirror table is locked to forwarded
  tone with Vitest snapshot coverage. Codex2 (2026-05-10T18:20:26Z) confirmed
  forwarded mirrors keep forwarded authority tone, governance/no-supply remain
  owned-scoped, and the canvas comparison at
  `Ops Console.html#dispatch-flow` (`OC_DispatchOwned` / `OC_DispatchForwarded`)
  matches.

### OPS-UI-RD-005 — Callcenter redesign

- Artifact: `apps/ops-console-web/app/callcenter/page.tsx`.
- Layout split into Sessions / Callback queue / Recordings tabs; live command
  surface preserved inside the session workspace (no behavioral regression
  versus prior `OPS-UI-008` implementation).
- Parity story `packages/ui-web/src/ops-callcenter.stories.tsx` matches
  `Ops Console.html#callcenter` (`OC_Callcenter`).

### OPS-UI-RD-006 — Complaints + Incidents redesign

- Artifacts: `apps/ops-console-web/app/complaints/page.tsx`,
  `apps/ops-console-web/app/incidents/page.tsx`.
- Two commits ship the redesign: `1d72fe3` (primitive adoption) and `c97924a`
  (incidents 3rd KPI label/detail aligned to `incidents.linkedCount` /
  `incidents.linkedSub`). Codex re-approval at 2026-05-10T20:01:46Z confirms
  the live KPI matches the `OC_IncidentDetail` parity story; Incident detail
  embedded workspace is preserved (treated as design improvement over the
  static mock, not a regression).
- Canvas anchors: `Ops Console.html#callcenter` covers `OC_Complaints`,
  `OC_Incidents`, and `OC_IncidentDetail`.

### OPS-UI-RD-007 — Reports / Revenue / Attendance / Maintenance redesign

- Artifacts: `apps/ops-console-web/app/{reports,revenue,attendance,maintenance}/page.tsx`.
- Shared `PageHeader` / `Kpi` / `DataView` treatment per the reporting brief.
  Codex re-approval at 2026-05-10T19:07:04Z (after a post-closeout cleanup
  pass that removed an unused `CardBody` import); task-scoped commit
  `e1c4965` is the canonical artifact.
- Parity story `packages/ui-web/src/ops-reporting.stories.tsx` covers all four
  canvas anchors (`#reports` / `#revenue` / `#attendance` / `#maintenance`).

### OPS-UI-RD-008 — Master data (drivers / vehicles / contracts / flags)

- Artifacts: `apps/ops-console-web/app/{drivers,vehicles,contracts,feature-flags}/page.tsx`.
- Flags route stays read-only; drivers / vehicles / contracts adopt the
  shared management-shell `DataView` treatment.
- Parity story `packages/ui-web/src/ops-master-data.stories.tsx` covers
  `OC_Drivers` / `OC_Vehicles` / `OC_Contracts` / `OC_Flags`.

## Outstanding items

None blocking Wave 2. Items intentionally deferred:

- This closeout records reviewer signatures for each surface; it does not
  rerun acceptance commands, by design — re-running acceptance was completed
  during each upstream task's `review_approved` event and is the basis of the
  reviewer signature on this packet.
- Visual-diff screenshots are not embedded. The design canvas
  (`docs/05-ui/drts-design-canvas/Ops Console.html`) and the parity
  Storybook stories (`packages/ui-web/src/ops-*.stories.tsx`) provide the
  living comparison surface and are reproducible from the listed commits.

## Reviewer signoff for OPS-UI-RD-009

The reviewer (Claude) is asked to confirm only that the matrix above is
internally consistent with `ai-status.json` and `ai-activity-log.jsonl` — i.e.
each `(reviewer, approved-at, commit_hash)` triple in the matrix matches the
machine truth on this branch.
