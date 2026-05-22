# PH1GC-PROD-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `PH1GC-PROD-001` — Phase 1 gap closure — production live execution readiness  
**Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer (machine truth snapshot):** `Codex` / `Codex2`  
**Generated:** `2026-05-22` (UTC)  
**Snapshot Timestamp:** `2026-05-22T05:38:11Z`

This packet is support-only. It does not edit canonical truth, does not claim the parent is complete, and does not supersede the parent owner's closeout evidence. Its purpose is to hand the reviewer a compact acceptance checklist, dependency map, and current-state hotspot list for `PH1GC-PROD-001`.

## 1. Machine-Truth Snapshot

- Sidecar task `PH1GC-PROD-001-SIDECAR-ACCEPTANCE` is `in_progress` under `Codex2` with reviewer `Codex`.
- Parent task `PH1GC-PROD-001` is `pending` under `Codex` with reviewer `Codex2`.
- Parent `depends_on=["PH1GC-BPL-002"]`.
- Parent `artifacts` in `ai-status.json`:
  - `.github/workflows/deploy-prod.yml`
  - `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
  - `docs/03-runbooks/production-rollback-drill-20260519.md`
  - `support/sidecars/WF-PROD-001-LIVE-EXEC/`

## 2. Dependency Map

### 2.1 Declared dependency

| Dependency | Status | Why it matters to `PH1GC-PROD-001` |
| --- | --- | --- |
| `PH1GC-BPL-002` | `pending` | The parent task explicitly depends on the release-truth sync runbook. Until that runbook lands, reviewer signoff on production readiness risks drifting from the branch/workflow naming, workflow-family renames, and sidecar mapping that Phase 1 gap-closure machine truth expects. |

### 2.2 Informative upstream context not encoded in `depends_on`

These are not declared blockers on the parent row, but they materially shape reviewer expectations:

| Context task | Status | Relevance |
| --- | --- | --- |
| `PROD-SPEC-001` | `done` | Machine truth says the production deploy rail spec was completed and pushed on `2026-05-19`; parent `PH1GC-PROD-001` re-issues that artifact under the PH1GC namespace and expects it visible on `origin/dev`. |
| `PROD-DRILL-001` | `done` | Machine truth says the production rollback drill runbook was completed and pushed on `2026-05-19`; parent `PH1GC-PROD-001` likewise expects the canonical path on `origin/dev`. |
| `WF-PROD-001-LIVE-EXEC` | `done` | Prior live-exec evidence closed as `HELD` external. The PH1GC parent tightens the expectation to a specific sidecar path and explicit readiness framing without claiming production has launched. |

## 3. Parent Acceptance Checklist

Source: parent `PH1GC-PROD-001` `acceptance` field in canonical `ai-status.json`, cross-read with `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` and directive `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.9 / §5.

| AC | Requirement | Current support snapshot |
| --- | --- | --- |
| AC-1 | `.github/workflows/deploy-prod.yml` on `origin/dev` wires the required `PROD_*` variables, WIF, Artifact Registry, Cloud Run, Cloud SQL migration, and Secret Manager mapping. | File is present in this worktree and on `origin/dev`. Content verification belongs to the parent owner/reviewer path. |
| AC-2 | `docs/03-runbooks/production-deploy-rail-spec-20260519.md` is visible on `origin/dev`. | Missing in this worktree. `ai-status.json` separately records `PROD-SPEC-001` as `done`, so reviewer should confirm whether the content exists only on another branch/commit and has not landed on `origin/dev`. |
| AC-3 | `docs/03-runbooks/production-rollback-drill-20260519.md` is visible on `origin/dev` with executable steps and verification. | Missing in this worktree. `ai-status.json` separately records `PROD-DRILL-001` as `done`, so reviewer should check for branch-only closeout vs. `origin/dev` visibility gap. |
| AC-4 | `support/sidecars/WF-PROD-001-LIVE-EXEC/` exists on `origin/dev` with dry-run plus rollback-drill evidence. | Missing at the exact PH1GC-required path in this worktree and absent from `git ls-tree -r origin/dev` under that name. Existing historical evidence is tracked under other paths/names. |
| AC-5 | GitHub Environment `production` required-reviewer rule is documented. | Prior `WF-PROD-001-LIVE-EXEC` machine truth says the environment/rule was confirmed, but that proof is historical and external-facing; reviewer should ensure PH1GC output cites it without overstating launch readiness. |
| AC-6 | Post-deploy smoke and rollback-by-prior-prod-tag are both proven. | Not evidenced by this sidecar. Historical `WF-PROD-001-LIVE-EXEC` is still `HELD` external, which means this remains an open parent concern until fresh PH1GC evidence is assembled. |
| AC-7 | Do not claim production launched without actual deploy, rollback drill, monitoring, and human approval gate. | This sidecar explicitly preserves that constraint. |
| AC-8 | Closeout report follows directive §7 format. | Parent-owner responsibility; not evaluated by this support artifact. |

## 4. Visibility Snapshot

### 4.1 Current worktree visibility

At packet generation time:

- Present: `.github/workflows/deploy-prod.yml`
- Missing: `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
- Missing: `docs/03-runbooks/production-rollback-drill-20260519.md`
- Missing: `support/sidecars/WF-PROD-001-LIVE-EXEC/`

### 4.2 `origin/dev` visibility check

`git ls-tree -r origin/dev -- ...` returns only:

- `.github/workflows/deploy-prod.yml`

This matches the status-truth document's headline that the PH1GC namespace was created because prior closeout markers did not guarantee the required artifacts were actually visible on `origin/dev`.

## 5. Reviewer Hotspots

1. `PH1GC-BPL-002` is still `pending`, and `PH1GC-PROD-001` explicitly depends on it. Reviewer should not treat the parent as ready for closeout until that dependency is resolved or deliberately re-scoped.
2. There is a naming/path alignment gap between current branch-strategy docs and the PH1GC parent acceptance:
   - `docs/ops/branch-strategy.md` points to `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
   - `PH1GC-PROD-001` requires `docs/03-runbooks/production-rollback-drill-20260519.md`
   - reviewer should require the parent packet to explain which document is canonical for PH1GC closeout rather than treating them as interchangeable by implication.
3. `ai-status.json` records `PROD-SPEC-001` and `PROD-DRILL-001` as `done`, but the exact PH1GC artifact paths are not visible in this worktree and are absent from `origin/dev` in this snapshot. That is precisely the gap-closure problem this wave is meant to fix.
4. `WF-PROD-001-LIVE-EXEC` historical evidence closed as `HELD` external, with missing `PROD_*` vars/secrets, no `prod/v*` tag evidence, and operator-managed GCP prerequisites. Parent `PH1GC-PROD-001` must keep that external-gate reality explicit and must not upgrade it to a launch claim.
5. This sidecar is intentionally limited to `support/sidecars/PH1GC-PROD-001/PH1GC-PROD-001-SIDECAR-ACCEPTANCE.md`. Any fix to workflow docs, canonical runbooks, or live-exec evidence belongs to the parent owner branch, not this packet.

## 6. Suggested Handoff Framing

Recommended review framing for the parent owner:

- Use this packet as a checklist and gap map only.
- Reconcile `PH1GC-BPL-002` first or explain why the dependency can be waived.
- Land or surface the exact PH1GC-required runbook paths on `origin/dev`.
- Reconcile the rollback-doc naming mismatch before asking for final acceptance.
- Keep the live-exec portion framed as readiness/evidence assembly unless an actual deploy and rollback drill have been run.

## 7. Evidence References

- Canonical machine truth: `ai-status.json` entries for `PH1GC-PROD-001-SIDECAR-ACCEPTANCE`, `PH1GC-PROD-001`, `PH1GC-BPL-002`, `PROD-SPEC-001`, `PROD-DRILL-001`, `WF-PROD-001-LIVE-EXEC`
- Status-truth audit: `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`
- Directive production rail section: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.9 and §5
- Branch and production rail wording: `docs/ops/branch-strategy.md` §5 Gate 4 and §7
- `origin/dev` visibility check for the parent artifact list

## 8. Scope Statement

This packet creates support material only. It does not modify L1/L2 product truth, runtime code, registry/governance logic, or the parent task's canonical implementation artifacts.
