# PH1GC-FIN-GOV-001 Sidecar Acceptance Packet

This document is the support-only acceptance packet for dispatch task
`PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE`. It does not modify canonical truth.
Its job is to hand reviewer `Gemini2` a compact checklist, dependency map, and
evidence index for the already-landed governance-aware finance slices tied to
parent task `FIN-GOV-001`.

Anchors used here come from:

- dispatch brief embedded in the supervisor wakeup
- `ai-status.json`
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- `docs/00-context/phase1-v3-resolution-20260519.md`
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`

## 1. Scope & Boundary

- **Task ID:** `PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE`
- **Parent Task:** `FIN-GOV-001`
- **Helper Kind:** `acceptance_packet`
- **Sidecar Owner:** `Codex2`
- **Assigned Reviewer:** `Gemini2`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md`

Guardrails for this packet:

- only summarize support evidence and dependency posture
- do not edit L1/L2 truth, release-gate truth, runtime code, or the parent task
- do not restate static evidence as new live proof
- keep the output limited to this sidecar artifact

## 2. Machine-Truth Anchors

### 2.1 Parent task: `FIN-GOV-001`

`ai-status.json` currently records:

| Field | Value |
| --- | --- |
| Title | `Governance-aware billing & reporting live evidence pack` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Status | `done` |
| Depends on | `[]` |
| Artifact | `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` |
| Planning ref | `docs/03-runbooks/phase1-v2-execution-wave-planning-20260519.md` |
| Last update | `2026-05-19T08:05:43Z` |
| Next | `Wave merge campaign complete — content merged into aggregate at 2026-05-19T08:05:43Z` |

Interpretation:

- the canonical parent evidence slice is already closed
- this sidecar does not reopen that task
- reviewer work here is limited to acceptance support packaging for the PH1GC dispatch

### 2.2 Related governance-completion anchors already in machine truth

These completed tasks define the post-`FIN-GOV-001` dependency surface that the
reviewer should read together:

| Task | Status | Why it matters |
| --- | --- | --- |
| `WF-FIN-GOV-001-MATRIX` | `done` | Added the explicit `WF-FIN-GOV-001` enrichment row without renaming baseline `WF-FIN-001`. |
| `WF-FIN-GOV-001-E2E` | `done` | Added the dedicated governance-aware billing/reporting E2E shell tied to the new workflow family. |

## 3. Dependency Map

### 3.1 Semantic dependency chain

The accepted v3 resolution defines the workflow relationship precisely:

- `WF-FIN-001` remains the baseline billing / invoice / report-export row
- `WF-FIN-GOV-001` is a new governance-aware enrichment row
- `WF-FIN-GOV-001` depends on:
  - `WF-TGV-001`
  - `WF-FIN-001`

This matters because the sidecar packet must not collapse governance-aware
finance into the older baseline finance claim.

### 3.2 Evidence dependency chain

For reviewer purposes, the dependency order is:

1. `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
2. `docs/00-context/phase1-v3-resolution-20260519.md`
3. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
4. `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
5. `WF-FIN-GOV-001-MATRIX` and `WF-FIN-GOV-001-E2E` machine-truth rows in `ai-status.json`

Read them in that order:

- the evidence pack states what was actually proven and what remained blocked
- the resolution locks the naming and dependency semantics
- the release-gate matrix states the current gate wording
- the directive states the target workflow and acceptance dimensions
- the done task rows show the supporting completion path already landed

### 3.3 Current gate posture

The conservative accepted reading remains:

- `WF-FIN-001` = `PASS (static evidence)`
- `WF-FIN-GOV-001` = governance enrichment carried by matrix/spec/UAT/E2E work,
  not a claim of fresh live staging proof from this sidecar

The original `FIN-GOV-001` evidence pack explicitly says the governance-aware
live rerun was blocked on IAP credentials / ingress and therefore should not be
promoted to fresh live proof from static packeting alone.

## 4. Reviewer-Facing Acceptance Checklist

These are the acceptance gates for this sidecar artifact itself.

### A. Scope gates

- [ ] The packet stays support-only and does not edit canonical truth.
- [ ] The packet names `FIN-GOV-001` as the parent and does not invent a new canonical finance task.
- [ ] The packet keeps governance-aware finance separate from baseline `WF-FIN-001`.

### B. Dependency gates

- [ ] The packet records the accepted dependency chain `WF-TGV-001 + WF-FIN-001 -> WF-FIN-GOV-001`.
- [ ] The packet points reviewer attention to the existing `FIN-GOV-001` evidence pack rather than recreating evidence claims.
- [ ] The packet cites the already-done `WF-FIN-GOV-001-MATRIX` and `WF-FIN-GOV-001-E2E` support tasks as landed dependencies.

### C. Evidence integrity gates

- [ ] The packet preserves the current gate posture as static/support evidence only.
- [ ] The packet explicitly carries forward the blocked live-rerun caveat from `FIN-GOV-001-EVIDENCE-PACK.md`.
- [ ] The packet avoids claiming new runtime, registry, governance, or release-gate changes.

### D. Handoff gates

- [ ] Reviewer `Gemini2` can validate the packet by reading only the listed anchors.
- [ ] The only task-scoped content artifact is this file under `support/sidecars/PH1GC-FIN-GOV-001/`.

## 5. Evidence Inventory

| ID | Anchor | Reviewer use |
| --- | --- | --- |
| `E1` | `ai-status.json` -> `FIN-GOV-001` | Confirms parent is already `done` and support-only packet must not mutate it. |
| `E2` | `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` | Primary evidence source, including the blocked live-rerun record. |
| `E3` | `docs/00-context/phase1-v3-resolution-20260519.md` | Canonical decision for keeping both `WF-FIN-001` and `WF-FIN-GOV-001`. |
| `E4` | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | Current gate wording for baseline finance and workflow-family interpretation. |
| `E5` | `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.7 | Target governance-aware billing/reporting workflow and acceptance dimensions. |
| `E6` | `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` | Shows the spec/UAT/E2E follow-on tasks that formalized the enrichment slice. |
| `E7` | `ai-status.json` -> `WF-FIN-GOV-001-MATRIX` | Confirms the matrix row landed as a distinct additive row. |
| `E8` | `ai-status.json` -> `WF-FIN-GOV-001-E2E` | Confirms the dedicated governance-aware E2E shell landed. |

## 6. Packet Completeness Check

- [x] Parent task and reviewer context are named.
- [x] Dependency map distinguishes baseline finance from governance enrichment.
- [x] Existing evidence pack is identified as the primary source of truth.
- [x] Blocked live-rerun caveat is preserved.
- [x] Follow-on matrix/E2E completions are linked for reviewer context.
- [x] Output is limited to a support artifact and does not edit canonical truth.

## 7. Reviewer Handoff Notes

1. Reconfirm `ai-status.json` still shows `FIN-GOV-001` as `done` before approving this sidecar; if parent machine truth changes, refresh §2 and §3.
2. Treat `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` as the evidence anchor and this file as an index/checklist only.
3. Reject any interpretation that upgrades static evidence to fresh live staging proof without new runtime evidence.
4. Reject any packet revision that rewrites `WF-FIN-001` into `WF-FIN-GOV-001`; the accepted resolution requires both rows to coexist.
5. Approval should verify that this task changed only `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-ACCEPTANCE.md` plus machine-truth state transitions recorded through `scripts/ai-status.sh`.
