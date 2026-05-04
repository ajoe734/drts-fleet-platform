# GCP Dev Environment — Deploy Config

This repo now treats `dev` as the shared integration environment. The dev
workflow is [Deploy — Dev](/home/edna/workspace/branch-archives/drts-fleet-platform-manual-dev/.github/workflows/deploy-dev.yml:1), and it is now manual-only via
`workflow_dispatch`.

## Goal

`dev` should always show the latest integrated mainline state. It is the place
to verify that merged work still builds, migrates, deploys, and boots in the
shared runtime shape.

## Trigger Model

- manual only: `workflow_dispatch` with an optional `source_ref`

`Deploy — Dev` builds fresh images, pushes them to Artifact Registry, runs the
migration job, then deploys API and web surfaces.

This is intentionally not tied to every `main` push. Run it only when the
current merged state actually needs a shared dev refresh.

## Required Configuration

The workflow resolves configuration in this order:

1. `DEV_*` variables / secrets
2. shared fallback variables / secrets without the `DEV_` prefix
3. workflow defaults where documented below

Required values:

| Name                              | Kind               | Purpose                                             |
| --------------------------------- | ------------------ | --------------------------------------------------- |
| `DEV_GCP_PROJECT_ID`              | variable           | Dev GCP project ID                                  |
| `DEV_GCP_REGION`                  | variable           | Dev Cloud Run / Cloud SQL region                    |
| `DEV_GCP_CLOUDSQL_INSTANCE`       | variable           | Dev Cloud SQL instance connection name              |
| `DEV_GCP_RUNTIME_SERVICE_ACCOUNT` | variable or secret | Runtime identity attached to Cloud Run job/services |
| `DEV_WIF_PROVIDER`                | secret             | Workload Identity Federation provider resource      |
| `DEV_WIF_SERVICE_ACCOUNT`         | secret             | GitHub Actions deployer identity                    |

Optional but recommended:

| Name                                       | Kind     | Default                                               |
| ------------------------------------------ | -------- | ----------------------------------------------------- |
| `DEV_ARTIFACT_PROJECT_ID`                  | variable | falls back to `DEV_GCP_PROJECT_ID`                    |
| `DEV_ARTIFACT_REGION`                      | variable | falls back to `DEV_GCP_REGION`                        |
| `DEV_ARTIFACT_REPOSITORY`                  | variable | `drts`                                                |
| `DEV_SECRET_PREFIX`                        | variable | `drts-dev`                                            |
| `DEV_GCP_API_SERVICE`                      | variable | `drts-api`                                            |
| `DEV_GCP_PLATFORM_ADMIN_SERVICE`           | variable | `drts-platform-admin-web`                             |
| `DEV_GCP_OPS_CONSOLE_SERVICE`              | variable | `drts-ops-console-web`                                |
| `DEV_GCP_MIGRATION_JOB`                    | variable | `drts-migrate`                                        |
| `DEV_API_ALLOW_UNAUTHENTICATED`            | variable | `true`                                                |
| `DEV_PLATFORM_ADMIN_ALLOW_UNAUTHENTICATED` | variable | `true`                                                |
| `DEV_OPS_CONSOLE_ALLOW_UNAUTHENTICATED`    | variable | `true`                                                |
| `DEV_CONTROL_PLANE_API_ORIGIN`             | variable | falls back to the deployed API service URL            |
| `DEV_PLATFORM_ADMIN_ORIGIN`                | variable | falls back to the deployed platform admin service URL |
| `DEV_OPS_CONSOLE_ORIGIN`                   | variable | falls back to the deployed ops console service URL    |
| `DEV_IAP_CLIENT_ID`                        | variable | empty                                                 |

## Secret Manager Convention

By default the workflow expects these Secret Manager names inside the dev GCP
project:

- `drts-dev-db-url`
- `drts-dev-api-key-salt`
- `drts-dev-jwt-secret`
- `drts-dev-controlled-download-signing-secret`
- `drts-dev-internal-key` (optional)

Set `DEV_SECRET_PREFIX` if your secret names differ.

## Artifact Promotion

For real build-once/promote behavior, `dev` and `staging` should point at the
same Artifact Registry coordinates:

- `*_ARTIFACT_PROJECT_ID`
- `*_ARTIFACT_REGION`
- `*_ARTIFACT_REPOSITORY`

That lets staging promote the exact image tag created by `Deploy — Dev` instead
of rebuilding anything.

## Shared-Project Note

If `dev` and `staging` live inside the same GCP project, override the service
and job names for at least one environment so the two tiers do not overwrite
each other.
