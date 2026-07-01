# MAP-FE-CALL-001 Review Packet & Evidence Summary

- **Sidecar Task:** `MAP-FE-CALL-001-SIDECAR-REVIEW`
- **Parent Task:** `MAP-FE-CALL-001` - Callcenter P0 map booking
- **Helper Kind:** `review_packet`
- **Current Owner:** `Codex`
- **Assigned Reviewer:** `Codex2`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Last Revised:** `2026-07-01 (UTC)`
- **Status:** `REVIEW SUPPORT ARTIFACT` - support-only packet; no canonical truth, runtime, or contract changes.

---

## 1. Purpose

This sidecar exists only to package the review trail for `MAP-FE-CALL-001`.

- In scope: current machine-truth snapshot, dependency/evidence anchors, reviewer hotspots, and handoff wording.
- Out of scope: changing `apps/ops-console-web`, changing backend/service-area behavior, editing L1/L2 truth, or claiming Gate A production readiness.

This refresh aligns the packet to the current `2026-07-01` machine-truth state. The parent task is still under review, but the latest parent `next` field has moved from the older Gate A caution to a concrete reviewer follow-up on shared provenance gating and nested `coordinateProvenance` handling.

---

## 2. Current Machine-Truth Snapshot

### 2.1 Sidecar task

The owner moved this helper from `todo` to `in_progress` with:

```bash
AI_NAME=Codex scripts/ai-status.sh start MAP-FE-CALL-001-SIDECAR-REVIEW "Preparing review packet and evidence summary in support artifact only"
```

Task traits from `scripts/ai-status.sh show MAP-FE-CALL-001-SIDECAR-REVIEW`:

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- helper_parent=`MAP-FE-CALL-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- last_update=`2026-07-01T04:14:07Z`

### 2.2 Parent task

`scripts/ai-status.sh show MAP-FE-CALL-001` currently records:

- owner / reviewer: `Codex` / `Claude2`
- status: `review`
- last_update: `2026-07-01T03:37:38Z`
- dependencies:
  - `MAP-UI-001`
  - `MAP-BE-004`
  - `MAP-BE-005`

Most important parent `next` field, as of this refresh:

- `apps/ops-console-web/app/callcenter/map-booking.ts` now uses shared `@drts/contracts` `hasAddressCoordinateProvenance`
- callcenter submit blocking is aligned with backend spatial-audit completeness, including nested `coordinateProvenance`
- unit coverage was updated for nested provenance readiness and empty nested provenance rejection
- recorded verification passed:
  - `pnpm --filter @drts/ops-console-web test -- callcenter-map-booking.test.ts ops-map-board.test.ts`
  - `pnpm --filter @drts/ops-console-web typecheck`

Interpretation:

- the parent task is in active review, not `review_approved` or `done`
- the current review focus is narrower and more concrete than the older Gate A note: shared provenance gating and nested provenance completeness
- this sidecar must preserve both truths at once:
  - the parent has fresh slice-level verification for the frontend review surface
  - Gate A still is not proven end to end by this sidecar alone

### 2.3 Dependency anchors

`MAP-BE-004`

- `scripts/ai-status.sh show MAP-BE-004` returned `Task not found` in this workspace, so this packet must not invent current machine truth for that slice
- directly verifiable git-history anchor:
  - commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
  - subject: `MAP-BE-004: finalize service-area booking creation enforcement (#1013)`

`MAP-BE-005`

- `scripts/ai-status.sh show MAP-BE-005` is available and currently records:
  - status=`review`
  - dependency on `MAP-BE-004`
  - latest note says spatial audit snapshot persistence, stop-level coordinate provenance, actor/surface metadata, immutable service-area decision snapshots, and related API verification all landed for review

Practical meaning:

- the frontend review packet can safely cite real backend evidence anchors
- but it should distinguish between:
  - `MAP-BE-004` as visible git-history evidence only
  - `MAP-BE-005` as visible machine-truth review-state evidence

---

## 3. Evidence Surface

| ID | Evidence | Direct anchor | Why it matters |
| --- | --- | --- | --- |
| E-1 | Parent machine-truth review state | `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001` | Confirms the parent remains in `review`. |
| E-2 | Parent reviewer follow-up | parent `next` field dated `2026-07-01T03:37:38Z` | Records the current review focus on shared provenance gating and nested `coordinateProvenance`. |
| E-3 | Gate A support packet | `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f` -> `support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md` | Preserves the stronger cautionary evidence about missing end-to-end proof. |
| E-4 | `MAP-BE-004` dependency anchor | commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3` | Confirms service-area enforcement work exists in repo history. |
| E-5 | `MAP-BE-005` dependency review state | `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005` | Confirms snapshot/audit persistence work is already in `review`. |
| E-6 | Sidecar review branch | `origin/codex/map-fe-call-001-sidecar-review@afa29719b` plus this refresh | Keeps the helper scoped to support material only. |

### 3.1 What the Gate A packet still contributes

The Gate A packet at `54604cf6f` remains the best single summary of what is **not** yet proven for production readiness:

- unit and UI-smoke anchors for fail-closed callcenter submission
- explicit missing E2E scenarios for serviceable, blocked, manual-review, provider-degraded, snapshot, backend-authority, Ops visibility, and observability flows
- release wording that avoids claiming Gate A pass

The key update in this review packet is that the parent machine-truth `next` field has moved forward since that packet was created. The Gate A packet is therefore supporting evidence, not the primary machine-truth headline.

### 3.2 Workspace visibility limits

This workspace shows the pushed sidecar refs:

- `origin/codex/map-fe-call-001-sidecar-gatea`
- `origin/codex/map-fe-call-001-sidecar-review`

It does **not** expose a directly inspectable `origin/codex/map-fe-call-001` ref from which this helper can review the parent implementation diff or name the exact parent implementation SHA.

This packet therefore does **not** claim:

- the parent implementation branch SHA
- that `Claude2` has already validated the parent diff
- that the parent acceptance commands were rerun from this sidecar workspace
- that Gate A E2E evidence exists beyond the existing support packet

---

## 4. Evidence Summary

### 4.1 What reviewer `Codex2` can safely approve for the sidecar

`Codex2` is reviewing the helper packet, not closing the parent feature review. The sidecar is ready for approval if the reviewer agrees that:

1. the artifact stays support-only
2. the packet accurately reflects the current parent machine truth as `review`
3. the packet records the new parent follow-up on shared provenance gating and nested provenance completeness
4. the packet still points to `MAP-FE-CALL-001-GATE-A-EVIDENCE.md` at pushed commit `54604cf6f` as the main Gate A caution/evidence packet
5. the dependency notes distinguish `MAP-BE-004` git-history evidence from `MAP-BE-005` review-state evidence

### 4.2 Main takeaways to preserve

- Parent review is currently focused on correctness of submit gating parity:
  - shared `@drts/contracts` provenance helper adoption
  - nested `coordinateProvenance` completeness
  - updated unit coverage for empty nested provenance rejection
- The current directly recorded verification is still slice-level:
  - `ops-console-web` targeted tests passed
  - `ops-console-web` typecheck passed
- Gate A still is not proven by this packet:
  - the existing Gate A packet remains explicit that end-to-end QA/release evidence is still required
- Backend dependency support exists:
  - `MAP-BE-004` is visible in git history
  - `MAP-BE-005` is visible in machine truth as in-review snapshot/audit persistence work

### 4.3 Recommended parent-review framing

For the parent reviewer (`Claude2`), the safest interpretation remains:

- approve or reopen the parent based on the actual implementation diff, not on this sidecar alone
- treat the parent `next` field as the current review focus
- treat the Gate A packet as the production-readiness caution/checklist
- keep release wording conservative until `MAP-QA-002` or equivalent release evidence proves the missing E2E scenarios

---

## 5. Reviewer Focus

Reviewer `Codex2` should check the following:

1. This helper changed support material only.
2. No canonical truth, runtime code, or governance docs were edited by this task.
3. The parent task is described as `review`, not `review_approved` or `done`.
4. The packet reflects the latest parent `next` field instead of the older stale Gate A-only wording.
5. The packet still keeps the Gate A packet at `54604cf6f` as a cautionary evidence anchor.
6. The dependency wording does not overclaim `MAP-BE-004` and correctly separates `MAP-BE-005` as current review-state evidence.
7. The packet is useful to hand back to the parent owner/reviewer pair without pretending to replace their code review.

Suggested approval conclusion:

> `審查通過：MAP-FE-CALL-001 sidecar review packet 已刷新為 2026-07-01 machine truth，正確記錄 parent task 仍在 review、補入目前 reviewer follow-up（shared provenance gating / nested coordinateProvenance completeness / targeted FE verification），同時保留已推送 Gate A evidence packet（origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f）作為尚缺 E2E 證據的限制。support artifact only；未修改 canonical truth。`

Suggested reopen conclusion:

> `packet needs refresh: [parent status drift / stale parent next summary / wrong Gate A anchor / dependency wording too strong / support-scope violation]`

---

## 6. Handoff Commands

Owner handoff to `Codex2`:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-CALL-001-SIDECAR-REVIEW Codex2 "Review packet refreshed at support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-SIDECAR-REVIEW.md. The packet stays support-only, records parent MAP-FE-CALL-001 as currently in review, captures the 2026-07-01 reviewer follow-up on shared provenance gating and nested coordinateProvenance completeness with the recorded ops-console verification commands, keeps the pushed Gate A evidence packet at origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f as the E2E caution anchor, and distinguishes MAP-BE-004 git-history evidence from MAP-BE-005 review-state evidence."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-CALL-001-SIDECAR-REVIEW "Review approved. The packet stays support-only, matches the 2026-07-01 parent machine truth, captures the current provenance-gating review focus, preserves the pushed Gate A evidence packet at 54604cf6f as the end-to-end caution anchor, and keeps dependency wording appropriately bounded."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-FE-CALL-001-SIDECAR-REVIEW "packet needs refresh: [parent status drift / stale parent next summary / wrong Gate A anchor / dependency wording too strong / support-scope violation]"
```

Owner closeout note after `review_approved`:

- follow the normal owner `done` rule from the dispatch instructions
- do not mark `done` until task-scoped commit/push metadata can be supplied

---

## 7. Change Log

- `2026-06-30`: created the initial sidecar review packet for `MAP-FE-CALL-001-SIDECAR-REVIEW`.
- `2026-06-30`: aligned the first packet to then-current parent `review` state and linked the pushed Gate A packet commit `54604cf6f`.
- `2026-07-01`: refreshed the packet to current parent machine truth, replacing the stale parent `next` summary with the current reviewer follow-up on shared provenance gating and nested `coordinateProvenance` completeness.
- `2026-07-01`: added `MAP-BE-005` as visible review-state evidence while keeping `MAP-BE-004` constrained to visible git-history evidence.
