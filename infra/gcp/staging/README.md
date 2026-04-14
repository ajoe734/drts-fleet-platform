# GCP Staging Environment — Deploy Config

This directory contains the declarative GCP Cloud Run service definitions and migration job
for the DRTS Phase 1 staging environment.

## Prerequisites

| Resource          | Description                                              |
| ----------------- | -------------------------------------------------------- |
| GCP Project       | `drts-staging` (set via `GCP_PROJECT_ID` repo variable)  |
| Region            | `asia-east1` (set via `GCP_REGION` repo variable)        |
| Artifact Registry | `asia-east1-docker.pkg.dev/$PROJECT/drts`                |
| Cloud SQL         | PostgreSQL 16 instance `drts-staging` in `asia-east1`    |
| Secret Manager    | Secrets listed in §Secrets below                         |
| Service Account   | `drts-staging-deployer@$PROJECT.iam.gserviceaccount.com` |

## Required GitHub Secrets / Variables

| Name                    | Kind     | Value                                               |
| ----------------------- | -------- | --------------------------------------------------- |
| `GCP_PROJECT_ID`        | variable | GCP project ID                                      |
| `GCP_REGION`            | variable | e.g. `asia-east1`                                   |
| `GCP_CLOUDSQL_INSTANCE` | variable | `$PROJECT:$REGION:drts-staging`                     |
| `WIF_PROVIDER`          | secret   | Workload Identity Federation provider resource name |
| `WIF_SERVICE_ACCOUNT`   | secret   | Deployer service account email                      |

## Secret Manager Secrets

These secrets are injected into Cloud Run services at runtime:

| Secret name                 | Consumed by          | Notes                                                    |
| --------------------------- | -------------------- | -------------------------------------------------------- |
| `drts-staging-db-url`       | `api`, `migrate-job` | `postgresql://user:pass@/dbname?host=/cloudsql/INSTANCE` |
| `drts-staging-api-key-salt` | `api`                | Random 32-byte hex string                                |
| `drts-staging-jwt-secret`   | `api`                | Random 64-byte hex string                                |

## Service Map

| Service YAML                      | Cloud Run service name    | Port | Description              |
| --------------------------------- | ------------------------- | ---- | ------------------------ |
| `api-service.yaml`                | `drts-api`                | 3001 | NestJS REST API          |
| `tenant-portal-web-service.yaml`  | `drts-tenant-portal-web`  | 3000 | Tenant Portal (Next.js)  |
| `platform-admin-web-service.yaml` | `drts-platform-admin-web` | 3002 | Platform Admin (Next.js) |
| `ops-console-web-service.yaml`    | `drts-ops-console-web`    | 3003 | Ops Console (Next.js)    |

## Migration Job

`migrate-job.yaml` defines a Cloud Run Job that:

1. Pulls the `drts-api` image (which contains `scripts/` and `infra/migrations/`)
2. Runs `bash scripts/db-apply.sh` against the staging Cloud SQL instance
3. Exits 0 on success — the deploy workflow gates the service rollout on job completion

## Deploy Order

```
build images → push to AR → run migrate-job → deploy api → deploy web apps → health check
```

## Files

```
infra/gcp/staging/
├── README.md                          # this file
├── api-service.yaml                   # Cloud Run service — drts-api
├── tenant-portal-web-service.yaml     # Cloud Run service — tenant-portal-web
├── platform-admin-web-service.yaml    # Cloud Run service — platform-admin-web
├── ops-console-web-service.yaml       # Cloud Run service — ops-console-web
└── migrate-job.yaml                   # Cloud Run Job — db migration runner
```
