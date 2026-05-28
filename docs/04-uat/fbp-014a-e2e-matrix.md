# FBP-014A — Cross-Surface E2E Scenario Matrix and Fixture Scaffold

**Task:** `FBP-014A`  
**Owner:** Codex  
**Reviewer:** Codex2  
**Status:** Ready for review — scaffold complete; final live staging evidence remains with `FBP-014B` after `FBP-013` closeout  
**Created:** 2026-04-16  
**Depends on:** FBP-006 (tenant-commute-hub BFF cutover), FBP-008, FBP-009, FBP-011, FBP-012

---

## 1. Purpose

This document defines the cross-surface E2E scenario matrix for Phase 1. It captures:

1. Which E2E scenarios must be executed and what surface chain each exercises.
2. Which fixtures, seed data, and API routes each scenario uses.
3. The ID continuity chain each scenario must produce (the "stitched evidence chain").
4. Verification points: cross-tenant safety, audit trail, billing confirmation.
5. How the scaffold relates to the existing smoke tests and UAT scenarios.

The E2E scaffold is in `tests/e2e/`. The scenarios operationalize the cross-surface flows
defined in `docs/04-uat/phase1-uat-scenarios.md §5 (E2E-001 through E2E-004)` plus the
partner cutover authority flow added by `E2E-008`.

> **Relationship to smoke tests:** `tests/smoke/` verifies individual API surfaces in isolation.
> `tests/e2e/` chains surfaces together in a single stateful run, tracking ID continuity across
> the booking → dispatch → driver → billing/audit chain.

---

## 2. Architecture and Guardrails

The following constraints apply to the entire E2E suite (from FBP-014 guardrails):

| #   | Guardrail                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Tenant surface entry point is **`tenant-commute-hub`** (external repo, backed by `/api/tenant/*`). The retired `apps/tenant-portal-web` must not be used.      |
| G2  | Repo B remains a pure UI consumer — no Supabase, edge functions, local authority, or local financial truth.                                                    |
| G3  | All API calls use canonical `/api/*` prefix, `snake_case`, `{ data, meta }` envelope, `items[] + page_info` for lists, and `Idempotency-Key` on POST commands. |
| G4  | Primary happy path is the owned **enterprise-dispatch** flow (E2E-001). E2E-002 (forwarded order) is a separate mirror scenario.                               |
| G5  | Billing and audit remain **backend-owned**. No local calculations or UI assumptions.                                                                           |
| G6  | Cross-tenant safety is part of the definition of done. E2E-004 explicitly tests it.                                                                            |
| G7  | If the suite discovers a real gap after FBP-006, the fix belongs in a new authority/evidence task — not in a local `tenant-commute-hub` workaround.            |

---

## 3. Seed Data

All scenarios use the demo operational seed (`infra/seeds/S0002__demo_operational_seed.sql`) by default.

| Seed ID           | UUID                                   | Description             |
| ----------------- | -------------------------------------- | ----------------------- |
| `TEN_ACME`        | `10000000-0000-0000-0000-000000000201` | Primary test tenant     |
| `DRIVER_ZHANG`    | `10000000-0000-0000-0000-000000000381` | 張司機 — seed driver    |
| `VEHICLE_ABC1234` | `10000000-0000-0000-0000-000000000351` | ABC-1234 — seed vehicle |

Environment variable overrides: `E2E_SEED_TENANT_ID`, `E2E_SEED_DRIVER_ID`, `E2E_SEED_VEHICLE_ID`.

---

## 4. Scenario Matrix

### 4.1 E2E-001 — Enterprise Dispatch Full Cycle

**Script:** `tests/e2e/E2E-001-enterprise-dispatch.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-001`

#### Surface Chain

```
Tenant Portal ─► Ops Console ─► Driver App ─► Tenant Portal (billing) ─► Audit
```

#### Leg Breakdown

| Leg | Surface       | Actor                     | API Route                                   | Output             |
| --- | ------------- | ------------------------- | ------------------------------------------- | ------------------ |
| 1   | Tenant Portal | `tenant_admin` (TEN_ACME) | `POST /api/tenant/bookings`                 | `bookingId`        |
| 1   | Tenant Portal | `tenant_admin`            | `GET /api/tenant/bookings/:bookingId`       | booking read-back  |
| 2   | Ops Console   | `platform_admin`          | `GET /api/dispatch/tasks`                   | `dispatchJobId`    |
| 2   | Ops Console   | `platform_admin`          | `GET /api/dispatch/tasks/:id/candidates`    | candidate list     |
| 2   | Ops Console   | `platform_admin`          | `POST /api/dispatch/assign`                 | `taskId`           |
| 3   | Driver App    | `driver_user`             | `GET /api/driver/tasks`                     | task list          |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/accept`         | accepted           |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/depart`         | departed           |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/arrived_pickup` | arrived            |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/start`          | started            |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/complete`       | completed          |
| 4   | Tenant Portal | `tenant_admin`            | `GET /api/tenant/bookings/:bookingId`       | `completed` status |
| 4   | Billing       | `tenant_admin`            | `POST /api/tenant/invoices/generate`        | `invoiceId`        |
| 4   | Billing       | `tenant_admin`            | `GET /api/tenant/invoices/:invoiceId`       | invoice body       |
| 4   | Audit         | `platform_admin`          | `GET /api/audit`                            | audit entry count  |

#### ID Continuity Chain

```
bookingId (tenant) ──► dispatchJobId (ops) ──► taskId (driver) ──► invoiceId (billing)
```

#### Fixtures Used

| Fixture                      | File                                                |
| ---------------------------- | --------------------------------------------------- |
| Enterprise dispatch booking  | `tests/e2e/fixtures/e2e-booking-enterprise.json`    |
| Dispatch assignment          | `tests/e2e/fixtures/e2e-dispatch-assign.json`       |
| Driver accept                | `tests/e2e/fixtures/e2e-driver-accept.json`         |
| Driver depart                | `tests/e2e/fixtures/e2e-driver-depart.json`         |
| Driver arrived pickup        | `tests/e2e/fixtures/e2e-driver-arrived-pickup.json` |
| Driver start                 | `tests/e2e/fixtures/e2e-driver-start.json`          |
| Driver complete with signoff | `tests/e2e/fixtures/e2e-driver-complete.json`       |

#### Pass Criteria

1. `bookingId` captured and same value readable from tenant booking list.
2. `dispatchJobId` found in ops dispatch queue (gracefully skippable on empty DB).
3. Driver task transitions all return `200|201`.
4. Task status is `accepted` after accept call.
5. `invoiceId` generated and retrievable.
6. Audit log returns ≥ 1 entry.
7. All chain assertions pass: `tenant.bookingId`, `ops.dispatchJobId`, `driver.taskId`, `billing.invoiceId`.

---

### 4.2 E2E-002 — Forwarded Order Mirror Lifecycle

**Script:** `tests/e2e/E2E-002-forwarded-order.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-002`

#### Surface Chain

```
Ops Console (sandbox mirror) ──► Driver App (visibility + accept) ──► Ops Console (status sync + cancel) ──► Finance/Ops (settlement row + no-owned-assignment)
```

#### Leg Breakdown

| Leg | Surface       | Actor            | API Route                                          | Assertion                                                            |
| --- | ------------- | ---------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/inbound`               | Create deterministic `forwarder_sandbox` mirror order                |
| 1   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/broadcast`    | Mirror is broadcast to seeded local driver                           |
| 1   | Ops Console   | `platform_admin` | `GET /api/forwarder/orders`                        | Mirror row visible with `status=broadcasted`                         |
| 2   | Driver App    | `driver_user`    | `GET /api/driver/task-views`                       | Sandbox forwarded task visible to the seeded driver                  |
| 2   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Verify `routeLocked`, `sourcePlatform`, and action state             |
| 3   | Driver App    | `driver_user`    | `POST /api/driver/forwarded-orders/:taskId/accept` | Accept relay returns `accept_pending`                                |
| 3   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/sync-status`  | Sync to `confirmed_by_platform`, then `completed`                    |
| 3   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Driver view reflects `confirmed_by_platform` then `completed_synced` |
| 4   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/sync-status`  | Second sandbox order syncs to `cancelled_by_platform`                |
| 4   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Driver view reflects cancelled mirror state                          |
| 5   | Finance / Ops | `platform_admin` | `GET /api/settlement/matrix`                       | `forwarded_shadow` row remains `shadow_only`                         |
| 5   | Ops Console   | `platform_admin` | `GET /api/dispatch/tasks`                          | No owned dispatch_assignment for either sandbox mirror               |

#### Pass Criteria

1. Sandbox inbound order yields a non-empty `mirrorOrderId` and becomes `broadcasted`.
2. Driver sees the sandbox forwarded task with `routeLocked=true` and `sourcePlatform=forwarder_sandbox`.
3. Accept relay succeeds with `outcome=accept_pending`.
4. Status sync advances the primary mirror to `confirmed_by_platform` and then `completed_synced`, both reflected in driver task views.
5. A second sandbox mirror can be accepted and later reflected as `cancelled_by_platform`.
6. Settlement matrix exposes the canonical `forwarded_shadow` row with `localLedgerMode=shadow_only`.
7. No owned `dispatch_assignment` exists for either sandbox mirror.

#### Notes

This scenario now uses the `forwarder_sandbox` provider from `FWD-SBX-001`.
It is deterministic and executable without partner credentials, but it remains
**sandbox evidence only**. Do not restate it as live Grab Taiwan or other
partner-adapter proof.

---

### 4.3 E2E-003 — Phone Recording Filing _(sandbox-proven automation)_

**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-003`

This scenario is now automated by
`tests/e2e/E2E-003-phone-recording-filing.sh` against the repo-local sandbox
authority. It proves the end-to-end chain for call session creation, phone
order linkage, `recording_pending` to `ready` transition, dispatch recording
index export, filing package generation, retention-policy lookup, and audited
signed-download issuance.

This is still **not** a claim that live CTI/provider media, staging scheduler
activation, or external retention execution are closed. Those activation gates
remain tracked in `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`
as `EXT-004-BLK-001` to `EXT-004-BLK-008`.

**Automated steps**:

1. Ops agent opens `POST /api/callcenter/sessions`, captures `callId`.
2. Ops agent creates `POST /api/call-center/orders` from that call, order stays `recording_pending`.
3. Recording callback binds `recording_id` via `POST /api/callcenter/sessions/:callId/recording-callback`.
4. Order and session both clear `recording_pending` and move to recording-bound / ready state.
5. `POST /api/reports/jobs` exports `dispatch_recording_index`; row includes masked call/recording refs.
6. `POST /api/filing-packages/generate` yields immutable manifest plus signed ZIP/PDF downloads.
7. `GET /api/audit/evidence-policies/*` and `GET /api/audit` prove retention metadata and audited issuance.

---

### 4.4 E2E-004 — Tenant Attribution and Cross-Tenant Safety

**Script:** `tests/e2e/E2E-004-tenant-attribution.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-004`

#### Surface Chain

```
Platform Admin (tenant create) ──► Tenant Portal (new tenant books) ──► Ops Console (attribution check) ──► Tenant Portal (cross-tenant safety)
```

#### Leg Breakdown

| Leg | Surface        | Actor                       | API Route                          | Assertion                                       |
| --- | -------------- | --------------------------- | ---------------------------------- | ----------------------------------------------- |
| 1   | Platform Admin | `platform_admin`            | `POST /api/platform-admin/tenants` | `newTenantId` captured                          |
| 1   | Platform Admin | `platform_admin`            | `GET /api/platform-admin/tenants`  | New tenant visible in list                      |
| 2   | Tenant Portal  | `tenant_admin` (new tenant) | `POST /api/tenant/bookings`        | `bookingId2` under new tenantId                 |
| 2   | Tenant Portal  | `tenant_admin` (new tenant) | `GET /api/tenant/bookings`         | New tenant sees own booking                     |
| 3   | Ops Console    | `platform_admin`            | `GET /api/dispatch/tasks`          | Dispatch job has correct `tenantId` attribution |
| 4   | Tenant Portal  | `tenant_admin` (TEN_ACME)   | `GET /api/tenant/bookings`         | `bookingId2` NOT present (no cross-tenant leak) |

#### ID Continuity Chain

```
newTenantId (platform_admin) ──► bookingId2 (tenant_newco) ──► [cross-tenant safety: absent from TEN_ACME view]
```

#### Fixtures Used

| Fixture                     | File                                             |
| --------------------------- | ------------------------------------------------ |
| Tenant create               | `tests/e2e/fixtures/e2e-tenant-create.json`      |
| Enterprise dispatch booking | `tests/e2e/fixtures/e2e-booking-enterprise.json` |

#### Pass Criteria

1. New tenant created; `newTenantId` non-empty.
2. New tenant admin can create a booking.
3. Dispatch queue shows job with correct `tenantId` (or warns if async propagation delay).
4. **CRITICAL:** TEN_ACME booking list does NOT contain `bookingId2`. Exit 1 on cross-tenant leak.

---

### 4.5 E2E-009 — Production Deploy Rail Dry-Run

**Script:** `tests/e2e/E2E-009-prod-rail-dry-run.sh`
**Workflow family:** `WF-PROD-001`
**Depends on:** `PROD-RAIL-001`
**Reviewer:** `Codex2`
**Cross-ref:**
`docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`,
`docs/ops/branch-strategy.md §7`,
`.github/workflows/deploy-prod.yml`.

#### Why This Scenario Is Different

The production rail is operator-triggered and side-effecting: it builds and
pushes images to Artifact Registry, runs a Cloud Run migration job against
Cloud SQL, and rolls Cloud Run services with IAP-protected ingress. We
deliberately do **not** drive a real deploy from this E2E. Instead, the
scenario is a static + dry-run contract check that runs in CI and locally,
asserting the rail will behave as the runbook promises before anyone
dispatches it.

#### Phase Breakdown

| Phase | Stage             | Assertions                                                                                                                                                       |
| ----- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `validate-config` | `workflow_dispatch` + `tag` + `skip_migration` inputs; tag regex `prod/v<YYYY.MM.DD>.<N>` (positive and negative); required PROD\_\* vars/secrets; `concurrency.group=deploy-prod`, `cancel-in-progress=false`; `environment.name=production`; `id-token: write`; runtime ≠ deployer identity guard (FULL mode). |
| 2     | `build-push`      | `build-push` job present, `needs: prepare`; all four Dockerfiles built (`apps/api/Dockerfile`, `Dockerfile.migrate`, `apps/platform-admin-web/Dockerfile`, `apps/ops-console-web/Dockerfile`); `:latest` tag aliases published. (FULL mode only.)                                                                |
| 3     | `deploy dry-run`  | `deploy` job depends on `build-push`; gates on `migrate.result == success || skipped` so rollback can bypass migrate; four Cloud Run targets reference defaults `drts-api` / `drts-platform-admin-web` / `drts-ops-console-web` / `drts-migrate`; `--ingress internal-and-cloud-load-balancing` on all three web/api services; Cloud SQL bound on api + migrate; `health-check` mints id_token and probes `CONTROL_PLANE_API_ORIGIN`, `PLATFORM_ADMIN_ORIGIN`, `OPS_CONSOLE_ORIGIN`. (FULL mode only.) |
| 4     | `rollback by tag` | No separate `rollback-prod.yml` file — rollback reuses the same rail; tag regex still accepts an older `prod/v<date>.<N>`; `skip_migration=true` actually gates the migrate job; runbook documents `Rollback Procedure`, `skip_migration=true`, prod/v tag, plus stop conditions referencing schema; `branch-strategy.md §7` exists. |

#### Mode Detection

| Mode       | When                                                                                                            | Behaviour                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SKELETON` | `deploy-prod.yml` only contains the `validate-config` skeleton (pre-merge state on `dev` while PROD-RAIL-001 is still on `codex/prod-rail-001`). | Minimum-contract assertions run; build-push / deploy assertions are reported as `EXTERNAL-GATED-skeleton`. Test passes. |
| `FULL`     | `deploy-prod.yml` contains the full `prepare → build-push → migrate → deploy → health-check` job graph (post PROD-RAIL-001 merge). | Every phase runs; SKELETON-only WARN downgrades become hard FAILs.                                                       |

#### Pass Criteria

1. Workflow file exists and parses as valid YAML.
2. Tag regex accepts a canonical good tag and rejects a malformed one.
3. Concurrency is serialised on `deploy-prod` and never auto-cancels in-flight runs.
4. Rollback path is documented and uses the same workflow with `skip_migration=true`.
5. In FULL mode, all four service Dockerfiles are built and the three web/api services deploy with internal-and-cloud-load-balancing ingress.

#### Evidence

Each phase appends rows to the shared E2E evidence log
(`/tmp/drts-e2e-evidence-<RUN_ID>.log`) using the tab-separated format
`SCENARIO\tPHASE\tKEY\tVALUE`. Required evidence keys per phase:

| Phase           | Required keys                                                                                |
| --------------- | -------------------------------------------------------------------------------------------- |
| preflight       | `workflowFile`, `mode`                                                                       |
| validate-config | `tagInput`, `skipMigrationInput`, `tagRegexAccepts`, `tagRegexRejects`, `concurrencySerialised`, `productionEnvironment` |
| build-push      | (`status` in SKELETON) or per-Dockerfile `dockerfile` keys in FULL                           |
| deploy          | (`status` in SKELETON) or `migrateGate`, `internalIngressCount` in FULL                      |
| rollback        | `rail`, `historicalTagAccepted` (always); `skipMigrationGate`, `runbook` in FULL             |
| result          | `verdict`, `mode`                                                                            |

---

## 5. Fixture Inventory

| Fixture File                     | Used By                             | Description                                                       |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `e2e-booking-enterprise.json`    | E2E-001, E2E-004                    | `enterprise_dispatch` booking with `__RESERVATION_*__` timestamps |
| `e2e-booking-airport.json`       | (reserved for future E2E expansion) | `credit_card_airport_transfer` booking                            |
| `e2e-dispatch-assign.json`       | E2E-001                             | Dispatch assign body with `__*__` placeholders                    |
| `e2e-driver-accept.json`         | E2E-001, E2E-002                    | Driver task accept with `__ACCEPTED_AT__`                         |
| `e2e-driver-depart.json`         | E2E-001                             | Driver depart pickup with `__DEPARTED_AT__`                       |
| `e2e-driver-arrived-pickup.json` | E2E-001                             | Driver arrived at pickup with `__ARRIVED_AT__`                    |
| `e2e-driver-start.json`          | E2E-001                             | Driver trip start with `__STARTED_AT__`                           |
| `e2e-driver-complete.json`       | E2E-001                             | Driver task complete with signoff                                 |
| `e2e-tenant-create.json`         | E2E-004                             | Platform-admin tenant create with `__TENANT_CODE__`               |
| `e2e-phone-booking.json`         | E2E-003                             | Phone booking payload for call-center order creation              |
| `e2e-report-compliance.json`     | E2E-003                             | Dispatch recording index report-job payload                       |
| `e2e-tenant-module-enable.json`  | Reserved (future expansion)         | Tenant module-enable payload stub for future staged cutovers      |

All `__PLACEHOLDER__` values are replaced at runtime by the scenario scripts before the fixture
is passed to curl.

`E2E-002` now builds its `forwarder_sandbox` inbound / broadcast / accept /
sync payloads as deterministic runtime JSON instead of relying on static fixture
files, so the mirror order IDs remain unique per run.

`E2E-005` and `E2E-010` likewise build their tenant-governance payloads
(cost-center, quota policy, approval rule, governed booking, invoice period,
report job filter) as deterministic runtime JSON under `/tmp/drts-e2e-005-*` /
`/tmp/drts-e2e-010-*` so the suffix-scoped fixtures stay unique per run and
nothing is committed under `tests/e2e/fixtures/`.

---

## 6. Running the E2E Suite

```bash
# Against local dev (default)
./tests/e2e/run-e2e.sh

# Against staging
export E2E_API_URL=https://api-staging.drts.internal   # bare origin, no /api suffix
./tests/e2e/run-e2e.sh

# Run a single scenario
./tests/e2e/run-e2e.sh --suite 001

# Run multiple scenarios
./tests/e2e/run-e2e.sh --suite 001,004,008

# Dry-run: list scenarios without executing
./tests/e2e/run-e2e.sh --dry-run

# Verbose output (show all scenario output, not just failures)
./tests/e2e/run-e2e.sh --verbose
```

### Auth model

The E2E suite uses the same staged auth model as the smoke tests: IAP Bearer token for the protected outer boundary, plus phased inner bootstrap headers for the application actor identity. No login endpoint exists.
`tests/e2e/lib/helpers.sh` auto-derives the `x-realm` header from the actor type. Each scenario
calls `switch_actor TYPE ID [TENANT_ID]` to change the active actor between surface legs.

### Graceful skip rules

- **E2E-001 legs 2–4:** skipped (exit 0 with warning) when staging DB has no open dispatch jobs.
  This is expected when testing against a fresh staging environment with no booking seed propagated.
- **E2E-002:** deterministic via `forwarder_sandbox`; not a live partner-adapter claim.
- **E2E-004:** skipped beyond leg 1 (exit 0 with warning) when `POST /api/platform-admin/tenants`
  does not return a `tenantId` in its response.
- **E2E-006:** since `PH1GC-DRV-MP-001`, default behavior is to **hard-fail** on missing mixed
  owned+forwarded seed. Warning-skip is opt-in via `E2E_ALLOW_MISSING_FORWARDER_SEED=true`.
  A warning-skipped run does **not** count as `WF-DRV-MP-001` release proof — release
  closeouts must confirm the deterministic seed mode ran.
- **E2E-008:** skipped (exit 0 with warning) when `PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT`
  is not configured for the seeded partner entry.
- **E2E-009:** dry-run rehearsal only; live production execution requires `vars.PROD_GCP_*` +
  `secrets.PROD_WIF_*` configured per `PH1GC-PROD-001`. A dry-run pass is NOT a
  production-launched claim.
- **E2E-010, E2E-011:** hard-fail on missing seed by directive design (`PH1GC-E2E-010` /
  `PH1GC-E2E-011` acceptance). No silent-pass paths.

---

## 7. Evidence Capture

Each scenario writes to a shared evidence log (`/tmp/drts-e2e-evidence-<RUN_ID>.log`) and
a chain file (`/tmp/drts-e2e-chain-<RUN_ID>.json`). The runner prints both at the end of the run.

For rollout-grade closeout evidence (FBP-014B), the run must be executed against live staging
and the evidence log must be committed alongside the FBP-014B evidence pack.

Minimum evidence items required for each scenario:

| Scenario | Required Evidence Items                                                     |
| -------- | --------------------------------------------------------------------------- |
| E2E-001  | `bookingId`, `dispatchJobId`, `taskId`, `invoiceId`, `auditEntryCount`      |
| E2E-002  | `forwardedTaskId`, `routeLocked`, `sourcePlatform`, `taskStatusAfterAccept` |
| E2E-004  | `newTenantId`, `bookingId` (new tenant), `crossTenantLeakDetected=false`    |
| E2E-009  | `workflowFile`, `mode`, `tagRegexAccepts`, `tagRegexRejects`, `concurrencySerialised`, `rail=same-as-deploy-prod`, `historicalTagAccepted`, `verdict` |

---

## 8. Relationship to Upstream Tasks

| Task     | Status      | Relationship                                                                             |
| -------- | ----------- | ---------------------------------------------------------------------------------------- |
| FBP-006  | done        | Establishes `tenant-commute-hub` BFF routes used as E2E entry points                     |
| FBP-007  | done        | Retires `apps/tenant-portal-web` — E2E must not use it                                   |
| FBP-008  | done        | Platform Admin control-plane routes used in E2E-004                                      |
| FBP-009  | done        | Ops Console dispatch routes used in E2E-001 / E2E-004                                    |
| FBP-011  | done        | Finance / billing routes used in E2E-001 leg 4                                           |
| FBP-012  | done        | Regulatory / reporting routes (available for future E2E-003 expansion)                   |
| FBP-013  | in_progress | Staging evidence closeout; E2E-001/004 count as rollout-grade only after FBP-013 closes  |
| FBP-014B | todo        | Blocked on FBP-013 + FBP-014A; will execute live integrated evidence run against staging |
| FIN-GOV-SPEC-001 | done | Defines the governance-aware billing/reporting field expectations consumed by `E2E-010` |
| FIN-GOV-UAT-001  | done | Defines sub-cases `FG-01`..`FG-09` and the conservative `BLOCKED FOR LIVE` read enforced by the `E2E-010` shell |
| WF-FIN-GOV-001-MATRIX | done | Registers the `WF-FIN-GOV-001` row in the release-gate matrix; `E2E-010` is the companion automated shell |

---

## 9. Acceptance Criteria (FBP-014A)

- [x] **AC-1:** `tests/e2e/lib/helpers.sh` exists with `switch_actor`, `chain_set/get`, `assert_chain`, `save_evidence`, shared `http_call`, and canonical command headers on write calls.
- [x] **AC-2:** `tests/e2e/E2E-001-enterprise-dispatch.sh` exercises all 4 surface legs (tenant booking, ops dispatch assign, driver lifecycle, billing+audit) and captures the full ID continuity chain.
- [x] **AC-3:** `tests/e2e/E2E-002-forwarded-order.sh` verifies sandbox mirror creation, driver visibility, accept/status sync, cancel propagation, forwarded settlement row, and absence of owned dispatch_assignment.
- [x] **AC-4:** `tests/e2e/E2E-004-tenant-attribution.sh` verifies correct `tenantId` attribution and **hard-fails on cross-tenant leak**.
- [x] **AC-5:** `tests/e2e/run-e2e.sh` runs all scenarios, emits pass/fail summary, and prints the evidence log.
- [x] **AC-6:** Fixtures cover all automated scenario legs plus reserved manual-expansion payloads under `tests/e2e/fixtures/`.
- [x] **AC-7:** This matrix document maps each scenario to its surface chain, fixtures, ID chain, and pass criteria.
- [x] **AC-8:** No scenario uses retired `apps/tenant-portal-web` routes or repo-B local authority paths.

### Verification Snapshot

- `bash -n tests/e2e/lib/helpers.sh tests/e2e/E2E-001-enterprise-dispatch.sh tests/e2e/E2E-002-forwarded-order.sh tests/e2e/E2E-004-tenant-attribution.sh tests/e2e/E2E-006-driver-multi-platform.sh tests/e2e/run-e2e.sh`
- `./tests/e2e/run-e2e.sh --dry-run`

---

_End of FBP-014A E2E matrix. Final integrated evidence run is the job of FBP-014B after FBP-013 closes._
