# Production Deploy And Rollback Runbook

Last updated: 2026-05-19
Owner: release engineering
Workflow: `.github/workflows/deploy-prod.yml`

## Purpose

This runbook defines the production deployment and rollback contract for
`WF-PROD-001`.

Production deploys are:

- manual only
- pinned to an immutable `prod/v<YYYY.MM.DD>.<N>` tag
- gated by the GitHub `production` environment
- executed through GitHub OIDC Workload Identity Federation into GCP

This is a release-operation rail, not a product-readiness claim. Pilot sign-off,
external integrations, and production go/no-go ownership still follow
`docs/03-runbooks/phase1-rollout.md`.

## Required GitHub Configuration

### Repository variables

Required:

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_PLATFORM_ADMIN_ORIGIN`
- `PROD_OPS_CONSOLE_ORIGIN`
- `PROD_CONTROL_PLANE_API_ORIGIN`
- `PROD_IAP_CLIENT_ID`

Optional:

- `PROD_ARTIFACT_PROJECT_ID`
- `PROD_ARTIFACT_REGION`
- `PROD_ARTIFACT_REPOSITORY`
- `PROD_SECRET_PREFIX`
- `PROD_API_ALLOW_UNAUTHENTICATED`
- `PROD_PLATFORM_ADMIN_ALLOW_UNAUTHENTICATED`
- `PROD_OPS_CONSOLE_ALLOW_UNAUTHENTICATED`

Defaults used by the workflow:

- `PROD_ARTIFACT_REPOSITORY` defaults to `drts`
- `PROD_SECRET_PREFIX` defaults to `drts-prod`
- unauthenticated exposure flags default to `false`

### Repository secrets

- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

## Required GCP Wiring

### Workload Identity Federation

The GitHub deploy identity must be able to impersonate the deployer service
account referenced by `PROD_WIF_SERVICE_ACCOUNT`.

Minimum effective permissions for the deployer identity:

- Artifact Registry push access
- Cloud Run admin/update access
- Cloud Run Job admin/execute access
- Secret Manager metadata read access
- IAM policy mutation for Cloud Run invoker/IAP binding, or a documented manual fallback

### Runtime service account

`PROD_GCP_RUNTIME_SERVICE_ACCOUNT` must not be the same identity as the GitHub
deployer account.

Minimum runtime permissions:

- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor`
- any app-specific runtime roles required by production services

### Secret Manager

The workflow hard-fails unless these secrets exist in the production GCP
project:

- `${PROD_SECRET_PREFIX}-db-url`
- `${PROD_SECRET_PREFIX}-api-key-salt`
- `${PROD_SECRET_PREFIX}-jwt-secret`
- `${PROD_SECRET_PREFIX}-controlled-download-signing-secret`

Optional:

- `${PROD_SECRET_PREFIX}-internal-key`

### Cloud SQL

`PROD_GCP_CLOUDSQL_INSTANCE` must point at the production Cloud SQL instance
connection name used by both:

- the `drts-migrate` Cloud Run Job
- the `drts-api` Cloud Run service

## What The Workflow Does

`deploy-prod.yml` runs the following graph:

1. `validate-config`
2. `build-push`
3. `migrate` unless `skip_migration=true`
4. `deploy`
5. `health-check`

Key protections:

- validates the `prod/v...` tag shape
- validates that the tag exists on origin
- validates required GitHub variables/secrets
- validates required Secret Manager entries before build/deploy begins
- serializes production deploys via `concurrency: deploy-prod`
- keeps production migrations non-cancellable
- verifies post-deploy health through the IAP-protected control-plane endpoints

## Standard Deploy Procedure

### Pre-flight

1. Confirm the target version exists:
   `git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V`
2. Confirm rollout approval and rollback owner from
   `docs/03-runbooks/phase1-rollout.md`.
3. Confirm required GitHub `production` environment reviewers are available.
4. Confirm production secrets and Cloud SQL target are current.

### Run deploy

Normal deploy:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.19.0
```

Deploy without rerunning DB migration:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.19.0 -f skip_migration=true
```

### Expected service actions

The workflow:

- checks out the requested prod tag
- builds and pushes `api`, `migrate`, `platform-admin-web`, and `ops-console-web`
- updates or creates the `drts-migrate` Cloud Run Job
- runs migration against production Cloud SQL unless skipped
- deploys:
  - `drts-api`
  - `drts-platform-admin-web`
  - `drts-ops-console-web`
- verifies:
  - Cloud Run `Ready=True`
  - `GET <PROD_CONTROL_PLANE_API_ORIGIN>/health`
  - protected platform-admin and ops-console identity context endpoints

## Rollback Procedure

### When to rollback

Rollback is the default production response when:

- migration completed but application health checks fail
- control-plane proxy auth fails after deploy
- operator-visible regression is confirmed on the new prod tag
- an approved go/no-go owner explicitly calls rollback

### Rollback steps

1. Identify the previous known-good prod tag:
   `git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V | tail -2`
2. Redeploy the previous tag:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.18.0 -f skip_migration=true
```

3. If the failed release included a forward-only migration, stop and escalate to
   the database owner before redeploying application services.
4. Re-run protected health verification against the restored tag.
5. Record the rollback decision, owner, tag pair, and remaining incident state in
   the active rollout log / evidence pack.

### Migration rollback rule

`skip_migration=true` is the safe default for application-only rollback.

Do not run a schema down-migration from GitHub Actions unless a separate,
reviewed rollback procedure for that migration exists and the database owner has
approved it.

## Failure Triage

If the workflow fails, triage in this order:

1. `validate-config`
   Missing GitHub vars/secrets, missing prod tag, or missing Secret Manager entries.
2. `build-push`
   Artifact Registry auth, Docker build failures, or image push permission issues.
3. `migrate`
   Cloud SQL connectivity, runtime service-account access, or app migration failure.
4. `deploy`
   Cloud Run IAM, secret mounts, IAP binding, or service config errors.
5. `health-check`
   Cloud Run readiness, IAP token audience mismatch, or control-plane route/auth regressions.

## Evidence Expectations

For any production deploy or rollback, capture at minimum:

- deployed prod tag
- resolved commit SHA
- whether migration was run or skipped
- workflow run URL
- health-check result
- rollback owner / approver
- any incident or regression reference used to justify rollback

## Reference Anchors

- [`.github/workflows/deploy-prod.yml`](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-prod-rail-001/.github/workflows/deploy-prod.yml)
- [`docs/03-runbooks/phase1-rollout.md`](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-prod-rail-001/docs/03-runbooks/phase1-rollout.md)
- [`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-prod-rail-001/docs/03-runbooks/phase1-workflow-acceptance-release-gates.md)
- [`docs/ops/branch-strategy.md`](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-prod-rail-001/docs/ops/branch-strategy.md)
