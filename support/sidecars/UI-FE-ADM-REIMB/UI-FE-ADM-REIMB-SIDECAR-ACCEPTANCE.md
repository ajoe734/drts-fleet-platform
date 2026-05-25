# UI-FE-ADM-REIMB Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `UI-FE-ADM-REIMB` — platform-admin-web: rebuild Reimbursement batch queue (NEW) page to canvas Platform Admin.html
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-25` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime behavior, or the parent implementation itself.

This packet is the reviewer-facing acceptance companion for the in-flight reimbursement-batch-queue
slice owned by `Codex` and reviewed by `Claude`. It pins the canonical spec anchors, dependency
map, contract surface, and behavioral acceptance checklist for `/payments/reimbursements`. Live
lifecycle fields such as `status`, `next`, and `last_update` stay authoritative only in
`ai-status.json`.

---

## 1. Scope Boundary

In scope:

- pin the machine-truth dependency chain for `UI-FE-ADM-REIMB`
- enumerate the canonical spec anchors that govern the new
  `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- enumerate the `@drts/contracts` types the parent slice must consume
- restate the acceptance bar (visual + behavior + verification commands)
- give the reviewer a single page of checklist gates aligned to the handoff packet §5.12,
  system-design answers §3.5–§3.6, and design canvas v0.6

Out of scope:

- editing L1/L2 product truth, parent task truth, or `ai-status.json`
- changing the parent implementation, its dependency tasks, the design handoff packet, or the
  design canvas
- approving the parent slice; that gate stays with `Claude` against the parent task record
- producing or modifying contracts under `packages/contracts/**`

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Codex`
- depends_on=`UI-FE-TOKENS`, `UI-BE-006`, `UI-CL-001`
- task_class=`sidecar`
- helper_parent=`UI-FE-ADM-REIMB`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/UI-FE-ADM-REIMB/UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent — `ai-status.json -> UI-FE-ADM-REIMB`

- owner=`Codex`
- reviewer=`Claude`
- status=`in_progress` at packet draft time (see `ai-status.json` for live state)
- phase=`phase1-ui-implementation-wave-202605`
- depends_on=`UI-FE-TOKENS`, `UI-BE-006`, `UI-CL-001`
- artifacts=`apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- acceptance recorded on parent:
  - Visual matches Platform Admin.html corresponding artboard
  - Behavior matches packet §5 entry for Reimbursement batch queue (NEW)
  - `availableActions` drives CTAs
  - `EmptyReason` 6 states rendered distinctly
  - refresh tier wired
  - `pnpm --filter @drts/platform-admin-web typecheck` + `build` pass

### Sibling slice (downstream sister) — `ai-status.json -> UI-FE-ADM-REIMBID`

- owner=`Codex`
- reviewer=`Codex2`
- status=`todo` at packet draft time
- artifacts=`apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`
- Same dependency chain; same contract surface; queue → detail row navigation flow.
- This packet does not gate the sister slice. Recorded here so the reviewer can flag if the queue
  slice forecloses anything the detail slice will need (e.g. row-action shape, deep-link query).

### Authoritative spec sources

- L1 product: `phase1_prd_detailed_v1.md` §7.4.8 (reimbursement actions)
- Design behavior packet: `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`
  - §3.4 risk-level matrix (Q-X09–Q-X11)
  - §3.5 authority boundaries (Q-X13 `availableActions`)
  - §3.6 empty / not-ready states (Q-X15 `EmptyReason`)
  - §3.9 notifications (`reconciliation_issue.assigned` cross-link relevance)
  - §3.10 cross-app navigation (audit deep-link receipts)
  - §4.1 sitemap (`/payments/reimbursements` placement)
  - §4.2 inter-page flows
  - **§5.12 `/payments/reimbursements` — Reimbursement Batch Queue (NEW per Q-ADM12)** ← primary brief
- Design canvas v0.6: `docs/05-ui/drts-design-canvas/Platform Admin.html`, artboards
  - `reimburse` — Reimbursements queue · NEW
  - `reimburse-detail` — Reimbursement batch · state machine (sister slice anchor)
- Open question reference: Q-ADM12 (queue + state machine promotion), Q-X13
  (`availableActions`), Q-X15 (`EmptyReason`)

---

## 3. Dependency Map

| Dependency      | Status | Closeout evidence in `ai-status.json`                                                                                    | Why it matters to `UI-FE-ADM-REIMB`                                                                       |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `UI-FE-TOKENS`  | `done` | commit `7fc1809c77afc32998f98557283828321e87e280` on `origin/codex/ui-fe-tokens`                                         | Provides `@drts/ui-web` Canvas primitives (`CanvasShell`, `CanvasTable`, `CanvasBtn`, `buildCanvasTheme`) and v0.6 tokens used by the queue page. |
| `UI-BE-006`     | `done` | commit `3d6d08503df661d3d7e1ce211f5c7de0a65cb79f` on `origin/codex2/ui-be-006`                                           | Anchors the rollout-state-machine pattern the reimbursement batch queue mirrors (state-tracked records with transition guards exposed via `availableActions`). |
| `UI-CL-001`     | `done` | commit `596c094d9b9f51ec1cd6d958b97698158e4c8d5a` on `origin/codex/ui-cl-001`                                            | Provides the generic response unwrapper (`UiHealthEnvelope` / `UiRefreshMetadata`) the queue's refresh-tier wiring and health banner will consume. |

Assertions:

- All three dependencies are `done` in `ai-status.json` with recorded commit + push evidence.
- No dependency reopen is implied by this packet.
- This packet does not add or mutate any dependency edges in machine truth.

Downstream / lateral note:

- `UI-FE-ADM-REIMBID` (batch detail) shares the same dependency set and is the row-target of this
  queue. The queue's row click semantics must leave a clean entry shape (`batchId` in the path)
  for the detail slice. Recorded here as a courtesy; not a gate on this packet.

---

## 4. Contract Surface (consumed, not modified)

The parent slice consumes existing `@drts/contracts` types. This packet does not propose adding,
renaming, or restructuring any of them. The reviewer should verify the implementation imports the
canonical names:

- `ReimbursementBatchRecord` (`packages/contracts/src/index.ts`)
  - keys used in the queue row: `batchId`, `driverId`, `statementId`, `periodMonth`,
    `status`, `totalAmount`, `approvedAt`, `paidAt`
  - **drift to flag for reviewer**: the typed `status` here is `DriverPayoutStatus`, whereas the
    design packet §5.12 enumerates a 6-state machine
    (`draft` / `pending_approval` / `approved` / `exported` / `paid` / `reconciled`). The slice
    must render those visual states off the backend payload as-is; if the live payload only emits
    a subset of `DriverPayoutStatus` codes, the queue must still degrade gracefully (no thrown
    enum coercion). Any discrepancy is **not** for this slice to resolve — log it for follow-up.
- `ReimbursementItemRecord` (only if the queue surfaces item counts / sample lines)
- `ApproveReimbursementBatchCommand` (action: Approve batch — high-risk; requires reason)
- `MarkReimbursementPaidCommand` (action: Mark paid — high-risk; requires reason)
- `ResourceActionDescriptor` (`packages/contracts/src/ui-runtime.ts`)
  - drives every CTA: `action`, `enabled`, `disabledReasonCode?`, `requiresReason?`,
    `riskLevel`
- `EmptyReason` + `EmptyStateEnvelope` (`packages/contracts/src/ui-runtime.ts`)
  - exactly the 7 reasons exist in contracts: `no_data`, `not_provisioned`, `fetch_failed`,
    `permission_denied`, `external_unavailable`, `driver_not_eligible`, `filtered_empty`
  - the design packet §3.6 / §5.12 calls for **6 distinct treatments** for this surface
    (`driver_not_eligible` is driver-app-specific per Q-DRV01 and is not expected on the
    platform-admin reimbursement queue); the parent acceptance bar of "6 EmptyReason states
    rendered distinctly" should be read against the 6 platform-relevant reasons
- `UiHealthEnvelope` (`packages/contracts/src/ui-runtime.ts`) — if the queue surfaces a header
  banner per the canvas
- `UiRefreshMetadata` (`packages/contracts/src/ui-runtime.ts`) — drives the T4 (30s) refresh
  cadence per §3.3 / §3.4

Out of scope for the parent slice (and therefore this packet):

- changing any of the above type definitions
- inventing a new state-machine enum for reimbursement batches in the UI
- mocking out the action receipts (action receipts must use the real `ActionReceipt` contract
  with `auditId` per §3.4 / §3.7)

---

## 5. Acceptance Checklist

Legend: `[REQUIRED]` = direct parent acceptance / reviewer evidence. `[DERIVED]` = reviewer
support gate for this sidecar packet.

### A. Sitemap and surface materialized `[REQUIRED]`

- [ ] `apps/platform-admin-web/app/payments/reimbursements/page.tsx` exists as a Next.js route.
- [ ] Route is reachable from `/payments` per §4.2 inter-page flows.
- [ ] Sidebar / nav exposes `/payments/reimbursements` under "結算與帳務" → "代墊批次" per §4.1.
- [ ] Row click navigates to `/payments/reimbursements/[batchId]` (with `batchId` carried in the
      path) so the sister slice (`UI-FE-ADM-REIMBID`) inherits a clean entry.

### B. Visual matches Platform Admin.html artboard `reimburse` `[REQUIRED]`

- [ ] Layout, density, indigo accent, and shell chrome match the canvas artboard.
- [ ] Built on `@drts/ui-web` Canvas primitives (no ad-hoc styled HTML for shell / table / KPI
      surfaces).
- [ ] Theme: `buildCanvasTheme({ surface: "platform", density: "compact" })` consistent with the
      sibling `/payments` page (`apps/platform-admin-web/app/payments/page.tsx`).
- [ ] Header surfaces the 6-state visual taxonomy
      (`draft` / `pending_approval` / `approved` / `exported` / `paid` / `reconciled`) per §5.12,
      including the urgency call-outs for "pending-approval backlog" and "stuck in `exported`".

### C. Must-show data per §5.12 `[REQUIRED]`

- [ ] Batch list columns: id, scope (tenant / partner / period), amount, current state, submitter,
      submitted at, approver (if any), updated at.
- [ ] Filters: state, scope, period.
- [ ] Submitter / approver render as readable identity, not raw user ids.

### D. `availableActions` drives CTAs (Q-X13) `[REQUIRED]`

- [ ] No hard-coded per-role CTA visibility anywhere in the queue.
- [ ] CTAs render only from `data.availableActions[]` per row (and for batch-level actions when
      backend exposes them on the list response).
- [ ] `riskLevel` from the descriptor drives confirmation flow:
  - `low` → direct action + toast receipt with `auditId`
  - `medium` → modal confirm + toast receipt with `auditId`
  - `high` → modal confirm + required reason text + toast receipt with `auditId`
- [ ] `requiresReason` is honored even when `riskLevel` is not `high` (descriptor wins).
- [ ] A row with `availableActions.length === 0` is read-only — no disabled-button graveyard.
- [ ] Action set per §5.12 actually appears in the live receipt path when the backend offers it:
  - Approve batch (high, requires reason)
  - Mark reimbursement paid (high, requires reason)
  - Mark reconciled (medium)
  - Export batch artifact (low — produces signed artifact link)

### E. `EmptyReason` 6 states rendered distinctly (Q-X15) `[REQUIRED]`

- [ ] Each of the 6 platform-relevant `EmptyReason` codes renders a visually distinct treatment
      (not just different copy on the same shell):
  - `no_data`
  - `not_provisioned`
  - `fetch_failed`
  - `permission_denied`
  - `external_unavailable`
  - `filtered_empty`
- [ ] When the envelope includes `nextAction`, a CTA renders inside the empty state (e.g.
      `not_provisioned` → "Configure reimbursement workflow"); the CTA still flows through the
      same `ResourceActionDescriptor` machinery (no bypass).
- [ ] `messageCode` from the envelope is rendered via the existing i18n layer; raw codes are not
      shown to the user.
- [ ] `driver_not_eligible` is not expected on this surface; if the backend emits it, the page
      must not crash, but it does not need a bespoke treatment.

### F. Refresh tier wired (Q-X01) `[REQUIRED]`

- [ ] Refresh cadence is **T4 (30s)** per §3.3 and §5.12. Implemented via
      `UiRefreshMetadata` (no ad-hoc `setInterval` that races the envelope).
- [ ] Manual refresh CTA is `low` risk → direct action + toast.
- [ ] The queue reads `UiHealthEnvelope` if surfaced by the canvas; otherwise no synthetic
      banner is invented.

### G. Cross-app deep links (§3.10) `[REQUIRED]`

- [ ] Cross-app deep links open in **new tab** by default.
- [ ] Action receipts surface "View audit" → `/audit?auditId=<id>` (in-app, since
      platform-admin owns the audit surface).
- [ ] Reconciliation-mismatch cross-link from the batch detail (sister slice) is not the queue's
      responsibility, but the queue must not break the row-to-detail navigation that the detail
      slice depends on.

### H. Verification commands `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes (recorded in the parent
      handoff).
- [ ] `pnpm --filter @drts/platform-admin-web build` passes (recorded in the parent handoff).
- [ ] The closeout commit on the parent records `LLM-Agent`, `Task-ID: UI-FE-ADM-REIMB`, and
      `Reviewer: Claude` trailers per the L0 commit-evidence rule.

### I. Sidecar packet hygiene `[DERIVED]`

- [x] Packet does not edit any file under `packages/contracts/**`, `phase1_*` truth docs,
      `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`, the canvas, or `ai-status.json`.
- [x] Packet's only artifact is `support/sidecars/UI-FE-ADM-REIMB/UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE.md`.
- [x] All dependency states cited match `ai-status.json` at packet draft time.
- [x] All spec anchors cite file + section.
- [x] Drift between `ReimbursementBatchRecord.status` (`DriverPayoutStatus`) and the §5.12
      6-state machine is recorded as a flag for follow-up, not a claim of fix.

---

## 6. Reviewer Focus

For `Codex` reviewing this sidecar packet:

- confirm Section 2 anchors match `ai-status.json` and that the parent's `acceptance` array is
  reflected verbatim into the checklist (Sections C–H).
- confirm Section 3 dependency closeout evidence (commits, push branches) still matches
  `ai-status.json`; if any dependency has moved since packet draft, flag it.
- confirm Section 4 lists only contract types that already exist in
  `packages/contracts/src/index.ts` and `packages/contracts/src/ui-runtime.ts`. No new types are
  proposed here.
- confirm Section 5 acceptance gates are testable against the parent slice's eventual diff. If a
  gate is ambiguous, flag it before the parent slice lands so the reviewer is not blocked at
  closeout time.
- confirm the recorded drift on `ReimbursementBatchRecord.status` is recorded as a follow-up
  flag only — this packet must not propose a contract change.
- confirm the packet stays support-only and does not rewrite canonical truth.

---

## 7. Handoff Summary

This packet captures the dependency map, contract surface, and behavioral acceptance bar for
`UI-FE-ADM-REIMB` so the reviewer has a single page to gate against once the parent slice
finishes. All three dependencies (`UI-FE-TOKENS`, `UI-BE-006`, `UI-CL-001`) are `done` with
recorded commit/push evidence, so the parent slice is unblocked on the contract / token / state
machine side. The remaining gates are entirely scoped to the new
`apps/platform-admin-web/app/payments/reimbursements/page.tsx` surface meeting the §5.12 behavior
spec and the `reimburse` canvas artboard.

No canonical truth is modified by this packet. Live lifecycle fields (`status`, `next`,
`last_update`) remain authoritative only in `ai-status.json`.
