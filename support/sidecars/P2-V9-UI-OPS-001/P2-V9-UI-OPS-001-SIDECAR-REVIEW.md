# P2-V9-UI-OPS-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `P2-V9-UI-OPS-001`  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Claude2`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-06-28` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not modify canonical truth, the parent runtime
surface, or the parent task row. It packages the repo facts that a reviewer needs to
reconstruct the current `P2-V9-UI-OPS-001` state, including the approved repair
delta and the current verification drift now visible on the integrated head.

## 1. Scope Boundary

In scope:

- summarize the parent task's live machine-truth state and current branch anchors
- restate the AV fallback / passenger recovery / sandbox exceptions evidence against
  the committed UI surface
- isolate the approved repair delta from unrelated `origin/dev` movement
- record fresh verification results from this worktree, including failures
- hand off a reviewer-facing packet for `P2-V9-UI-OPS-001-SIDECAR-REVIEW`

Out of scope:

- editing `ai-status.json` by hand or changing the parent task's `review` state
- modifying `apps/ops-console-web/**`, `packages/contracts/**`, or any other parent
  implementation file
- fixing the current type/output drift that causes live `typecheck` / `build` to fail
- reinterpreting the design canvas or inventing a new UI direction

## 2. Machine-Truth & Branch Anchors

### Sidecar row: `P2-V9-UI-OPS-001-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` at packet write time, pending handoff
- helper_parent=`P2-V9-UI-OPS-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/P2-V9-UI-OPS-001/P2-V9-UI-OPS-001-SIDECAR-REVIEW.md`

### Parent row: `P2-V9-UI-OPS-001`

- status=`review`
- owner=`Codex`
- reviewer=`Claude2`
- last_update=`2026-06-28T16:04:42Z`
- acceptance:
  - `AV fallback screens match v9 canvas`
  - `same booking context preserved`
  - `ETA update visible`
  - `messageCode rendered without internal reason leak`
  - `no surcharge UI`
  - `typecheck/build evidence recorded`

Important: the parent row is still `review`. Even though the repaired UI surface is
already visible on `origin/dev`, this packet does **not** treat the parent as
`review_approved` or `done`.

### Commit / branch lineage

| Anchor | Meaning | Evidence |
| --- | --- | --- |
| `4e8beab82` | original feature commit | `feat(P2-V9-UI-OPS-001): implement av fallback ops runtime` |
| `4f7ff94fe` | owner finalize metadata commit | same runtime tree as `4e8beab82`; no surface diff in `git diff --stat 4e8beab82 4f7ff94fe --` |
| `6a468b879` | approved repair parity | only 4 files changed, replacing 3 inline reason strings with translation keys |
| `83c1b6818` | current integrated head | merged repair surface plus separate dashboard compatibility fix |

Current refs:

- `claude2/p2-v9-ui-ops-001` -> `83c1b6818db5cd75fe905c6dd2cc4644a63a6d89`
- `origin/dev` -> `83c1b6818db5cd75fe905c6dd2cc4644a63a6d89`
- this sidecar branch `codex/p2-v9-ui-ops-001-sidecar-review` -> `83c1b6818db5cd75fe905c6dd2cc4644a63a6d89`
- `codex/p2-v9-ui-ops-001` -> `6a468b8798ffdf5b13de14122f7aa90352503e05`

Interpretation:

- `6a468b879` is the clean parent-scoped repair anchor.
- `83c1b6818` is the same repaired AV-fallback surface after integration onto a newer
  `origin/dev`, with extra non-parent churn around it.

## 3. Delivered Surface vs Canvas

| Surface | Canvas anchor | Runtime anchor | What matches |
| --- | --- | --- | --- |
| AV fallback monitor | `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx:18-73` | `apps/ops-console-web/app/av-fallback/page.tsx:195-362` | stage progress, alert card header, booking/passenger/vehicle/ETA facts, ops action block, recovery / exceptions links |
| Passenger recovery | `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx:76-113` | `apps/ops-console-web/app/av-fallback/passenger-recovery/[orderId]/page.tsx:168-333` | same-booking recovery context, revised ETA, passenger-visible message block, visibility guardrail, no-surcharge note |
| Sandbox exceptions | `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx:116-148` | `apps/ops-console-web/app/av-fallback/sandbox-exceptions/page.tsx:177-295` | backend-authored exception table, severity/status pills, single action cell driven by emitted actions |

The implementation stays on the ops realm via `buildCanvasTheme({ surface: "ops", dark:
true, density: "compact" })` in all three pages and does not introduce raw hex theme
inventories into the parent surface.

## 4. Acceptance Crosswalk

| Acceptance / brief item | Evidence | Result |
| --- | --- | --- |
| `AV fallback screens match v9 canvas` | the three runtime pages mirror the three canvas functions above; monitor progress UI is implemented at `app/av-fallback/page.tsx:283-355`, passenger recovery layout at `passenger-recovery/[orderId]/page.tsx:194-330`, sandbox exceptions table at `sandbox-exceptions/page.tsx:182-291` | `surface-aligned` |
| `same booking context preserved` | booking context is derived once in `lib/ops-av-fallback.ts:222-249`; monitor cards render it at `app/av-fallback/page.tsx:289-293`; recovery reuses the original booking/order facts at `passenger-recovery/[orderId]/page.tsx:203-212`; supporting copy is explicit in `lib/translations.ts:130-132` and `:4455-4457` | `supported` |
| `ETA update visible` | monitor cards show revised ETA at `app/av-fallback/page.tsx:305-309`; recovery shows current ETA and calculation time at `passenger-recovery/[orderId]/page.tsx:210-211`; copy anchors exist at `lib/translations.ts:108`, `:150`, `:4433`, `:4475` | `supported` |
| `messageCode rendered without internal reason leak` | recovery derives only `passengerDisclosure.messageCode` at `passenger-recovery/[orderId]/page.tsx:137-156`, renders it at `:232-245`, and reiterates the guardrail at `:267-279`; the translation contract says "Render the backend messageCode only" at `lib/translations.ts:133-137` and `:4458-4462` | `supported` |
| `no surcharge UI` | recovery renders a dedicated info banner at `passenger-recovery/[orderId]/page.tsx:325-330`; translation copy says `No fallback surcharge UI is shown here.` at `lib/translations.ts:152-153` and `此畫面不顯示 fallback surcharge UI。` at `:4477` | `supported` |
| `availableActions + ActionReceipt` from the brief | each page selects CTAs from emitted `availableActions` via `selectAlertActions(...)` and `buildAlertActionPath(...)` at `app/av-fallback/page.tsx:83-123`, `passenger-recovery/[orderId]/page.tsx:70-108`, and `sandbox-exceptions/page.tsx:97-147`; the shared `components/ops-write-action-list.tsx:65-77` posts the action and `:177-183` renders the returned `ActionReceipt.auditId` | `supported` |
| `typecheck/build evidence recorded` | historical evidence exists in the parent `review_notes_zh`; fresh rerun results are recorded in §6 below | `recorded-with-drift` |

## 5. Repair Delta Isolation

The approved repair delta is the diff from `4e8beab82` to `6a468b879`.

`git diff --stat 4e8beab82 6a468b879 --` reports:

- `apps/ops-console-web/app/av-fallback/page.tsx`
- `apps/ops-console-web/app/av-fallback/passenger-recovery/[orderId]/page.tsx`
- `apps/ops-console-web/app/av-fallback/sandbox-exceptions/page.tsx`
- `apps/ops-console-web/lib/translations.ts`

The actual behavior change is narrow:

- 3 inline reason strings became translation lookups:
  - `avFallback.actions.reason.avMonitor`
  - `avFallback.actions.reason.passengerRecovery`
  - `avFallback.actions.reason.sandboxException`
- the new translation keys were added in both `en` and `zh`
- no CTA selection logic, no screen layout, and no passenger-facing disclosure logic
  changed across that repair diff

Relevant repair hunk anchors:

- `app/av-fallback/page.tsx:115-121`
- `app/av-fallback/passenger-recovery/[orderId]/page.tsx:100-106`
- `app/av-fallback/sandbox-exceptions/page.tsx:137-145`
- `lib/translations.ts:183-188` and `:4506-4511`

## 6. Verification Evidence & Current Drift

### Historically recorded parent evidence

The parent task's current `review_notes_zh` says the repair branch re-review already
confirmed:

- repair vs original approved commit differs only in the 3 reason strings moved to
  `t()` / `translations.ts`
- the repair branch passed `node scripts/i18n-guard.mjs`
- the repair branch passed `pnpm --filter @drts/ops-console-web typecheck`
- the repair branch passed `pnpm --filter @drts/ops-console-web build`
- PR `#988` CI was green on the relevant gates

This packet treats those notes as historical evidence, not as a substitute for a live
rerun on the current integrated head.

### Fresh rerun from this worktree on `2026-06-28` UTC

| Command | Result | Notes |
| --- | --- | --- |
| `node scripts/i18n-guard.mjs` | `PASS` | `i18n-guard: OK (403 files scanned across 10 apps, 0 exemption(s))` |
| `pnpm --filter @drts/ops-console-web typecheck` | `FAIL` | `app/dashboard/page.tsx(922,5): 'phase2SandboxKpiDashboard' does not exist in type 'OperationalObservabilitySnapshot'` |
| `pnpm --filter @drts/ops-console-web build` | `FAIL` | same type error during Next.js typecheck stage |

### Why the live failure matters

The failure is **not** in the AV fallback pages themselves. The current integrated head
contains a dashboard compatibility change at `apps/ops-console-web/app/dashboard/page.tsx:922`
that sets `phase2SandboxKpiDashboard: null`.

Source vs resolved-type drift:

- this worktree's source contract **does** include the field at
  `packages/contracts/src/index.ts:5688-5701`
- `apps/ops-console-web/node_modules/@drts/contracts` is a symlink to the canonical-root
  package directory `/home/edna/workspace/drts-fleet-platform/packages/contracts`
- the resolved declaration file actually used by the app,
  `/home/edna/workspace/drts-fleet-platform/packages/contracts/dist/index.d.ts:3861-3874`,
  does **not** include `phase2SandboxKpiDashboard`

Implication for review:

- the AV fallback UI evidence in §§3-5 still stands
- the historical repair approval evidence is real
- current live `typecheck` / `build` on the integrated head are red because of a
  workspace package-output drift outside this sidecar's allowed edit scope
- this packet deliberately records that drift instead of patching it, because fixing it
  would require canonical/runtime edits beyond `review_packet`

## 7. Reviewer Checklist

- [ ] Confirm `P2-V9-UI-OPS-001-SIDECAR-REVIEW` remains a support-only sidecar row and
      that this file is its only task-scoped artifact.
- [ ] Confirm the parent row is still `review` and that this packet does not claim an
      unauthorized `review_approved` / `done`.
- [ ] Confirm the screen-to-canvas mapping in §3 matches the current files.
- [ ] Confirm the acceptance evidence in §4 correctly cites same-booking context,
      revised ETA, messageCode-only disclosure, no-surcharge UI, and
      `availableActions + ActionReceipt`.
- [ ] Confirm the repair-delta description in §5 matches
      `git diff 4e8beab82 6a468b879 -- ...`.
- [ ] Confirm the fresh verification section accurately reports
      `i18n-guard PASS` and `typecheck/build FAIL` on the integrated head.
- [ ] Reopen rather than approve if the current branch/commit pointers or failure mode
      drift from what this packet records.

## 8. Reviewer Handoff

Primary review target for this sidecar: the accuracy of this packet.

Suggested commands:

```bash
AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-OPS-001-SIDECAR-REVIEW
AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-OPS-001
git diff --stat 4e8beab82 6a468b879 --
node scripts/i18n-guard.mjs
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/ops-console-web build
```

Approve this sidecar if the packet is accurate:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-V9-UI-OPS-001-SIDECAR-REVIEW "Review packet verified: parent review state, repair delta, and live verification drift are accurately captured."
```

Reopen this sidecar if the packet is stale or inaccurate:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-V9-UI-OPS-001-SIDECAR-REVIEW "Packet stale or inaccurate: <reason>"
```
