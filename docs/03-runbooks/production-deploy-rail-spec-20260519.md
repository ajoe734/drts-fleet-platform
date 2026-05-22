# Production Deploy Rail Spec

Last updated: 2026-05-22
Owner: release engineering
Workflow: `.github/workflows/deploy-prod.yml`
Directive: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.9

## Purpose

This document is the canonical production deploy specification for `WF-PROD-001`.

It defines the deploy rail, config gates, Cloud Run service scope, migration path,
post-deploy smoke contract, and the human approval boundary. It does not claim
that production has launched.

## Required GitHub Configuration

### Required repository variables

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_PLATFORM_ADMIN_ORIGIN`
- `PROD_OPS_CONSOLE_ORIGIN`
- `PROD_CONTROL_PLANE_API_ORIGIN`
- `PROD_IAP_CLIENT_ID`

### Artifact Registry path inputs

Use one of these shapes:

1. Preferred single-path form:
   - `PROD_ARTIFACT_REGISTRY`
2. Component form:
   - `PROD_ARTIFACT_PROJECT_ID`
   - `PROD_ARTIFACT_REGION`
   - `PROD_ARTIFACT_REPOSITORY`

If the component form is omitted, the workflow falls back to:

- artifact project = `PROD_GCP_PROJECT_ID`
- artifact region = `PROD_GCP_REGION`
- artifact repository = `drts`

### Optional repository variables

- `PROD_SECRET_PREFIX`
- `PROD_API_ALLOW_UNAUTHENTICATED`
- `PROD_PLATFORM_ADMIN_ALLOW_UNAUTHENTICATED`
- `PROD_OPS_CONSOLE_ALLOW_UNAUTHENTICATED`

Defaults:

- `PROD_SECRET_PREFIX` defaults to `drts-prod`
- unauthenticated exposure flags default to `false`

### Required repository secrets

- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

### Required GitHub environment gate

The workflow targets environment `production`. That environment must retain a
required-reviewer rule so every dispatch pauses for explicit human approval
before any production mutation runs.

## Required GCP Wiring

### Workload Identity Federation

The GitHub deploy identity must be able to impersonate
`PROD_WIF_SERVICE_ACCOUNT` via `PROD_WIF_PROVIDER`.

Minimum effective permissions for the deployer identity:

- Artifact Registry push access
- Cloud Run admin/update access
- Cloud Run Job admin/execute access
- Secret Manager metadata read access
- Cloud Run / IAP IAM mutation access, or a documented manual fallback

### Runtime service account

`PROD_GCP_RUNTIME_SERVICE_ACCOUNT` must be a separate identity from the WIF
deployer service account.

Minimum runtime permissions:

- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor`
- app-specific runtime roles required by the production services

### Secret Manager mapping

The workflow hard-fails unless these secrets exist in the production GCP
project:

- `${PROD_SECRET_PREFIX}-db-url` -> `DATABASE_URL`
- `${PROD_SECRET_PREFIX}-api-key-salt` -> `API_KEY_SALT`
- `${PROD_SECRET_PREFIX}-jwt-secret` -> `JWT_SECRET`
- `${PROD_SECRET_PREFIX}-controlled-download-signing-secret` -> `CONTROLLED_DOWNLOAD_SIGNING_SECRET`

Optional mapping:

- `${PROD_SECRET_PREFIX}-internal-key` -> `DRTS_INTERNAL_KEY`

### Cloud SQL attachment

`PROD_GCP_CLOUDSQL_INSTANCE` is attached to:

- Cloud Run Job `drts-migrate`
- Cloud Run service `drts-api`

## Workflow Graph

`deploy-prod.yml` is `workflow_dispatch` only and accepts:

- `tag` = immutable `prod/vYYYY.MM.DD.N`
- `skip_migration` = `false|true`

Execution graph:

1. `validate-config`
2. `build-push`
3. `migrate` unless `skip_migration=true`
4. `deploy`
5. `health-check`

Protections:

- tag regex enforcement
- origin tag existence check
- required GitHub variable/secret validation
- required Secret Manager entry validation
- serialized production concurrency via `group: deploy-prod`
- environment `production` approval gate

## Build / Artifact Contract

The workflow builds and pushes these images into `${REGISTRY}`:

- `api`
- `migrate`
- `platform-admin-web`
- `ops-console-web`

Tagging model:

- immutable image tag = first 12 chars of the resolved commit SHA
- mutable convenience tag = `latest`

## Production Service Scope

The deploy job updates these Cloud Run services:

- `drts-api`
- `drts-platform-admin-web`
- `drts-ops-console-web`

The migration job is:

- `drts-migrate`

Current production rail scope does not include separate tenant, partner, or
driver Cloud Run services because those surfaces are shipped through other
channels and are not referenced by `.github/workflows/deploy-prod.yml`.

## Standard Deploy Procedure

### Pre-flight

1. Confirm the target tag exists:
   `git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V`
2. Confirm go/no-go owner and rollback owner from `docs/03-runbooks/phase1-rollout.md`.
3. Confirm the `production` environment reviewer rule is active.
4. Confirm the Artifact Registry path, Cloud SQL instance, and Secret Manager entries are current.

### Dispatch

Normal deploy:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.19.0
```

Application-only redeploy without migration:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.19.0 -f skip_migration=true
```

## Post-Deploy Smoke Contract

The workflow proves all of the following before it prints completion URLs:

1. Cloud Run service `drts-api` reaches `Ready=True`
2. `GET ${PROD_CONTROL_PLANE_API_ORIGIN}/health` succeeds with an IAP-minted ID token
3. `GET ${PROD_PLATFORM_ADMIN_ORIGIN}/control-plane-proxy/identity/context` succeeds
4. `GET ${PROD_OPS_CONSOLE_ORIGIN}/control-plane-proxy/identity/context` succeeds

Any failure leaves the run red and blocks the production claim.

## Evidence And Non-Claim Rules

Every dispatch must record:

- deployed `prod/v*` tag
- resolved commit SHA
- whether migration ran or was skipped
- workflow run URL
- smoke verdict
- approver / rollback owner

This spec is not enough to claim "production launched". That claim requires:

- a real approved deploy
- post-deploy monitoring evidence
- a rollback drill against a prior prod tag
- the companion artifact in `support/sidecars/WF-PROD-001-LIVE-EXEC/`

## Companion Artifacts

- `docs/03-runbooks/production-rollback-drill-20260519.md`
- `support/sidecars/WF-PROD-001-LIVE-EXEC/`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/ops/branch-strategy.md` §7
