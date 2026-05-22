# PH1GC-MATRIX-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `PH1GC-MATRIX-001` - Phase 1 gap closure release-gate matrix reconciliation
**Current Sidecar Owner:** `Gemini2`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Last Revised:** `2026-05-22T03:48Z (UTC)`
**Status Snapshot:** parent `PH1GC-MATRIX-001` is `pending`; this sidecar `PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE` is `review` in machine truth as of `2026-05-22T03:44:08Z`

---

## 1) Scope Boundary

This sidecar only prepares the acceptance framing, dependency map, reviewer hotspots, and closeout template for `PH1GC-MATRIX-001`. It does not edit canonical truth and does not claim the parent matrix rewrite is already landed.

- In scope: support-only checklist, machine-truth snapshot, current repo baseline anchors, upstream/downstream dependency mapping, reviewer guidance, and directive `§7` closeout template.
- Out of scope: editing `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, changing any workflow-family row directly, creating `E2E-010` or `E2E-011`, rewriting `docs/04-uat/fbp-014a-e2e-matrix.md`, or converting external-gated rows into live-closure claims.

## 2) Current Machine-Truth Snapshot

Based on `ai-status.json`, `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`, and the current repo snapshot:

- Parent `PH1GC-MATRIX-001` is `pending` under owner `Codex2`, reviewer `Codex`, with one formal dependency: `PH1GC-BPL-002`.
- Parent machine-truth acceptance currently requires:
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` visible on `origin/dev` with 16 workflow-family rows.
  - `WF-PRT-001` fully replaced by `WF-PARTNER-001`.
  - New rows present: `WF-DRV-MP-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`.
  - `WF-PROD-001` updated to the dual dry-run / live-exec gate read.
  - `WF-FWD-001` remains `EXTERNAL-GATED` until forwarder sandbox evidence lands.
  - Every row has a named verification path and a non-claim.
  - Closeout follows directive `§7` format.
- Sidecar `PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE` is `review` under owner `Gemini2`, reviewer `Codex2`, `last_update=2026-05-22T03:44:08Z`.
- Reviewer history recorded in `ai-status.json` matters here:
  - the first review failure was path-level: packet missing entirely.
  - the second review failure was content-level: packet existed on Gemini2 branch (`b0b05c15`) but was too skeletal and omitted the real parent acceptance bar plus dependency map.

### Repo Baseline Anchors

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` currently still contains `WF-PRT-001` and does not contain `WF-PARTNER-001`, `WF-DRV-MP-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, or `WF-REL-001`.
- The same matrix currently keeps `WF-PROD-001` at `PASS (dry-run contract evidence)` and `WF-FWD-001` at `EXTERNAL-GATED`, which is the baseline that the parent task must update carefully without overstating proof.
- `docs/04-uat/fbp-014a-e2e-matrix.md` currently references `E2E-008`, but there are no visible rows yet for `E2E-010` or `E2E-011`.
- `tests/e2e/` currently contains `E2E-001` through `E2E-009`; `E2E-010-governance-aware-billing-reporting.sh` and `E2E-011-platform-admin-control-plane.sh` are still absent.
- `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` is authoritative for the gap statement that the release matrix is present on `origin/dev` but still needs the v3 reconciliation to reach 16 rows and remove stale `WF-PRT-001`.

Conclusion: this packet should be reviewed as a support-only freeze of the current acceptance story and dependency graph for a matrix rewrite that has not yet landed.

## 3) Parent Acceptance Checklist

This checklist expands the parent task's recorded acceptance into reviewer-facing detail without inventing new product semantics.

### AC-1 - Matrix identity and row count must match the gap-closure directive

- [ ] `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` is the only canonical artifact claimed by `PH1GC-MATRIX-001`.
- [ ] The parent closeout must show that the matrix reaches 16 workflow-family rows on `origin/dev`.
- [ ] The parent must not describe partial row additions as complete if the matrix still remains below 16 rows.

### AC-2 - `WF-PRT-001` must be fully replaced by `WF-PARTNER-001`

- [ ] No stale `WF-PRT-001` row remains in `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.
- [ ] `WF-PARTNER-001` is the only partner-eligibility workflow-family name used in the reconciled matrix.
- [ ] The parent evidence should include a grep/diff anchor that proves removal, not just prose claiming the rename happened.
- [ ] Historical evidence families such as `EXT-001` may still exist, but the matrix row itself must not preserve the old ID as an alias.

### AC-3 - Four net-new workflow rows must be present and correctly scoped

- [ ] `WF-DRV-MP-001` is present and framed as driver multi-platform workbench proof, not collapsed into `WF-DRV-001`.
- [ ] `WF-FIN-GOV-001` is present as governance-aware finance, separate from baseline `WF-FIN-001`.
- [ ] `WF-ADM-001` is present for platform-admin control-plane closure.
- [ ] `WF-REL-001` is present for release-truth synchronization / audit evidence.
- [ ] The parent must not silently drop any pre-existing non-target row while adding these four.

### AC-4 - `WF-PROD-001` must reflect the dual dry-run / live-exec posture

- [ ] The row description or gate-read language explicitly distinguishes dry-run evidence from live-exec readiness.
- [ ] The parent must not overstate production launch completion if only dry-run / rollback-drill proof exists.
- [ ] The row should remain aligned with the separate `PH1GC-PROD-001` support/evidence path.

### AC-5 - `WF-FWD-001` must preserve the forwarder non-claim

- [ ] `WF-FWD-001` remains `EXTERNAL-GATED` until the forwarder sandbox evidence task actually lands.
- [ ] The parent must not convert `WF-FWD-001` to `PASS` merely because the matrix wording was refreshed.
- [ ] The row should still point to named verification anchors rather than generic "future evidence" language.

### AC-6 - Every workflow row must have both verification path and non-claim

- [ ] Each row has a concrete verification path or evidence anchor.
- [ ] Each row also preserves a non-claim / boundary statement where proof is partial, static, sandbox-only, or externally gated.
- [ ] Reviewer should reject a matrix that only adds new names but leaves ambiguous evidence ownership or hidden closure assumptions.

### AC-7 - Closeout must follow directive `§7`

- [ ] Parent closeout includes: `Task ID`, `Owner`, `Reviewer`, `Branch`, `PR`, `Commit`, `Files changed`, `Verification commands`, `Evidence artifact`, `Workflow family affected`, `Gate read before`, `Gate read after`, `Remaining non-claim`, and `External dependencies, if any`.
- [ ] The parent closeout should make clear which rows remain blocked by downstream evidence tasks (`PH1GC-FWD-001`, `PH1GC-PROD-001`, device evidence, sandbox credentials, etc.).

## 4) Dependency Map

### 4.1 Formal machine dependency

| Dependency | Source | Status | Why It Matters |
| ---------- | ------ | ------ | -------------- |
| `PH1GC-BPL-002` | `PH1GC-MATRIX-001.depends_on` | pending | Release-truth terminology and audit framing must exist before the final matrix wording can claim a coherent `WF-REL-001` row and related evidence path. |

### 4.2 Downstream tasks and consumers

| Consumer | Current Status | Why It Matters |
| -------- | -------------- | -------------- |
| `PH1GC-MATRIX-002` | pending | The E2E matrix reconciliation depends on the final workflow-family names and row mapping from `PH1GC-MATRIX-001`. |
| `PH1GC-PARTNER-001` | pending | Supplies the architecture/evidence framing that `WF-PARTNER-001` should reference after the rename. |
| `PH1GC-DRV-MP-001` | pending | Supplies the row-level proof posture for `WF-DRV-MP-001`, especially the hard-gated `E2E-006`/device-evidence story. |
| `PH1GC-FIN-GOV-001` | pending | Supplies the spec/evidence basis for `WF-FIN-GOV-001` as a separate governance-aware finance row. |
| `PH1GC-ADM-001` | pending | Supplies the UAT/control-plane basis for `WF-ADM-001`. |
| `PH1GC-PROD-001` | pending | Supplies the live-exec readiness and rollback proof that `WF-PROD-001` must point at without overstating completion. |
| `PH1GC-FWD-001` | pending | Supplies the sandbox proof that may eventually change `WF-FWD-001`, but until then the row must keep its `EXTERNAL-GATED` non-claim. |

### 4.3 Practical review anchors

| Anchor | Location | Why It Matters |
| ------ | -------- | -------------- |
| D-1 | `ai-status.json` entries for `PH1GC-MATRIX-001` and `PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE` | Canonical machine truth for parent acceptance and sidecar review state. |
| D-2 | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.3 / §2.5 | Records the current gap: matrix present but still stale, row count still 12, rename/additions still missing. |
| D-3 | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §2 / §3.2 / §7 | Records the target 16-row posture, the `WF-PRT-001 -> WF-PARTNER-001` naming decision, and the required closeout format. |
| D-4 | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | Current baseline matrix that the parent will reconcile. |
| D-5 | `docs/04-uat/fbp-014a-e2e-matrix.md` | Downstream matrix consumer that must align once workflow-family names change. |
| D-6 | `tests/e2e/E2E-006-driver-multi-platform.sh` through `E2E-009-prod-rail-dry-run.sh` | Current visible E2E baseline that explains why some rows can be upgraded now and others must stay partial/non-claim. |

## 5) Evidence Inventory

| ID | Evidence | Location |
| -- | -------- | -------- |
| E-1 | Parent task machine-truth row | `ai-status.json` entry for `PH1GC-MATRIX-001` |
| E-2 | Sidecar task machine-truth row | `ai-status.json` entry for `PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE` |
| E-3 | Status-truth gap audit | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` |
| E-4 | Immutable directive / implementation target | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` |
| E-5 | Current release-gate matrix baseline | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` |
| E-6 | Current E2E matrix baseline | `docs/04-uat/fbp-014a-e2e-matrix.md` |
| E-7 | Current visible E2E script inventory | `tests/e2e/E2E-001-*.sh` through `tests/e2e/E2E-009-*.sh` |
| E-8 | Review-failure history explaining why this packet must be detailed | `ai-status.json` activity log messages for `PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE` |

## 6) Reviewer Hotspots (`Codex2`)

Reviewer should confirm:

1. The packet mirrors current machine truth: parent `PH1GC-MATRIX-001` is still `pending`, while this sidecar is only a support artifact in `review`.
2. The packet translates the real parent acceptance bar into actionable checklist items, rather than repeating four generic bullets.
3. The dependency map explicitly includes the formal upstream dependency `PH1GC-BPL-002` and the key downstream consumers `PH1GC-MATRIX-002` plus the row-specific evidence tasks.
4. The packet preserves the critical non-claims: `WF-FWD-001` remains `EXTERNAL-GATED`, `WF-PROD-001` cannot be overstated as live launch, and row-name updates alone do not count as evidence closure.
5. No canonical truth, runtime, registry, or main matrix files were modified while preparing this sidecar.

## 7) Suggested Parent Closeout Template

Use this only when the parent task itself is actually completed.

```text
Task ID: PH1GC-MATRIX-001
Owner: Codex2
Reviewer: Codex
Branch:
PR:
Commit:
Files changed: docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
Verification commands:
  - git grep 'WF-PRT-001' docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
  - git diff --check
  - git diff origin/dev -- docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
Evidence artifact: support/sidecars/PH1GC-MATRIX-001/PH1GC-MATRIX-001-SIDECAR-ACCEPTANCE.md
Workflow family affected: WF-PARTNER-001, WF-DRV-MP-001, WF-FIN-GOV-001, WF-ADM-001, WF-REL-001, WF-PROD-001, WF-FWD-001
Gate read before:
Gate read after:
Remaining non-claim:
External dependencies, if any:
```

## 8) Handoff Summary

This packet freezes the reviewer-facing acceptance story for `PH1GC-MATRIX-001` before the canonical matrix rewrite lands. It records the actual parent acceptance bar, the formal dependency on `PH1GC-BPL-002`, the downstream consumers that rely on the reconciled workflow-family naming, the current repo baseline still carrying `WF-PRT-001` and only `E2E-001..009`, and the mandatory non-claims that must survive the rewrite. It is support-only and does not change canonical truth.
