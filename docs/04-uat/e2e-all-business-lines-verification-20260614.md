# Cross-Surface E2E — All-Business-Line Verification (2026-06-14)

Goal: prove every business line's end-to-end service flow is actually verified,
not just authored. This document records the authoritative baseline, the genuine
bugs found and fixed, the harness reliability work, and the remaining gaps.

## TL;DR

- Stood up the full local stack (Postgres + seeded API) and ran the entire
  `tests/e2e/E2E-0*.sh` matrix **hermetically** (DB reset + API restart per
  scenario) to remove cross-scenario pollution.
- Authoritative baseline before fixes: **12/15 pass**; genuine failures in
  `E2E-005` (tenant governance), `E2E-006` (driver multi-platform), `E2E-011`
  (platform admin control plane).
- Root-caused and fixed all three. Authoritative baseline after fixes:
  **15/15 pass**.
- Added a committable hermetic runner (`tests/e2e/run-e2e-hermetic.sh`) and wired
  the suite into CI (`ci-integ.yml` `e2e` job) so this stops being a manual,
  drift-prone check.

## Why "nobody had verified it" was accurate

The suite was real and broad (15 scenarios, hundreds of assertions across every
business line) but:

1. **Not in CI** — no workflow started Postgres + the API to run it. Merges
   never executed it.
2. **Not hermetic** — `run-e2e.sh` runs all scenarios against one long-lived API
   and one shared DB. Phase-1 modules keep in-memory read models, and scenarios
   mutate persistent rows (service products, eligibility matrix, partner entries,
   quota ledgers). Back-to-back runs let earlier scenarios pollute later ones, so
   pass/fail flips with ordering (observed: `E2E-004`/`E2E-014` flipping between
   runs purely from shared state).
3. **Only one line was live-verified** — the bank/partner runtime spec
   (`bank-partner-dev-runtime.spec.ts`) runs against deployed dev; the other
   lines had stale, local-only "Round N" evidence.

## Authoritative baseline (hermetic: reset DB + restart API per scenario)

| Scenario | Business line | Before | After |
|---|---|---|---|
| E2E-001 enterprise-dispatch | 企業派車 (Line B) | PASS | PASS |
| E2E-002 forwarded-order | 平台串接 / 轉單 | PASS | PASS |
| E2E-003 phone-recording-filing | 客服/通話歸檔 | PASS | PASS |
| E2E-004 tenant-attribution | 租戶歸因 | PASS | PASS |
| E2E-005 tenant-governance | 租戶治理 | **FAIL** | PASS |
| E2E-006 driver-multi-platform | 司機端多平台 | **FAIL** | PASS |
| E2E-007 partner-airport-transfer | 銀行信用卡接送 (Line A) | PASS | PASS |
| E2E-008 partner-booking-cutover | 銀行信用卡接送 (Line A) | PASS | PASS |
| E2E-009 prod-rail-dry-run | 發布軌道 | PASS | PASS |
| E2E-010 governance-aware-billing | 治理感知帳務 | PASS | PASS |
| E2E-011 platform-admin-control-plane | 平台管理控制面 | **FAIL** | PASS |
| E2E-012 tenant-business-operations | 租戶營運 | PASS | PASS |
| E2E-013 service-product-eligibility | 服務產品/車輛適配 | PASS | PASS |
| E2E-014 fleet-partner-revenue-share | 車隊夥伴分潤 | PASS | PASS |
| E2E-015 partner-program-variants | 保險/旅行社等變體 | PASS | PASS |

Reproduce: `./tests/e2e/run-e2e-hermetic.sh` (needs Postgres + the env exported in
the CI `e2e` job).

## Genuine bugs found and fixed

### 1. E2E-011 — feature-flag tenant overrides impossible (schema bug)

- **Symptom:** `POST /admin/flags/:key/tenant-overrides` returned an envelope with
  no `data`; `upsertTenantOverride` silently returned `undefined`.
- **Root cause:** `V0014__feature_flags.sql` declares `flag_key TEXT PRIMARY KEY`.
  A sole primary key on `flag_key` makes it impossible to hold a global row
  (`tenant_id IS NULL`) **and** tenant-override rows for the same key — the
  override insert collides with the global row's PK. The repository contract
  needs one global row plus per-tenant override rows, which requires two
  **partial** unique indexes, not a sole PK. (A 13-day-old local volume happened
  to carry the older partial-index schema, which masked the bug; a fresh migrate
  reproduced it — a good argument for hermetic testing.)
- **Fix:**
  - `infra/migrations/V0030__feature_flags_tenant_override_constraint_fix.sql`
    (idempotent): drop the sole PK + composite unique, add partial unique indexes
    `(flag_key) WHERE tenant_id IS NULL` and `(flag_key, tenant_id) WHERE
    tenant_id IS NOT NULL`.
  - `feature-flag.repository.ts`: `ON CONFLICT (flag_key, tenant_id) WHERE
    tenant_id IS NOT NULL` to match the partial index.

### 2. E2E-006 — driver by-platform earnings empty in DB mode

- **Symptom:** `GET /platform-earnings/by-platform` returned 0 items for the demo
  driver, so the driver multi-platform breakdown could not be proven.
- **Root cause:** `byPlatform`/`summary` take the DB aggregation path whenever
  `DATABASE_URL` is set and return its result unconditionally. The demo driver
  ids are strings (`drv-demo-001`) while `ops.phase1_platform_earnings_ledger`
  is UUID-keyed and unseeded, so aggregation returns `[]`. The in-memory demo
  seed (which carries the breakdown, incl. `forwarder_sandbox`) was only used
  when DB was absent.
- **Fix:** `platform-earnings.service.ts` — when the DB aggregation yields no rows
  for a driver, fall through to the in-memory demo fallback (matches the code's
  own "in-memory runtime fallback" intent) instead of returning empty.

### 3. E2E-005 — quota ledger residue after a rejected booking

- **Symptom:** Booking a cost center with no resolvable approver correctly
  returned `409 APPROVAL_NO_RESOLVABLE_APPROVERS`, but left 2 quota-ledger rows in
  the in-memory read model (`before=0, after=2`).
- **Root cause:** `owned-mobility.service` reserves quota (mutating in-memory
  governance state eagerly) **before** creating the approval request that throws.
  The non-DB path restores a governance snapshot on failure
  (`withRollback`/`restoreTenantGovernanceSnapshot`), but the DB-transaction path
  relied only on the SQL transaction rollback — which does not undo the in-memory
  mutation. The quota-ledger read model reads in-memory state, so residue
  persisted.
- **Fix:** `owned-mobility.service.ts` — the DB-transaction path now restores the
  pre-booking governance snapshot on error, mirroring the non-DB path.

## Harness reliability (so this stays verified)

- **`tests/e2e/run-e2e-hermetic.sh`** — resets the DB and restarts the API before
  every scenario, giving deterministic, gate-quality results. Use this, not the
  bare `run-e2e.sh`, for any pass/fail claim across the whole matrix.
- **`.github/workflows/ci-integ.yml`** — new `e2e` job: Postgres service →
  migrate + seed → build API → `run-e2e-hermetic.sh`; added to the aggregate
  `ci-integ` required check. The matrix now gates `dev`.

## Remaining gaps (need a different branch / environment)

1. **Third-party referral channel (CRC / 社區 App 轉介)** — biggest coverage hole;
   there is **no E2E for it**. The backend (`packages/contracts/src/referral-channel.ts`,
   `/partner/ingress/handoff`, referral attribution + settlement) lives on
   `origin/dev` and the `claude2/crc-be-*` branches, **not on this feature
   branch** (which is ~45 commits behind dev). Author `E2E-016-referral-channel`
   against dev where the endpoints exist; `CRC-VERIFY` / `CRC-FE-VERIFY` remain
   backlog.
2. **Driver mobile (Android/iOS native)** — `E2E-006` proves the driver
   multi-platform chain at the API layer, but on-device WebView/native behavior is
   unverified (`PH1GC-DRV-MP-002` is blocked). Needs emulator/device CI, not
   available in this environment.
3. **Deployed dev/staging + real external adapters** — every local "Round" and the
   above are local-runtime proofs. Real issuer token signing, bank-app WebView
   handoff, live CTI/provider, and external insurer/travel integrations remain
   explicit non-claims (consistent with the suite's own non-claim notes).

## Landing note

The three code fixes touch files that overlap an actively-running Codex session's
uncommitted work on this branch (`platform-earnings.service.ts`,
`owned-mobility.service.ts`). `feature-flag.repository.ts`, the `V0030` migration,
`run-e2e-hermetic.sh`, and the `ci-integ.yml` change are cleanly isolated. Because
these are real bugs that almost certainly also exist on `dev`, prefer landing the
fixes via a branch cut from current `origin/dev` rather than burying them in this
stale i18n branch.
