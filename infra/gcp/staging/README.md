# GCP Staging Environment — Promotion Config

This repo now treats `staging` as a manually approved candidate environment.
The staging workflow is [Promote — Staging](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-staging.yml:1), which promotes an existing image tag instead of rebuilding the app.

## Goal

`staging` should represent an approved candidate build, not “whatever landed on
main most recently”. The artifact should already exist in `dev`, and promotion
into `staging` should happen only after a human checkpoint.

## Trigger Model

- manual only: `workflow_dispatch`
- required input: `image_tag`
- recommended protection: GitHub Environment `staging` with required reviewers when the repo billing plan supports that protection rule

`Promote — Staging` reuses the shared deploy workflow to:

1. validate staging config
2. optionally run DB migration with the approved image tag
3. deploy API and web services
4. run protected post-deploy verification

On the current private-repo plan, GitHub accepted the `staging` environment
itself but rejected the required-reviewers protection rule. Promotion therefore
remains manual via `workflow_dispatch` until the plan supports environment
reviewers.

## Required Configuration

The reusable deploy workflow resolves configuration in this order:

1. `STAGING_*` variables / secrets
2. shared fallback variables / secrets without the `STAGING_` prefix
3. workflow defaults where documented below

Required values:

| Name                                  | Kind               | Purpose                                             |
| ------------------------------------- | ------------------ | --------------------------------------------------- |
| `STAGING_GCP_PROJECT_ID`              | variable           | Staging GCP project ID                              |
| `STAGING_GCP_REGION`                  | variable           | Staging Cloud Run / Cloud SQL region                |
| `STAGING_GCP_CLOUDSQL_INSTANCE`       | variable           | Staging Cloud SQL instance connection name          |
| `STAGING_GCP_RUNTIME_SERVICE_ACCOUNT` | variable or secret | Runtime identity attached to Cloud Run job/services |
| `STAGING_WIF_PROVIDER`                | secret             | Workload Identity Federation provider resource      |
| `STAGING_WIF_SERVICE_ACCOUNT`         | secret             | GitHub Actions deployer identity                    |
| `STAGING_CONTROL_PLANE_API_ORIGIN`    | variable           | Protected staging API origin                        |
| `STAGING_IAP_CLIENT_ID`               | variable           | IAP audience used for post-deploy verification      |

Optional but recommended:

| Name                                           | Kind     | Default                                             |
| ---------------------------------------------- | -------- | --------------------------------------------------- |
| `STAGING_ARTIFACT_PROJECT_ID`                  | variable | falls back to `STAGING_GCP_PROJECT_ID`              |
| `STAGING_ARTIFACT_REGION`                      | variable | falls back to `STAGING_GCP_REGION`                  |
| `STAGING_ARTIFACT_REPOSITORY`                  | variable | `drts`                                              |
| `STAGING_SECRET_PREFIX`                        | variable | `drts-staging`                                      |
| `STAGING_GCP_API_SERVICE`                      | variable | `drts-api`                                          |
| `STAGING_GCP_PLATFORM_ADMIN_SERVICE`           | variable | `drts-platform-admin-web`                           |
| `STAGING_GCP_OPS_CONSOLE_SERVICE`              | variable | `drts-ops-console-web`                              |
| `STAGING_GCP_MIGRATION_JOB`                    | variable | `drts-migrate`                                      |
| `STAGING_API_ALLOW_UNAUTHENTICATED`            | variable | `true`                                              |
| `STAGING_PLATFORM_ADMIN_ALLOW_UNAUTHENTICATED` | variable | `true`                                              |
| `STAGING_OPS_CONSOLE_ALLOW_UNAUTHENTICATED`    | variable | `true`                                              |
| `STAGING_PLATFORM_ADMIN_ORIGIN`                | variable | `https://staging.drts-fleet.cctech-support.com`     |
| `STAGING_OPS_CONSOLE_ORIGIN`                   | variable | `https://ops.staging.drts-fleet.cctech-support.com` |

## Secret Manager Convention

By default the workflow expects these Secret Manager names inside the staging
GCP project:

- `drts-staging-db-url`
- `drts-staging-api-key-salt`
- `drts-staging-jwt-secret`
- `drts-staging-internal-key` (optional)
- `drts-staging-controlled-download-signing-secret` (optional)

Set `STAGING_SECRET_PREFIX` if your secret names differ.

## Identity Split

The staging workflow distinguishes between two identities:

- `STAGING_WIF_SERVICE_ACCOUNT`: used by GitHub Actions to authenticate to GCP
  and mutate Cloud Run resources
- `STAGING_GCP_RUNTIME_SERVICE_ACCOUNT`: attached to the Cloud Run Job and Cloud
  Run services at runtime

Do not reuse the deployer identity as the runtime identity. The runtime service
account must have, at minimum:

- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor`

The deployer identity must also be able to attach the runtime identity
(`iam.serviceAccounts.actAs`, typically via `roles/iam.serviceAccountUser`).

## Artifact Promotion

For staging to promote the same artifact created in `dev`, both environments
must resolve to the same Artifact Registry coordinates:

- `*_ARTIFACT_PROJECT_ID`
- `*_ARTIFACT_REGION`
- `*_ARTIFACT_REPOSITORY`

If those settings differ, the `image_tag` may exist in `dev` but not in the
registry that staging reads from.

## Service Map Defaults

| Variable                             | Default service / job     |
| ------------------------------------ | ------------------------- |
| `STAGING_GCP_API_SERVICE`            | `drts-api`                |
| `STAGING_GCP_PLATFORM_ADMIN_SERVICE` | `drts-platform-admin-web` |
| `STAGING_GCP_OPS_CONSOLE_SERVICE`    | `drts-ops-console-web`    |
| `STAGING_GCP_MIGRATION_JOB`          | `drts-migrate`            |

If `dev` and `staging` share the same GCP project, override one environment’s
names so the two tiers do not collide.
