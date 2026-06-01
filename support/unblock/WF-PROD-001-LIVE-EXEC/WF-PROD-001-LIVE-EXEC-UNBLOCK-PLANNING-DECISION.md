# WF-PROD-001-LIVE-EXEC — Unblock Planning Decision

**Task ID:** `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
**Parent task:** `WF-PROD-001-LIVE-EXEC`
**Owner:** `Codex`
**Reviewer:** `Codex2`
**Decision date:** 2026-05-19
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`WF-PROD-001-LIVE-EXEC` is **not** blocked on a missing product or contract
decision. The canonical planning artifacts already classify it as a
**HELD-external** follow-on: the rail is complete at the dry-run contract level,
while the first real production execution depends on operator-managed GitHub and
GCP configuration that exists outside repo-only closure.

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No scope cut**
- **Explicit external follow-up for the parent task**

## 2. Evidence

| Source | Finding |
| --- | --- |
| `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` §4, §5, §7, §8 | `WF-PROD-001-LIVE-EXEC` is listed under `HELD (external)` because it needs prod GCP project, WIF, Cloud SQL, Secret Manager, and GitHub Environment `production` reviewer configuration. The wave done criteria explicitly say HELD-external tasks are not blockers for the documentation-and-rail-completion definition of done. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row `WF-PROD-001` | The workflow family already reads `PASS (dry-run contract evidence)` with an explicit `EXTERNAL-GATED` non-claim for live prod execution. |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` §1, §4, §7 | The production rail is structurally complete; the missing pieces are repo settings and GCP resources that a human operator must provision before the first real `gh workflow run deploy-prod.yml ...` can succeed. |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | The operator procedure is already specified: required repo variables, required repo secrets, required GCP wiring, first deploy command, and rollback command. |
| `PHASE1_OPEN_QUESTIONS.md`, `PHASE1_DECISION_LEDGER.md` | No open question or decision entry targets `WF-PROD-001` or production live-exec semantics. |

## 3. Why This Is Not A Product/Contract Blocker

The canonical artifacts already define the production deploy contract:

- deploys are manual only
- deploys are pinned to immutable `prod/v<YYYY.MM.DD>.<N>` tags
- deploys are GitHub `production` environment gated
- deploys run through GitHub OIDC WIF into GCP
- live execution remains `EXTERNAL-GATED` until the operator provisions the
  required GitHub and GCP surfaces

That means the unresolved work is environmental provisioning, not product
semantics. Reframing this as a missing product/contract decision would create a
new blocker that is not supported by the planning artifacts.

## 4. Parent Task Next Step

The concrete next step for `WF-PROD-001-LIVE-EXEC` is:

> External-gated. Complete the "Required GitHub Configuration" and "Required
> GCP Wiring" sections in
> `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, then execute the
> first real deploy with
> `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`. After that
> run completes, attach a live-execution evidence packet and re-open
> `WF-PROD-001-LIVE-EXEC` for closeout.

This is the only unblock required by the parent task. No additional canonical
planning artifact is needed before the operator step.

## 5. Machine-Truth Note

The parent task's `next` field should point to the operator-runbook step above.
The current `waiting_for=Gemini2` value is semantically wrong, but the
`ai-status` helper only treats agent identities as first-class `waiting_for`
targets. This unblock packet therefore records the correct external dependency
in prose and updates the parent `next` message accordingly.

## 6. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: canonical planning artifacts already classify the parent as `HELD (external)`, not pending product semantics. |
| Record the decision / scope cut / or explicit follow-up needed by the parent task | Recorded here: no new decision, no scope cut, operator-driven external follow-up only. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Delivered on branch `codex/wf-prod-001-live-exec-unblock-planning-decision` alongside this artifact. |
| Update the parent task with the concrete unblocked next step | The parent `next` text should point at the prod deploy runbook operator steps and first live deploy command. |
