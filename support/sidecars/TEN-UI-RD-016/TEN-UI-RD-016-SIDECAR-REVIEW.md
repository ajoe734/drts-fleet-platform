# TEN-UI-RD-016 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `TEN-UI-RD-016` — Reports route 新增
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Refreshed:** `2026-05-10T21:11Z` — packet refresh after parent review
failure on `2026-05-10T20:52:58Z`; previous revision is no longer accurate
against machine truth (it described the parent as in `review` and asserted
that the navigation order `Reports → Invoices` was consistent with the
TEN-UI-RD-015 sibling slice).
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, or the parent task's implementation files.

This packet is a reviewer-facing companion to the parent task `TEN-UI-RD-016`,
which adds a contract-backed Reports route to `apps/tenant-console-web` and a
`TN_Reports` side-by-side parity story. The parent task is the canonical
implementation slice; this packet pins the machine-truth handoff record, the
file-by-file evidence map, and the acceptance checklist that the parent
reviewer (`Codex`) is expected to apply against the parent owner's working
tree.

At packet refresh time the parent task is **back in `in_progress`** after the
parent reviewer (`Codex`) failed the first review round and returned the work
to the parent owner (`Codex2`) for a follow-up. Two findings drove the
failure (recorded verbatim in `ai-status.json → TEN-UI-RD-016.next` at
`2026-05-10T20:52:58Z`); both are tracked in §4 and §5 below as known
defects against the current working tree.

Transient parent lifecycle truth (`status`, `next`, `last_update`, future
`commit_hash` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet does not snapshot those fields, by design — the
parent has not yet been committed and is currently mid-rework.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist against
  the parent's working-tree changes
- pin the machine-truth dependency on `TEN-UI-RD-001`
- enumerate the verifiable anchors the parent's implementation cites (file
  paths, contract surfaces, design canvas artboard, parity story)
- record the parent task's file-level shape so a reviewer can audit the route
  without re-deriving it from scratch
- record the parent owner's self-reported verification commands as part of
  the handoff so the reviewer can re-run them deterministically
- record the parent reviewer's first-round failure findings against the
  current working tree, so the next round of review can re-anchor on the
  same audit surfaces

Out of scope:

- editing L1/L2 product truth, the parent task entry in `ai-status.json`, or
  the working-tree implementation files (`apps/tenant-console-web/app/reports/*`,
  `apps/tenant-console-web/lib/navigation.ts`,
  `packages/ui-web/src/tenant-reports.stories.tsx`,
  `packages/ui-web/src/tenant-story-support.tsx`)
- editing the design canvas (`docs/05-ui/drts-design-canvas/Tenant Console.html`,
  `docs/05-ui/drts-design-canvas/tenant-screens.jsx`) or any other parity
  story under `packages/ui-web/src/tenant-*.stories.tsx`
- expanding tenant reporting contracts under
  `apps/api/src/modules/reporting-filing/` or
  `packages/api-client/src/index.ts`; the parent explicitly stays on the
  existing tenant report job APIs
- mutating or "absorbing" the parent task; absorption is the parent owner's
  decision after parent review approval, not the sidecar's
- prescribing a specific fix for the review-failure findings; this packet
  records the failures and the audit surfaces, but the rework decision is
  the parent owner's

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → TEN-UI-RD-016-SIDECAR-REVIEW`

- owner=`Claude2`
- reviewer=`Codex2`
- depends_on=`TEN-UI-RD-001`
- task_class=`sidecar`
- helper_parent=`TEN-UI-RD-016`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-RD-016/TEN-UI-RD-016-SIDECAR-REVIEW.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent — `ai-status.json → TEN-UI-RD-016`

- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- branch the parent's working tree currently sits on=`feat/claude2-ui-redesign-foundation`
- parent commit/push evidence: deferred to parent owner's `done` closeout
  (the parent has not yet been committed; first review round failed and the
  parent is back in `in_progress`)

### Parent lifecycle log — `ai-activity-log.jsonl`

- first handoff (owner → reviewer):
  - timestamp (UTC)=`2026-05-10T20:46:05Z`
  - agent=`Codex2`
  - target reviewer=`Codex`
  - self-reported verifications (per parent's handoff message):
    - `pnpm --filter @drts/tenant-console-web typecheck`
    - `pnpm --filter @drts/tenant-console-web build`
    - `pnpm --filter @drts/tenant-console-web test`
  - handoff guarantee: "No backend contract expansion was introduced; route
    stays on existing tenant report job APIs."
- first review failure:
  - timestamp (UTC)=`2026-05-10T20:52:58Z`
  - reviewer=`Codex`
  - effect: parent task transitioned `review → in_progress` and
    `next` was rewritten with the two findings captured in §4.7 below.
  - reviewer's own re-verifications (per parent `next` field):
    - `pnpm --filter @drts/tenant-console-web typecheck`
    - `pnpm --filter @drts/tenant-console-web build`
    - `pnpm --filter @drts/tenant-console-web test`
    - `pnpm --filter @drts/ui-web build-storybook`

### Upstream dependency — `ai-status.json → TEN-UI-RD-001`

- status=`done`
- shipped commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- commit subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- commit_recorded_at=`2026-05-10T16:34:46Z`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- contribution to `TEN-UI-RD-016`: shell adoption baseline + tenant-shell
  parity story + globals.css cleanup, so the new `/reports` route renders
  inside the post-shell tenant chrome and uses the same primitive set
  (`PageHero`, `SurfaceCard`, `CalloutPanel`) as Wave 3 sibling routes.

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` (planning_ref —
  records `TEN-UI-RD-016` as Sub-line B parity-fill task with the
  "do not extend contract; open blocker if missing" guardrail)
- `docs/05-ui/drts-design-canvas/Tenant Console.html` (design source of
  truth for the Tenant Console artboard set)
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx`
  - `TN_NAV` definition at `tenant-screens.jsx:3` — declares
    `invoices` (`tenant-screens.jsx:14`) **before** `reports`
    (`tenant-screens.jsx:15`); this is the canonical nav order the parent
    must mirror.
  - `TN_Reports` artboard at `tenant-screens.jsx:316`.
- `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`
  (existing `createTenantReportJob` / `listTenantReportJobs` controller —
  the contract surface the route consumes without expansion)
- `packages/api-client/src/index.ts` (existing
  `createTenantReportJob` / `listTenantReportJobs` client methods)
- `packages/contracts/src/index.ts:3147-3180`:
  - `ReportArtifactRecord.downloadUrl: string` — already part of the
    contract; the tenant page is permitted to read it.
  - `ReportJobRecord.artifact: ReportArtifactRecord | null` — exposed from
    `listTenantReportJobs()` per contract.
- `apps/ops-console-web/app/reports/page.tsx` (sibling consumer that already
  exposes `job.artifact.downloadUrl` as a signed download link — referenced
  by the parent reviewer as the parity precedent for finding #1).

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends only on `TEN-UI-RD-001`. That dependency is
already `done` and shipped on the active branch.

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | What it contributes to `TEN-UI-RD-016`                                                                                                                                                                |
| --------------- | ------ | ------------------ | -------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-001` | `done` | `Codex`            | 2026-05-10T16:34:46Z | `515f271`      | Tenant console shell + globals.css cleanup + `tenant-shell.stories.tsx` parity baseline; required so the `/reports` route renders post-shell and shares primitives with Wave 3 sibling tenant routes. |

Branch presence assertion:

- `515f271` resolves on `origin/feat/claude2-ui-redesign-foundation` at packet
  generation time (recorded as `push_commit` / `push_ref` in
  `ai-status.json → TEN-UI-RD-001`).

The parent does not declare any other hard `depends_on` in machine truth.
There is no contract-side dependency entry because the parent explicitly
reuses existing tenant report job APIs and adds no new contract.

### B. Downstream consumer map

`TEN-UI-RD-016` is a single-route tenant parity-fill slice. Its downstream
consumers are not other `ai-status.json` tasks but the Wave 3 tenant closeout
and sibling parity reviewers.

| Consumer                                                     | Relationship       | Why `TEN-UI-RD-016` matters                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-099` Wave 3 tenant closeout packet                | reference baseline | The Wave 3 closeout matrix needs a row for the `Reports` surface with reviewer + approved-at + shipped commit + canvas/parity anchors; this task provides those values.                                                    |
| Tenant parity-fill siblings (`TEN-UI-RD-010`..`-018`)        | structural sibling | Tenant route additions in this wave reuse the same shape (server component + server actions + parity story); the `Reports` route is a template-conformant Wave 3 example.                                                  |
| Design canvas maintenance (`docs/05-ui/drts-design-canvas/`) | anchor inventory   | The `TN_Reports` artboard at `Tenant Console.html#reports` is now load-bearing for a shipped route; canvas refactors must preserve `id="reports"`.                                                                         |
| Reviewers of `apps/tenant-console-web`                       | review boundary    | The `/reports` route is a new server-rendered surface that calls `listTenantReportJobs` / `createTenantReportJob`; reviewers should treat its server-action redirect contract as part of the tenant-portal review surface. |

Dispatch interpretation:

- No `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge **to** `TEN-UI-RD-016` at packet time. The consumers
  above are reference / template consumers, not formal dependencies, and
  should not be promoted to hard dependencies in machine truth without an
  explicit decision.

---

## 4. Implementation Evidence Map

The parent task's working-tree changes (handed off `2026-05-10T20:46:05Z`,
returned to `in_progress` after first-round review failure at
`2026-05-10T20:52:58Z`) touch four files. This section records what each
file contributes, where the reviewer can find the load-bearing lines, and —
for each file involved in a review-failure finding — the specific gap the
parent reviewer flagged.

### 4.1 `apps/tenant-console-web/app/reports/page.tsx` (new — 323 lines)

- imports `ReportJobRecord`, `ReportJobStatus`, `ReportOutputFormat` from
  `@drts/contracts` (existing types, no contract expansion); imports the
  shared `PageHero` / `SurfaceCard` / `CalloutPanel` primitives and the
  tenant API client + formatters.
- `loadReportsData()` calls `client.listTenantReportJobs()` inside a
  try/catch so transport failures surface as a `CalloutPanel` warning while
  the create form remains usable (`page.tsx:42-61`).
- `getStatusClassName()` maps the contract's `ReportJobStatus` set
  (`completed`, `running`, `failed`, `expired`, `queued`) to the existing
  tenant-console status-chip classes without inventing new statuses
  (`page.tsx:70-84`).
- `getArtifactState()` displays artifact readiness using the
  backend-published `artifact.expiresAt`, the `failed`/`expired` status,
  or a `Pending` fallback — no UI-local retention logic
  (`page.tsx:86-97`). **Note:** the function returns text only and does
  not produce or expose a download anchor; see review-failure finding §4.7
  finding #1.
- `ReportsPage` renders four KPI cards (Jobs / Running+queued / Artifacts
  ready / Completed), a create form posting to
  `createTenantReportJobAction`, a contract-scope panel mapping artboard
  intent to existing job types (`monthly_trip_report`, `revenue_summary`,
  `trip_summary`), and a job-history table (`page.tsx:99-322`).
- handles success/error feedback by reading
  `searchParams.created` / `searchParams.error` after the server action
  redirect (`page.tsx:99-144`).
- declares `export const dynamic = "force-dynamic"`, consistent with
  sibling tenant routes that need fresh per-request data
  (`page.tsx:15`).
- **Review-failure surface (finding #1):** the job-history table cell at
  `page.tsx:296-303` renders artifact readiness with `getArtifactState(job)`
  plus the static span text `"Signed artifact available"` /
  `"No artifact URL yet"`; it never emits an `<a href={job.artifact.downloadUrl}>`
  control. The contract already exposes `ReportArtifactRecord.downloadUrl`
  (`packages/contracts/src/index.ts:3150`) and the sibling
  `apps/ops-console-web/app/reports/page.tsx:1097` consumes it directly as a
  signed-download link, so the gap is at the tenant-console UI layer rather
  than the contract layer.

### 4.2 `apps/tenant-console-web/app/reports/actions.ts` (new — 56 lines)

- declares `"use server"`; imports `REPORT_OUTPUT_FORMATS` and
  `ReportOutputFormat` from `@drts/contracts` so format validation tracks
  the canonical contract enum (`actions.ts:1-8`).
- `REPORT_KIND_OPTIONS` keeps the UI-allowed kinds to a small,
  contract-known subset (`monthly_trip_report` / `revenue_summary` /
  `trip_summary`) and is enforced via `isReportKind()`
  (`actions.ts:11-21`).
- `createTenantReportJobAction(formData)` validates both fields, calls
  `client.createTenantReportJob({ jobType, format })`, then redirects with
  `?created=<jobId>` on success or `?error=<message>` on rejection — both
  drive the `CalloutPanel` rendering in `page.tsx`. Failure modes redirect
  via `redirect()`, so server-action surface remains a pure POST→redirect
  flow (`actions.ts:27-56`).
- calls `revalidatePath("/reports")` only on success so failure redirects
  do not invalidate caches (`actions.ts:49-50`).
- not implicated by either review-failure finding.

### 4.3 `apps/tenant-console-web/lib/navigation.ts` (modified)

- `lib/navigation.ts:48-55` adds a `Reports` entry under the existing
  `Billing` nav group: `href: "/reports"`, `label: "Reports"`,
  `note: "Tenant report jobs, artifact readiness, and contract-backed
export history."`. The current entry sits **above** the existing
  `Invoices` entry at `lib/navigation.ts:56-60`, so the Billing group reads
  `Reports → Invoices`.
- **Review-failure surface (finding #2):** the canonical canvas
  `TN_NAV` array at `docs/05-ui/drts-design-canvas/tenant-screens.jsx:14-15`
  declares `invoices` (`key: "invoices"`) **before** `reports`
  (`key: "reports"`). The current navigation order in
  `lib/navigation.ts` therefore inverts the artboard parity contract;
  the `Invoices`-then-`Reports` order is what the parent reviewer expects.
- no other groups, captions, or tags are touched.

### 4.4 `packages/ui-web/src/tenant-reports.stories.tsx` (new — 298 lines)

- declares `meta.title = "Tenant Console/Reports"` and a single
  `Reports` story that renders a `StoryChrome` side-by-side with the
  `TN_Reports` artboard via `anchor="reports"`
  (`tenant-reports.stories.tsx:272-298`).
- `ReportsBuiltView()` mirrors the route's KPI row, create-form copy,
  contract-scope panel, and the job-history table using the shared
  `TenantStoryShell`, `PageHeader`, `KpiRow`/`KpiCard`, `DataViewCard`,
  `DetailList`, `CalloutBanner`, `DataTable` primitives — the same
  primitive vocabulary used by adjacent Wave 3 tenant parity stories
  (`tenant-reports.stories.tsx:23-269`).
- the story's docs description explicitly names the parity intent:
  "Built parity target for the tenant reporting route. Review this story
  beside `TN_Reports` during TEN-UI-RD-016."
  (`tenant-reports.stories.tsx:276-281`).
- four sample report jobs are encoded in fixtures (statuses `completed`,
  `completed`, `running`, `failed`) so the reviewer can see every visible
  status chip and artifact state without backend traffic.
- not directly implicated by either review-failure finding, but inherits
  finding #1 indirectly: if the route exposes `downloadUrl`, the parity
  story's job-history table should also render a download anchor so the
  side-by-side comparison stays faithful.

### 4.5 `packages/ui-web/src/tenant-story-support.tsx` (modified)

- `tenant-story-support.tsx:29-30` declares the `Billing` story-shell nav
  group as `[ { href: "/reports", label: "Reports" }, { href: "/invoices",
label: "Invoices" } ]` — i.e., the same `Reports → Invoices` order as
  the runtime `lib/navigation.ts`.
- **Review-failure surface (finding #2, story-shell mirror):** the parent
  reviewer's failure note explicitly cites this file alongside
  `lib/navigation.ts`. The story-shell mirror must invert to
  `Invoices → Reports` together with the runtime change so the parity
  story does not drift from `TN_NAV`.

### 4.6 Contract-boundary evidence

- consuming surfaces:
  - `packages/api-client/src/index.ts:1190` — existing
    `createTenantReportJob` method.
  - `packages/api-client/src/index.ts:1198` — existing
    `listTenantReportJobs` method (returns `ReportJobRecord[]`).
- backend controller:
  - `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts:50`
    — `createTenantReportJob` route.
  - `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts:81`
    — `listTenantReportJobs` route.
- contract record types relevant to the failed review:
  - `packages/contracts/src/index.ts:3171` —
    `ReportJobRecord.artifact: ReportArtifactRecord | null`.
  - `packages/contracts/src/index.ts:3147-3154` — `ReportArtifactRecord`
    fields, including `downloadUrl: string` (line `3150`) and
    `expiresAt: string` (line `3151`).
- prior consumer (parallel ops-console app, parity precedent for finding
  #1):
  - `apps/ops-console-web/app/reports/page.tsx:1097` — emits
    `<a href={job.artifact.downloadUrl}>…</a>` against the same contract.
- there are no `git diff` lines under `packages/contracts/`,
  `packages/api-client/src/`, or `apps/api/src/modules/reporting-filing/`
  attributable to this task — consistent with the parent's "no contract
  expansion" guarantee. Resolving review-failure finding #1 also requires
  no contract change, since `downloadUrl` is already part of the
  existing record shape.

### 4.7 Review-failure findings (verbatim from parent `next`)

The parent reviewer's failure note in `ai-status.json → TEN-UI-RD-016.next`
(timestamped `2026-05-10T20:52:58Z`) records two findings; both are
re-anchored to working-tree evidence here.

1. `apps/tenant-console-web/app/reports/page.tsx` still renders artifact
   readiness as text only and never exposes `job.artifact.downloadUrl`,
   so the route misses the signed-download UX required by `UI-TN-11` and
   already used by `apps/ops-console-web/app/reports/page.tsx`.
   - working-tree anchor: `page.tsx:296-303` (artifact cell renders
     `getArtifactState(job)` plus a static span; no `<a href="…">` is
     emitted).
   - parity precedent: `apps/ops-console-web/app/reports/page.tsx:1097`
     emits `<a href={job.artifact.downloadUrl}>` for the same record.
   - contract surface already available:
     `ReportArtifactRecord.downloadUrl` at
     `packages/contracts/src/index.ts:3150`.
2. `apps/tenant-console-web/lib/navigation.ts` and
   `packages/ui-web/src/tenant-story-support.tsx` place `Reports` before
   `Invoices`, but the `TN_NAV` artboard keeps `Invoices` before
   `Reports`, so runtime/story shell parity regresses.
   - runtime working-tree anchor: `lib/navigation.ts:48-60` (Reports at
     `:48-55`, Invoices at `:56-60`).
   - story-shell working-tree anchor:
     `packages/ui-web/src/tenant-story-support.tsx:29-30` (Reports at
     `:29`, Invoices at `:30`).
   - canonical canvas truth:
     `docs/05-ui/drts-design-canvas/tenant-screens.jsx:14-15` (Invoices
     at `:14`, Reports at `:15`).

The parent reviewer's re-verification command set after the next round of
fixes is also recorded in the `next` field:

- `pnpm --filter @drts/tenant-console-web typecheck`
- `pnpm --filter @drts/tenant-console-web build`
- `pnpm --filter @drts/tenant-console-web test`
- `pnpm --filter @drts/ui-web build-storybook`

This packet does not propose specific diffs to close the findings; the
parent owner (`Codex2`) decides the fix shape on the next cycle.

### 4.8 Canvas anchor

- `docs/05-ui/drts-design-canvas/Tenant Console.html:79` declares
  `<DCArtboard id="reports" label="報表" …><TN_Reports /></DCArtboard>` —
  this is the anchor the parity story references via `anchor="reports"`.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:316` defines the
  `TN_Reports` component with a `PageHeader` (title `報表`, subtitle
  `月用量 · cost center 拆分 · SLA 摘要`) and a `Card`-wrapped `Table`
  whose columns are `JOB / KIND / PERIOD / FORMAT / STATUS / EXPIRES /
CREATED` — informing the parity-story column set.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:14-15` — the
  `TN_NAV` ordering reference for finding #2 (Invoices precedes Reports).

---

## 5. Acceptance Checklist

This checklist restates the parent acceptance bar as auditable line items
the parent reviewer (`Codex`) can apply against the parent's working tree.
The parent task entry's acceptance section has three bars; each is restated
below. Items already known-failing per the first review round are explicitly
marked.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` = sidecar
support gate for this packet. `[FAILED-2026-05-10]` = item known to have
failed the first review round and still pending in the working tree.

### A. Tenant-console build/test gate `[REQUIRED]`

Parent acceptance line:
`pnpm --filter @drts/tenant-console-web typecheck / build / test`

- [ ] `pnpm --filter @drts/tenant-console-web typecheck` passes against the
      working tree (parent owner self-reported pass at handoff
      `2026-05-10T20:46:05Z`; parent reviewer also re-ran during failure
      review at `2026-05-10T20:52:58Z`; reviewer should re-run after the
      next round of fixes).
- [ ] `pnpm --filter @drts/tenant-console-web build` passes against the
      working tree (parent owner self-reported pass at handoff; parent
      reviewer re-ran during failure review; reviewer should re-run
      after the next round of fixes).
- [ ] `pnpm --filter @drts/tenant-console-web test` passes against the
      working tree (parent owner self-reported pass at handoff; parent
      reviewer re-ran during failure review; reviewer should re-run
      after the next round of fixes).
- [ ] `pnpm --filter @drts/ui-web build-storybook` passes against the
      working tree (added by parent reviewer during failure review; the
      parity-story file is in `@drts/ui-web` so a Storybook build is part
      of the parity gate going forward).

### B. Storybook parity gate `[REQUIRED]`

Parent acceptance line: `Storybook 對照對應 TN_* artboard`

- [ ] `packages/ui-web/src/tenant-reports.stories.tsx` exists and exports
      a single `Reports` story under `Tenant Console/Reports`.
- [ ] The story renders `StoryChrome` with `anchor="reports"`, matching
      the `Tenant Console.html#reports` artboard id.
- [ ] The built view in the story uses the shared `TenantStoryShell` +
      `ManagementShell` chrome and the `ui-web` data primitives
      (`PageHeader`, `KpiRow`, `DataViewCard`, `DataTable`, `StatusChip`)
      — i.e., it is composed from the same primitives as the route, so a
      side-by-side review reflects parity rather than two unrelated UIs.
- [ ] No new artboard is added to
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx` and no canvas
      anchor is renamed; the existing `TN_Reports` / `id="reports"`
      anchor is the parity target.
- [ ] **`[FAILED-2026-05-10]`** Story-shell nav order
      (`packages/ui-web/src/tenant-story-support.tsx:29-30`) matches
      `TN_NAV` (`tenant-screens.jsx:14-15`): `Invoices` before `Reports`.
      Currently inverted in the working tree (per failure finding #2).
- [ ] **`[FAILED-2026-05-10]`** Parity story's job-history table reflects
      the route's signed-download UX once finding #1 is addressed (so
      side-by-side parity stays faithful after the route emits a
      `downloadUrl` anchor).

### C. Contract-boundary gate `[REQUIRED]`

Parent acceptance line:
`若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

- [ ] Route reads only via `client.listTenantReportJobs()` (existing) and
      writes only via `client.createTenantReportJob({ jobType, format })`
      (existing). No new client method is introduced.
- [ ] No file under `packages/contracts/`, `packages/api-client/src/`, or
      `apps/api/src/modules/reporting-filing/` is modified by this task —
      verified via `git status` at handoff time and still expected to
      hold after finding #1 is fixed (the `downloadUrl` field already
      exists on `ReportArtifactRecord`, so the fix does not require a
      contract change).
- [ ] The UI's report-kind option set (`monthly_trip_report`,
      `revenue_summary`, `trip_summary`) is a strict subset of the
      contract's known job types, enforced by `isReportKind()` in
      `actions.ts`.
- [ ] The UI's format option set is sourced from `REPORT_OUTPUT_FORMATS`
      in `@drts/contracts` (validated by `isReportFormat()` in
      `actions.ts`); UI display order (`xlsx`, `csv`, `pdf`) is a UI
      ordering choice, not a contract change.
- [ ] Artifact TTL surface is read from `job.artifact.expiresAt` only;
      the route does not compute, persist, or override expiry locally.
- [ ] **`[FAILED-2026-05-10]`** Job-history artifact column exposes
      `job.artifact.downloadUrl` as an `<a href="…">` signed-download
      control (parity precedent at
      `apps/ops-console-web/app/reports/page.tsx:1097`); currently the
      tenant route only renders the readiness text per finding #1.
- [ ] No blocker ticket was opened against discussion_planning,
      consistent with the parent's handoff message ("No backend contract
      expansion was introduced").

### D. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner/reviewer
      assignment for both the sidecar and the parent task.
- [ ] This packet does not snapshot live parent `status` / `next` /
      `last_update` values, nor invent commit/push evidence the parent
      has not yet recorded; those remain authoritative in
      `ai-status.json` at parent `done` time.
- [ ] This packet records the parent reviewer's first-round failure
      findings as known-failing acceptance items, anchored to the
      working-tree lines and the canonical canvas truth, without
      prescribing the fix.
- [ ] This packet does not edit canonical truth — the parent's
      working-tree files, the design canvas, the contract surfaces, and
      `ai-status.json` remain untouched by this sidecar.
- [ ] This packet does not record `done` evidence for the parent task;
      that step is the parent owner's responsibility after parent review
      approval.

---

## 6. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section (§2) matches the current
  `ai-status.json` fields for both `TEN-UI-RD-016-SIDECAR-REVIEW` and
  `TEN-UI-RD-016`, including the parent's reopened `in_progress` state and
  the failure-event timestamp `2026-05-10T20:52:58Z`.
- confirm the upstream dependency table (§3.A) matches `TEN-UI-RD-001`'s
  recorded `commit_hash` / `commit_recorded_at` / `commit_reviewer` and
  the branch presence assertion holds.
- confirm the implementation evidence map (§4) faithfully describes the
  five working-tree files (`page.tsx`, `actions.ts`, `navigation.ts`,
  `tenant-reports.stories.tsx`, `tenant-story-support.tsx`) without
  smuggling in changes the parent did not make.
- confirm §4.7 reproduces the failure findings without paraphrasing them
  away from the parent reviewer's wording, and that each finding is
  anchored to a concrete file/line in the current working tree.
- confirm the acceptance checklist (§5) is a faithful expansion of the
  parent acceptance bar, with the failed items explicitly tagged
  `[FAILED-2026-05-10]` rather than silently dropped.
- confirm the packet remains support-only and does not modify the
  parent's implementation files, the design canvas, the contract
  surfaces, or `ai-status.json`.

For `Codex` (the parent reviewer) — this packet is **not** the canonical
review of the parent task. Codex's review still runs against the parent
working tree using the §5 checklist as a tool. This packet is a stable
companion document that captures the evidence map at handoff time and now
also records the first-round failure surfaces.

---

## 7. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for the
Wave 3 tenant `Reports` route slice. The parent task `TEN-UI-RD-016` itself
remains canonical; this packet is a reviewer companion that:

- pins the five working-tree files and the contract surfaces they consume.
- records the parent owner's self-reported verifications and the explicit
  "no contract expansion" guarantee.
- records the parent reviewer's first-round failure findings as
  known-failing acceptance items, anchored to working-tree lines and the
  canonical canvas truth, without prescribing the fix.
- restates the three-line parent acceptance bar as an auditable
  checklist, with failed items explicitly tagged.
- maps the parent's structural anchors (canvas artboard `TN_Reports`,
  `TN_NAV` order, parity story `Tenant Console/Reports`, navigation
  entries in both runtime and story-shell mirrors).
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, future `commit_hash` / `push_*`) to `ai-status.json`.

The packet is now consistent with the post-failure machine truth: the
parent is back in `in_progress`, the two failure findings are anchored to
working-tree evidence, and the acceptance checklist explicitly marks the
items that the next review round must re-confirm. After sidecar review
approval the packet is intended to remain in
`support/sidecars/TEN-UI-RD-016/` as a stable reference; it is not absorbed
into any other artifact and does not change canonical truth. When the
parent owner finalizes the parent's `done` closeout in a later cycle, this
packet's evidence map will continue to read against the same set of files
(since the parent does not plan to mutate canvas or contracts), so the
packet does not need follow-up edits at parent-`done` time beyond
re-marking the failed items as resolved if the parent reviewer wants a
post-approval snapshot.
