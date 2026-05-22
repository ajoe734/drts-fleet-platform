# WF-PROD-001 Dry-Run Evidence

Date: 2026-05-22
Task: `PH1GC-PROD-001`
Workflow family: `WF-PROD-001`
Status: `dry-run reviewed`

## Summary

This evidence packet records the non-live closure that `PH1GC-PROD-001` can
truthfully claim on `origin/dev`:

- `.github/workflows/deploy-prod.yml` is fully wired for production dispatch
- the canonical production deploy spec now exists
- the canonical rollback drill now exists
- static contract verification passes

This packet does not claim that production has launched.

## Evidence Anchors

- `.github/workflows/deploy-prod.yml`
- `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
- `docs/03-runbooks/production-rollback-drill-20260519.md`
- `tests/e2e/E2E-009-prod-rail-dry-run.sh`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`

## Dry-Run Execution

Command:

```bash
bash tests/e2e/E2E-009-prod-rail-dry-run.sh
```

Expected proof points:

- `validate-config` exists and enforces prod-tag shape + origin presence
- required `PROD_GCP_*` / `PROD_WIF_*` configuration gates exist
- build/push, migration, deploy, and health-check jobs are real
- rollback-by-tag command path is documented

## Workflow Wiring Covered

The production rail now documents and/or enforces:

- GitHub variables for project, region, Cloud SQL, runtime service account
- WIF provider and WIF deployer service account
- Artifact Registry path through `PROD_ARTIFACT_REGISTRY` or component fallbacks
- Cloud SQL attach for `drts-migrate` and `drts-api`
- Secret Manager mapping for `DATABASE_URL`, `API_KEY_SALT`, `JWT_SECRET`, and `CONTROLLED_DOWNLOAD_SIGNING_SECRET`
- Cloud Run service deploys for `drts-api`, `drts-platform-admin-web`, and `drts-ops-console-web`
- post-deploy smoke via IAP-protected `/health` and identity-context endpoints

## Remaining External Gates

Real live execution still depends on:

1. repo Settings containing the production variables and secrets
2. a provisioned production GCP project with WIF, Artifact Registry, Cloud SQL, and Secret Manager
3. GitHub environment `production` keeping its required-reviewer rule
4. a real `prod/v*` tag chosen for dispatch

## Non-Claim

No live production deploy, rollback, or monitoring evidence is attached here.
The correct current gate language remains dry-run / documented, not production
launched.
