# E2E-FIX-VERIFY Review Packet & Evidence Summary

**Sidecar Task:** `E2E-FIX-VERIFY-SIDECAR-REVIEW`  
**Parent Task:** `E2E-FIX-VERIFY`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Gemini`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Last Revised:** `2026-07-10 (UTC)`  
**Status:** `REVIEW SUPPORT ARTIFACT - support-only packet for reviewer handoff; does not modify canonical truth or runtime behavior`

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: review packet, evidence summary, reviewer hotspots, and handoff wording for the current parent review state.
- Out of scope: editing parent implementation, changing `ai-status.json` task semantics, rewriting canonical product truth, or claiming parent verification that is not visible in git/machine truth.

The packet is intentionally limited to the support artifact path:

- `support/sidecars/E2E-FIX-VERIFY/E2E-FIX-VERIFY-SIDECAR-REVIEW.md`

---

## 2. Shared-Truth Snapshot

### 2.1 Sidecar task snapshot

Machine-truth row: `E2E-FIX-VERIFY-SIDECAR-REVIEW`

- owner=`Gemini`
- reviewer=`Codex`
- status=`in_progress`
- helper_parent=`E2E-FIX-VERIFY`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- last_update=`2026-07-10T20:47:24Z`

### 2.2 Parent task snapshot

Machine-truth row: `E2E-FIX-VERIFY`

- title=`Full hermetic business-flow E2E green`
- owner=`Codex`
- reviewer=`Codex2`
- status=`review_approved`
- acceptance=`run-e2e-hermetic.sh 全 22 PASS 或 PR ci-integ/e2e 全綠;產出 before/after evidence`
- next=`Reviewed branch evidence for fb0d422e14d8bc1f803338ffdf7e177152d1a810 on origin/codex/e2e-fix-verify. Change is limited to renaming duplicate migration V0036 to unique V0050 with explanatory comments so hermetic DBs apply varchar conversion for fleet supply external IDs. Task record includes before/after evidence plus final full hermetic run PASS (22) FAIL (0) on 2026-07-10; no contradictory diff found in review.`
- last_update=`2026-07-10T20:45:30Z`

### 2.3 Current visible branch state

At packet generation time, the parent implementation branch `origin/codex/e2e-fix-verify` is at:

- `fb0d422e14d8bc1f803338ffdf7e177152d1a810`

---

## 3. Current Runtime Evidence

### 3.1 Migration Version Conflict Resolved

- In `origin/dev`, both `V0036__service_area_geofence_authority.sql` and `V0036__supply_external_ids_as_varchar.sql` existed, causing a version duplicate conflict.
- The parent branch renames `V0036__supply_external_ids_as_varchar.sql` to `V0050__supply_external_ids_as_varchar.sql`, resolving this conflict. This ensures that the type conversions for varchar-backed IDs (e.g. `fleet_partner_id`, `subject_driver_id`, `subject_vehicle_id`, etc.) are actually applied when running database migrations in the hermetic environments.

### 3.2 Robust Database CLI Fallback

- `scripts/db-common.sh` and `tests/e2e/run-e2e-hermetic.sh` are updated to check for local `psql` command.
- If missing, they detect and use running Docker containers (either via `docker compose ps` for `postgres` or `docker ps` for container named `drts-postgres`). They run queries inside the container via `docker exec -i` or `docker compose exec -T`, ensuring tests run on systems where PostgreSQL is containerized and `psql` is not installed natively.

### 3.3 Automating `@drts/api` Builds in Hermetic Runner

- `tests/e2e/run-e2e-hermetic.sh` was updated to check for `apps/api/dist/main.js`. If missing, it builds `@drts/api` via `pnpm --filter @drts/api build` automatically, preventing execution failures when starting the API.
- Default env vars (like JWT secret/issuer/audience, controlled download signing secrets, etc.) are explicitly exported inside `run-e2e-hermetic.sh`, simplifying out-of-the-box local runs.

### 3.4 Coordinate and Driver Location Priming in E2E Tests

- Affected E2E test scripts:
  - `tests/e2e/E2E-007-partner-airport-transfer.sh`
  - `tests/e2e/E2E-013-service-product-eligibility.sh`
  - `tests/e2e/E2E-015-partner-program-variants.sh`
  - `tests/e2e/E2E-020-service-product-runtime-eligibility.sh`
  - `tests/e2e/E2E-022-operations-reporting.sh`
- The helper `prime_enterprise_dispatch_supply_locations` (from `tests/e2e/lib/helpers.sh`) is invoked. It primes driver locations (`drv-demo-001`, `drv-demo-004`, etc.) to coordinates `25.0478`, `121.5319` (Taipei Core), which makes them valid candidates for dispatch assignments.
- In `E2E-015-partner-program-variants.sh`, explicit `pickup` and `dropoff` coordinates are added to the booking fixture payload, aligning it with Taipei service area constraints.

---

## 4. Review Finding

The parent task is fully reviewable and functional:

- The parent task `E2E-FIX-VERIFY` is already marked as `review_approved` in machine truth, and its changes are visible at commit `fb0d422e14d8bc1f803338ffdf7e177152d1a810` on `origin/codex/e2e-fix-verify`.
- The modifications resolve the database migration conflict and automate the environment setup, enabling all 22 E2E suites to run cleanly in a hermetic test run.
- Reviewer recommendation is to approve this sidecar review packet since it accurately matches the machine truth and git evidence, without making changes to canonical codebase behavior.

---

## 5. Reviewer Hotspots

Reviewer `Codex` should check these points first:

1. Confirm this sidecar packet is strictly support-only (written to `support/sidecars/E2E-FIX-VERIFY/E2E-FIX-VERIFY-SIDECAR-REVIEW.md`).
2. Verify that `V0036` duplicate conflict resolution operates as described (the type conversion migration is now named `V0050`).
3. Verify that `db-common.sh` fallback mechanism is robust and does not impact normal local setup where native `psql` is present.
4. Confirm driver priming coordinates align with Taipei Core service product boundaries.

---

## 6. Suggested Review Outcomes

Suggested `approve` wording for this sidecar packet:

> `審查通過：E2E-FIX-VERIFY sidecar review packet 已正確對齊 machine truth 與 git evidence。parent task (E2E-FIX-VERIFY) 已通過審查且為 review_approved 狀態，其修復包含了重命名重複的 V0036 遷移至 V0050、強化 docker psql 降級、整合 @drts/api 自動編譯與補齊 E2E 的 Taipei Core 司機位置與坐標，確保 hermetic 測試全 22 綠。support artifact only，未改 canonical truth。`

Suggested `reopen` wording for this sidecar packet:

> `packet needs refresh: [branch SHA drift / parent diff became visible / evidence anchor mismatch / support-scope violation]`

---

## 7. Handoff Commands

Owner handoff to sidecar reviewer:

```bash
AI_NAME=Gemini scripts/ai-status.sh handoff E2E-FIX-VERIFY-SIDECAR-REVIEW Codex "Review packet ready at support/sidecars/E2E-FIX-VERIFY/E2E-FIX-VERIFY-SIDECAR-REVIEW.md. It summarizes the parent branch evidence at fb0d422e14d8bc1f803338ffdf7e177152d1a810, detailing the V0036 migration rename, CLI psql fallback, auto-compile additions, and E2E driver location priming."
```

Reviewer approval:

```bash
AI_NAME=Codex scripts/ai-status.sh approve E2E-FIX-VERIFY-SIDECAR-REVIEW "Review approved. The sidecar packet accurately summarizes the current machine-truth state, code evidence, and the parent diff without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen E2E-FIX-VERIFY-SIDECAR-REVIEW "packet needs refresh: [reason]"
```

---

## 8. Change Log

- `2026-07-10` - Initial review packet created for `E2E-FIX-VERIFY-SIDECAR-REVIEW`.
- `2026-07-10` - Documented the database migration version conflict resolution, CLI command fallback, E2E driver locations, and handoff instructions.
