# MAP-FE-CALL-001 Review Packet & Evidence Summary

**Sidecar Task:** `MAP-FE-CALL-001-SIDECAR-REVIEW`  
**Parent Task:** `MAP-FE-CALL-001` - Callcenter P0 map booking  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `Claude2`  
**Last Revised:** `2026-06-30 (UTC)`  
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only packet; no canonical truth, runtime, or contract changes.

---

## 1. Purpose

This sidecar exists only to package the review trail for `MAP-FE-CALL-001`.

- In scope: current machine-truth snapshot, dependency/evidence anchors, reviewer hotspots, and handoff wording.
- Out of scope: changing `apps/ops-console-web`, changing backend/service-area behavior, editing L1/L2 truth, or claiming Gate A production readiness.

The packet intentionally stays conservative: it distinguishes evidence that is directly verifiable in this workspace from evidence that must still be checked on the parent implementation branch by the parent reviewer.

---

## 2. Current Machine-Truth Snapshot

### 2.1 Sidecar task

After dispatch pickup, the owner moved this helper task from `todo` to `in_progress` with:

```bash
AI_NAME=Codex scripts/ai-status.sh start MAP-FE-CALL-001-SIDECAR-REVIEW "Preparing review packet and evidence summary in support artifact only"
```

Task traits from `scripts/ai-status.sh show MAP-FE-CALL-001-SIDECAR-REVIEW`:

- owner=`Codex`
- reviewer=`Codex2`
- status was dispatched as `todo`
- helper_parent=`MAP-FE-CALL-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`

### 2.2 Parent task

`scripts/ai-status.sh show MAP-FE-CALL-001` currently records:

- title: `Callcenter P0 map booking`
- owner / reviewer: `Codex` / `Claude2`
- status: `review`
- dependencies:
  - `MAP-UI-001`
  - `MAP-BE-004`
  - `MAP-BE-005`
- artifacts:
  - `apps/ops-console-web/app/callcenter/page.tsx`
  - `apps/ops-console-web/`
  - `tests/e2e/`

Most important parent `next` field:

> `MAP-FE-CALL-001-SIDECAR-GATEA` produced `support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md` on `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f`. Parent UI review can proceed, but Gate A remains production-blocked until `MAP-QA-002` proves serviceable, blocked, manual-review, provider-degraded, backend-authority, snapshot, Ops-visibility, and observability scenarios E2E.

Interpretation:

- the parent task is in active review, not `done`
- the sidecar must not present Gate A as passed
- the existing Gate A packet is an input to review, not a substitute for parent implementation review

### 2.3 Dependency note: `MAP-BE-004`

In this workspace, `scripts/ai-status.sh show MAP-BE-004` returned `Task not found`. That means this packet should not invent a machine-truth status for the dependency.

What *is* directly verifiable from repo history:

- commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
- subject: `MAP-BE-004: finalize service-area booking creation enforcement (#1013)`
- verification trailer:
  - `pnpm --filter @drts/contracts typecheck`
  - `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/geo.service.test.ts apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts`

Practical meaning:

- backend service-area enforcement work does exist in git history and is a real dependency anchor for parent review
- this sidecar should still cite parent machine truth for lifecycle state, and git history for the dependency evidence slice

---

## 3. Evidence Surface

| ID | Evidence | Direct anchor | Why it matters |
| --- | --- | --- | --- |
| E-1 | Parent machine-truth review state | `scripts/ai-status.sh show MAP-FE-CALL-001` | Confirms the parent is still under review and must not be described as closed. |
| E-2 | Gate A support packet | `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f` -> `support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md` | Provides the most concrete review/evidence summary currently visible from this workspace. |
| E-3 | Dependency implementation anchor | commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3` | Confirms service-area booking enforcement landed in repo history and is not hypothetical. |
| E-4 | Sidecar review branch | current branch `codex/map-fe-call-001-sidecar-review` | Keeps this helper scoped to support material only. |

### 3.1 Gate A packet contents already available

The existing Gate A packet at `54604cf6f` already captures the strongest concrete evidence available to this sidecar:

- frontend guard helpers for coordinate/provenance gating
- `AddressMapPairPicker` render anchors in the callcenter booking UI
- unit-test anchors for coordinate-less submit blocking
- Playwright smoke anchor for fail-closed initial submit
- explicit list of still-missing E2E scenarios before Gate A can pass
- release wording that avoids overstating readiness

That packet should be treated as the baseline evidence reference for this sidecar review.

### 3.2 What this packet cannot independently prove

From the refs visible in this workspace, there is no directly discoverable `codex/map-fe-call-001` parent implementation branch/ref to inspect.

This packet therefore does **not** claim:

- the parent implementation branch SHA
- that the parent reviewer `Claude2` has already validated the UI diff
- that parent acceptance commands have already been rerun from this sidecar workspace
- that Gate A E2E evidence exists beyond the support packet

Instead, it records the trustworthy minimum:

- the parent task is in `review`
- the Gate A packet exists and is pushed
- production-readiness remains blocked on QA/release evidence

---

## 4. Evidence Summary

### 4.1 What reviewer `Codex2` can safely approve for the sidecar

`Codex2` is reviewing the helper packet, not closing the parent feature review. The sidecar is ready for approval if the reviewer agrees that:

1. the artifact stays support-only
2. the packet accurately reflects parent machine truth as `review`
3. the packet correctly points to `MAP-FE-CALL-001-GATE-A-EVIDENCE.md` at pushed commit `54604cf6f`
4. the packet preserves the explicit Gate A caution that E2E proof is still missing
5. the dependency note for `MAP-BE-004` is framed as git-history evidence, not invented machine truth

### 4.2 Main review takeaways to preserve

- The frontend review surface appears aimed at fail-closed callcenter booking:
  - no silent coordinate-less normal dispatch
  - provenance gating exists in the evidence packet
  - operator-visible blocked/manual-review/degraded states are part of the intended review surface
- The current evidence is still slice-level evidence:
  - unit-test and UI-smoke style proof exists
  - full backend/provider/snapshot/ops-visibility E2E proof is still outstanding
- Gate A remains blocked by design:
  - `MAP-QA-002` and release evidence are still required before production-ready claims

### 4.3 Recommended parent-review framing

For the parent reviewer (`Claude2`), the safest interpretation remains:

- approve or reopen the parent based on the actual implementation branch diff
- use the Gate A packet as a checklist, not as proof that production readiness is complete
- keep release wording aligned with the packet's "do not claim" rules until QA evidence lands

---

## 5. Reviewer Focus

Reviewer `Codex2` should check the following:

1. This packet creates or updates support material only.
2. No canonical truth, runtime code, or governance docs were edited by this helper task.
3. The parent task is described as `review`, not `review_approved` or `done`.
4. The packet points at the pushed Gate A packet commit `54604cf6f` and keeps its constraints intact.
5. The packet does not overstate `MAP-BE-004`; it cites the visible git commit and explicitly notes the missing task-slice lookup in this workspace.
6. The packet is useful to hand back to the parent owner/reviewer pair without pretending to replace their code review.

Suggested approval conclusion:

> `審查通過：MAP-FE-CALL-001 sidecar review packet 已對齊目前 machine truth，正確記錄 parent task 仍在 review、引用已推送的 Gate A evidence packet（origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f），並保留「Gate A 尚未通過，仍待 MAP-QA-002/ release E2E 證據」的限制。support artifact only；未修改 canonical truth。`

Suggested reopen conclusion:

> `packet needs refresh: [parent status drift / wrong Gate A anchor / dependency wording too strong / support-scope violation]`

---

## 6. Handoff Commands

Owner handoff to `Codex2`:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-CALL-001-SIDECAR-REVIEW Codex2 "Review packet ready at support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-SIDECAR-REVIEW.md. The packet stays support-only, records parent MAP-FE-CALL-001 as currently in review, points to pushed Gate A evidence packet origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f, preserves that Gate A remains blocked pending MAP-QA-002 and release E2E evidence, and cites MAP-BE-004 via visible git-history anchor deb5e1d366f1789c29bd26818b14ffcb801a43a3 without inventing missing machine-truth status."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-CALL-001-SIDECAR-REVIEW "Review approved. The packet stays support-only, matches current parent machine truth, anchors the pushed Gate A evidence packet at 54604cf6f, and correctly preserves the rule that Gate A remains blocked until MAP-QA-002/release E2E evidence exists."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-FE-CALL-001-SIDECAR-REVIEW "packet needs refresh: [parent status drift / wrong Gate A anchor / dependency wording too strong / support-scope violation]"
```

Owner closeout note after `review_approved`:

- follow the normal owner `done` rule from the dispatch instructions
- do not mark `done` until task-scoped commit/push metadata can be supplied

---

## 7. Change Log

- `2026-06-30`: created the initial sidecar review packet for `MAP-FE-CALL-001-SIDECAR-REVIEW`.
- `2026-06-30`: aligned the packet to current parent machine truth (`review`) and linked the pushed Gate A packet commit `54604cf6f`.
- `2026-06-30`: recorded the dependency note for `MAP-BE-004` using visible git-history evidence rather than assuming unavailable task-slice status.
