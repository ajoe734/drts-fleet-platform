# PH1GC-PROD-001 — Unblock Planning Decision

**Task ID:** `PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION`
**Parent task:** `PH1GC-PROD-001`
**Owner:** `Codex2`
**Reviewer:** `Gemini2`
**Decision date:** 2026-05-22
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`PH1GC-PROD-001` is **not** blocked on a missing product or contract decision.
The canonical planning artifacts already define the production deploy rail,
release-tag authority, rollback expectations, and the live-execution hold
boundary. The authoritative production tag shape is the v4 branch-strategy tag:
`prod/v<YYYY.MM.DD>.<N>`.

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No contract/schema change**
- **No scope cut**
- **Explicit external follow-up for the parent task**
- **Document-precedence correction:** any lower-precedence `prod/v<semver>`
  wording is a documentation-alignment defect, not a planning blocker for
  `PH1GC-PROD-001`

The remaining blocker is operator-managed production readiness: GitHub `PROD_*`
variables and secrets, production GCP resources, `prod/v*` release-tag use, and
the first real deploy plus rollback evidence.

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `docs/ops/branch-strategy.md` §3, §4, §5 Gate 4, §7, §8 | Higher-precedence branch strategy v4 defines the production deploy anchor as `prod/v<YYYY.MM.DD>.<N>` and requires `deploy-prod.yml` to be dispatched with that exact tag shape. |
| `docs/03-runbooks/phase1-release-truth-sync-20260519.md` §2.1, §3, §4, §6 | This runbook correctly maps `WF-PROD-001` to matrix row 2 and `PH1GC-PROD-001` to `support/sidecars/WF-PROD-001-LIVE-EXEC/`, but its `prod/v<semver>` wording is lower-precedence than branch-strategy and therefore cannot control the production-tag shape. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row `WF-PROD-001` | The workflow family already has a settled contract: current read is `PASS (dry-run contract evidence)`, while live production execution remains explicitly `EXTERNAL-GATED` pending operator-managed resources and a real deploy. |
| `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.2 | The audit names the real gap precisely: missing `support/sidecars/WF-PROD-001-LIVE-EXEC/` evidence and `.github/workflows/deploy-prod.yml` completeness against the directive's production resource set. |
| `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.9 | The directive already fixes the required artifact set for this lane: `deploy-prod.yml`, `production-deploy-rail-spec-20260519.md`, `production-rollback-drill-20260519.md`, and production dry-run / rollback evidence. |
| `ai-status.json` tasks `PH1GC-BPL-002`, `PROD-SPEC-001`, `PROD-DRILL-001`, `WF-PROD-001-LIVE-EXEC` | Upstream planning/spec work is already closed. The unresolved work is the external live-execution gate, not a missing planning decision. |

## 3. Why This Is Not A Planning-Semantics Blocker

The production lane semantics are already settled:

- `prod/v<YYYY.MM.DD>.<N>` is the immutable production deploy anchor
- rollback is re-deploy of a prior `prod/v*` tag
- Cloud SQL rollback procedure must exist before any migration-bearing prod deploy
- `WF-PROD-001` may not claim live execution until real deploy + monitoring +
  human approval + rollback evidence exist
- the sidecar path for that proof is already fixed

Nothing in the canonical planning stack leaves the product intent unresolved.
The remaining gaps are environmental provisioning, the existence of a valid
origin tag in the branch-strategy format, and evidence capture.

The only unresolved issue found in planning artifacts is a documentation
consistency defect: `phase1-release-truth-sync-20260519.md` uses
`prod/v<semver>` wording that conflicts with the higher-precedence v4
branch-strategy document. Under `AI_COLLABORATION_GUIDE.md` conflict
precedence and the runbook's own §2.1 authority rule, branch-strategy wins.
That inconsistency should be cleaned up separately, but it does not block the
parent task from using the correct production-tag shape.

## 4. Parent Task Next Step

The concrete next step for `PH1GC-PROD-001` is:

> Keep the task classified as externally blocked until an operator provisions
> the required GitHub `PROD_*` variables/secrets, production GCP project/WIF/
> Cloud SQL/Artifact Registry/Secret Manager resources, and origin contains a
> deployable `prod/v<YYYY.MM.DD>.<N>` tag produced by the normal v4
> publish/promote flow. Then execute the first real production deploy rail via
> `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`, collect
> post-deploy smoke plus rollback-drill evidence, and publish that packet
> under `support/sidecars/WF-PROD-001-LIVE-EXEC/`.

This is a routing clarification, not a net-new decision. The parent should
resume only when those external prerequisites are available.

Until then, `PH1GC-PROD-001` should remain tracked as an external-readiness
gate rather than being reopened as a product-semantics or contract-definition
issue.

Separate follow-up for canonical doc hygiene:

> Align `docs/03-runbooks/phase1-release-truth-sync-20260519.md` from
> `prod/v<semver>` wording to the adopted v4 branch-strategy shape
> `prod/v<YYYY.MM.DD>.<N>`. This is a documentation correction task, not a
> blocker on `PH1GC-PROD-001`.

## 5. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only with precedence correction: branch-strategy v4 already defines the production tag shape and the parent's external gate. |
| Record the decision | Recorded here: no new decision required; use `prod/v<YYYY.MM.DD>.<N>` per branch-strategy and route the task to external prod readiness plus live evidence collection. |
| scope cut | Not needed. The parent scope is still valid; only its remaining gate is external. |
| or explicit follow-up needed by the parent task | Recorded in §4 as the operator-managed production readiness + live deploy evidence step, plus a separate documentation-alignment follow-up for release-truth-sync wording. |
| Produce task-scoped commit/push/PR evidence for any canonical change | This artifact is the canonical planning change for this helper task. |
| Update the parent task with the concrete unblocked next step | The parent should point at the external readiness checklist and the first real production deploy / rollback evidence step. |

## 6. Closeout Note

This helper task closes once the routing decision is committed, pushed on the
task branch, and mirrored into machine truth as the owner's `done` transition.

## 7. Review And Verification Evidence

- Reviewer approval for this routing conclusion is recorded on the task as
  `review_approved` with reviewer `Gemini2`.
- Verification scope for owner closeout is limited to canonical-artifact
  inspection and git evidence:
  - `AI_COLLABORATION_GUIDE.md` read for collaboration and machine-truth rules
  - `support/unblock/PH1GC-PROD-001/PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION.md`
    reviewed as the canonical unblock artifact
  - `git status -sb` confirmed a task-owned clean working tree before closeout
  - `git log --oneline --decorate -n 8` and `git show -s --format=fuller`
    confirmed the task-scoped commit chain and reviewer metadata
- Parent-task unblock result remains unchanged: `PH1GC-PROD-001` is routed to
  external production readiness plus first live deploy / rollback evidence, not
  to a new planning or contract decision.
