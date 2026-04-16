# GCP Staging Environment — Deploy Config

This directory contains the declarative GCP Cloud Run service definitions and migration job
for the DRTS Phase 1 staging environment.

## Prerequisites

| Resource                 | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| GCP Project              | `drts-staging` (set via `GCP_PROJECT_ID` repo variable)                       |
| Region                   | `asia-east1` (set via `GCP_REGION` repo variable)                             |
| Artifact Registry        | `asia-east1-docker.pkg.dev/$PROJECT/drts`                                     |
| Cloud SQL                | PostgreSQL 16 instance `drts-staging` in `asia-east1`                         |
| Secret Manager           | Secrets listed in §Secrets below                                              |
| Deployer service account | `WIF_SERVICE_ACCOUNT` — GitHub Actions identity used only for GCP auth/deploy |
| Runtime service account  | `GCP_RUNTIME_SERVICE_ACCOUNT` — attached to Cloud Run job/services at runtime |

## Required GitHub Secrets / Variables

| Name                          | Kind     | Value / Purpose                                     |
| ----------------------------- | -------- | --------------------------------------------------- |
| `GCP_PROJECT_ID`              | variable | GCP project ID                                      |
| `GCP_REGION`                  | variable | e.g. `asia-east1`                                   |
| `GCP_CLOUDSQL_INSTANCE`       | variable | `$PROJECT:$REGION:drts-staging`                     |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | variable | Cloud Run runtime service account email             |
| `WIF_PROVIDER`                | secret   | Workload Identity Federation provider resource name |
| `WIF_SERVICE_ACCOUNT`         | secret   | GitHub Actions deployer service account email       |

## Identity Split

The staging workflow now distinguishes between two identities:

- `WIF_SERVICE_ACCOUNT`: used by `google-github-actions/auth` so GitHub Actions can call
  `gcloud` and update Cloud Run resources.
- `GCP_RUNTIME_SERVICE_ACCOUNT`: attached to the Cloud Run Job and Cloud Run services
  during deploy.

Do not reuse the deployer identity as the Cloud Run runtime identity. The runtime service
account must have, at minimum:

- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor`
- The GitHub WIF deployer identity (`WIF_SERVICE_ACCOUNT`) must also have
  `iam.serviceAccounts.actAs` on `GCP_RUNTIME_SERVICE_ACCOUNT`
  (typically via `roles/iam.serviceAccountUser`) so `gcloud run deploy` /
  `gcloud run jobs update` can attach the runtime identity.

If `GCP_RUNTIME_SERVICE_ACCOUNT` is missing, or resolves to the same email as
`WIF_SERVICE_ACCOUNT`, `deploy-staging.yml` now fails fast before attempting the migration
execution. The workflow also tests `iam.serviceAccounts.actAs` up front so reruns fail
before the migration job if the deployer cannot bind the runtime service account.

## Secret Manager Secrets

These secrets are injected into Cloud Run services at runtime. The Cloud Run runtime
service account, not the GitHub WIF deployer identity, must be able to access them:

| Secret name                 | Consumed by          | Notes                                                    |
| --------------------------- | -------------------- | -------------------------------------------------------- |
| `drts-staging-db-url`       | `api`, `migrate-job` | `postgresql://user:pass@/dbname?host=/cloudsql/INSTANCE` |
| `drts-staging-api-key-salt` | `api`                | Random 32-byte hex string                                |
| `drts-staging-jwt-secret`   | `api`                | Random 64-byte hex string                                |

## Service Map

| Service YAML                      | Cloud Run service name       | Port | Description                                                                                                                 |
| --------------------------------- | ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `api-service.yaml`                | `drts-api`                   | 3001 | NestJS REST API                                                                                                             |
| `tenant-portal-web-service.yaml`  | ~~`drts-tenant-portal-web`~~ | 3000 | **RETIRED (FBP-007)** — frozen reference only; do NOT deploy. Production tenant UI is `tenant-commute-hub` (external repo). |
| `platform-admin-web-service.yaml` | `drts-platform-admin-web`    | 3002 | Platform Admin (Next.js)                                                                                                    |
| `ops-console-web-service.yaml`    | `drts-ops-console-web`       | 3003 | Ops Console (Next.js)                                                                                                       |

## Migration Job

`migrate-job.yaml` defines a Cloud Run Job that:

1. Pulls the `drts-api` image (which contains `scripts/` and `infra/migrations/`)
2. Runs `bash scripts/db-apply.sh` against the staging Cloud SQL instance
3. Uses `GCP_RUNTIME_SERVICE_ACCOUNT` so Cloud SQL socket access and Secret Manager
   injection do not depend on the GitHub deployer identity
4. Exits 0 on success — the deploy workflow gates the service rollout on job completion

## Deploy Order

```
build images → push to AR → run migrate-job → deploy api → deploy web apps → health check
```

## Files

```
infra/gcp/staging/
├── README.md                          # this file
├── api-service.yaml                   # Cloud Run service — drts-api
├── tenant-portal-web-service.yaml     # RETIRED (FBP-007) — frozen reference; do NOT deploy
├── platform-admin-web-service.yaml    # Cloud Run service — platform-admin-web
├── ops-console-web-service.yaml       # Cloud Run service — ops-console-web
└── migrate-job.yaml                   # Cloud Run Job — db migration runner
```
