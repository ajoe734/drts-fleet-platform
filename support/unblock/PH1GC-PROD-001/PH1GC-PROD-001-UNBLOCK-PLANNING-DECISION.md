# PH1GC-PROD-001 Unblock Planning Decision

## Scope

- Task: `PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION`
- Parent: `PH1GC-PROD-001`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Decision date: `2026-05-24`
- Related held-external follow-up already closed: `WF-PROD-001-LIVE-EXEC`
  (`done` in `ai-status.json`)

## Question Routed Here

The chairman triage created this helper because `PH1GC-PROD-001` is blocked on
what has effectively become a planning-contract mismatch:

> Does `PH1GC-PROD-001` stay blocked until a real production deploy, live
> smoke, and rollback-by-prior-prod-tag are executed, or is that live-exec
> work already routed to the separate HELD-external `WF-PROD-001-LIVE-EXEC`
> track while `PH1GC-PROD-001` closes the repo-local dry-run/readiness scope?

## Canonical Sources Consulted

Citing higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2.

1. Directive §3.9 `WF-PROD-001` -
   `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`.
   The directive requires the production workflow, deploy spec, rollback drill,
   required `PROD_*` configuration, and acceptance at the level of a non-skeleton
   workflow plus dry run / controlled dry run plus rollback-drill evidence.
2. Implementation spec -
   `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
   §2 target matrix. It sets `WF-PROD-001` to `PASS (production dry-run
   evidence)`, not to "production launched".
3. Wave-planning runbook -
   `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   §5 and §8. It classifies `WF-PROD-001-LIVE-EXEC` as `HELD (external)` and
   explicitly pushes that live-exec work to a follow-on "once GCP prod
   configured".
4. Release-truth sync runbook -
   `docs/03-runbooks/phase1-release-truth-sync-20260519.md` §6.3. It defines
   rollback truth off `prod/v*` tags and points the operator playbook back to
   `PH1GC-PROD-001`, but it does not say the docs/readiness task itself equals a
   production-launch claim.
5. Workflow gate matrix -
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row
   `WF-PROD-001`. Current gate read is `PASS (dry-run contract evidence)` and
   the row explicitly says actual live prod execution remains
   `EXTERNAL-GATED`.
6. Existing closeout artifact -
   `support/sidecars/WF-PROD-001-LIVE-EXEC/PH1GC-PROD-001-CLOSEOUT-20260522.md`.
   It already records the repo-local closure as static/dry-run evidence and
   explicitly says it does not prove a live production deploy or launch claim.
7. Existing HELD-external task -
   `WF-PROD-001-LIVE-EXEC` in `ai-status.json`, plus its unblock helpers. That
   task is already the canonical route for real prod environment execution and
   external operator-managed prerequisites.

## Decision

**Scope cut the live-production execution proof out of `PH1GC-PROD-001`.**

More precisely:

- `PH1GC-PROD-001` owns the repo-local production rail readiness closure:
  `.github/workflows/deploy-prod.yml`, the deploy spec, the rollback drill, the
  sidecar packet shape, and the non-claim wording around production.
- Real production dispatch, post-deploy smoke, monitoring capture, and
  rollback-by-prior-prod-tag are not to be reinterpreted as missing product
  semantics on this parent task.
- That live-execution proof is already routed to the separate
  `WF-PROD-001-LIVE-EXEC` HELD-external track, which exists precisely because
  the required GCP/GitHub/operator resources are outside repo-local control.

## Rationale

- The highest-precedence planning artifacts after the directive do not model
  `PH1GC-PROD-001` as a production-launch task. They model `WF-PROD-001` as a
  dry-run/readiness gate and split live production execution into the explicit
  follow-on `WF-PROD-001-LIVE-EXEC`.
- Keeping `PH1GC-PROD-001` blocked on live smoke + rollback would duplicate the
  already-canonical `WF-PROD-001-LIVE-EXEC` owner/reviewer/evidence chain and
  would contradict the matrix row that already marks the current state as
  `PASS (dry-run contract evidence)` with an `EXTERNAL-GATED` non-claim.
- The existing `PH1GC-PROD-001` acceptance text in `ai-status.json` mixes two
  scopes: repo-local dry-run readiness and external live execution. This helper
  resolves that mismatch in favor of the canonical planning split above rather
  than inventing a new product requirement.

## What This Decision Changes

Machine truth:

- `PH1GC-PROD-001` should no longer remain `blocked` on a missing planning
  decision.
- Parent `next` should move from "blocked on external prod resources" to a
  concrete owner action: reconcile the parent against the accepted dry-run
  contract scope and close it on that basis.
- The live production follow-up stays where canon already put it:
  `WF-PROD-001-LIVE-EXEC` plus its existing HELD-external evidence and unblock
  chain.

Process:

- No new product decision ledger entry is needed; this artifact records that
  canon already chose the split.
- No new `PHASE1_OPEN_QUESTIONS.md` row is needed because the question is now
  answered, not escalated.

## Concrete Unblocked Next Step For The Parent

To be reflected in `PH1GC-PROD-001.next`:

1. Treat `PH1GC-PROD-001` as the dry-run/readiness closure for `WF-PROD-001`,
   aligned to the current matrix gate read `PASS (dry-run contract evidence)`.
2. Use the existing artifacts already present in repo:
   - `.github/workflows/deploy-prod.yml`
   - `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
   - `docs/03-runbooks/production-rollback-drill-20260519.md`
   - `support/sidecars/WF-PROD-001-LIVE-EXEC/PH1GC-PROD-001-CLOSEOUT-20260522.md`
3. Do not wait for live prod execution inputs on this parent. Real `prod/v*`
   deploy, post-deploy smoke, monitoring, and rollback evidence remain routed
   to `WF-PROD-001-LIVE-EXEC`.
4. If any machine-truth cleanup is still required before parent closeout, keep
   that cleanup scoped to metadata/scope alignment; do not reopen the product
   question.

## Disposition

- **Decision recorded**: live production execution is an explicit follow-up
  scope already routed to `WF-PROD-001-LIVE-EXEC`; it is not a missing
  product/contract decision on `PH1GC-PROD-001`.
- **Scope cut**: `PH1GC-PROD-001` should close on dry-run/readiness evidence,
  not on a production-launch claim.
- **Parent unblock result**: the next action is owner closeout/reconciliation
  of the parent task, not waiting on new product semantics.
