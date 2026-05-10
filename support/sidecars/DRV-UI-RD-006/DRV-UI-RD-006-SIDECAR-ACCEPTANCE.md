# DRV-UI-RD-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-UI-RD-006` — Reskin Earnings + Shift
**Parent Owner:** `Codex2` (per `ai-status.json -> DRV-UI-RD-006.owner`)
**Parent Reviewer:** `Codex` (per `ai-status.json -> DRV-UI-RD-006.reviewer`)
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC) — initial draft
**Refreshed:** `2026-05-10` (UTC) — Codex2 reopen incorporated;
sections 1, 4.3, and 4.5 rewritten against the live source of
`apps/driver-app/app/earnings.tsx`, `apps/driver-app/app/shift.tsx`,
`apps/driver-app/lib/api-client.ts`, and
`packages/contracts/src/index.ts -> ShiftRecord` to drop the
overstated parent-behavior claims (no `getDriverId` call from
earnings; no existing multi-platform availability write path on
shift; shift start / end handlers do not navigate via `useRouter`).
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> DRV-UI-RD-006-SIDECAR-ACCEPTANCE.status` directly;
this packet does not snapshot it.

This packet is the forward-looking acceptance map for parent
`DRV-UI-RD-006`. At packet write the parent is `todo` in machine
truth — the parent owner (`Codex2`) has not yet handed off any diff,
so each acceptance gate below is phrased as a property the parent
diff must satisfy once the parent moves to `in_progress` and then to
`review`. The sidecar reviewer (`Codex2`) is the same lane as the
parent owner (`Codex2`); the sidecar review only audits packet
accuracy and does **not** approve the parent diff — only the parent
reviewer (`Codex`) may approve `DRV-UI-RD-006`. This packet does not
pre-approve any future parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field, the planning-ref
  Wave 4 task line for `DRV-UI-RD-006`, and the cross-cutting
  acceptance gates into a concrete, citation-anchored acceptance
  checklist for the Earnings + Shift reskin
  (`apps/driver-app/app/earnings.tsx` backing the design canvas's
  `ScreenEarnings` reference, and `apps/driver-app/app/shift.tsx`
  backing `ScreenShift`).
- Pin the dependency map and confirm each upstream slice is `done`
  in machine truth.
- Record the formal downstream tasks that depend on `DRV-UI-RD-006`
  so reviewer attention during parent finalize can correctly weigh
  blast-radius risk (Wave 4 driver closeout packet `DRV-UI-RD-009`).
- Preserve a reviewer-handoff command block the assigned sidecar
  reviewer (`Codex2`) can run after this packet is written.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the
  planning-ref workbreakdown doc, or the parent task's machine-truth
  fields (`ai-status.json -> DRV-UI-RD-006`)
- editing `apps/driver-app/app/earnings.tsx`,
  `apps/driver-app/app/shift.tsx`, or any other parent-write-scope
  file under `apps/driver-app/`
- pre-running the parent's acceptance commands, opening a
  parent-scoped commit, or altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent
  owner finalizes it
- approving DRV-UI-RD-006 itself (only `Codex` may do that on the
  parent row, as the live parent reviewer)
- altering DRTS / SmartRides X / Metro Hail earnings semantics —
  earnings authority (DRTS settlement vs platform-authoritative
  display) is contract-driven and must remain read-only context for
  this slice
- altering shift lifecycle behavior (start/end shift, odometer
  capture) — the planning-ref Wave 4 guardrail explicitly forbids
  changing backend behavior, location heartbeat, and provisioning
  flow, so existing shift network semantics stay read-only context.
  Note: at packet write `app/shift.tsx` has no multi-platform
  availability write path of its own (no availability fields on
  `ShiftRecord`, no availability method consumed in
  `apps/driver-app/lib/api-client.ts` from this screen); the
  design-canvas availability section is a forward-looking
  requirement that must be satisfied without inventing a new
  availability write endpoint here — see section 4.5 below.
- rewriting `apps/driver-app/lib/api-client.ts` networking,
  `apps/driver-app/lib/money.ts` formatting helpers, or
  `apps/driver-app/lib/operational-labels.ts` label normalizers —
  the parent acceptance line "Existing money formatting helpers are
  reused" forbids forking these helpers

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> DRV-UI-RD-006-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-006`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `DRV-UI-RD-001` (mirrors the parent's dependency set)
- artifacts:
  `support/sidecars/DRV-UI-RD-006/DRV-UI-RD-006-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Read live `status` and `next` directly from `ai-status.json`; this
packet does not freeze either field.

### Parent — `ai-status.json -> DRV-UI-RD-006`

Persistent fields:

- title: `Reskin Earnings + Shift`
- phase: `Wave 4`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on: `DRV-UI-RD-001`
- artifacts: `apps/driver-app/`
- acceptance (verbatim from the row):
  - `pnpm --filter @drts/driver-app typecheck / lint / test`
  - `Expo dev build on Android emulator + manual screenshot vs canvas`
  - `Backend / location heartbeat / provisioning flow 不可動`
- planning_ref:
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- `next` (at packet write): records the chairman reassignment from
  `Gemini` to `Codex2` because the `Gemini` lane is exact
  capacity-paused since `2026-05-09T23:08:16Z`; do not reread the
  packet to learn the live `next` field — read it from
  `ai-status.json` directly when the parent owner picks the slice up.

Read live `status` and `next` directly from `ai-status.json`; this
packet does not freeze either field.

### Upstream dependency — `ai-status.json -> DRV-UI-RD-001`

At packet write:

- status=`done`
- commit_hash=`5db92c8312953f584c0ddb51b366ea177b78b978`
- commit_subject=`feat(DRV-UI-RD-001): wire ui-tokens into driver-app
RN primitives`
- commit_agent=`Codex`
- commit_reviewer=`Codex2`
- closeout `next`: notes that the Android emulator / manual
  screenshot acceptance gate remains pending outside the closeout
  environment because adb / emulator SDK is unavailable there.
  Reviewer should treat the same external-environment caveat as in
  scope for `DRV-UI-RD-006`: the typecheck / lint / test trio is
  executable inside the repo sandbox, but the Expo Android dev-build
  screenshot acceptance line will continue to depend on an external
  emulator-capable environment.

### Planning ref anchor — `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`

Wave 4 task line for `DRV-UI-RD-006`:

> `DRV-UI-RD-006` Reskin Earnings + Shift
> (`app/earnings.tsx`, `app/shift.tsx`)

Wave-level common acceptance gates (apply to every Wave 4 driver
reskin including `DRV-UI-RD-006`):

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test`
- `pnpm --filter @drts/driver-app lint`
- `Expo dev build run on Android emulator (manual screenshot vs design canvas)`
- Wave depends on Wave 1 (`TOK-UI-001`); Wave 4 may run in parallel
  with Wave 3.

Wave-level guardrails (apply to every Wave 4 driver reskin including
`DRV-UI-RD-006`):

- 禁止改變 backend 行為、location heartbeat、provisioning flow
- A/B variants 不實作 (從 Workspace A/B、Inbox A/B 中各選一個落地)
- 既有 forwarded sync_failed 處理邏輯比 mock 更強，不可降級

### Design canvas anchor — `docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`

Section 6 — Earnings (source: `ScreenEarnings`):

> Must implement:
>
> - Net income card with gross, platform fee, pending settlement.
> - Per-platform breakdown:
>   - DRTS: DRTS settlement authority
>   - SmartRides X: platform settlement authority
>   - Metro Hail: empty/degraded state
> - Monthly statement rows.
>
> Acceptance:
>
> - External platform earnings are marked as reference/platform-authoritative.
> - Existing money formatting helpers are reused.

Section 7 — Shift (source: `ScreenShift`):

> Must implement:
>
> - Active shift card, timer, vehicle, odometer, start location, expected off time.
> - Today summary KPIs.
> - Multi-platform availability section.
> - Sticky danger outline `下班打卡`.
>
> Acceptance:
>
> - Existing shift screen behavior stays intact.
> - Visual hierarchy follows the design.

---

## 3. Dependency Map

### Upstream (must be `done` before the parent diff may close)

| Task ID         | Title                                                        | Status @ packet write | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-001` | Wire `@drts/ui-tokens` into driver-app + RN primitives layer | `done`                | Commit `5db92c8` on `origin/feat/claude2-ui-redesign-foundation`. Provides the `@/components/ui` / `@/components/ui-rn` token-driven primitives that `app/earnings.tsx` and `app/shift.tsx` already import (e.g. `PageHeader`, `ActionButton`, `BottomActionBar`, `EmptyState`, `ErrorBanner`, `IconButton`, `StatusChip`, `SegmentedControl`, `InfoTile`, `ListCard`, `AuthorityBanner`, `Tokens`). Wave 1 upstream `TOK-UI-001` is folded into this slice's closeout. |

Transitive upstream noted for reviewer context only (not on the
parent row's own `depends_on` list):

- `TOK-UI-001` (Wave 1) — provides the `@drts/ui-tokens` package the
  driver-app primitives consume. Already absorbed into
  `DRV-UI-RD-001`'s closeout.

### Sibling Wave 4 driver reskins

These are not strict dependencies, but they share the same primitive
layer, the same wave-level guardrails, and the same closeout packet,
so reviewer attention should track visual-vocabulary drift across
the wave:

- `DRV-UI-RD-002` — Reskin Workspace cockpit (`app/index.tsx`,
  `app/onboarding.tsx`).
- `DRV-UI-RD-003` — Reskin Trip (`app/trip.tsx`).
- `DRV-UI-RD-004` — Reskin Inbox (`app/jobs.tsx`).
- `DRV-UI-RD-005` — Reskin Platform Presence
  (`app/platform-presence.tsx`).
- `DRV-UI-RD-007` — Reskin SOS (`app/incident.tsx`).
- `DRV-UI-RD-008` — Reskin Settings (`app/settings.tsx`).

### Downstream

- `DRV-UI-RD-009` — Wave 4 driver closeout packet. Closeout cannot
  certify the Wave 4 driver surface unless every Wave 4 reskin
  including `DRV-UI-RD-006` has reached `done` with the wave-level
  acceptance trio recorded. Read the live `depends_on` list and
  status of `DRV-UI-RD-009` from `ai-status.json` rather than
  trusting this packet.

---

## 4. Forward-looking Parent Acceptance Checklist

These gates restate the parent's `acceptance` field, the planning-ref
wave-level gates, and the design-canvas section-6 / section-7
acceptance lines as concrete properties the parent diff must satisfy.
This checklist does **not** approve the parent diff and is **not**
machine truth — it is reviewer ammunition for the parent reviewer
(`Codex`) when the parent reaches `review`.

### 4.1 Build / static-analysis gates (verbatim from parent row)

- [ ] `pnpm --filter @drts/driver-app typecheck` runs clean on the
      parent branch.
- [ ] `pnpm --filter @drts/driver-app lint` runs clean on the parent
      branch.
- [ ] `pnpm --filter @drts/driver-app test` runs clean on the parent
      branch (existing earnings / shift tests must continue to pass; any
      new test added by the parent owner must accompany the reskin
      rather than displace existing coverage).

### 4.2 Visual / manual gate (verbatim from parent row)

- [ ] Expo dev build executed on an Android emulator with a manual
      screenshot diff against `ScreenEarnings` and `ScreenShift` in the
      design canvas. Same external-environment caveat as
      `DRV-UI-RD-001`: if the closeout environment lacks adb / emulator
      SDK, the parent owner must explicitly record that the screenshot
      gate ran in an external emulator-capable environment, with a
      pointer to the screenshot evidence.

### 4.3 Behavioral guardrails (verbatim from parent row + wave gates)

- [ ] Backend behavior unchanged: no changes to
      `apps/driver-app/lib/api-client.ts` request/response shapes, no new
      endpoints, no contract changes. The current api-client entry points
      consumed by these two screens must continue to be used unchanged:
  - `app/earnings.tsx` currently imports only `getDriverClient` and
    `isDriverIdentityProvisioned` (see
    `apps/driver-app/app/earnings.tsx` import block) — it does not
    call `getDriverId` because the listing endpoints it uses
    (`listEarningsByPlatform`, `listEarnings`, `listStatements`)
    resolve the driver server-side from the bearer identity. The
    parent diff must not introduce a new `getDriverId` call from
    earnings just to satisfy a visual refactor.
  - `app/shift.tsx` currently imports `getDriverClient`, `getDriverId`,
    and `isDriverIdentityProvisioned` and calls `getDriverId()` only
    inside `loadShifts`, `handleClockIn`, and `handleClockOut`
    (lines 120, 161, 192). These three call sites and their argument
    shape must be preserved by the parent diff.
- [ ] Location heartbeat unchanged: no edits to
      `apps/driver-app/lib/driver-location-heartbeat.ts` and no new
      callers from the earnings / shift screens.
- [ ] Provisioning flow unchanged: no edits to
      `apps/driver-app/lib/driver-identity-bootstrap.ts` and no change
      to the `isDriverIdentityProvisioned()` early-return gate that
      `app/earnings.tsx` (line 182) and `app/shift.tsx` (line 72)
      consult before rendering data.
- [ ] No A/B variants implemented in this slice (wave guardrail).
- [ ] `forwarded sync_failed` handling logic must not be degraded
      below the existing implementation (wave guardrail). Earnings /
      shift do not directly own this logic today, but any shared
      component the reskin touches that participates in forwarded-state
      rendering must not regress.

### 4.4 Earnings reskin coverage (design canvas section 6)

- [ ] Net income card renders gross, platform fee, and pending
      settlement, sourced from the existing
      `PlatformEarningsSummary` / `PlatformEarningsByPlatformResponse`
      contracts (`@drts/contracts`) — no new contract fields.
- [ ] Per-platform breakdown distinguishes:
  - DRTS as DRTS settlement authority (the
    `isOwnedPlatformCode` branch in
    `@/components/earnings-by-platform`).
  - SmartRides X as platform settlement authority (the
    `isShadowOnlyPlatformCode` branch — external-platform earnings
    must be marked as reference / platform-authoritative, matching
    the design-canvas acceptance line).
  - Metro Hail rendered in its empty / degraded state when no
    earnings are reported.
- [ ] Monthly statement rows continue to render
      `DriverStatementRecord[]` and respect the existing
      `DriverPayoutStatus` labels via
      `formatDriverPayoutStatusLabel`. Existing money formatting helpers
      (`formatMoney`, `sumMoneyAmounts` from `@/lib/money`) must be
      reused — no parallel formatter introduced inside the screen.
- [ ] Period segmentation (`today` / `week` / `month`) continues to
      drive earnings fetches; segment selection must remain visible and
      operable in the reskinned layout.

### 4.5 Shift reskin coverage (design canvas section 7)

Read this section as forward-looking design coverage: the design
canvas (`ScreenShift`) adds several elements that the current
`app/shift.tsx` does **not** yet expose (no timer, no
`expectedOffTime`, no today-KPI section, no multi-platform
availability section, no availability write path in either
`apps/driver-app/lib/api-client.ts` or
`packages/contracts/src/index.ts -> ShiftRecord`). The parent diff
must satisfy the design without inventing contract fields and
without regressing the existing wave-level guardrail that backend
behavior, location heartbeat, and provisioning flow stay
untouched. Concretely:

- [ ] Active shift card renders the fields the existing
      `ShiftRecord` contract already exposes — `vehicleId`,
      `clockedInAt`, `startLocation`, `startOdometer` — using the
      reskin's primitives. Today these are rendered via
      `ShiftDetailRow` helpers (`app/shift.tsx:299–314`); the parent
      diff may regroup them visually but must not drop any of these
      four fields and must not add new `ShiftRecord` fields.
- [ ] Timer / expected-off-time visuals from the design canvas
      must derive purely from existing data
      (`clockedInAt` and any locally computed elapsed-time view) — no
      new contract fields and no new endpoint added solely for this
      visual.
- [ ] Today summary KPI section: if the parent diff adds the
      design's KPI tiles, they must source from data the screen can
      already obtain via `listShifts(driverId)` (today the screen only
      reads the `active` shift; any KPI aggregation must reuse the
      existing list response, not introduce a new endpoint).
- [ ] Multi-platform availability section: the current shift
      screen has no availability-write path
      (`apps/driver-app/lib/api-client.ts` exposes no
      `setAvailability` / `setPresence` method that `shift.tsx`
      consumes, and `ShiftRecord` carries no availability fields). If
      the parent diff renders the multi-platform availability section
      it must do so via the existing platform-presence surface owned
      by `app/platform-presence.tsx` / `DRV-UI-RD-005` (e.g. embedded
      component reuse or read-only display sourced from that surface)
      rather than introducing a new availability write API from
      `shift.tsx`. If a write capability is required, that is a
      separate slice and must not land inside `DRV-UI-RD-006`.
- [ ] Sticky bottom action: the current screen already renders the
      end-shift CTA via `BottomActionBar` with `variant="danger"`
      (`app/shift.tsx:375–395`) labelled `下線打卡`. The parent diff
      may align the label with the design canvas wording (`下班打卡`)
      but must preserve the danger variant and the bottom-anchored
      placement. The clock-in CTA uses `variant="primary"` and must
      keep that variant.
- [ ] Odometer validation rule preserved: the existing
      `getOdometerValidationMessage` semantics in `app/shift.tsx`
      (`app/shift.tsx:23–39`) must remain — digits-only via
      `ODOMETER_PATTERN`, `Number.isSafeInteger` guard, and the same
      user-facing validation messages.
- [ ] `useRouter` usage is preserved at its current call sites
      only: the two `router.push("/onboarding")` navigations from the
      unprovisioned and `shiftEnabled === false` EmptyState fallbacks
      (`app/shift.tsx:144` and `app/shift.tsx:232`) must continue to
      exist. The shift start / end handlers do **not** currently
      navigate via `useRouter` — they use `Alert.alert` plus local
      state updates (`setActiveShift` / `setSubmissionError`); the
      parent diff must not silently introduce navigation on
      clock-in / clock-out as part of the reskin.

### 4.6 Token / primitive hygiene

- [ ] All visual changes go through `@/components/ui` /
      `@/components/ui-rn` token-driven primitives wired in by
      `DRV-UI-RD-001` (e.g. `PageHeader`, `ActionButton`, `IconButton`,
      `StatusChip`, `SegmentedControl`, `InfoTile`, `ListCard`,
      `AuthorityBanner`, `EmptyState`, `ErrorBanner`, `BottomActionBar`,
      `Tokens`). No new ad-hoc `StyleSheet` color constants that
      duplicate token values.
- [ ] No regression in import surface: `app/earnings.tsx` continues
      to consume `@drts/contracts` types and `@/lib/money` helpers
      rather than forking them.

### 4.7 Commit-evidence prep (parent finalize)

- [ ] Parent commit subject is `feat(DRV-UI-RD-006): …` form,
      matching the `task id in subject` rule.
- [ ] Parent commit body carries trailers `LLM-Agent: Codex2`,
      `Task-ID: DRV-UI-RD-006`, `Reviewer: Codex`.
- [ ] Parent commit is pushed with a normal non-force push;
      `PUSH_REMOTE` and `PUSH_BRANCH` are recorded on the
      `ai-status.sh done DRV-UI-RD-006` call.

---

## 5. Reviewer Hand-off Notes

For the sidecar reviewer (`Codex2`):

- The packet's acceptance is the three sidecar bullets on
  `ai-status.json -> DRV-UI-RD-006-SIDECAR-ACCEPTANCE.acceptance` —
  not the parent's `acceptance` field. Approve the sidecar if and
  only if:
  1. This file exists at the artifact path above.
  2. The packet stays inside the sidecar scope (no canonical truth,
     no runtime, no parent-row mutation).
  3. The dependency map agrees with the live state of
     `ai-status.json -> DRV-UI-RD-001` (already `done` at packet
     write).
- Do **not** approve `DRV-UI-RD-006` itself from this packet — that
  remains `Codex`'s call as the live parent reviewer.
- If the live parent owner / reviewer assignment has rotated again
  since packet write, treat `ai-status.json` as truth and request a
  packet refresh rather than rewriting machine truth from this
  packet.

Suggested reviewer command block (run from repo root):

```bash
# Inspect live machine truth for the sidecar + parent + dep
python3 - <<'PY'
import json, pathlib
data = json.loads(pathlib.Path("ai-status.json").read_text())
for tid in ("DRV-UI-RD-006-SIDECAR-ACCEPTANCE",
            "DRV-UI-RD-006",
            "DRV-UI-RD-001"):
    row = next((t for t in data["tasks"] if t["id"] == tid), None)
    print(tid, row.get("status"), "owner=", row.get("owner"),
          "reviewer=", row.get("reviewer"))
PY

# Sanity-check the packet exists at the declared artifact path
ls -l support/sidecars/DRV-UI-RD-006/DRV-UI-RD-006-SIDECAR-ACCEPTANCE.md

# Approve the SIDECAR row only (not the parent) once content review
# passes.  Replace REVIEW_NOTES_ZH as appropriate.
AI_NAME=Codex2 REVIEW_NOTES_ZH="Sidecar packet content reviewed; \
parent DRV-UI-RD-006 still requires Codex's separate approval." \
  scripts/ai-status.sh approve DRV-UI-RD-006-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet approved; parent row left to its own reviewer."
```

---

## 6. Packet Provenance

- Generated by sidecar owner `Claude` on `2026-05-10` (UTC) under
  dispatch task `DRV-UI-RD-006-SIDECAR-ACCEPTANCE`.
- Refreshed by sidecar owner `Claude` on `2026-05-10` (UTC) after
  Codex2 reopened the packet for overstating current parent behavior;
  sections 1, 4.3, and 4.5 were rewritten with citations grounded in
  the live source (file paths + line numbers) and the claims that
  earnings called `getDriverId`, that shift had an existing
  multi-platform availability write path, and that shift
  start / end handlers navigated via `useRouter` were removed.
- Sources cited:
  - `ai-status.json` rows for `DRV-UI-RD-006-SIDECAR-ACCEPTANCE`,
    `DRV-UI-RD-006`, `DRV-UI-RD-001`.
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
    Wave 4 task line and wave-level acceptance/guardrails block.
  - `docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`
    sections 6 (Earnings) and 7 (Shift).
  - `apps/driver-app/app/earnings.tsx` and
    `apps/driver-app/app/shift.tsx` import surfaces, read-only, to
    pin which primitives and helpers the parent diff must keep
    using.
- No canonical truth, planning ref, runtime code, or parent
  machine-truth field was mutated to produce this packet.
