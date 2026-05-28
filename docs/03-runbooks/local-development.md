# VM Development and Staging

## Purpose

This runbook defines the only two active runtime environments for this repo:

- `VM dev`
- `stage`

This repo does not treat ad hoc laptop-only development or one-off SSH tunnel
workflows as the canonical operator model. Each project is expected to run on
its own dedicated VM development machine, and that VM must expose a stable,
externally reachable development entrypoint.

## Environment Model

### VM dev

`VM dev` is the long-lived development environment for one project on one VM.
Its job is to let engineers and reviewers reach in-progress web and API
surfaces directly from outside the VM without creating a fresh SSH tunnel or a
temporary public tunnel for every session.

`VM dev` is the right place for:

- daily feature work
- remote UI review of work in progress
- branch-level API and integration debugging
- fast cross-team previews before a staging deploy

`VM dev` is not the system-of-record for rollout evidence, final auth posture,
or shared closeout verification.

### Stage

`stage` is the shared verification environment. It is intended for deploy
validation, protected-control-plane checks, smoke coverage, UAT, and
cross-surface integration verification.

For this repo, staging remains the protected Cloud Run environment documented in
`docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`, with the internal
control-plane path routed through the protected staging hosts:

- `https://staging.drts-fleet.cctech-support.com`
- `https://ops.staging.drts-fleet.cctech-support.com`
- `https://api.staging.drts-fleet.cctech-support.com`

## Environment Responsibilities

### VM dev responsibilities

- provide a stable external entrypoint for the project VM
- expose only the web and API ports needed for development review
- support rapid iteration, temporary breakage, and branch-specific behavior
- remain simple enough that developers can restart or reconfigure it quickly

### VM dev non-responsibilities

- final release evidence
- canonical ingress / IAM / IAP verification
- production-like rollout proof
- shared cross-team truth when a result must be reproducible

### Stage responsibilities

- shared integration validation
- deploy, migration, and post-deploy verification
- protected auth / proxy / ingress verification
- smoke and UAT evidence capture

## VM dev Requirements

Every project VM must satisfy all of the following:

1. The VM has a fixed external address model.
   Use a stable VM IP, DNS name, or equivalent fixed endpoint. Do not depend on
   one-time tunnel URLs.
2. The VM exposes a stable project entrypoint.
   Web and API access patterns must be predictable from session to session.
3. Dev services are reachable from outside the VM.
   Services must not be effectively limited to loopback-only access if remote
   review is required.
4. Only necessary ports are exposed.
   Do not publish PostgreSQL, Redis, Mailpit, or other internal-only service
   ports to the public internet.
5. The VM has baseline access protection.
   At minimum, use HTTPS plus one of: basic auth, upstream identity protection,
   IP allowlisting, or an equivalent gate appropriate to the host environment.

## VM dev Runtime Shape

The current repo bootstrap still uses the local infra helpers below even though
the intended operator surface is a project VM:

1. Use Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env` if repo-local overrides are needed.
3. Run `python3 scripts/ensure-local-node-modules.py repair`.
   This wraps the canonical-root install path so `node_modules` stays linked to
   the local `.pnpm` virtual store instead of inheriting symlinks from an
   isolated auto-worker worktree.
4. Run `./scripts/dev-up.sh` to start PostgreSQL, Redis, and Mailpit.
5. Run `pnpm db:init` to apply migrations and seeds.
6. Start the required app surfaces on the VM.

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
time-boxed operator reason to expose infrastructure ports beyond the VM itself.

## Local Overlay

Machine-specific notes do not belong in this tracked runbook. Put transient
port mappings, current container names, temporary firewall commands, and other
per-VM review details in:

- `docs/03-runbooks/local-development.local.md`
- `.local/` for broader machine-only scratch files that are not part of the
  canonical runbook

That file is intentionally gitignored. Bootstrap it from:

- `docs/03-runbooks/local-development.local.example.md`
- `./scripts/init-local-workspace.sh`
- `./scripts/init-local-development-overlay.sh`

Examples of information that should stay in the local overlay instead of this
canonical runbook:

- current `430x` Docker review port mappings for one VM
- temporary container names such as `drts-we002-*`
- operator-specific GCP firewall commands
- ad hoc external-access debugging notes for one machine

Use `.env` / `.env.local` for runtime configuration overrides, and use `.local/`
for personal notes, scratch payloads, temporary reviewer URLs, and any other
local-only artifacts that should never be committed.

Common commands:

- `python3 scripts/ensure-local-node-modules.py check`
- `python3 scripts/ensure-local-node-modules.py repair`
- `pnpm dev:api`
- `pnpm dev:tenant`
- `pnpm dev:platform-admin`
- `pnpm dev:ops`
- `pnpm dev:driver`
- `./scripts/check.sh`
- `pnpm phase1:verify:backfill`
- `pnpm phase1:verify:uat`
- `pnpm phase1:verify:pilot`
- `pnpm phase1:verify:production`
- `pnpm db:migrate`
- `pnpm db:seed:reference`
- `pnpm db:seed:demo`
- `pnpm db:verify`

If app verification suddenly starts failing with `React` namespace errors,
missing `vitest` declarations, or `pnpm` warnings about an unexpected virtual
store location, run `python3 scripts/ensure-local-node-modules.py repair`
before debugging the application code itself. Those symptoms usually mean the
canonical root's `node_modules/.modules.yaml` has been rewired away from the
local `.pnpm` store.

## Operator Rules

### Use VM dev when

- you need to inspect in-progress UI or API behavior quickly
- you want another person to review work on the dedicated project VM
- the change is still actively evolving and does not need shared rollout
  evidence yet

### Use stage when

- you need a shared, reproducible verification result
- the change depends on protected-control-plane behavior
- the goal is smoke, UAT, or deploy verification rather than fast iteration

### Do not do this

- do not treat `VM dev` as the final closeout environment
- do not require per-session SSH tunnels as the normal way to access a project VM
- do not use temporary dashboard-only tunnel scripts as the app ingress model
- do not expose database or internal support ports publicly just because the VM
  is externally reachable

## Current Repo Boundaries

- API now contains executable Phase 1 baseline slices, but some runtime
  hardening and residual cleanup still remain environment-sensitive.
- Web and mobile surfaces still contain placeholder or partially integrated
  areas, so `VM dev` should be expected to show branch-level instability.
- Protected staging is the environment where auth, ingress, and shared rollout
  claims must be verified before they are treated as accepted evidence.
