# PH1GC-PROD-001 Closeout Report

Date: 2026-05-22
Task: `PH1GC-PROD-001`
Owner: `Codex`
Reviewer: `Codex2`
Directive anchor: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §2.2, §3.9, §7
Revalidated on: `2026-05-23` against `origin/dev`

Workflow family: `WF-PROD-001`
Business flow: `Production deploy / rollback rail`
Current gate read: `PASS (dry-run contract evidence)`
Verification path: `.github/workflows/deploy-prod.yml`; `tests/e2e/E2E-009-prod-rail-dry-run.sh`; `docs/03-runbooks/production-deploy-rail-spec-20260519.md`; `docs/03-runbooks/production-rollback-drill-20260519.md`; `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-DRY-RUN-EVIDENCE-20260522.md`; `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-ROLLBACK-DRILL-EVIDENCE-20260522.md`
Evidence level: `static evidence`
Non-claim: `This task does not prove a live production deploy, live production rollback, post-deploy monitoring, or a production launch claim. Production remains externally gated on GitHub production reviewers, PROD_* repo configuration, GCP provisioning, an approved dispatch, and real smoke + rollback evidence.`
Next action: `Use a real prod/v* tag with the protected production environment gate, capture the workflow run URL and smoke results, then execute and record a rollback-by-prior-prod-tag drill against live production.`

## Delivered Scope

- `.github/workflows/deploy-prod.yml` now wires the production rail through required `PROD_GCP_*` variables, WIF secrets, Artifact Registry path inputs, Cloud Run service/job overrides, Cloud SQL attachment, and Secret Manager mappings.
- `docs/03-runbooks/production-deploy-rail-spec-20260519.md` is the canonical operator spec for dispatch, config gates, service scope, smoke contract, and non-claim language.
- `docs/03-runbooks/production-rollback-drill-20260519.md` is the canonical rollback drill for previous-tag redeploy with `skip_migration=true`.
- `support/sidecars/WF-PROD-001-LIVE-EXEC/` contains dry-run evidence and rollback-drill evidence for the current non-live closure.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` names `WF-PROD-001` explicitly and keeps live production execution marked as externally gated.

## Acceptance Mapping

- Workflow acceptance: `.github/workflows/deploy-prod.yml` wires directive §3.9.3 `PROD_*` inputs, Artifact Registry path resolution, Cloud Run service/job overrides, Cloud SQL migration wiring, Secret Manager checks, and post-deploy health verification.
- Runbook acceptance: the deploy spec and rollback drill are both present on `origin/dev`, executable as written, and aligned with the workflow's `${PROD_GCP_API_SERVICE:-drts-api}`, `${PROD_GCP_PLATFORM_ADMIN_SERVICE:-drts-platform-admin-web}`, `${PROD_GCP_OPS_CONSOLE_SERVICE:-drts-ops-console-web}`, and `${PROD_GCP_MIGRATION_JOB:-drts-migrate}` override semantics.
- Sidecar acceptance: `support/sidecars/WF-PROD-001-LIVE-EXEC/` contains both dry-run evidence and rollback-drill evidence plus this closeout artifact.
- Non-claim acceptance: the gate remains `PASS (dry-run contract evidence)` and does not claim a live production launch, live rollback, or post-deploy monitoring proof.

## Remaining External Gates

- GitHub Environment `production` must keep its required-reviewer rule active.
- Repo settings must provide the required `PROD_GCP_*`, `PROD_ARTIFACT_*`, and `PROD_WIF_*` configuration.
- A real `prod/v*` tag dispatch, post-deploy smoke capture, and rollback-by-prior-prod-tag evidence are still required before any production-launch claim.

## Verification Commands

```bash
bash tests/e2e/E2E-009-prod-rail-dry-run.sh
git grep -n 'PROD_GCP_PROJECT_ID\|PROD_GCP_REGION\|PROD_GCP_CLOUDSQL_INSTANCE\|PROD_GCP_RUNTIME_SERVICE_ACCOUNT\|PROD_WIF_PROVIDER\|PROD_WIF_SERVICE_ACCOUNT' .github/workflows/deploy-prod.yml
git grep -n 'WF-PROD-001' docs/03-runbooks/phase1-workflow-acceptance-release-gates.md docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md
```

## Verification Result

- `tests/e2e/E2E-009-prod-rail-dry-run.sh` passes repo-locally on 2026-05-23.
- The release-gate matrix, deploy spec, rollback drill, and sidecar evidence all point to the same `WF-PROD-001` operator path.
- No artifact in this closeout claims production has launched.
