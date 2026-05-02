# Development and Staging

## Purpose

This runbook defines the canonical environment model for this repo:

- `dev`
- `staging`

Local laptop or per-VM workspaces still matter for feature development, but they
are no longer treated as the shared integration tier. Shared verification now
happens in `dev`, and promotion into `staging` is a deliberate human decision.

## Environment Model

### Dev

`dev` is the shared integration environment. It should always reflect the latest
code that successfully passed CI on `main`.

`dev` is the right place for:

- integrated team review of the latest merged work
- cross-surface checks after feature branches land
- fast confirmation that the current mainline build still boots and deploys
- early QA before a phase is considered ready for staging

`dev` is not the final sign-off environment. It is allowed to move quickly and
can contain partially complete work that is safe to share internally.

### Staging

`staging` is the protected candidate environment. It should only receive an
artifact that already exists in `dev` and has been deliberately approved for
deeper verification.

`staging` is the right place for:

- deploy validation of an approved candidate build
- smoke and UAT evidence capture
- protected auth / proxy / ingress verification
- shared, reproducible sign-off before any later production decision

### Local workspace

Local laptop and project-VM workflows remain the place for branch-level work,
temporary debugging, and in-progress experimentation. They are no longer the
shared source of truth for “what is in development now”.

## CI/CD Flow

The repo now follows this baseline promotion path:

1. `feature/*` or any working branch opens a PR.
2. [CI workflow](/home/edna/workspace/drts-fleet-platform/.github/workflows/ci.yml:1) runs lint, typecheck, and unit tests.
3. When `main` is updated and CI completes successfully, [Deploy — Dev](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-dev.yml:1) automatically builds, migrates, and deploys `dev`.
4. When the team decides a phase is coherent enough for wider verification, an operator manually runs [Promote — Staging](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-staging.yml:1) with the approved `image_tag`.
5. GitHub Environment protection on `staging` should require human reviewers before the promotion job proceeds when the repo billing plan supports required reviewers. On the current private-repo plan, the repo still uses manual `workflow_dispatch` as the promotion gate because the required-reviewers protection rule is unavailable.

This model means:

- `dev` tracks the latest integrated mainline state
- `staging` tracks the latest approved candidate state
- the same image tag should move from `dev` into `staging`
- if `DEV_GCP_PROJECT_ID`, `DEV_GCP_REGION`, or `DEV_GCP_CLOUDSQL_INSTANCE` are not configured yet, `Deploy — Dev` intentionally stays dormant instead of falling back onto staging infrastructure

## Shared Runtime Shape

`dev` and `staging` should use the same deployment shape:

- Cloud Run services for API and web surfaces
- Cloud Run Job for database migration
- Cloud SQL for PostgreSQL
- Secret Manager for runtime secrets
- Artifact Registry for promoted container images

Do not treat “VM dev” as the canonical shared deploy tier anymore. If a
developer still uses a project VM for branch review, that workspace is a local
overlay, not the promotion path.

## Local Workspace Shape

For branch work and personal debugging, the existing repo bootstrap remains
valid:

1. Use Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env` if repo-local overrides are needed.
3. Run `pnpm install`.
4. Run `./scripts/dev-up.sh` to start PostgreSQL, Redis, and Mailpit.
5. Run `pnpm db:init` to apply migrations and seeds.
6. Start the required app surfaces locally or on your project VM.

Default service bindings:

| Surface                 | Command                   | Default bind                     | Default port          |
| ----------------------- | ------------------------- | -------------------------------- | --------------------- |
| API                     | `pnpm dev:api`            | `0.0.0.0` via `API_HOST` default | `3001` via `API_PORT` |
| Platform Admin Web      | `pnpm dev:platform-admin` | `0.0.0.0`                        | `3002`                |
| Ops Console Web         | `pnpm dev:ops`            | `0.0.0.0`                        | `3003`                |
| Tenant Portal reference | `pnpm dev:tenant`         | `0.0.0.0`                        | `3000`                |

Default infrastructure bindings:

| Service      | Compose port                 | Default bind                           |
| ------------ | ---------------------------- | -------------------------------------- |
| PostgreSQL   | `${POSTGRES_PORT:-5432}`     | `${DEV_INFRA_BIND_ADDRESS:-127.0.0.1}` |
| Redis        | `${REDIS_PORT:-6379}`        | `${DEV_INFRA_BIND_ADDRESS:-127.0.0.1}` |
| Mailpit SMTP | `${MAILPIT_SMTP_PORT:-1025}` | `${DEV_INFRA_BIND_ADDRESS:-127.0.0.1}` |
| Mailpit HTTP | `${MAILPIT_HTTP_PORT:-8025}` | `${DEV_INFRA_BIND_ADDRESS:-127.0.0.1}` |

Keep `DEV_INFRA_BIND_ADDRESS` at its default unless there is a deliberate,
time-boxed operator reason to expose infrastructure ports beyond the local
machine or project VM itself.

## Artifact Promotion Rules

- `Deploy — Dev` builds images once and tags them with the merged commit SHA.
- `Promote — Staging` must deploy an existing `image_tag`; it does not rebuild.
- For true build-once/promote behavior, `dev` and `staging` should point at the
  same Artifact Registry project / region / repository configuration.
- If `dev` and `staging` share a single GCP project, override the Cloud Run
  service names per environment so the two tiers do not collide.

## Local Overlay

Machine-specific notes do not belong in this tracked runbook. Put transient
port mappings, current container names, temporary firewall commands, and other
per-machine details in:

- `docs/03-runbooks/local-development.local.md`
- `.local/` for broader machine-only scratch files that are not part of the
  canonical runbook

Bootstrap helpers remain:

- `docs/03-runbooks/local-development.local.example.md`
- `./scripts/init-local-workspace.sh`
- `./scripts/init-local-development-overlay.sh`

Use `.env` / `.env.local` for runtime overrides, and use `.local/` for personal
notes, scratch payloads, and temporary reviewer URLs that should never be
committed.

Common local commands:

- `pnpm dev:api`
- `pnpm dev:tenant`
- `pnpm dev:platform-admin`
- `pnpm dev:ops`
- `pnpm dev:driver`
- `./scripts/check.sh`
- `pnpm db:migrate`
- `pnpm db:seed:reference`
- `pnpm db:seed:demo`
- `pnpm db:verify`

## Operator Rules

### Use local workspace when

- you are still iterating inside a feature branch
- the change is unstable and not ready to share with the rest of the team
- you need branch-level debugging or a one-off review surface

### Use dev when

- you need to see the latest merged state across the project
- you want a shared environment that updates automatically after CI passes
- the goal is integration feedback, not final approval

### Use staging when

- you need a stable, named candidate build
- the change is ready for shared smoke, UAT, or protected-auth verification
- the team wants a human checkpoint before wider verification

### Do not do this

- do not treat a developer VM as the canonical shared `dev` environment
- do not rebuild a fresh artifact in `staging` when promoting an approved dev candidate
- do not let direct pushes bypass CI and still count as “ready for dev”
- do not use `staging` as the fast-iteration sandbox
