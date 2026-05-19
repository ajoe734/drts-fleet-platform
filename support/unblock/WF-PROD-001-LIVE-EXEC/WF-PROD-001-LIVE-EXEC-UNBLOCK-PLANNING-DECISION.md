# WF-PROD-001-LIVE-EXEC — Unblock Planning Decision

**Task ID:** `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
**Parent task:** `WF-PROD-001-LIVE-EXEC`
**Owner:** `Claude` (governance review / architecture arbitration)
**Reviewer:** `Codex2`
**Decision date:** 2026-05-19
**Decision type:** Routing decision (no canonical product/contract change)

---

## 1. Decision

**No new product/contract decision is required.** The parent task
`WF-PROD-001-LIVE-EXEC` is correctly classified as **HELD-external**, not
HELD-pending-decision. The planning decision was already recorded in canon on
2026-05-19; the only remaining gate is human-operator provisioning of GCP
infrastructure and GitHub repository configuration.

This unblock task therefore resolves to **route as explicit external follow-up
needed**, per the task brief acceptance option "explicit follow-up needed by the
parent task".

### What was checked

| Source                                                                                       | Finding                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` §5, §8    | `WF-PROD-001-LIVE-EXEC` is listed under **HELD — Pending human resources / external resolution**, with explicit `waiting_for` reason: prod GCP project + WIF + Cloud SQL + Secret Manager + GitHub Environment `production` reviewer rule. Also listed as a P1 follow-on out of the v3 wave. |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` (PR #162)      | Production rail (`deploy-prod.yml`, 627 lines) is structurally complete; `tests/e2e/E2E-009-prod-rail-dry-run.sh` PASSES all 4 surfaces (validate-config, build-push, deploy dry-run, rollback). Live execution is intentionally external-gated; that is the rail's design, not a defect. |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`                                  | Operator playbook already exists: enumerates required `vars.PROD_*` and `secrets.PROD_WIF_*`, GitHub Environment `production` reviewer requirement, GCP provisioning steps, first-deploy command, and rollback command. |
| `phase1_service_contracts_v1.md` / `phase1_migration_plan_v1.md`                             | No product/contract surface is in conflict. Deploy rail is infrastructure plumbing; product semantics are unchanged.                                                  |
| `PHASE1_DECISION_LEDGER.md` / `PHASE1_OPEN_QUESTIONS.md`                                     | No outstanding decision targets the prod-rail surface. Decisions in flight relate to E2E numbering, partner rename, fin-gov scope, and docs strategy — none touch live-exec gating. |
| `ai-status.json` parent record                                                               | `status=blocked`, `waiting_for=Gemini2`, `next="Held — see conflicts doc / external resources"`. `waiting_for` and `next` are imprecise and will be corrected by this decision. |

### Why this is not a product/contract decision

A product/contract decision would change canonical L1/L2 spec surfaces
(PRD, service contracts, migration plan, decision tables, acceptance scenarios)
or alter what "production deploy" means. The current hold does none of those:

- The contract is fixed: prod deploys are manual, tag-pinned, environment-gated,
  WIF-authenticated, against a single configured GCP project.
- The acceptance bar is fixed: first real `gh workflow run deploy-prod.yml -f tag=prod/v<date>`
  succeeds through validate → build-push → migrate → deploy → health-check, plus
  a rollback drill.
- The hold is a *resource-availability* hold (GCP project + secrets + reviewer
  rule), not a *semantic* hold.

Treating this as a planning blocker would synthesise a non-existent product
question and is a category error.

## 2. Concrete unblocked next step for the parent task

The parent task `WF-PROD-001-LIVE-EXEC` requires no further canonical planning
work. Its `next` step is **operator-driven external configuration**, fully
documented in `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` and
summarised in `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` §7.

Concrete next step (recorded into the parent task's `next` field):

> External-gated. Operator must complete the prod-deploy-rollback runbook
> "Required GitHub Configuration" and GCP provisioning sections, then run
> `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>` for the first
> real deploy. Re-open as `WF-PROD-001-LIVE-EXEC` once the first run completes
> and produces a live-execution evidence packet. See
> `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` and
> `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` §7.

Correspondingly, the parent's `waiting_for` is updated from `Gemini2` (incorrect
— Gemini2 cannot unblock this; they reviewed the dry-run closeout) to
`human-operator-gcp-and-github-config` (matches the v3 wave planning runbook's
HELD-external classification).

## 3. Scope cut

**No scope cut is taken.** The parent task remains in scope as a P1 follow-on
out of the v3 wave (per planning runbook §8). It does not block any v3-wave
acceptance bar (planning runbook §7).

## 4. Acceptance check (per task brief)

| Acceptance item                                                                              | How met                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Resolve or route the missing product/contract decision through canonical planning artifacts  | Routed: confirmed via v3 wave planning runbook §5/§8 and PROD-RAIL-CLOSEOUT evidence that no product/contract decision is outstanding; the gate is external-resource availability. |
| Record the decision / scope cut / or explicit follow-up needed by the parent task            | Recorded above (§1 decision; §3 no scope cut; §2 explicit external follow-up).                          |
| Produce task-scoped commit/push/PR evidence for any canonical change                         | This artifact is committed task-scoped on `claude/wf-prod-001-live-exec-unblock-planning-decision` and pushed; the parent task's `next` / `waiting_for` correction is applied via `scripts/ai-status.sh progress` on the parent. |
| Update the parent task with the concrete unblocked next step                                 | Applied to `ai-status.json` parent record (see §2).                                                      |

## 5. Reviewer hand-off note for Codex2

Codex2: this is a routing-only decision. There is no canonical L1/L2 product
contract or schema change in this packet. Review surfaces to validate:

1. The HELD-external classification of `WF-PROD-001-LIVE-EXEC` in the v3 wave
   planning runbook §5/§8 is the correct precedence over the unblock brief's
   "missing product/contract decision" framing.
2. The parent task's updated `next` and `waiting_for` are concrete and point at
   the operator playbook rather than dangling phrases like "see conflicts doc".
3. No new entry is required in `PHASE1_DECISION_LEDGER.md` or
   `PHASE1_OPEN_QUESTIONS.md` (this decision does not create a new product
   semantic; it documents a routing call).

If you disagree on any of these — particularly if you believe a canonical
product/contract decision is in fact pending — `reopen` with the missing
citation and I'll re-draft.
