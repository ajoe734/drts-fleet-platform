# P1D-VERIFY — Phase-1-Delta Wave Verification Report — 2026-06-20

**Task:** `P1D-VERIFY`
**Owner:** `Codex`
**Reviewer:** `Claude`
**Phase:** `phase1-delta-supply-eligibility-mobile-reporting-20260619`
**Authority:** SD §13 Definition of Done
([`phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`](../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md))
**Verified at:** `origin/dev` tip `69fcf74f4` (`MOB-UAT-001: Android physical-device UAT evidence pack`)
**Overall read:** `api/driver/i18n GREEN; ops-console typecheck+build RED on current dev; one collateral E2E+migration regression remediated on the verify branch; live E2E remains environment-gated in this worktree`

> **Path note.** The task brief lists `docs/05-ui/` as the artifact home, which is
> the design-handoff corpus. This wave-verification report is filed there to honour
> the task's declared artifact path; the runnable E2E gate and its prior live reads
> live under `tests/e2e/` and `docs/04-uat/`.

---

## 1. Executive Summary

The Phase-1-delta supply / eligibility / mobile-telemetry / reporting wave is
**not closeout-ready** at `origin/dev` tip `69fcf74f4`:

- `@drts/api` typecheck + build pass in this worktree.
- `@drts/driver-app` typecheck + build pass in this worktree. The build runs
  `expo prebuild`; the generated iOS asset churn was reverted after verification
  so it does not pollute this task diff.
- `@drts/ops-console-web` typecheck **fails** on current dev with unresolved
  workspace package typing (`@drts/contracts`/`@drts/ui-tokens`) and strict
  `packages/ui-web` errors; build also fails at
  `packages/ui-web/src/data-table.tsx:26` (`MANAGEMENT_SURFACE_TONES.neutral`
  possibly `undefined`).
- i18n-guard reports **0 violations with an empty baseline** (true-fix
  verification, no exemptions relied upon).
- All four wave E2E scenarios are syntactically valid after restoring
  `E2E-021`; `E2E-019` remains an intended gate-deferral and live E2E rerun is
  still environment-gated here.

Two blockers therefore exist:

1. current `ops-console` static gates are red, so the task acceptance
   "typecheck+build all" does not hold on the current tree;
2. commit `fbc744877` (`#823`, `ORCH-DROP-COPILOT-20260620`, "drop copilot lane
   from dispatch sequence") collaterally deleted
   `tests/e2e/E2E-021-driver-heartbeat-replay.sh` **and**
   `infra/migrations/V0035__driver_location_event_id_text.sql`, both of which
   `MOB-QA-001 (#824)` had just restored.

---

## 2. Static Gate Results (ran in this worktree)

Environment note: this isolated task worktree required `CI=true pnpm install
--frozen-lockfile` to hydrate `node_modules` before the toolchain resolved
(`@types/node`, `react`, JSX lib). The gate list below reflects the current
owner rerun after install, not the earlier stale report state.

| Gate                        | Command                                                  | Result                                                                                                                                    |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| api typecheck               | `pnpm --filter @drts/api typecheck`                      | **PASS** (exit 0)                                                                                                                         |
| ops-console typecheck       | `pnpm --filter @drts/ops-console-web typecheck`          | **FAIL** — `TS2307` on `@drts/contracts` / `@drts/ui-tokens` plus many `packages/ui-web` strict-type errors under `tsc --noEmit`          |
| driver-app typecheck        | `pnpm --filter @drts/driver-app typecheck`               | **PASS** (exit 0)                                                                                                                         |
| api build                   | `pnpm --filter @drts/api build`                          | **PASS** (`@drts/contracts` build + `tsc -p tsconfig.json`, exit 0)                                                                       |
| ops-console build           | `pnpm --filter @drts/ops-console-web build`              | **FAIL** — Next.js build stops at `../../packages/ui-web/src/data-table.tsx:26` (`MANAGEMENT_SURFACE_TONES.neutral` possibly `undefined`) |
| driver-app build            | `pnpm --filter @drts/driver-app build`                   | **PASS** (`expo prebuild` + `tsc --noEmit`, exit 0; generated iOS asset churn reverted after verification)                                |
| i18n-guard (empty baseline) | `node scripts/i18n-guard.mjs --baseline /tmp/empty.json` | **PASS** — `OK (376 files scanned across 10 apps, 0 exemption(s) from /tmp/empty.json)`                                                   |

The i18n-guard run used `{"version":1,"exemptions":[]}` as the baseline, so the
0-violation result reflects a genuine fix surface, not baseline suppression.
Net result: `api`, `driver-app`, and i18n are green; `ops-console` is the
current static-gate blocker.

---

## 3. E2E Scenario Inventory

| Scenario                                         | On `dev`?                                   | `bash -n` | Gate role                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-019-fleet-supply-onboarding.sh`             | yes                                         | OK        | **gate-deferred** (tracked): fleet-partner self-service write API is an unbuilt scaffold; review/approve/provisioning/readiness legs proven in-memory, write+read-model-seam legs reported not silently passed (`tests/e2e/gate-deferred.txt`, owner SUP-QA) |
| `E2E-020-service-product-runtime-eligibility.sh` | yes                                         | OK        | airport-transfer negative eligibility (DoD #5)                                                                                                                                                                                                               |
| `E2E-021-driver-heartbeat-replay.sh`             | **NO — deleted, restored on verify branch** | OK        | heartbeat dedupe / out-of-order / replay durability (DoD #7)                                                                                                                                                                                                 |
| `E2E-022-operations-reporting.sh`                | yes                                         | OK        | daily dispatch record + six-month summary (DoD #9/#10)                                                                                                                                                                                                       |

**E2E live-run is environment-gated in this worktree** and was not executed:

1. The hermetic gate runner (`tests/e2e/run-e2e-hermetic.sh`) requires host
   `psql` for its `reset_db` step; `psql`/`pg_isready` are not installed here.
2. The repo `db:migrate`/`db:seed` path routes through `docker compose -f
docker-compose.dev.yml exec postgres`, but the running `drts-postgres`
   container is **not** managed by that compose project, so the normal
   migrate/seed path is unavailable.
3. The shared `drts_fleet_platform` database backs a live review stack
   (`drts-we002-*` containers); resetting it is unsafe and out of scope.
4. Standing up an isolated API instance would require secrets I should not
   harvest from another lane's running container (correctly permission-denied).

The authoritative E2E green is the hermetic deploy gate, which was exercised
when each QA task (`SUP-QA-001`, `ELIG-QA-001`, `MOB-QA-001`, `REP-QA-001`)
landed/was approved on dev. This report verifies **presence + validity** of the
scripts and surfaces the `E2E-021` deletion; it does **not** claim a fresh live
green for `020/021/022` from this worktree.

---

## 4. Regression Found & Remediated — `E2E-021` + `V0035` collateral deletion

### 4.1 Root cause

`tests/e2e/E2E-021-driver-heartbeat-replay.sh` file history on `origin/dev`:

```
3df35e5e0  MOB-QA-001 (#820)                          A  (added, 334 lines)
fabad4311  REVERT-MOB-QA-001 (#822)                    D  (reverted)
752a9611e  MOB-QA-001: restore heartbeat QA coverage (#824)  A  (re-added)
fbc744877  chore(orchestrator): drop copilot lane (#823)     D  (DELETED — collateral)
```

`fbc744877` (`Task-ID: ORCH-DROP-COPILOT-20260620`) is described as "drop
copilot lane from dispatch sequence" but its diff removed **3337 lines** across
fleet-partner supply services, ops-console, a DB migration, and the heartbeat
E2E. Most of the supply/ops code was subsequently re-landed by later commits
(`SUP-BE-006 #844`, `SUP-BE-007 #846`, `MOB-OPS-001 #821`), but because the
`MOB-QA-001` restore (`#824`) merged **before** `fbc744877` in dev topo order,
the `E2E-021` script and `V0035` migration were deleted and **never re-added**.

### 4.2 `E2E-021` absence

Confirmed: `git ls-tree origin/dev tests/e2e/` returns 0 matches for `E2E-021`.
The wave acceptance ("E2E-019/020/021/022 green") and SD §13 DoD #11 ("所有新增
E2E 經綠") cannot hold while the file is absent from dev.

### 4.3 `V0035` absence is a real runtime regression

`V0035__driver_location_event_id_text.sql` converts
`telemetry.driver_location_events.event_id` from `uuid` to `text`:

```sql
ALTER TABLE telemetry.driver_location_events
  ALTER COLUMN event_id TYPE text USING event_id::text;
```

`V0034` (the latest migration on dev) creates that column as `event_id uuid
PRIMARY KEY` (line 250). The heartbeat ingest code treats `eventId` as a
**client-provided idempotency token** — typed `string`, trimmed and
non-blank-checked (`regulatory-registry.service.ts:1023`), **not** UUID-validated
— and inserts it into `event_id`. Without `V0035`, a non-UUID idempotency token
fails the `uuid` column at insert time, breaking the heartbeat-replay contract
(`MOB-BE-002`, DoD #7) at the DB layer. `V0035` is therefore required, not
cosmetic.

### 4.4 Remediation

Both files restored from the authoritative `MOB-QA-001` commit `752a9611e` onto
`codex/p1d-verify`:

- `tests/e2e/E2E-021-driver-heartbeat-replay.sh` (`bash -n` clean)
- `infra/migrations/V0035__driver_location_event_id_text.sql` (orders correctly
  after `V0034`; idempotent ALTER on an empty column)

**Integration owed:** this restoration must merge to `dev` for the wave to be
whole. Until merged, `INTEGRATION_STATUS=branch_pushed`.

---

## 5. SD §13 Definition of Done — item-by-item

| #   | DoD item                                                    | Delivering work                              | Verification read                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 車行可自行送件，平台不用代建                                | SUP-BE-006/007 + fleet-partner portal design | **PARTIAL/DEFERRED** — platform supply-review state machine + canonical provisioning + readiness engine are built and proven; the fleet-partner **self-service create/upload/submit/resubmit write API** is an unbuilt scaffold (`E2E-019` gate-deferral). No-canvas FE deferred (§7). |
| 2   | 核可前 submission 不污染 canonical registry                 | SUP-BE-006                                   | covered by supply-review state machine + approve-time provisioning boundary (`E2E-019` review/approve legs, in-memory)                                                                                                                                                                 |
| 3   | 核可後 driver/vehicle/insurance/contract/affiliation 可追溯 | SUP-BE-006                                   | approve-time canonical provisioning leg (`E2E-019`)                                                                                                                                                                                                                                    |
| 4   | exact service product 從 intake 到 task 不丟失              | ELIG-BE-004/005, ELIG-MOB-001, ELIG-FE-001   | candidate eligibility decoration + driver exact-product surface; `E2E-013`/`E2E-020`                                                                                                                                                                                                   |
| 5   | 機場接送資格負向測試確實生效                                | ELIG-QA-001                                  | `E2E-020-service-product-runtime-eligibility.sh` present + valid                                                                                                                                                                                                                       |
| 6   | Android 與 iOS 真機各有 evidence pack                       | MOB-UAT-001                                  | Android **repo-backed static evidence complete**, signed-build on-device execution **externally gated** (`BLOCKED + STATIC EVIDENCE`); iOS parity declared (`UIBackgroundModes`), on-device likewise externally gated. Pack status `provisional`.                                      |
| 7   | Heartbeat 斷線後可 durable replay                           | MOB-APP-001, MOB-BE-002, MOB-QA-001          | code on dev; **`E2E-021` + `V0035` were deleted from dev (§4) and restored on verify branch**                                                                                                                                                                                          |
| 8   | Ops 可看 stale/gap/eligibility reason                       | MOB-OPS-001, ELIG-FE-001                     | ops-console driver tracking + location-state reconcile + eligibility panel code is present, but current `ops-console` typecheck/build is red (§6.1)                                                                                                                                    |
| 9   | 每日派遣紀錄可固定重建與下載                                | REP-OPS-001, REP-QA-001                      | operational reports UI/report code is present and `E2E-022` is valid, but umbrella static-gate acceptance is still blocked by current `ops-console` failures (§6.1)                                                                                                                    |
| 10  | 半年摘要口徑、coverage 與客訴統計正確                       | REP-OPS-001, REP-QA-001                      | six-month summary coverage is implemented and `E2E-022` is valid, but umbrella static-gate acceptance is still blocked by current `ops-console` failures (§6.1)                                                                                                                        |
| 11  | 所有新增 E2E 經綠                                           | SUP/ELIG/MOB/REP-QA                          | **CAVEAT** — `E2E-019` intended gate-deferral; `E2E-021` was absent from dev (now restored); `020/022` present. Live hermetic green is environment-gated here (§3).                                                                                                                    |
| 12  | CTI 不在本次 completion claim 內                            | —                                            | confirmed: SD §14 forbids vendor pre-embed; no CTI claimed in this wave                                                                                                                                                                                                                |

---

## 6. Residual / Blocker List

1. **[BLOCKER — current acceptance mismatch]** `@drts/ops-console-web`
   typecheck/build fail on the current tree. First fatal build stop:
   `packages/ui-web/src/data-table.tsx:26` (`MANAGEMENT_SURFACE_TONES.neutral`
   possibly `undefined`). Typecheck also reports unresolved workspace package
   imports (`@drts/contracts`, `@drts/ui-tokens`) and additional strict-type
   violations in `packages/ui-web`.
2. **[BLOCKER — remediated on branch, merge owed]** `E2E-021` + `V0035` deleted
   from `dev` by `fbc744877` (`#823 ORCH-DROP-COPILOT-20260620`). Restored on
   `codex/p1d-verify`; needs merge to `dev`. Root cause: an orchestrator
   "drop copilot lane" chore carried a stale 3337-line revert.
3. **[PROCESS]** `fbc744877` is an out-of-scope chore that mass-reverted
   supply/ops/mobile code; later commits re-landed most of it piecemeal, but the
   board has no single record reconciling what `#823` removed vs. what was
   re-added. Recommend a follow-up audit that `#823`'s remaining net deletions
   (beyond the two files restored here) are all intended deferrals, not silent
   regressions. (Spot-checked: `supply-submission.service.ts` /
   `supply-document.service.ts` 15-line stubs match the documented "unbuilt
   scaffold" deferral; `supply-readiness.service.ts` 602 lines and ops drivers
   page 1922 lines were re-landed full.)
4. **[ENV]** Live E2E hermetic gate not runnable in this isolated worktree
   (no host `psql`; compose-unmanaged postgres; shared DB safety; no
   harvestable API secrets). Re-run on a gate host with `psql` + an isolated DB
   to convert §3's "present + valid" into a fresh live green.
5. **[EXTERNAL]** MOB-UAT-001 on-device execution (Android signed build + iOS)
   remains externally gated; pack is `provisional` static-evidence-complete.
   This is the expected DoD #6 posture, tracked, not a wave blocker.

---

## 7. Deferred No-Canvas Frontends

These surfaces have **design handoffs complete** under `docs/05-ui/` but their
visual/canvas FE implementation is **deferred** (backend + contracts landed;
no production canvas yet):

| Surface                                       | Design handoff                                                                      | State                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fleet supply portal (self-service onboarding) | `docs/05-ui/fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md` | design handoff only; self-service write API unbuilt scaffold (DoD #1 partial)               |
| Admin supply-review                           | `docs/05-ui/platform-admin-supply-review-screen-requirements-20260619.md`           | design handoff only; review state machine exists at API level                               |
| Driver tracking / permission visuals          | `docs/05-ui/driver-app-tracking-and-permission-screen-requirements-20260619.md`     | design handoff only; RN behaviour/data/state specified, visual layout left to manual design |

---

## 8. Verdict

- Static gates: **not green**. `api`, `driver-app`, and i18n pass; `ops-console`
  typecheck/build fail on the current tree.
- E2E scripts: **present + valid** after restoring the `E2E-021` regression;
  live hermetic green is environment-gated here and owned by the deploy gate.
- SD §13 DoD: do **not** claim full closeout from this state. #1 remains
  partial (self-service write API deferred), #11 remains caveated, and the
  umbrella acceptance "typecheck+build all" is currently blocked by
  `ops-console`.
- This branch is blocker evidence plus a concrete remediation diff
  (`E2E-021` + `V0035` restore). `P1D-VERIFY` should not be marked `done`
  until `ops-console` static gates are repaired and the restoration merges to
  `dev`.
