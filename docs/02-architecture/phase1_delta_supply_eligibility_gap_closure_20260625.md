# Phase 1 Δ — Supply / Eligibility / Mobile / Reporting — Gap Closure Audit & Work List (2026-06-25)

Audit of the goal: *"車行自建司機/車輛/保單/契約 + 平台退件/補正/核准; submission 與 canonical 分離;
VehicleFleetAffiliation; serviceProductCode 全鏈傳遞; 機場接送資格繞過修正; 真機背景定位 / durable
heartbeat; 每日派遣 + 六月營運摘要; 完整 API/契約/DDL/狀態機/RBAC/audit/migration/E2E/真機 UAT;
可拆給各團隊的工作列表。"*

Source of truth: [`phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`](./phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md).

## Verdict (per cluster)

| # | Feature | Verdict | Notes |
|---|---------|---------|-------|
| 1 | 車行自建 + 平台退件/補正/核准 | ✅ **CLOSED 2026-06-25** | self-create write path was an empty scaffold; now implemented (below) |
| 2 | Submission ↔ canonical 分離 | ✅ done | canonical IDs null pre-approval; `provisionFromSubmission` on approve |
| 3 | VehicleFleetAffiliation | ✅ done | contract + DDL (`fleet.vehicle_fleet_affiliations`) + provisioned on approve |
| 4 | 機場接送被廣義 business_dispatch 繞過 | ✅ **CLOSED 2026-06-25** | scarcity fallback no longer re-admits airport-permit-failing vehicles |
| 5 | serviceProductCode booking→…→settlement | ✅ **CLOSED 2026-06-25** | now a first-class field stamped at booking intake; whole chain reads the stored value |
| 6 | 真機背景定位 / 權限 / 斷網補送 / 重啟 | ✅ done (code) | iOS real-device UAT still `provisional` (no macOS/device in fleet) |
| 7 | Durable heartbeat / 去重 / 順序 / freshness / gap | ✅ done | client offline-queue + server sequence/duplicate/freshness |
| 8 | 每日派遣 + 六月營運摘要 | ✅ done | reporting endpoints + service |
| 9 | API/契約/DDL/狀態機/RBAC/audit/migration/E2E | ✅ done | V0034 migration (11 tables); E2E-019/020/021/022; int-sup/elig/mob |

## What was implemented in this pass (verified, all api tests green: 662 passed)

### Gap 1 — fleet-partner self-service submission write path
Previously `SupplySubmissionService` / `SupplyDocumentService` were `export class X {}` and there were
no partner-facing write endpoints; submissions only existed as in-memory seed.

- **Contracts** ([`phase1-delta-supply-eligibility.ts`](../../packages/contracts/src/phase1-delta-supply-eligibility.ts)):
  `CreateSupplySubmissionCommand`, `UpsertDriverSupplyDraftCommand`, `UpsertVehicleSupplyDraftCommand`,
  `AddSupplyDocumentCommand`, `SupplySubmissionLifecycleCommand`.
- **Service** ([`supply-review.service.ts`](../../apps/api/src/modules/fleet-partner/supply-review.service.ts)):
  `createSubmission`, `upsertDriverDraft`, `upsertVehicleDraft`, `addDocument`, `submitSubmission`,
  `withdrawSubmission`, `listFleetSubmissions`, `getFleetSubmission`. Write path shares the same in-memory
  + DB-backed state the review path reads. Guards: editable-only (draft/needs_revision), submit requires a
  driver or vehicle draft, fleet-scope hiding (cross-fleet → 404), plate uniqueness, required-field 400s,
  optimistic `expectedRevisionNo`.
- **Scaffolds** now delegate: [`supply-submission.service.ts`](../../apps/api/src/modules/fleet-partner/supply-submission.service.ts),
  [`supply-document.service.ts`](../../apps/api/src/modules/fleet-partner/supply-document.service.ts).
- **Endpoints** ([`fleet-partner.controller.ts`](../../apps/api/src/modules/fleet-partner/fleet-partner.controller.ts)),
  all `@RequireRealms("partner")` + `x-fleet-partner-id`:
  `GET/POST /fleet-partner/supply-submissions`, `GET .../:id`,
  `PUT .../:id/driver-draft`, `PUT .../:id/vehicle-draft`, `POST .../:id/documents`,
  `POST .../:id/submit`, `POST .../:id/withdraw`.
- **Test**: [`int-sup-003-partner-self-create-to-approval.test.ts`](../../apps/api/tests/integration/int-sup-003-partner-self-create-to-approval.test.ts)
  exercises the full create → drafts → docs → submit → review → approve → canonical-provisioning loop plus
  every guard (6/6).

### Gap 4 — airport-transfer eligibility bypass
The runtime evaluator already marks airport-permit-failing vehicles `ineligible`
(`MISSING_AIRPORT_ELIGIBILITY`), but the dispatch **scarcity fallback** re-admitted *all* ineligible
candidates when none were eligible — letting a broad `business_dispatch` vehicle serve an airport transfer.

- [`owned-mobility.service.ts`](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts):
  added `NON_BYPASSABLE_HARD_REASON_CODES` (`MISSING_AIRPORT_ELIGIBILITY`); the scarcity fallback no longer
  re-admits candidates carrying a non-bypassable hard reason. The general anti-stranding fallback (for other
  hard reasons) is preserved, so the existing design + test stay intact.
- **Test**: `owned-mobility.service.test.ts` — *"never offers an airport-permit-failing vehicle even under
  scarcity"* (default list empty; diagnostic `includeIneligible` still shows it).
- Note: the evaluator is a provider **and** exported by `VehicleEligibilityModule` and imported by
  `OwnedMobilityModule`, so it is always injected in the running app — the `@Optional()` fallback only
  affects directly-constructed unit tests. No production "unwired evaluator" exposure.

### Gap 5 — serviceProductCode booking-origin chain
- `OwnedOrderRecord.serviceProductCode` added to the contract and **stamped at booking intake**
  (`OwnedMobilityService.stampServiceProductCode` at the three order-creation sites), so the precise code
  originates with the booking.
- All consumers now **prefer the stored value** and only derive as a legacy fallback:
  `resolveServiceProductForOwnedOrder` (vehicle-eligibility), `resolveServiceProductCodeForOrder`
  (owned-mobility, feeds candidate decoration + assignment + task), and `resolvePreciseServiceProductCode`
  (billing-settlement).
- `DispatchAssignmentRecord.serviceProductCode` added + populated.
- **Test**: `owned-mobility.service.test.ts` — *"stamps serviceProductCode at booking intake and carries it
  through assignment + task"* (asserts `getOrder().serviceProductCode` at intake + `getDriverTask()` carries it).

## Remaining work (could not be fully closed in this pass)

### QA — iOS real-device UAT
[`mob-uat-002-ios-physical-device-evidence-pack-20260620.md`](../04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
is `provisional`: no macOS / Xcode / device in this fleet. Needs a signed `eas build --platform ios` →
TestFlight → on-device background-location / permission / offline-resend / restart run. Android
(`mob-uat-001`) is real.

### Fleet Partner Portal — submission UI
The 11 portal pages are read-only. Build the create/correct/upload UI on top of the new
`/fleet-partner/supply-submissions*` endpoints (draft form → driver/vehicle drafts → document upload →
submit/resubmit; surface `needs_revision` reason codes).

### QA — E2E-019
[`E2E-019-fleet-supply-onboarding.sh`](../../tests/e2e/E2E-019-fleet-supply-onboarding.sh) self-documents
the old scaffold and falls back to seeded submissions. With the write API live, replace the seed-discovery
legs with real `create → driver-draft → vehicle-draft → document → submit → request-revision → resubmit →
approve`.

## Per-team work list
- **Backend**: (done) self-create write path; (done) airport fallback; (done) serviceProductCode booking-origin + settlement.
- **Fleet Partner Portal**: (done) Onboarding Submissions create/driver-draft/submit UI; remaining = vehicle-draft + document-upload + needs_revision correction surfaces.
- **Platform Admin / Ops Console**: review queue already wired (`admin/supply-review/*`); add affiliation + readiness surfacing if missing.
- **Driver App**: heartbeat/background/offline complete; no new backend work — iOS device build for UAT.
- **QA**: rewrite E2E-019 against the live write API; execute iOS real-device UAT.
