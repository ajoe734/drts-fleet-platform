# Production Deploy Rail Spec

Last updated: 2026-05-19
Workflow family: `WF-PROD-001`
Evidence level: `PASS (dry-run contract evidence)`
Primary workflow: `.github/workflows/deploy-prod.yml`

## Purpose

This document formalizes the Phase 1 production deploy rail for
`WF-PROD-001`. It defines what the production rail is allowed to claim, what
surfaces it currently covers, which operator and platform controls must exist
before first live use, and how the rail advances from dry-run proof to live
production evidence.

This spec does not replace the operator procedure in
`docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`. It defines the
rail contract that the runbook executes and that
`support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
proved at dry-run level.

## Source Of Truth

- Rail procedure: `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- Dry-run evidence: `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
- Gate row: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- Release/tag policy: `docs/ops/branch-strategy.md` §7
- Executable workflow: `.github/workflows/deploy-prod.yml`

## Workflow Family Statement

```text
Workflow family: WF-PROD-001
Business flow: Production deploy rail, rollback dispatch, and protected health verification
Current gate read: PASS (dry-run contract evidence)
Verification path: deploy-prod.yml + E2E-009 static contract check + PROD-RAIL closeout evidence
Evidence level: static evidence
Non-claim: This is not yet live production execution evidence
Next action: Configure prod GitHub/GCP controls, execute first real prod tag deploy, then run the rollback drill
```

## Scope Boundary

The production rail is the controlled path for deploying a promoted production
tag into GCP production infrastructure. Its contract is:

1. A human operator selects an immutable `prod/vYYYY.MM.DD.N` tag.
2. GitHub Actions validates the tag, repo configuration, and required GCP
   secrets before any deploy work starts.
3. The workflow builds and pushes production images, optionally runs the
   migration job, deploys the named Cloud Run services, and performs protected
   health verification.
4. Rollback is performed by redeploying the previous known-good `prod/v*` tag,
   normally with `skip_migration=true`.

The current rail covers these runtime surfaces:

- `drts-api`
- `drts-migrate`
- `drts-platform-admin-web`
- `drts-ops-console-web`

It does not currently claim direct deployment coverage for driver/mobile,
partner-booking, tenant-facing web, or any external partner adapter runtime.
Those surfaces may depend on this rail indirectly, but they are not explicit
workflow-owned deploy targets in `.github/workflows/deploy-prod.yml`.

## Required Control Plane

### GitHub-side controls

Required repository variables:

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_PLATFORM_ADMIN_ORIGIN`
- `PROD_OPS_CONSOLE_ORIGIN`
- `PROD_CONTROL_PLANE_API_ORIGIN`
- `PROD_IAP_CLIENT_ID`

Required repository secrets:

- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

Optional production workflow inputs and defaults:

- `skip_migration=true|false`
- `PROD_ARTIFACT_PROJECT_ID` defaults to `PROD_GCP_PROJECT_ID`
- `PROD_ARTIFACT_REGION` defaults to `PROD_GCP_REGION`
- `PROD_ARTIFACT_REPOSITORY` defaults to `drts`
- `PROD_SECRET_PREFIX` defaults to `drts-prod`
- `PROD_*_ALLOW_UNAUTHENTICATED` defaults to `false`

The GitHub `production` environment is the mandatory human approval gate.

### GCP-side controls

The rail assumes all of the following exist before first live execution:

- Workload Identity Federation path from GitHub Actions into the production
  project
- A distinct runtime service account separate from the GitHub deployer identity
- Artifact Registry write access for image push
- Cloud SQL instance wiring for both `drts-migrate` and `drts-api`
- Secret Manager entries under `${PROD_SECRET_PREFIX}-*`
- Cloud Run and IAP policy rights, or an explicit manual fallback for IAP policy
  mutation

Required Secret Manager entries:

- `${PROD_SECRET_PREFIX}-db-url`
- `${PROD_SECRET_PREFIX}-api-key-salt`
- `${PROD_SECRET_PREFIX}-jwt-secret`
- `${PROD_SECRET_PREFIX}-controlled-download-signing-secret`

Optional:

- `${PROD_SECRET_PREFIX}-internal-key`

## Deployment Graph Contract

`deploy-prod.yml` is a manual-only rail with serialized execution
(`concurrency: deploy-prod`) and a fixed stage order:

1. `validate-config`
   Confirms tag shape, tag existence on origin, required GitHub variables and
   secrets, and required Secret Manager entries.
2. `build-push`
   Resolves the requested prod tag to a commit SHA, then builds and pushes
   `api`, `migrate`, `platform-admin-web`, and `ops-console-web`.
3. `migrate`
   Creates or updates `drts-migrate`, attaches Cloud SQL, injects production DB
   secret material, and executes the job unless `skip_migration=true`.
4. `deploy`
   Deploys `drts-api`, `drts-platform-admin-web`, and `drts-ops-console-web`,
   enforces runtime service-account separation, wires Cloud SQL and secrets, and
   attempts the required Cloud Run/IAP policy bindings.
5. `health-check`
   Waits for `drts-api` readiness, mints an IAP token through WIF, verifies
   `GET /health`, and verifies protected identity-context routes for both web
   surfaces.

This graph is the minimum bar for a non-skeleton production rail. Removing any
of these stages downgrades the rail from production-ready contract to partial
automation.

## Tag And Release Model

The rail only accepts `prod/vYYYY.MM.DD.N` tags created by the promote path
defined in `docs/ops/branch-strategy.md` §7. The production rail therefore
depends on release-truth discipline upstream:

- `publish/v*` carries the promoted snapshot from `dev`
- `hourly-promote.yml` advances accepted publish snapshots toward `main`
- successful promote creates the immutable `prod/v*` deployment target

Production deploy is therefore a release-operation decision on a previously
promoted artifact, not a shortcut for deploying arbitrary branch heads.

## Rollback Relationship

Rollback is part of the rail contract, but the full drill protocol is a
separate artifact:

- This spec defines rollback as previous-tag redeploy, usually with
  `skip_migration=true`.
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` defines the
  operator procedure.
- `docs/03-runbooks/production-rollback-drill-20260519.md` is the formal drill
  and evidence template for proving that the rollback path works under operator
  control.

If a release includes a forward-only migration, the rail must stop at operator
escalation and cannot claim application-only rollback safety without database
owner approval.

## Evidence And Non-Claim Rules

The current evidence proves structural completeness, not live execution. The
following claims are allowed today:

- The production workflow is no longer a skeleton.
- The production rail enforces a manual `workflow_dispatch` entrypoint.
- Tag validation, production config validation, build/push, migration, deploy,
  and protected health-check stages are all present.
- E2E-009 statically proves the deploy/rollback contract in repo.

The following claims are not allowed today:

- No claim that a real prod GCP project has been deployed successfully.
- No claim that WIF, Secret Manager access, Cloud SQL connectivity, or IAP
  bindings have been exercised in production.
- No claim that rollback has been drill-tested against a previous prod tag.
- No claim that staging green equals production-ready.
- No claim that non-listed product surfaces are deployed by this rail.

## Live Gate To Reach Production Evidence

`WF-PROD-001` can only move from `PASS (dry-run contract evidence)` to a live
production evidence state when all of the following are true:

1. GitHub repo variables, secrets, and `production` environment reviewer gate
   are configured.
2. Production GCP project wiring exists for WIF, Cloud SQL, Artifact Registry,
   Secret Manager, Cloud Run, and IAP.
3. A valid `prod/v*` tag exists from the release promote path.
4. A real `gh workflow run deploy-prod.yml -f tag=prod/vYYYY.MM.DD.N` succeeds
   end to end.
5. Evidence is captured for tag, commit SHA, migration mode, workflow run,
   health-check result, and approver/rollback owner.
6. The follow-on rollback drill is executed and recorded.

Until those conditions are met, the remaining gate stays `EXTERNAL-GATED` for
live prod execution even though the contract-level rail is complete in repo.

## Acceptance For This Spec

This v3 formalization is complete when:

- `docs/03-runbooks/production-deploy-rail-spec-20260519.md` exists
- it points at the existing runbook and closeout evidence instead of duplicating
  operator steps
- it explicitly names the rail scope, control-plane dependencies, deploy graph,
  rollback relationship, and non-claims
- it preserves the current gate read as `PASS (dry-run contract evidence)` and
  does not over-claim live production readiness

