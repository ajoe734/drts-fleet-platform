# FBP-013A — Staging Deploy Evidence Pack

**Task:** `FBP-013A` — staging deploy evidence pack
**Parent Umbrella:** `FBP-013` — staging / smoke / UAT evidence closeout
**Owner:** Claude (availability-first reassignment from Codex at 2026-04-16T02:49Z)
**Reviewer:** Codex
**Status:** review_ready — all three AC now PASS; live evidence collected from green run #24522301392
**Created:** 2026-04-16 (UTC)
**Staging Infra Baseline:** commit `ff015a9` (WE-003), path `infra/gcp/staging/`
**Deploy Workflow Baseline:** commit `ff015a9` (WE-003), path `.github/workflows/deploy-staging.yml`
**Green Deploy Commit:** `fb77010` — FBP-013A-INFRA remediation complete; all four jobs passed

---

## 1. Purpose & Scope

This pack constitutes the staging deploy evidence artifact for Phase 1 blueprint execution
closeout. It provides:

- Canonical deploy pipeline topology and job dependency graph
- Migration sequence (V0001–V0018) with pass semantics
- Secret wiring inventory and runtime injection trace
- Health check acceptance criteria
- Canonical passing-deploy transcript (what a green staging run looks like)
- **Explicit gate decisions** for the two operational gaps carried from Wave E:
  - Manual rollout matrix (AC-2a)
  - `/api/admin/flags` endpoint status (AC-2b)
- Family-to-sidecar cross-reference table for FBP-013D synthesis

**Not in scope:** fabricating CI artifact URLs or claiming a passing live deploy without
runtime evidence. This pack preserves both the pre-remediation failure record and the
post-remediation green evidence chain that now satisfies AC-1.

> **Status note (post-remediation, green):** FBP-013A-INFRA remediation is complete.
> GitHub Actions run **#24522301392** passed all four jobs: `build-push`, `migrate`,
> `deploy`, and `health-check`. Live evidence items E-11/E-12/E-13 are now populated.
> AC-1 moves to PASS. All three acceptance criteria are satisfied. Evidence pack is
> ready for Codex review.

---

## 2. Staging Infrastructure Inventory

### 2.1 Cloud Run Services

| Service YAML                                        | Cloud Run Service Name       | Port | Status                                |
| --------------------------------------------------- | ---------------------------- | ---- | ------------------------------------- |
| `infra/gcp/staging/api-service.yaml`                | `drts-api`                   | 3001 | **Active**                            |
| `infra/gcp/staging/platform-admin-web-service.yaml` | `drts-platform-admin-web`    | 3002 | **Active**                            |
| `infra/gcp/staging/ops-console-web-service.yaml`    | `drts-ops-console-web`       | 3003 | **Active**                            |
| `infra/gcp/staging/tenant-portal-web-service.yaml`  | ~~`drts-tenant-portal-web`~~ | 3000 | **RETIRED** (FBP-007) — do NOT deploy |
| `infra/gcp/staging/migrate-job.yaml`                | Cloud Run Job `drts-migrate` | —    | **Active**                            |

**Note:** `tenant-portal-web` is frozen-reference only. The production tenant UI is
`tenant-commute-hub` (external repo, FBP-006 cutover). The deploy workflow and Cloud Run
YAML both carry the RETIRED annotation.

### 2.2 GCP Project Coordinates

| Resource                 | Value                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| GCP Project              | `drts-staging` (via `GCP_PROJECT_ID` repo variable)                    |
| Region                   | `asia-east1` (via `GCP_REGION` repo variable)                          |
| Artifact Registry        | `asia-east1-docker.pkg.dev/$PROJECT/drts`                              |
| Cloud SQL                | PostgreSQL 16 instance `drts-staging` in `asia-east1`                  |
| Deployer service account | `WIF_SERVICE_ACCOUNT` — GitHub Actions identity used for GCP auth      |
| Runtime service account  | `GCP_RUNTIME_SERVICE_ACCOUNT` — Cloud Run runtime identity for job/API |

---

## 3. Deploy Pipeline Topology

The deploy workflow (`.github/workflows/deploy-staging.yml`) enforces the following
job dependency graph. **The rollout order is machine-enforced by GitHub Actions — not
manual.** This resolves AC-2a (see §6.1).

```
[push: main / workflow_dispatch]
       │
       ▼
┌─────────────┐
│ build-push  │  Builds & pushes all 4 images (api, migrate, platform-admin-web, ops-console-web)
└──────┬──────┘  Image tag = GITHUB_SHA[:12]
       │
       ▼
┌─────────────┐
│   migrate   │  Creates/updates drts-migrate Cloud Run Job; executes & waits
│             │  Skippable via workflow_dispatch input `skip_migration=true`
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   deploy    │  Deploys api → platform-admin-web → ops-console-web (sequential within job)
│             │  Runs only if: build-push succeeded AND (migrate succeeded OR was skipped)
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ health-check │  Polls GET {API_URL}/health → 200 (max 24 × 10 s = 240 s)
│              │  Prints all service URLs on success
└──────────────┘
```

### 3.1 Concurrency Guard

```yaml
concurrency:
  group: deploy-staging
  cancel-in-progress: false # serialises deploys; never cancels a running migration
```

This ensures no two staging deploys run simultaneously, preventing migration race conditions.

---

## 4. Migration Sequence

The `drts-migrate` Cloud Run Job runs `bash scripts/db-apply.sh` against the Cloud SQL
instance before any service is updated. The migration tool applies all pending `.sql` files
under `infra/migrations/` in version order.

### 4.1 Migration Inventory (V0001–V0018)

| Version | File                                         | Domain                                                                                                                                        |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V0001   | `bootstrap_extensions_and_schemas.sql`       | Extensions (`uuid-ossp`, `pg_trgm`), schema layout                                                                                            |
| V0002   | `enum_types.sql`                             | All shared enum types                                                                                                                         |
| V0003   | `core_master_data.sql`                       | Tenants, drivers, vehicles, cities                                                                                                            |
| V0004   | `regulatory_registry.sql`                    | Licenses, certificates, compliance records                                                                                                    |
| V0005   | `ops_rules_and_mappings.sql`                 | Dispatch rules, pricing, split mappings                                                                                                       |
| V0006   | `ops_orders_dispatch_and_trips.sql`          | Orders, dispatch tasks, trips                                                                                                                 |
| V0007   | `crm_callcenter_and_complaints.sql`          | Call sessions, complaints, timelines                                                                                                          |
| V0008   | `billing_and_settlement.sql`                 | Invoices, statements, reimbursements                                                                                                          |
| V0009   | `admin_reporting_audit_and_integrations.sql` | Reports, audit log, webhook endpoints                                                                                                         |
| V0010   | `views_triggers_and_guardrails.sql`          | Read views, triggers, FK guardrails                                                                                                           |
| V0011   | `phase1_runtime_snapshots.sql`               | Runtime snapshot tables                                                                                                                       |
| V0012   | `phase1_remaining_runtime_snapshots.sql`     | Remaining runtime snapshots                                                                                                                   |
| V0013   | `phase1_source_of_truth_snapshots.sql`       | Source-of-truth snapshot tables                                                                                                               |
| V0014   | `feature_flags.sql`                          | Feature flag registry — single `admin.feature_flags` table; global flags (`tenant_id IS NULL`) and per-tenant override rows (`tenant_id` set) |
| V0015   | `ops_driver_domains.sql`                     | Driver domain tables (WA-001 prerequisite)                                                                                                    |
| V0016   | `driver_attendance_settings.sql`             | Driver attendance and shift settings                                                                                                          |
| V0017   | `platform_presence.sql`                      | Per-platform online/offline presence                                                                                                          |
| V0018   | `platform_earnings.sql`                      | Per-platform driver earnings read model                                                                                                       |

**Pass Semantics:** The migration job exits `0` only when all 18 migrations apply
successfully. The deploy job gates on migration success (`needs: [build-push, migrate]`).
A migration failure aborts the deploy before any service update.

---

## 5. Secret Wiring

### 5.1 GitHub Secrets / Variables Required

| Name                          | Kind     | Purpose                                                      |
| ----------------------------- | -------- | ------------------------------------------------------------ |
| `GCP_PROJECT_ID`              | variable | GCP project ID (`drts-staging`)                              |
| `GCP_REGION`                  | variable | Cloud Run region (`asia-east1`)                              |
| `GCP_CLOUDSQL_INSTANCE`       | variable | CloudSQL connection name                                     |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | variable | Cloud Run runtime SA email (must access Cloud SQL + secrets) |
| `WIF_PROVIDER`                | secret   | Workload Identity Federation provider resource               |
| `WIF_SERVICE_ACCOUNT`         | secret   | GitHub Actions deployer SA email                             |

### 5.2 Secret Manager → Cloud Run Runtime Injection

| Secret Manager Secret       | Injected as Env Var | Consumed by        |
| --------------------------- | ------------------- | ------------------ |
| `drts-staging-db-url`       | `DATABASE_URL`      | `api`, migrate job |
| `drts-staging-api-key-salt` | `API_KEY_SALT`      | `api`              |
| `drts-staging-jwt-secret`   | `JWT_SECRET`        | `api`              |

Injection is declared in the `gcloud run deploy` flags:

```
--set-secrets "DATABASE_URL=drts-staging-db-url:latest,\
               API_KEY_SALT=drts-staging-api-key-salt:latest,\
               JWT_SECRET=drts-staging-jwt-secret:latest"
```

Secrets are **never** written to environment variables in the workflow YAML. They are
fetched from Secret Manager at container startup by the Cloud Run runtime. The runtime
service account therefore needs `roles/secretmanager.secretAccessor`; the GitHub WIF
deployer identity does not satisfy that requirement by itself. That deployer identity must
also have `iam.serviceAccounts.actAs` on the runtime service account (for example via
`roles/iam.serviceAccountUser`) so Cloud Run can bind the runtime identity during deploy.

### 5.3 Static Environment Variables

| Env Var    | Value        | Service |
| ---------- | ------------ | ------- |
| `NODE_ENV` | `production` | api     |
| `API_PORT` | `3001`       | api     |

Web apps receive `NEXT_PUBLIC_API_URL` dynamically from the `Get API URL` step output
(the live Cloud Run service URL for `drts-api`).

---

## 6. Operational Gap Resolutions

### 6.1 AC-2a: Manual Rollout Matrix → GATE DECISION: Automated by Workflow

**Gap background (from WE-003 review):** The deploy order (api before web apps) was
documented in `infra/gcp/staging/README.md` as a README annotation, which left open the
question of whether the order was operationally enforced.

**Resolution:** The deploy order is **machine-enforced** by the GitHub Actions job
dependency graph. Within the `deploy` job, services are deployed in strict sequence:

1. `Deploy — api` (Step 1)
2. `Get API URL` (Step 2 — fetches live URL after api deploy)
3. `Deploy — platform-admin-web` (Step 3 — receives `NEXT_PUBLIC_API_URL` from Step 2)
4. `Deploy — ops-console-web` (Step 4 — same)

If api deployment fails, steps 2–4 are not reached. The migration job must pass before
any service deploy begins (enforced by `needs: [build-push, migrate]`). This is a
**hard gate**, not a recommendation.

**Decision record:** No additional automation is required. The manual rollout matrix in
`docs/03-runbooks/phase1-rollout.md` (Pilot / Production packs) refers to the
**tenant/city/module cutover sequence** for business-level gating (which tenant goes
live first), not the CI deploy order. That business-level sequence remains explicitly
manual by design, as per the rollout plan:

> "Prepare the manual tenant/city/module rollout matrix because runtime feature flags
> are not fully wired yet."

The distinction is:

- **Infrastructure deploy order** (api → web apps): machine-enforced ✅
- **Business rollout sequence** (which tenant/city/module cuts over first): intentionally
  manual, managed via the rollout matrix in `docs/03-runbooks/phase1-rollout.md` §Pack 3

**Status: RESOLVED — No additional workflow changes required.**

---

### 6.2 AC-2b: `/api/admin/flags` Endpoint Status → GATE DECISION: Endpoint Confirmed Implemented

**Gap background (from WE-004 review):** The smoke suite UAT checklist (PF-7) and feature
flags flow required `/api/admin/flags`, but WE-004 review noted the endpoint needed staging
availability confirmation.

**Resolution:** The endpoint is **fully implemented and registered** in the Phase 1
codebase:

| Endpoint                                 | Method | Implementation Location                                                 |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `/api/admin/flags`                       | GET    | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` L20-35 |
| `/api/admin/flags/:key`                  | GET    | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` L37-45 |
| `/api/admin/flags/:key`                  | PATCH  | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` L47-55 |
| `/api/admin/flags/:key/tenant-overrides` | POST   | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` L57-78 |
| `/api/admin/flags/:key/enabled`          | GET    | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` L80-88 |

**Auth requirement:** `x-actor-type: platform_admin` (bootstrap auth, same as smoke runner default).

**Tenant-scoped query:** Pass `x-tenant-id` header to retrieve tenant-specific flag state;
`POST /api/admin/flags/:key/tenant-overrides?tenantId={id}` to set per-tenant override.

**Module registration:** `FeatureFlagsModule` is imported in `apps/api/src/app.module.ts`.
`@Controller("admin")` combined with the NestJS global prefix `/api` exposes all routes
under `/api/admin/flags/*`.

**Schema:** `infra/migrations/V0014__feature_flags.sql` provides a **single**
`admin.feature_flags` table. Global flags have `tenant_id IS NULL`; per-tenant overrides
are stored as additional rows in the same table with `tenant_id` set to the target tenant.
The UNIQUE constraint `(flag_key, tenant_id)` enforces one override row per tenant per key.
There is **no** separate `feature_flag_tenant_overrides` table.

**Known Phase 1 boundary:** Per-tenant **runtime flag evaluation client** (i.e., application
surfaces calling `/api/admin/flags/:key/enabled` at feature branch points) is not yet wired
into the web apps. Module-level and tenant-level cutovers therefore require operator action
via the Platform Admin UI flags page (which calls the same API) or direct API call. This
is an intentional Phase 1 scope boundary, not a bug, and is documented in
`docs/03-runbooks/phase1-rollout.md` §Current Repo Truth.

**Decision record:** No implementation work is needed for Phase 1 staging gating. UAT
checklist item PF-7 can proceed with manual flag verification via:

Seeded flag keys (from `V0014__feature_flags.sql` and `FeatureFlagsService.seedDefaults()`):
`tenant-portal.booking`, `tenant-portal.billing`, `tenant-portal.reports`,
`tenant-portal.webhooks`, `ops-console.dispatch`, `ops-console.complaint`,
`ops-console.callcenter`, `ops-console.reports`, `driver-app.tasks`,
`driver-app.earnings`, `driver-app.incidents`, `driver-app.shift`,
`phase1.read-models`, `phase1.smoke-paths`.

```bash
# List all flags (platform_admin auth)
curl -s \
  -H "x-actor-type: platform_admin" \
  -H "x-actor-id: uat-admin" \
  "${STAGING_API_URL}/api/admin/flags" | jq .

# Check a specific flag (global scope)
curl -s \
  -H "x-actor-type: platform_admin" \
  -H "x-actor-id: uat-admin" \
  "${STAGING_API_URL}/api/admin/flags/tenant-portal.booking/enabled" | jq .

# Check flag with tenant override (pass x-tenant-id header)
curl -s \
  -H "x-actor-type: platform_admin" \
  -H "x-actor-id: uat-admin" \
  -H "x-tenant-id: tenant-001" \
  "${STAGING_API_URL}/api/admin/flags/tenant-portal.booking/enabled" | jq .

# Toggle a global flag
curl -s -X PATCH \
  -H "x-actor-type: platform_admin" \
  -H "x-actor-id: uat-admin" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' \
  "${STAGING_API_URL}/api/admin/flags/tenant-portal.booking" | jq .

# Set per-tenant override (tenantId is a query param, not a header)
curl -s -X POST \
  -H "x-actor-type: platform_admin" \
  -H "x-actor-id: uat-admin" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  "${STAGING_API_URL}/api/admin/flags/tenant-portal.booking/tenant-overrides?tenantId=tenant-001" | jq .
```

**Status: RESOLVED — Endpoint is implemented. Runtime client wiring is deferred post-Phase 1.**

---

## 7. Canonical Passing-Deploy Transcript

This section documents what a **green** staging deploy run looks like. Values in
`{braces}` are placeholders for the actual values produced at deploy time.

### 7.1 Job: build-push

```
Run: Derive image tag
  tag=abc123def456

Run: Authenticate to GCP
  ✓ Authenticated via Workload Identity Federation

Run: Build & push — api
  #1 [internal] load build definition from apps/api/Dockerfile
  ...
  #N DONE pushing drts/api:abc123def456
  #N DONE pushing drts/api:latest

Run: Build & push — migrate
  ...
  #N DONE pushing drts/migrate:abc123def456
  #N DONE pushing drts/migrate:latest

Run: Build & push — platform-admin-web
  ...
  #N DONE pushing drts/platform-admin-web:abc123def456

Run: Build & push — ops-console-web
  ...
  #N DONE pushing drts/ops-console-web:abc123def456

✅ build-push PASSED (image tag: abc123def456)
```

### 7.2 Job: migrate

```
Run: Create / update migration job definition
  Updating Cloud Run job [drts-migrate] in project [drts-staging] region [asia-east1]

Run: Execute migration job and wait for completion
  Creating execution [drts-migrate-{exec-id}]...
  Running...
  Execution [drts-migrate-{exec-id}] has successfully completed.

✅ migrate PASSED (V0001–V0018 applied)
```

**Failure mode:** If any migration fails, the job exits non-zero and gcloud reports:

```
ERROR: (gcloud.run.jobs.execute) Execution [drts-migrate-{exec-id}] failed.
```

The deploy job is then skipped (GitHub Actions `needs` dependency fails).

### 7.3 Job: deploy

```
Run: Deploy — api
  Deploying container to Cloud Run service [drts-api] in project [drts-staging]
  ✓ Deploying new revision...
  ✓ Routing traffic...
  Done.
  Service [drts-api] revision [drts-api-{rev}] has been deployed.

Run: Get API URL
  url=https://drts-api-{hash}-{region}.a.run.app

Run: Deploy — platform-admin-web
  Service [drts-platform-admin-web] revision [drts-platform-admin-web-{rev}] has been deployed.

Run: Deploy — ops-console-web
  Service [drts-ops-console-web] revision [drts-ops-console-web-{rev}] has been deployed.

✅ deploy PASSED
```

### 7.4 Job: health-check

```
Run: Wait for /health to return 200
  Polling https://drts-api-{hash}-{region}.a.run.app/health ...
    attempt 1: HTTP 200
  Health check passed.

Run: Print staging URLs
  === Staging deployment complete ===
    drts-api:               https://drts-api-{hash}-{region}.a.run.app
    drts-platform-admin-web: https://drts-platform-admin-web-{hash}-{region}.a.run.app
    drts-ops-console-web:   https://drts-ops-console-web-{hash}-{region}.a.run.app

✅ health-check PASSED
```

### 7.5 Pre-Remediation Live Failure (Historical Record — Resolved)

Before FBP-013A-INFRA remediation, a **failed live migration execution** was recorded in
`ai-activity-log.jsonl` / `current-work.md` at `2026-04-16T02:37:56Z`:

```text
2026-04-16T02:37:56Z Orchestrator: `FBP-013A` ERROR:
(gcloud.run.jobs.execute) Execution [drts-migrate-{exec-id}] failed.
```

The failure occurred in the **migration gate** before any service deployment or
health-check step. Root cause: runtime service account split, Cloud SQL binding, and
Secret Manager access were misconfigured. Codex resolved all issues under child task
`FBP-013A-INFRA` (commit `fb77010`).

**Post-remediation result:** GitHub Actions run **#24522301392** passed all four jobs.
E-11/E-12/E-13 are now fully populated (see §8). This section is retained as an
auditable historical record of the pre-remediation failure.

---

## 8. Evidence Checklist

| #    | Evidence Item                                      | Anchor                                                                    | Status                                    |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| E-1  | Deploy workflow file (machine-readable)            | `.github/workflows/deploy-staging.yml`                                    | ✅ exists                                 |
| E-2  | Cloud Run service YAMLs (3 active + 1 retired)     | `infra/gcp/staging/*.yaml`                                                | ✅ exists                                 |
| E-3  | Migration job YAML                                 | `infra/gcp/staging/migrate-job.yaml`                                      | ✅ exists                                 |
| E-4  | Migration sequence V0001–V0018                     | `infra/migrations/V0001–V0018`                                            | ✅ 18 files present                       |
| E-5  | Secret wiring declared in workflow                 | `.github/workflows/deploy-staging.yml` §deploy                            | ✅ documented §5                          |
| E-6  | Deploy order machine-enforced                      | GitHub Actions job dependency graph                                       | ✅ documented §3                          |
| E-7  | Manual rollout matrix gap resolution               | §6.1                                                                      | ✅ RESOLVED                               |
| E-8  | `/api/admin/flags` gap resolution                  | §6.2                                                                      | ✅ RESOLVED                               |
| E-9  | Canonical passing-deploy transcript                | §7                                                                        | ✅ documented                             |
| E-10 | Feature flags endpoint implementation confirmation | `apps/api/src/modules/feature-flags/feature-flags.controller.ts`          | ✅ verified                               |
| E-11 | CI run artifact URL (live)                         | `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24522301392` | ✅ PASS — run #24522301392 all jobs green |
| E-12 | DB migration job execution log (V0001–V0018)       | `migrate` job in GitHub Actions run #24522301392                          | ✅ PASS — V0001–V0018 applied, exit 0     |
| E-13 | API health check HTTP 200 confirmation             | `health-check` job in GitHub Actions run #24522301392                     | ✅ PASS — HTTP 200 confirmed              |
| E-14 | Failed live deploy attempt recorded                | `ai-activity-log.jsonl` @ `2026-04-16T02:37:56Z`                          | ✅ failure captured (pre-remediation)     |
| E-15 | Remediation commands for latest execution          | §11.1                                                                     | ✅ applied — green rerun succeeded        |

All evidence items are now populated. GitHub Actions run **#24522301392** confirmed:

- All 4 Docker images built and pushed to Artifact Registry (`build-push` job ✅).
- V0001–V0018 migrations applied to `drts-staging` Cloud SQL instance (`migrate` job ✅).
- `drts-api`, `drts-platform-admin-web`, `drts-ops-console-web` deployed to Cloud Run (`deploy` job ✅).
- `/health` returned HTTP 200 within the 240-second polling window (`health-check` job ✅).

---

## 9. Rollout Matrix Decision Record

The Phase 1 rollout matrix for business-level gating (tenant/city/module expansion) is
documented in `docs/03-runbooks/phase1-rollout.md` §Pack 3 (Pilot). The matrix is
**intentionally manual** at Phase 1, with the following formal gate decision:

| Gate                                            | Decision                                                                           | Rationale                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Infra deploy order (api → web apps)             | **Automated** — machine-enforced by GitHub Actions job graph                       | Runtime correctness requires api to be live before web apps receive traffic                          |
| Business rollout (tenant/city/module expansion) | **Manual** — operator-controlled via rollout matrix                                | Per-tenant runtime flag evaluation client not yet implemented; Phase 1 scope boundary                |
| `/api/admin/flags` staging availability         | **Implemented** — endpoint live in NestJS API, V0014 migration applies flag tables | Verified in codebase; staging availability confirmed once deploy runs                                |
| Runtime flag evaluation client                  | **Deferred** — post-Phase 1 roadmap                                                | Full per-tenant runtime flag eval requires dedicated client slice; not blocking Phase 1 staging gate |

---

## 10. Family-to-Sidecar Cross-Reference

For use by `FBP-013D` (final evidence synthesis) and `FBP-014` (integrated E2E).

| Major Family           | Task                                | Commit    | Paired Sidecar(s)                                       | Status      |
| ---------------------- | ----------------------------------- | --------- | ------------------------------------------------------- | ----------- |
| FBP-005 BFF parity     | tenant-facing BFF                   | `78cb874` | `FBP-005-SIDECAR-BFF-HANDOFF`                           | done        |
| FBP-006 cutover        | tenant-commute-hub cutover          | `ddfc087` | `FBP-006-SIDECAR-BFF-HANDOFF`                           | done        |
| FBP-007 retirement     | tenant-portal-web retired           | `3ef9079` | `FBP-007-SIDECAR-ACCEPTANCE`                            | done        |
| FBP-008 platform admin | Platform Admin control-plane        | `61547cc` | `FBP-008-SIDECAR-ACCEPTANCE` + `FBP-008-SIDECAR-REVIEW` | done        |
| FBP-009 ops console    | Ops Console Phase 1                 | `71d9fa8` | `FBP-009-SIDECAR-ACCEPTANCE`                            | done        |
| FBP-010 callcenter     | Callcenter/complaint/dispatch-trace | `1d5ed4f` | `FBP-010-SIDECAR-ACCEPTANCE` + `FBP-010-SIDECAR-REVIEW` | done        |
| FBP-011 finance        | Finance/billing/filing              | `b00b01b` | `FBP-011-SIDECAR-ACCEPTANCE` + `FBP-011-SIDECAR-REVIEW` | done        |
| FBP-012 public info    | Public Info/Placard/Regulatory      | `7f02fe1` | `FBP-012-SIDECAR-ACCEPTANCE` + `FBP-012-SIDECAR-REVIEW` | done        |
| Wave E CI              | GitHub Actions CI                   | `4d7d1bb` | `WE-001-SIDECAR-REVIEW`                                 | done        |
| Wave E Docker          | Docker multi-stage builds           | `657a4d3` | `WE-002-SIDECAR-ACCEPTANCE` + `WE-002-SIDECAR-REVIEW`   | done        |
| Wave E staging         | GCP staging deploy scaffold         | `ff015a9` | _(FBP-013A is the staging evidence pack)_               | ✅ this doc |
| Wave E smoke           | Smoke test suite                    | `9a233d1` | `FBP-013B-SMOKE-EVIDENCE-PACK`                          | done        |
| Wave E UAT             | UAT scenario pack                   | `5c9cc4d` | `FBP-013C-UAT-EVIDENCE-PACK`                            | done        |

---

## 11. Acceptance Criteria Evaluation

### AC-1: staging deploy 流程與 evidence anchor 有實際輸出

> **Overall AC-1 status: ✅ PASS**
> GitHub Actions run **#24522301392** completed with all four jobs green. Live evidence
> E-11/E-12/E-13 are now collected. FBP-013A-INFRA remediation successfully resolved the
> earlier `drts-migrate` failure at `2026-04-16T02:37:56Z` — runtime service account
> split, Cloud SQL binding, and Secret Manager access were corrected before rerun.

| Sub-criterion                                 | Evidence                                                        | Status           |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| Deploy pipeline defined and job-ordered       | §3, `.github/workflows/deploy-staging.yml`                      | ✅ PASS (static) |
| All 4 images built & pushed                   | §3.1 (api, migrate, platform-admin-web, ops-console-web)        | ✅ PASS (static) |
| Migration job gates deploy                    | §3 topology diagram, §4 inventory                               | ✅ PASS (static) |
| Canonical passing transcript provided         | §7                                                              | ✅ PASS (static) |
| Failed live migration attempt observed        | §7.5, E-14 (pre-remediation failure recorded)                   | ✅ recorded      |
| Live CI run artifact URL (E-11)               | run #24522301392 — all jobs passed                              | ✅ PASS (live)   |
| DB migration execution log V0001–V0018 (E-12) | `migrate` job in run #24522301392 — exit 0, V0001–V0018 applied | ✅ PASS (live)   |
| API health check HTTP 200 confirmation (E-13) | `health-check` job in run #24522301392 — HTTP 200 confirmed     | ✅ PASS (live)   |

### AC-2: migration / secret wiring 與 health check evidence 被整理進 rollout packet

| Sub-criterion                          | Evidence | Status  |
| -------------------------------------- | -------- | ------- |
| V0001–V0018 migration inventory        | §4.1     | ✅ PASS |
| Secret Manager → env var injection     | §5.2     | ✅ PASS |
| Static env vars                        | §5.3     | ✅ PASS |
| Health check semantics (240 s polling) | §3, §7.4 | ✅ PASS |

### AC-3: manual rollout matrix 與 `/api/admin/flags` operational gap 有明確處置

| Sub-criterion                           | Evidence                             | Status  |
| --------------------------------------- | ------------------------------------ | ------- |
| Rollout matrix gap — infra deploy order | §6.1 RESOLVED: machine-enforced      | ✅ PASS |
| Rollout matrix gap — business cutover   | §9: intentionally manual, documented | ✅ PASS |
| `/api/admin/flags` endpoint status      | §6.2 RESOLVED: fully implemented     | ✅ PASS |
| Feature flag runtime client deferral    | §6.2, §9 decision record             | ✅ PASS |

---

## 11.1 AC-1 Remediation — Applied and Resolved

> **Status: COMPLETED.** All remediation steps below have been applied by Codex under
> child task `FBP-013A-INFRA` (commit `fb77010`). GitHub Actions run **#24522301392**
> passed all four jobs. E-11/E-12/E-13 are populated. This section is retained for
> auditability.

The following commands were used to diagnose the pre-remediation failure and verify the fix:

```bash
export PROJECT_ID="drts-staging"
export REGION="asia-east1"

EXECUTION_NAME="$(gcloud run jobs describe drts-migrate \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.latestCreatedExecution.name)')"

gcloud run jobs executions describe "$EXECUTION_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='yaml(metadata.name,status.startTime,status.completionTime,status.logUri,status.conditions,status.failedCount,status.runningCount,status.succeededCount)'

gcloud run jobs executions tasks list \
  --execution="$EXECUTION_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --succeeded
```

Remediation steps applied (all resolved):

1. ✅ Inspected `status.logUri` and task output to identify the failing migration cause.
2. ✅ `GCP_RUNTIME_SERVICE_ACCOUNT` is now configured separately from `WIF_SERVICE_ACCOUNT`.
   Runtime SA holds `roles/cloudsql.client` and `roles/secretmanager.secretAccessor`.
3. ✅ GitHub WIF deployer identity has `iam.serviceAccounts.actAs` (via
   `roles/iam.serviceAccountUser`) on the runtime SA.
4. ✅ `drts-migrate` runtime can read `drts-staging-db-url` and reach the Cloud SQL
   instance via `GCP_CLOUDSQL_INSTANCE`.
5. ✅ Workflow now always uses `gcloud run deploy` so runtime identity, Cloud SQL
   binding, and Secret Manager mounts are re-applied on every release.
6. ✅ `Deploy — Staging` rerun with `skip_migration=false` produced green run #24522301392.
7. ✅ E-11 (CI run URL), E-12 (migration success log), E-13 (health-check HTTP 200)
   collected in §8 of this pack.

---

## 12. Handoff Record

> **Status: RESOLVED.** The blocker raised in prior revisions has been cleared.
> FBP-013A-INFRA remediation (commit `fb77010`) and green run #24522301392 satisfy all
> three acceptance criteria. The post-remediation handoff to Codex was issued at
> `2026-04-16T23:27:54Z` via `ai_status.py handoff`. FBP-013A is now in `review` status
> awaiting Codex reviewer response.

### Issued Handoff (for audit trail)

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff FBP-013A Codex \
  "Staging deploy evidence pack updated at support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md \
(commit da998be). FBP-013A-INFRA remediation complete — GitHub Actions run #24522301392 passed all four jobs. \
Live evidence collected: E-11 (CI run URL: run #24522301392), E-12 (migrate job exit 0, V0001-V0018 applied), \
E-13 (health-check HTTP 200). AC-1 moves to PASS; AC-2 and AC-3 were already PASS. \
All three acceptance criteria satisfied. Ready for Codex review."
```

---

## 13. Change Log

- 2026-04-16 (rev 7) — Claude reconciled pack to post-remediation shared truth before
  re-review per Codex revision request:
  (1) §7.5 heading changed from "Current Shared Truth" to "Pre-Remediation Live Failure
  (Historical Record — Resolved)" and body updated to reflect that the failure is
  historical, not current; the green run #24522301392 result is cross-referenced back to §8;
  (2) §10 Family-to-Sidecar table: FBP-013B and FBP-013C status updated from `in_progress`
  to `done`, matching ai-status.json and current-work.md shared truth;
  (3) §11.1 heading and body converted from forward-looking remediation checklist to
  retrospective audit record — all 7 checklist items now marked ✅ applied;
  (4) §12 converted from "Blocker & Handoff" (with an active blocker command) to
  "Handoff Record" — the prior blocker is declared resolved, the issued handoff command
  is preserved for audit trail only.

- 2026-04-16 (rev 6) — Claude collected live evidence from green GitHub Actions run
  #24522301392 (FBP-013A-INFRA remediation complete):
  (1) E-11 populated: CI run URL `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24522301392`;
  (2) E-12 populated: `migrate` job in that run confirmed V0001–V0018 applied, exit 0;
  (3) E-13 populated: `health-check` job confirmed HTTP 200 within 240-second window;
  (4) AC-1 evaluation updated from BLOCKED to ✅ PASS — all three live evidence items satisfied;
  (5) Metadata status updated to `review_ready`; §1 status note updated to reflect green run;
  (6) Evidence pack ready for Codex reviewer.

- 2026-04-16 (rev 5) — Codex landed the infra remediation follow-up for child task
  `FBP-013A-INFRA`:
  (1) `.github/workflows/deploy-staging.yml` now resolves a dedicated
  `GCP_RUNTIME_SERVICE_ACCOUNT`, fails fast if it is missing or reuses the GitHub WIF
  deployer identity, and applies that runtime identity to the migration job plus all
  Cloud Run services;
  (2) the API deploy step now always uses `gcloud run deploy` so runtime identity,
  Cloud SQL binding, and Secret Manager mounts are re-applied on every release instead
  of surviving from a stale image-only update;
  (3) this pack's service-account and remediation sections now distinguish deployer vs
  runtime identities and explicitly call out the required `roles/cloudsql.client` and
  `roles/secretmanager.secretAccessor` grants, plus the deployer's
  `iam.serviceAccounts.actAs` / `roles/iam.serviceAccountUser` prerequisite on the
  runtime SA;
  (4) the owner blocker command now points at child task `FBP-013A-INFRA` / `Codex`
  rather than the superseded Gemini lane. AC-1 remains BLOCKED pending a live green
  rerun; E-11/E-12/E-13 are still unpopulated.

- 2026-04-16 (rev 4) — Claude (availability-first reassignment) committed the uncommitted
  deploy-staging.yml triage improvements added in rev 3:
  (1) `Execute migration job and wait for completion` step now wraps the `gcloud run jobs execute`
  call in an `if/then/exit 0` guard with `set -euo pipefail`, ensuring the step captures the exit
  code correctly and emits triage metadata (execution name, YAML describe, tasks-list) before
  exiting 1 on failure;
  (2) metadata updated to reflect ownership transfer: Claude (availability-first reassignment from
  Codex at 2026-04-16T02:49Z), reviewer remains Codex;
  (3) §12 handoff commands updated to `AI_NAME=Claude`.
  Static evidence (AC-2 and AC-3) remains fully PASS. AC-1 remains BLOCKED on live GCP staging
  deploy — no change to E-11/E-12/E-13 status.

- 2026-04-16 (rev 3) — Codex converted the pack from "pending live deploy" to an
  explicit blocker-aware evidence packet:
  (1) metadata updated to current owner/reviewer (`Codex`/`Claude`) and task state
  `blocked`;
  (2) §7.5 added the observed live failure from shared truth:
  `ERROR: (gcloud.run.jobs.execute) Execution [drts-migrate-{exec-id}] failed.`;
  (3) §8 and §11 now classify E-11/E-12/E-13 as **blocked** pending infra remediation
  instead of merely pending;
  (4) §11.1 adds concrete `gcloud run jobs describe / executions describe / tasks list`
  triage commands for the latest execution;
  (5) §12 now provides the owner-side blocker sync command plus the post-remediation
  reviewer handoff command.

- 2026-04-16 (rev 2) — Claude applied Codex review corrections:
  (1) AC-1 re-evaluated: live evidence items E-11/E-12/E-13 explicitly marked **PENDING
  LIVE DEPLOY** — AC-1 is not PASS until a real `drts-staging` deploy run populates them.
  (2) §6.2 schema corrected: V0014 creates a **single** `admin.feature_flags` table using
  a `tenant_id` column for overrides; no separate `feature_flag_tenant_overrides` table
  exists. §4.1 V0014 description updated to match.
  (3) §6.2 curl examples corrected: flag key updated from nonexistent `tenant_booking` to
  actual seeded key `tenant-portal.booking` (matching `V0014__feature_flags.sql` seeds and
  `FeatureFlagsService.seedDefaults()`). Tenant override example corrected to use
  `?tenantId=` query param (matching `@Query("tenantId")` in controller).
- 2026-04-16 (rev 1) — Claude created initial staging deploy evidence pack for FBP-013A,
  covering the full deploy pipeline topology, V0001–V0018 migration sequence, secret wiring,
  canonical passing transcript, and explicit gate decisions for both AC-2 operational gaps
  (rollout matrix: machine-enforced; `/api/admin/flags`: confirmed implemented).
