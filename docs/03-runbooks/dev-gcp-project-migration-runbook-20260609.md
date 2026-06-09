# Dev GCP Project Migration Runbook

**Status:** active guardrail
**Last updated:** 2026-06-09
**Scope:** dev Cloud Run deploy target, Secret Manager, WIF, Cloud SQL, and
assistant provider credentials.

## Why This Exists

Dev can move between GCP projects as ownership changes. A human account name,
the active `gcloud` account, or a local `gcloud config get-value project` is not
the deploy target. The deploy target is the project encoded in GitHub repo
variables and proven by the latest `deploy-dev.yml` logs.

On 2026-06-09, local `gcloud` was authenticated as
`ray.tsai@cctech-support.com`, but the shared dev deploy rail still targeted
`drts-dev-bobo-20260503` because GitHub `DEV_GCP_PROJECT_ID` still pointed
there. This runbook prevents repeating that mistake during future moves.

## Source Of Truth

Use this order when deciding where to provision or debug dev resources:

1. GitHub repo variables and secrets used by `.github/workflows/deploy-dev.yml`.
2. The latest successful or in-progress `deploy-dev.yml` log.
3. Live Cloud Run service metadata in the project from step 1.
4. Secret Manager inventory in the project from step 1.

Do not use these as source of truth for the deploy target:

- local `gcloud config get-value project`
- current `gcloud auth list` active account
- the email address of the operator doing auth
- historical docs that mention `drts-dev-*` secret names
- a secret with the right name in a different GCP project

## Required GitHub Variables

Before provisioning dev secrets or rerunning deploy, capture these values:

```bash
gh variable get DEV_GCP_PROJECT_ID
gh variable get DEV_GCP_REGION
gh variable get DEV_GCP_CLOUDSQL_INSTANCE
gh variable get DEV_GCP_RUNTIME_SERVICE_ACCOUNT
gh variable get DEV_ARTIFACT_PROJECT_ID
gh variable get DEV_ARTIFACT_REGION
gh variable get DEV_ARTIFACT_REPOSITORY
gh variable get DEV_SECRET_PREFIX
gh variable get DEV_GCP_API_SERVICE
gh variable get DEV_GCP_PLATFORM_ADMIN_SERVICE
gh variable get DEV_GCP_OPS_CONSOLE_SERVICE
gh variable get DEV_GCP_FLEET_PARTNER_PORTAL_SERVICE
gh variable get DEV_GCP_MIGRATION_JOB
```

Also confirm these repo secrets exist and point to the intended Workload
Identity Federation provider/service account for the new dev project:

```bash
gh secret list | rg 'DEV_WIF_PROVIDER|DEV_WIF_SERVICE_ACCOUNT'
```

## Current-State Probe

Run these before deciding which project needs `drts-dev-llm-gateway-api-key`:

```bash
project_id="$(gh variable get DEV_GCP_PROJECT_ID)"
region="$(gh variable get DEV_GCP_REGION)"
secret_prefix="$(gh variable get DEV_SECRET_PREFIX)"

gcloud run services list \
  --project "$project_id" \
  --region "$region" \
  --format='table(metadata.name,status.url)'

gcloud secrets list \
  --project "$project_id" \
  --filter="name~${secret_prefix}" \
  --format='table(name)'
```

Then inspect the latest deploy log:

```bash
gh run list --workflow deploy-dev.yml --limit 5 \
  --json databaseId,headBranch,headSha,status,conclusion,url

gh run view <run-id> --log \
  | rg 'DEV_GCP_PROJECT_ID|DEV_GCP_CLOUDSQL_INSTANCE|DEV_GCP_RUNTIME_SERVICE_ACCOUNT|--project|Service URL|LLM_GATEWAY_PROVIDER'
```

The `--project` values in the log must match `DEV_GCP_PROJECT_ID`.

## Migration Checklist

1. Create or confirm the target GCP project is active.
2. Provision the target Cloud SQL instance and update `DEV_GCP_CLOUDSQL_INSTANCE`.
3. Provision the target runtime service account and update `DEV_GCP_RUNTIME_SERVICE_ACCOUNT`.
4. Configure WIF for GitHub Actions and update `DEV_WIF_PROVIDER` plus `DEV_WIF_SERVICE_ACCOUNT`.
5. Update `DEV_GCP_PROJECT_ID`, `DEV_GCP_REGION`, service names, artifact registry vars, and `DEV_SECRET_PREFIX`.
6. Recreate required dev secrets in the target project:
   `drts-dev-db-url`, `drts-dev-jwt-secret`,
   `drts-dev-controlled-download-signing-secret`, `drts-dev-internal-key`,
   `drts-dev-api-key-salt`, and any feature-specific provider secrets.
7. Add `drts-dev-llm-gateway-api-key` in the target project if OpenClaw or any
   real LLM provider should run in dev.
8. Confirm the runtime service account has `roles/secretmanager.secretAccessor`
   on the target project's required secrets.
9. Dispatch `deploy-dev.yml` with a full commit SHA or publish snapshot.
10. Verify the deploy log shows the target project in every `--project` flag.
11. Verify Cloud Run services exist in the target project and return healthy URLs.
12. Probe Platform Admin assistant sessions and confirm `provider` is the
    intended value (`openclaw` for OpenClaw rollout, `mock` only when explicitly
    choosing fallback).

## LLM Secret Rule

`drts-dev-llm-gateway-api-key` must live in the project named by the current
`DEV_GCP_PROJECT_ID`. The same secret name in an old dev project does not affect
the active deploy. The same secret name in a future personal or replacement dev
project does not affect deploy until GitHub `DEV_*` variables point there and a
new deploy succeeds.

When moving the LLM key, prefer a direct read/write by an operator or service
account with access to both projects. Do not assume staging WIF can read staging
secrets; verify that WIF path first.

## OpenClaw Verification

After `deploy-dev.yml` succeeds, use the Platform Admin web proxy path and check
the session provider:

```bash
base="<platform-admin-service-url>"

curl --silent --show-error --fail \
  -H 'content-type: application/json' \
  -d '{"title":"OpenClaw migration verification"}' \
  "$base/control-plane-proxy/platform-admin/assistant/sessions" \
  | jq '.data.provider'
```

If the result is `mock`, inspect the deploy log for
`LLM_GATEWAY_PROVIDER=mock`. The usual cause is that
`${DEV_SECRET_PREFIX}-llm-gateway-api-key` was absent from the active
`DEV_GCP_PROJECT_ID` at deploy time.
