# DRTS dev / staging environment topology (2026-06-30)

Why this doc exists: the project/URL naming makes it easy to point at the wrong
environment. "dev" is split across **two layers** (a VM engine-room + a Cloud Run
storefront), and the GitHub-Actions deploy identity (WIF) lives in a *different*
project from where the dev services actually run. This maps it all out.

## "dev" is two layers

### Layer 1 — the VM (this machine) = dev engine-room / dev box
- Project the VM lives in: **`drts-dev-ray-tw-20260530`** (project number `1048889254056`;
  the VM's default compute SA is `1048889254056-compute@`).
- Runs the **dev infra** via `docker-compose.dev.yml`: Postgres (`drts-postgres`, postgis,
  `0.0.0.0:5432`), Redis, Mailpit. (`scripts/dev-up.sh` brings this up.)
- Runs the **orchestrator**: `drts-supervisor.service` + `drts-dashboard.service`
  (協作看板 dashboard, exposed via a cloudflared quick tunnel on `127.0.0.1:4174`).
- Also has stale local **review containers** `drts-we002-*` (`drts-review-*:we002`,
  built 2026-05-02 — old code on ports 4300-4303; NOT current dev).
- This layer is where code is built / CI / e2e is run / development happens.
  **It does NOT serve the public dev app URLs.**

### Layer 2 — Cloud Run = dev storefront (the public app URLs)
- The browsable dev surfaces are `https://drts-dev-<app>-waji3fer3a-uc.a.run.app`
  (the **`waji3fer3a`** URL set), served from project **`drts-dev-bobo-20260503`**
  (project number `75915426578`). This is the `waji` deploy profile.
- These keep serving the **last successfully-deployed** dev revision.

## The three GCP projects involved

| Project | Number | Role | State |
|---|---|---|---|
| `drts-dev-ray-tw-20260530` | 1048889254056 | the **VM** / dev box (infra + orchestrator) | healthy; no Cloud Run / artifact / WIF set up |
| `drts-dev-bobo-20260503` | 75915426578 | **dev Cloud Run storefront** (`waji3fer3a` URLs, `waji` profile) | healthy, serving |
| `drts-dev-ray-20260527` | 1027721192081 | **only hosts the GitHub-Actions WIF pool** `github-actions-pool` (deploy identity) | **CONSUMER_SUSPENDED** (billing) |

Staging is yet another Cloud Run set (`-y4vyuseyda` URLs, `drts-staging-*` projects) — do
not confuse it with the `waji3fer3a` dev set.

## The deploy-dev profiles (`.github/workflows/deploy-dev.yml`)

| profile | target project (vars) | artifact project | notes |
|---|---|---|---|
| `current` / DEV | `DEV_GCP_PROJECT_ID` = `drts-dev-ray-20260527` | same | points at the suspended project |
| `waji` | `WAJI_GCP_PROJECT_ID` = `drts-dev-bobo-20260503` | `WAJI_ARTIFACT_PROJECT_ID` = `drts-staging-bobo-20260502` | **this is the live public dev** |

## Why deploys are currently blocked (and why the site still works)

- The **GitHub-Actions WIF pool lives in `drts-dev-ray-20260527`** (the suspended project).
  Every deploy profile (current AND waji) authenticates by exchanging an STS token against
  that project, so **all new deploys fail** with
  `access_denied … Consumer 'projects/1027721192081' has been suspended`.
- BUT the running dev services are on **bobo**, not on the suspended ray project, so the
  `waji3fer3a` URLs keep serving the old revision. Suspension blocks *new deploys*, not the
  already-running services.
- A billing-suspended project keeps `lifecycleState: ACTIVE`; re-linking billing to an open
  account does **not** auto-lift the consumer-suspension — it needs an explicit Console
  **Reactivate** (or the billing-account owner).

## How to publish new dev code to the live storefront

1. Reactivate `drts-dev-ray-20260527` (Console Reactivate on the billing banner, or via the
   billing-account owner — `ray.tsai@` is project owner but cannot manage billing acct
   `015519-BA9D1D-37C984`). This only needs to un-suspend the WIF host; that project runs no
   services.
2. Then: `gh workflow run deploy-dev.yml --ref dev -f source_ref=<full-sha> -f target_profile=waji`.
   (`--ref dev` is required, else the "don't deploy from main" guard fails; `source_ref` must
   be a full 40-hex SHA.)

Cleaner long-term fix: move the GitHub-Actions WIF pool out of the suspended/abandoned ray
project into a healthy one (ideally `drts-dev-bobo-20260503` where dev runs), then repoint the
`DEV_WIF_PROVIDER` / `WAJI_WIF_PROVIDER` GitHub secrets. (Needs admin on the target project;
`ray.tsai@` has no permission on bobo.)

## Running the dev stack / e2e on the VM (verified working 2026-06-30)
- The VM's `drts-postgres` has postgis (CI's runner did not), so the hermetic e2e suite that
  is red in CI can run green here.
- Host has no `psql`; create a shim that routes into the container, translating `-f <hostfile>`
  to stdin (the container can't see host paths):
  `docker exec -i drts-postgres psql ...` with `-f` read from the host file via stdin.
- With that shim + `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform`
  and the e2e env (JWT_SECRET=ci-e2e-secret, PARTNER_INGRESS_KEY_BANK_DEMO_*_AIRPORT, etc.),
  `tests/e2e/run-e2e-hermetic.sh` runs each scenario green against a real booted API.
