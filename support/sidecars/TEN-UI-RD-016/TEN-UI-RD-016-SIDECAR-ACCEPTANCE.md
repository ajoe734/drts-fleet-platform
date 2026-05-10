# TEN-UI-RD-016 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `TEN-UI-RD-016` — Reports route 新增
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2` (availability-first reassignment from `Claude`)
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, the parent task's implementation files,
or `ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
tenant `Reports` route slice. The parent task `TEN-UI-RD-016` ships a
contract-backed `/reports` route under `apps/tenant-console-web` plus a
`TN_Reports` side-by-side parity story under `packages/ui-web/src/`; this
packet pins the machine-truth anchors, the dependency map, and the
acceptance checklist that the parent reviewer (`Codex`) is expected to
apply against that implementation.

Transient parent lifecycle truth (`status`, `next`, `last_update`, future
`commit_hash` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet does not snapshot those fields, by design —
at packet-generation time the parent task is in `in_progress` after a
second-round review failure recorded at `2026-05-10T21:29:55Z`, and the
parent has not yet been committed.

A sibling sidecar `TEN-UI-RD-016-SIDECAR-REVIEW`
(`support/sidecars/TEN-UI-RD-016/TEN-UI-RD-016-SIDECAR-REVIEW.md`, status
`done`, shipped commit `8a7e6fe`) records the parent reviewer's
first-round failure surfaces with file/line anchors. This packet does not
duplicate that file-level evidence map; instead it restates the parent
acceptance bar as an auditable checklist and maps the dependency surface,
and cross-references the review packet for finding-by-finding details.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar
  (`pnpm --filter @drts/tenant-console-web typecheck / build / test` +
  `Storybook 對照對應 TN_* artboard` + the "no backend contract expansion"
  guardrail) as a reviewer checklist
- pin the machine-truth dependency on `TEN-UI-RD-001`
- map the canvas + parity-story anchors that the redesign must hit
  (`Tenant Console.html#reports`, `TN_Reports` component, `TN_NAV`
  ordering)
- record the parent task's structural shape (route + actions +
  navigation + parity story + story-shell mirror) so `Codex` can audit
  the slice without re-deriving Wave 3 parity expectations
- track which of the first-round failure findings remain open at
  packet-generation time, and which the working tree appears to have
  closed, so the reviewer focuses re-verification effort on the
  still-open surface

Out of scope:

- editing L1/L2 product truth, the planning ref, the tenant-console app
  source, the parity story, the design canvas, or `ai-status.json`
- replacing or duplicating the file-level evidence map in
  `TEN-UI-RD-016-SIDECAR-REVIEW.md` — this packet defers to that
  sidecar for working-tree line citations
- proposing or prescribing specific fixes for the open TypeScript
  blocker; the rework decision is the parent owner's
- recording `commit_hash` / `push_remote` / `push_branch` evidence for
  the parent task; that step is the parent owner's responsibility after
  parent review approval
- mutating or "absorbing" the parent task; absorption is the parent
  owner's decision, not the sidecar's

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → TEN-UI-RD-016-SIDECAR-ACCEPTANCE`

- owner=`Claude2` (availability-first reassignment from `Claude`; recorded
  in `ai-status.json → TEN-UI-RD-016-SIDECAR-ACCEPTANCE.next` at
  `2026-05-10T21:57:29Z`)
- reviewer=`Codex2`
- depends_on=`TEN-UI-RD-001`
- task_class=`sidecar`
- helper_parent=`TEN-UI-RD-016`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-RD-016/TEN-UI-RD-016-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Sibling sidecar — `ai-status.json → TEN-UI-RD-016-SIDECAR-REVIEW`

- owner=`Claude2`
- reviewer=`Codex2`
- status=`done`
- shipped commit=`8a7e6fe`
  (`docs(TEN-UI-RD-016-SIDECAR-REVIEW): add TEN-UI-RD-016 review packet
& evidence summary`)
- push target=`origin/feat/claude2-ui-redesign-foundation`
- helper_kind=`review_packet`
- contribution to this packet: pins the file-level evidence map for the
  parent's working tree (route, actions, navigation, parity story,
  story-shell mirror, contract-boundary evidence) and records the
  first-round failure findings with working-tree line anchors

### Parent — `ai-status.json → TEN-UI-RD-016`

- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- artifact root=`apps/tenant-console-web/app/`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  (Wave 3 tenant section line 467 lists `TEN-UI-RD-016 Reports route 新增`)
- branch on which the parent implementation is expected to land=
  `feat/claude2-ui-redesign-foundation` (active Wave 3 branch)
- parent commit/push evidence: deferred to parent owner's `done` closeout
  (the parent has not yet been committed; first review round failed at
  `2026-05-10T20:52:58Z`, second-round review failed at
  `2026-05-10T21:29:55Z`, and the parent remains in `in_progress`)

### Parent lifecycle events of record

- first handoff (owner → reviewer): `2026-05-10T20:46:05Z` (Codex2 → Codex)
- first review failure: `2026-05-10T20:52:58Z` — two findings:
  1. `apps/tenant-console-web/app/reports/page.tsx` never emitted
     `<a href={job.artifact.downloadUrl}>` for the artifact column.
  2. `apps/tenant-console-web/lib/navigation.ts` +
     `packages/ui-web/src/tenant-story-support.tsx` placed `Reports`
     before `Invoices`, inverting `TN_NAV` ordering.
- second review failure: `2026-05-10T21:29:55Z` — one residual finding:
  - `packages/ui-web/src/tenant-reports.stories.tsx:72` and `:110` pass
    `tone="tenant"` to `DetailList`, but
    `DetailMetadataGridProps` in
    `packages/ui-web/src/management-primitives.tsx:1665-1670` does not
    declare a `tone` prop and `DetailListProps` is just an alias for
    that (`management-primitives.tsx:1784-1787`), so
    `pnpm --filter @drts/tenant-console-web typecheck` still fails.
- working-tree state of the first-round findings at packet-generation
  time (informational; the parent reviewer is the authority):
  - finding #1 appears to be closed —
    `apps/tenant-console-web/app/reports/page.tsx:100-111` now renders
    `<a href={job.artifact.downloadUrl} …>Download artifact</a>` when
    `job.artifact` is truthy, with `getArtifactState(job)` as the
    secondary readiness caption.
  - finding #2 appears to be closed —
    `apps/tenant-console-web/lib/navigation.ts:48-61` and
    `packages/ui-web/src/tenant-story-support.tsx:29-30` now both
    declare `Invoices` (line 52-55 / `:29`) before `Reports` (line
    57-60 / `:30`), matching `TN_NAV` at
    `docs/05-ui/drts-design-canvas/tenant-screens.jsx:14-15`.

### Upstream dependency — `ai-status.json → TEN-UI-RD-001`

- status=`done`
- shipped commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- commit subject=
  `feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- commit reviewer=`Codex`
- commit_recorded_at=`2026-05-10T16:34:46Z`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- branch presence assertion: `515f271` resolves on
  `origin/feat/claude2-ui-redesign-foundation` at packet-generation time
  (verified via `git branch -r --contains 515f271…`).

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:467`
  (`TEN-UI-RD-016` row in Wave 3 tenant section; defines the
  "do not extend contract; open blocker if missing" guardrail)
- `docs/05-ui/drts-design-canvas/Tenant Console.html:78-79`
  (`#invoices` and `#reports` artboards; `id="reports"` is the parity
  anchor the route's parity story binds to via `anchor="reports"`)
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx`:
  - `TN_NAV` array at line `3`, with `invoices` at `:14` and
    `reports` at `:15` — canonical nav order the runtime + story
    shell must mirror.
  - `TN_Reports` component at line `316` — canvas source of truth
    for the parity story's column set and breadcrumbs.
- parent working-tree files (per
  `TEN-UI-RD-016-SIDECAR-REVIEW.md` §4):
  - `apps/tenant-console-web/app/reports/page.tsx` (new — route)
  - `apps/tenant-console-web/app/reports/actions.ts` (new — server
    actions)
  - `apps/tenant-console-web/lib/navigation.ts` (modified — Billing
    group order)
  - `packages/ui-web/src/tenant-reports.stories.tsx` (new — parity
    story)
  - `packages/ui-web/src/tenant-story-support.tsx` (modified —
    story-shell Billing group order)
- contract surfaces the route consumes (no expansion intended):
  - `packages/api-client/src/index.ts` — existing
    `createTenantReportJob` / `listTenantReportJobs` client methods.
  - `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`
    — existing `createTenantReportJob` / `listTenantReportJobs` routes.
  - `packages/contracts/src/index.ts` —
    `ReportJobRecord.artifact: ReportArtifactRecord | null` and
    `ReportArtifactRecord.downloadUrl: string` (already part of the
    contract; no new fields required).
- parity precedent for the download-link UX:
  - `apps/ops-console-web/app/reports/page.tsx` (sibling ops consumer
    that already emits `<a href={job.artifact.downloadUrl}>` against
    the same `ReportArtifactRecord` shape).
- `DetailList` typing surface implicated by the open TypeScript blocker:
  - `packages/ui-web/src/management-primitives.tsx:1659-1670`
    (`DetailListItem.tone` exists per item, but
    `DetailMetadataGridProps` itself has no `tone` field).
  - `packages/ui-web/src/management-primitives.tsx:1784-1787`
    (`DetailListProps = DetailMetadataGridProps`;
    `DetailList(props: DetailMetadataGridProps)`).

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends only on `TEN-UI-RD-001`. That dependency
is already `done` and shipped on the active Wave 3 branch.

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | What it contributes to `TEN-UI-RD-016`                                                                                                                                                                                                                          |
| --------------- | ------ | ------------------ | -------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-001` | `done` | `Codex`            | 2026-05-10T16:34:46Z | `515f271`      | Tenant console shell + globals.css cleanup + `tenant-shell.stories.tsx` parity baseline; required so the new `/reports` route renders inside the post-shell tenant chrome and the parity story reuses the same primitive set as Wave 3 sibling tenant surfaces. |

Branch presence assertion:

- `515f271` resolves on `origin/feat/claude2-ui-redesign-foundation` at
  packet-generation time (recorded as `push_commit` / `push_ref` in
  `ai-status.json → TEN-UI-RD-001`).

Assertions:

- the parent declares no other hard `depends_on` edges in machine truth.
- the parent introduces no new acceptance bars beyond the three already
  in `ai-status.json` (`typecheck / build / test`, `Storybook 對照
TN_*`, `no contract expansion`); every checklist item in §4 is a
  faithful expansion of one of those three bars.
- no new hard `depends_on` edge is being asserted in this packet beyond
  the one already in `ai-status.json` (`TEN-UI-RD-001`). The sibling
  review packet (`TEN-UI-RD-016-SIDECAR-REVIEW`, `8a7e6fe`) is recorded
  as a sidecar peer, not as a proposed machine-truth dependency edge.

### B. Downstream consumer map

`TEN-UI-RD-016` is a single-route tenant parity-fill slice within
Wave 3. Its downstream consumers are not other `ai-status.json` tasks
with hard `depends_on` edges; they are the Wave 3 tenant closeout and
the sibling parity reviewers.

| Consumer                                                     | Relationship       | Why `TEN-UI-RD-016` matters                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 3 tenant closeout (eventual `TEN-UI-RD-099`-shape task) | reference baseline | The Wave 3 closeout matrix needs a row for the tenant `Reports` surface with reviewer + approved-at + shipped commit + canvas/parity anchors; this task supplies those values.                                                           |
| Tenant parity-fill siblings (`TEN-UI-RD-010`..`-018`)        | structural sibling | Tenant route additions in this wave reuse the same shape (server component + server actions + parity story + story-shell mirror); the `Reports` route is a template-conformant Wave 3 example once approved.                             |
| Design canvas maintenance (`docs/05-ui/drts-design-canvas/`) | anchor inventory   | The `TN_Reports` artboard at `Tenant Console.html#reports` becomes load-bearing for a shipped route after this task lands; canvas refactors must preserve `id="reports"` and the `TN_NAV` ordering.                                      |
| Reviewers of `apps/tenant-console-web`                       | review boundary    | The `/reports` route is a new server-rendered surface that calls `listTenantReportJobs` / `createTenantReportJob`; reviewers should treat its server-action redirect contract as part of the tenant-portal review surface going forward. |

Dispatch interpretation:

- no `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge **to** `TEN-UI-RD-016` at packet-generation time.
  the consumers above are template / reference consumers, not formal
  dependencies, and should not be promoted to hard dependencies in
  machine truth without an explicit decision.

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar —

- `pnpm --filter @drts/tenant-console-web typecheck / build / test`
- `Storybook 對照對應 TN_* artboard`
- `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

— as a reviewable line-item list against the parent implementation that
will land under `apps/tenant-console-web/app/reports/{page.tsx,actions.ts}`,
`apps/tenant-console-web/lib/navigation.ts`,
`packages/ui-web/src/tenant-reports.stories.tsx`, and
`packages/ui-web/src/tenant-story-support.tsx`.

Legend:
`[REQUIRED]` = explicit parent acceptance bar.
`[DERIVED]` = reviewer support gate for this packet.
`[FAILED-2026-05-10]` = item known to have failed a prior review round and
still pending in the working tree at packet-generation time.
`[FAILED-2026-05-10-RESOLVED]` = item known to have failed a prior round
but the working tree appears to have closed it at packet-generation time;
the parent reviewer re-verifies authoritatively.

### A. Tenant-console build / typecheck / test gate `[REQUIRED]`

Parent acceptance line:
`pnpm --filter @drts/tenant-console-web typecheck / build / test`

- [ ] **`[FAILED-2026-05-10]`**
      `pnpm --filter @drts/tenant-console-web typecheck` passes against
      the parent's working tree. Currently still failing in
      `packages/ui-web/src/tenant-reports.stories.tsx:72` and `:110`
      because `<DetailList tone="tenant" …>` is rejected by
      `DetailMetadataGridProps` in
      `packages/ui-web/src/management-primitives.tsx:1665-1670` /
      `:1784-1787`.
- [ ] `pnpm --filter @drts/tenant-console-web build` passes against the
      parent's working tree. `next-env.d.ts` regeneration noise from
      Next.js is tolerable; substantive build failures are not. (Parent
      owner self-reported pass at first handoff `2026-05-10T20:46:05Z`;
      parent reviewer re-ran during second-round review at
      `2026-05-10T21:29:55Z`; reviewer should re-run after the
      TypeScript blocker is closed.)
- [ ] `pnpm --filter @drts/tenant-console-web test` passes against the
      parent's working tree. (Parent owner self-reported pass at first
      handoff; parent reviewer re-ran during second-round review;
      reviewer should re-run after the TypeScript blocker is closed.)
- [ ] `pnpm --filter @drts/ui-web build-storybook` passes against the
      parent's working tree. (Added by parent reviewer during first
      review round because the parity-story file lives in
      `@drts/ui-web`; the reviewer's second-round note flagged that
      this Storybook build is currently blocked by an unrelated
      untracked file `packages/ui-web/src/platform-pricing.stories.tsx`,
      which is not in this task's working set — but the
      `tenant-reports.stories.tsx` TypeScript error must still be
      fixed before the Storybook gate is meaningful here.)

### B. Storybook parity vs. `TN_Reports` artboard `[REQUIRED]`

Parent acceptance line: `Storybook 對照對應 TN_* artboard`

- [ ] `packages/ui-web/src/tenant-reports.stories.tsx` exists and
      exports a single `Reports` story under `Tenant Console/Reports`,
      rendering `StoryChrome` with `anchor="reports"` (the canonical
      `Tenant Console.html#reports` artboard id).
- [ ] The built view composes the shared `TenantStoryShell` +
      `ManagementShell` chrome and uses the `@drts/ui-web` data
      primitives (`PageHeader`, `KpiRow` / `KpiCard`, `DataViewCard`,
      `DetailList`, `CalloutBanner`, `DataTable`, `StatusChip`) — i.e.,
      the same primitive vocabulary used by adjacent Wave 3 tenant
      parity stories, so the side-by-side comparison reflects parity
      rather than two unrelated UIs.
- [ ] **`[FAILED-2026-05-10]`** The `DetailList` usages at
      `tenant-reports.stories.tsx:72` and `:110` do not pass an
      unsupported `tone` prop, or `DetailListProps` is widened in
      `management-primitives.tsx` so the prop is supported. The story's
      job-history fixture should still render every visible status
      chip (`completed`, `running`, `failed`) and the artifact-ready
      states without backend traffic.
- [ ] **`[FAILED-2026-05-10-RESOLVED]`** Story-shell nav order
      (`packages/ui-web/src/tenant-story-support.tsx:29-30`) matches
      `TN_NAV` (`tenant-screens.jsx:14-15`): `Invoices` before
      `Reports`. Working tree at packet-generation time matches this
      ordering; parent reviewer re-verifies.
- [ ] Parity story's job-history table reflects the route's
      signed-download UX so side-by-side parity stays faithful when the
      route emits a `downloadUrl` anchor (first-round finding #1
      cascade; the reviewer confirms either that the story's artifact
      cell mirrors the route's anchor or that the divergence is
      explicitly justified as a story-shell limitation).
- [ ] No new artboard is added to
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx` and no canvas
      anchor is renamed; the existing `TN_Reports` component
      (`tenant-screens.jsx:316`) and `id="reports"` artboard
      (`Tenant Console.html:79`) remain the parity target.

### C. Canvas anchor existence `[REQUIRED]`

- [ ] `Tenant Console.html#reports` exists in
      `docs/05-ui/drts-design-canvas/Tenant Console.html` (verified at
      packet-generation time: line `79` binds `id="reports"` to
      `<TN_Reports theme={th} />`).
- [ ] `TN_Reports` is still exported from
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx` (verified at
      packet-generation time: definition at line `316`; re-exported at
      line `469` alongside `TN_Invoices` and other `TN_*` components).
- [ ] `TN_NAV` ordering at
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx:14-15` is
      preserved (`invoices` before `reports`) — this anchor is what
      drives the runtime + story-shell nav-order acceptance lines in
      §B and the runtime-mirror line in §D below.

### D. Runtime navigation parity `[REQUIRED-derivation-of-B]`

The parent acceptance bar covers Storybook parity explicitly; the
runtime navigation mirror is the runtime side of the same parity
requirement (the parent reviewer treated `lib/navigation.ts` and the
story-shell as a single parity surface in first-round finding #2).

- [ ] **`[FAILED-2026-05-10-RESOLVED]`**
      `apps/tenant-console-web/lib/navigation.ts` Billing group orders
      `Invoices` before `Reports`, matching `TN_NAV`. Working tree at
      packet-generation time matches this ordering
      (`navigation.ts:48-61`); parent reviewer re-verifies.
- [ ] The `Reports` entry retains the contract-aware note
      ("Tenant report jobs, artifact readiness, and contract-backed
      export history.") and is grouped under `Billing`, not under
      `Integrations` or a new group.
- [ ] No other tenant nav groups, captions, tags, or `note` strings are
      mutated by this task.

### E. Contract-boundary gate `[REQUIRED]`

Parent acceptance line:
`若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

- [ ] Route reads only via `client.listTenantReportJobs()` (existing)
      and writes only via
      `client.createTenantReportJob({ jobType, format })` (existing).
      No new client method is introduced.
- [ ] No file under `packages/contracts/`, `packages/api-client/src/`,
      or `apps/api/src/modules/reporting-filing/` is modified by this
      task — verified via `git status` at parent review time. The
      first-round download-link fix does not require a contract change
      because `ReportArtifactRecord.downloadUrl` is already part of the
      existing record shape.
- [ ] The UI's report-kind option set
      (`monthly_trip_report`, `revenue_summary`, `trip_summary`) is a
      strict subset of the contract's known job types, enforced by
      `isReportKind()` in
      `apps/tenant-console-web/app/reports/actions.ts`.
- [ ] The UI's format option set is sourced from
      `REPORT_OUTPUT_FORMATS` in `@drts/contracts` (validated by
      `isReportFormat()` in `actions.ts`); UI display order is a UI
      ordering choice, not a contract change.
- [ ] Artifact TTL surface is read from `job.artifact.expiresAt` only;
      the route does not compute, persist, or override expiry locally.
- [ ] **`[FAILED-2026-05-10-RESOLVED]`** Job-history artifact column
      exposes `job.artifact.downloadUrl` as an `<a href="…">`
      signed-download control (parity precedent at
      `apps/ops-console-web/app/reports/page.tsx`). Working tree at
      packet-generation time renders this anchor at
      `apps/tenant-console-web/app/reports/page.tsx:100-111`; parent
      reviewer re-verifies that the rendered link uses the
      contract-supplied URL and renders the readiness caption as a
      secondary line rather than as the only artifact-cell content.
- [ ] No blocker ticket was opened against `discussion_planning`,
      consistent with the parent's first-handoff message ("No backend
      contract expansion was introduced").

### F. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on
      `origin/feat/claude2-ui-redesign-foundation` (the active Wave 3
      branch). If the parent owner pushes to a different branch, that
      divergence is captured in machine truth (`push_branch`) and is
      not silently absorbed into the Wave 3 closeout.
- [ ] The parent's commit subject contains `TEN-UI-RD-016` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule.
- [ ] The parent's `review_approved` event names a reviewer of record
      (expected: `Codex`) and an approval UTC timestamp, taken after
      the still-open TypeScript blocker is closed and after the
      reviewer has re-verified §A and §B against the new working tree.

### G. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner / reviewer
      assignment for both the sidecar (`Claude2` / `Codex2`, after the
      availability-first reassignment recorded at
      `2026-05-10T21:57:29Z`) and the parent task (`Codex2` / `Codex`).
- [ ] This packet does not snapshot live parent `status` / `next` /
      `last_update` / `commit_*` values; those remain authoritative in
      `ai-status.json`.
- [ ] This packet records the parent reviewer's first-round and
      second-round failure findings as auditable acceptance lines,
      with first-round items tagged `[FAILED-2026-05-10]` (if still
      open) or `[FAILED-2026-05-10-RESOLVED]` (if the working tree has
      closed them at packet-generation time), and the second-round
      TypeScript blocker tagged `[FAILED-2026-05-10]`. The parent
      reviewer is the authoritative party for confirming any of these
      resolutions.
- [ ] This packet does not duplicate the file-level evidence map in
      `TEN-UI-RD-016-SIDECAR-REVIEW.md`; instead it cross-references
      that sidecar for per-file working-tree line citations.
- [ ] This packet does not edit canonical truth — the planning ref,
      the design canvas, the tenant-console app source, the parity
      story, the story-shell mirror, the contract surfaces, and
      `ai-status.json` all remain untouched by this sidecar.
- [ ] This packet does not record `done` evidence for the parent task;
      that step is the parent owner's responsibility after parent
      review approval.

---

## 5. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section (§2) matches the current
  `ai-status.json` fields for both `TEN-UI-RD-016-SIDECAR-ACCEPTANCE`
  and `TEN-UI-RD-016`, including the parent's `in_progress` state
  after the second-round failure event timestamped
  `2026-05-10T21:29:55Z`.
- confirm the sibling-sidecar reference (`TEN-UI-RD-016-SIDECAR-REVIEW`,
  shipped commit `8a7e6fe`) is accurate, and that this packet defers
  the file-level evidence map to that sidecar rather than duplicating
  it.
- confirm the upstream dependency table (§3.A) matches
  `TEN-UI-RD-001`'s recorded `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` values and the branch presence assertion holds.
- confirm the downstream consumer map (§3.B) does not assert any hard
  machine-truth `depends_on` edges that do not exist in
  `ai-status.json`.
- confirm the acceptance checklist (§4) is a faithful expansion of the
  three-line parent acceptance bar, with the still-open TypeScript
  blocker explicitly tagged `[FAILED-2026-05-10]`, the resolved
  first-round findings tagged `[FAILED-2026-05-10-RESOLVED]`, and no
  new acceptance bars invented.
- confirm the packet remains support-only and does not modify the
  workbreakdown planning ref, the design canvas, the parity story,
  the tenant-console app source, the story-shell mirror, the contract
  surfaces, or `ai-status.json`.

For `Codex` (the parent reviewer) — this packet is **not** the canonical
review of the parent task. Codex's review still runs against the parent
working tree using the §4 checklist (and the file-level evidence map in
`TEN-UI-RD-016-SIDECAR-REVIEW.md`) as tools. This packet is a stable
companion document that captures the acceptance gate and dependency map
at packet-generation time and now also tracks which of the prior-round
findings remain open against the working tree.

---

## 6. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for
the Wave 3 tenant `Reports` route slice. The parent task
`TEN-UI-RD-016` itself remains the canonical implementation slice; this
packet is a reviewer companion that:

- pins the single upstream `done` evidence pair (`TEN-UI-RD-001` /
  `515f271` / `origin/feat/claude2-ui-redesign-foundation`) in one
  place.
- pins the sibling sidecar (`TEN-UI-RD-016-SIDECAR-REVIEW`,
  shipped commit `8a7e6fe`) as the authoritative file-level evidence
  map this packet defers to.
- restates the three-line parent acceptance bar
  (`pnpm typecheck / build / test`, `TN_*` Storybook parity, no
  contract expansion) as an auditable checklist against the
  `/reports` route, the parity story, the story-shell mirror, and the
  runtime nav-order surface.
- maps the canvas anchors (`Tenant Console.html#reports`, `TN_Reports`
  component, `TN_NAV` ordering) and the contract surfaces
  (`createTenantReportJob` / `listTenantReportJobs` /
  `ReportJobRecord.artifact.downloadUrl`) that the slice consumes
  without expanding.
- tracks which of the prior failure findings remain open at
  packet-generation time (the `DetailList tone="tenant"` TypeScript
  blocker) versus which the working tree appears to have closed
  (download anchor + nav order), so the next review round can
  re-anchor on the still-open surface.
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, eventual `commit_hash` / `push_*` fields) to
  `ai-status.json`.

After sidecar review approval the packet is intended to remain in
`support/sidecars/TEN-UI-RD-016/` as a stable reference; it is not
absorbed into the parent's implementation or into the eventual Wave 3
tenant closeout, and it does not change any canonical artifact. When
the parent owner finalizes the parent's `done` closeout in a later
cycle, this packet's checklist will continue to read against the same
set of files, since the parent's design does not plan to mutate the
canvas or the contract.
