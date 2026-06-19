#!/usr/bin/env python3
"""Dispatch the Phase 1 DELTA execution wave (Supply self-onboarding / exact
service-product runtime eligibility / Driver App physical-device location &
state / daily-dispatch & six-month operations reporting) to the supervisor.

Source of truth (archived 2026-06-19):
  - SA:    docs/02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md
  - SD:    docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md
  - Index: docs/02-architecture/phase1_delta_sasd_index_20260619.md
  - UI hand-offs (screen-requirements, human design consumes these):
      docs/05-ui/fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md
      docs/05-ui/platform-admin-supply-review-screen-requirements-20260619.md
      docs/05-ui/ops-console-eligibility-and-operational-reports-screen-requirements-20260619.md
      docs/05-ui/driver-app-tracking-and-permission-screen-requirements-20260619.md

Why this wave:
  The delta SA/SD reconnect four broken seams that `dev` does NOT yet close:
    (A) 車行 supply self-submission → platform review → canonical registry
    (B) exact serviceProductCode propagated intake→assignment (no broad-bucket bypass)
    (C) Driver App durable offline queue + online_available tracking + permission
        gate + physical-device UAT
    (D) daily_dispatch_record + six_month_operations_summary report types
  Verified against the live repo before dispatch:
    - service-product / vehicle-eligibility / fleet-partner modules + admin pages
      ALREADY exist (prior wave phase1-svc-fleet-tenantops-20260604) → EXTENDED, not rebuilt.
    - DriverFleetAffiliation already exists (phase1_driver_fleet_affiliations);
      this wave adds VEHICLE affiliation (fleet.vehicle_fleet_affiliations) per SD §4.6.
    - Fleet Partner Portal has only READ routes → /supply/* write flow is net-new.
    - ReportingFilingModule exists → two new jobTypes + schedulers are net-new.

Guardrails baked into the briefs (operator standing rules):
  - No LLM UI design / canvas-first (feedback_no_llm_ui_design,
    feedback_must_check_design_canvas):
      * Surfaces WITH canvas → buildable, canvas-first + bilingual t():
        Ops candidate eligibility panel + reports (ops-screens-*.jsx),
        Driver task-card exact product (driver-screens-*.jsx),
        Ops tracking diagnostics.
      * Surfaces WITHOUT canvas → screen-requirements hand-off ONLY (delivered as
        the four docs above); the autoworker UI BUILD is DEFERRED to a post-design
        wave. These are intentionally NOT dispatched as UI build tasks:
          - Fleet Partner Portal /supply/* write screens (SUP-FE-001)
          - Platform Admin /supply-review screens (SUP-FE-002)
          - Driver App dedicated Tracking-Status screen + Permission-Gate visual
        Their BACKEND + behaviour + API are dispatched so E2E (API-level) can run.
  - Bilingual: every dispatched frontend goes through central lib/translations.ts
    t() — no inline i18n (i18n-guard clean en+zh).
  - Mobile permission-gate task ships the GATE BEHAVIOUR + minimal functional UI
    only; final visual treatment per the driver-app hand-off doc VQs after design.
  - Physical-device UAT: Android is feasible on the dedicated VM
    (project_driver_app_ondevice_e2e_emulator); iOS UAT is external_blocked
    (real device / TestFlight / human) and is registered as such, mirroring the
    standing PH1GC-DRV-MP-002 exception.
  - exact-product ALTER targets must align to real migration table names
    (phase1_orders / phase1_dispatch_jobs / phase1_driver_tasks).

Design (maximize parallel, minimize deps):
  - P1D-WP0 is the ONLY foundation hub: lands all SD §2 contracts + the
    fleet.supply / telemetry / reporting migration skeleton + empty service
    scaffolds so downstream BE tasks don't collide.
  - Backend tasks depend on WP0 (+ their direct backend dep).
  - Canvas-backed FE + mobile + QA depend on their backend.
  - P1D-VERIFY depends on the whole set.

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy backend;
Gemini/Gemini2 E2E; Claude/Claude2 coordination/review). The supervisor
availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-phase1-delta-supply-eligibility-mobile-reporting-20260619.py
  (to register against a different canonical root, set AI_STATUS_ROOT=/path)
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[1]
PHASE = "phase1-delta-supply-eligibility-mobile-reporting-20260619"
PLANNING_REF = "docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Foundation hub ────────────────────────────────────────────────────
    (
        "P1D-WP0", "Claude2", "Codex2",
        "Contracts + migration skeleton + module scaffolds (supply / eligibility / telemetry / reporting)",
        "依 SD §2/§4：(1) packages/contracts/src/ 新增並 export 所有新型別："
        "SupplySubmissionRecord/Type/Status、DriverSupplyDraft、VehicleSupplyDraft、SupplyDocumentRecord/Type、"
        "VehicleFleetAffiliationRecord/Type、SupplyReadinessRecord/State/ReasonCode、ExactServiceProductContext、"
        "RuntimeEligibilityDecisionRecord/EligibilityDecision、DriverLocationHeartbeatEnvelope/Ack、"
        "DispatchDailyRecord、SixMonthOperationsSummary。(2) 建立 migration skeleton：schema fleet（supply_submissions/"
        "driver_supply_drafts/vehicle_supply_drafts/supply_documents/supply_review_events/vehicle_fleet_affiliations）、"
        "telemetry.driver_location_events、reporting.dispatch_daily_records/dispatchable_supply_snapshots/"
        "monthly_operations_summaries、mobility.runtime_eligibility_decisions（DDL 見 SD §4，**ALTER 目標表名須對齊現有 "
        "phase1_orders/phase1_dispatch_jobs/phase1_driver_tasks**）。(3) FleetPartnerModule 內新增空 SupplySubmission*/"
        "SupplyReview*/SupplyReadiness*/SupplyDocument* service 骨架、VehicleEligibilityModule 內 RuntimeEligibilityEvaluator/"
        "EligibilityContextResolver 骨架、ReportingFilingModule 註冊兩新 jobType。本任務只下契約/骨架/migration，不實作邏輯。",
        "",
        "packages/contracts/src/,apps/api/src/modules/fleet-partner/,apps/api/src/modules/vehicle-eligibility/,apps/api/src/modules/reporting/,apps/api/src/migrations/",
        "Contracts compile & exported; migrations apply cleanly; scaffolds registered; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass",
    ),

    # ════════════════ Wave 1 — Supply onboarding (BE + API) ════════════════
    (
        "SUP-BE-002", "Codex", "Codex2",
        "Supply submission persistence + repositories (fleet.* tables)",
        "依 SD §4.1-§4.6/§1.1：實作 SupplySubmissionRepository 與 driver/vehicle draft、supply_documents、"
        "supply_review_events、vehicle_fleet_affiliations 的 persistence（per-table loadRows 降級，沿用 "
        "project_e2e_bizflow_gate_greening 的 TenantPartnerRepository 教訓，缺表不可整體 reject）。附 unit tests（state "
        "transition、revision conflict、fleet scope、duplicate plate）。",
        "P1D-WP0", "apps/api/src/modules/fleet-partner/",
        "Repos persist all fleet.* tables; revision/scope/duplicate-plate unit tests pass; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "SUP-BE-003", "Codex2", "Codex",
        "Fleet Partner submission APIs + pre-signed document upload",
        "依 SD §3.1：實作 GET/POST/PUT /api/fleet-partner/supply-submissions[/drivers|/vehicles|/{id}/...]、submit/withdraw、"
        "readiness GET，以及 documents/upload-url + confirm + DELETE（**pre-signed，API 不接大檔 binary**）。fleet-scope "
        "強制（FLEET_SCOPE_DENIED）。所有 mutation 寫 audit（SD §8）。附 tests。",
        "P1D-WP0,SUP-BE-002", "apps/api/src/modules/fleet-partner/",
        "Partner submission + pre-signed upload APIs work; fleet-scope enforced; audited; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "SUP-BE-004", "Codex", "Claude2",
        "Platform supply-review APIs (start/request-revision/approve/reject, optimistic concurrency)",
        "依 SD §3.2/§5.1：實作 /api/admin/supply-review/submissions[/{id}/start|request-revision|approve|reject]，command 帶 "
        "expectedRevisionNo+reasonCode+comment；approve 走 optimistic concurrency，衝突回 409 SUBMISSION_REVISION_CONFLICT；"
        "禁自審（REVIEWER_SELF_APPROVAL_DENIED）。附 tests。",
        "P1D-WP0,SUP-BE-002", "apps/api/src/modules/fleet-partner/",
        "Review APIs enforce concurrency + self-approval guard; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "SUP-BE-005", "Codex2", "Codex",
        "Canonical provisioning on approve (single transaction → RegulatoryRegistry)",
        "依 SD §5.1/§1.2：approveSubmission 單一 transaction 內 lock→assertStatus(in_review)→assertRevision→assertReviewerNotSubmitter"
        "→validateCompleteSubmission→regulatoryRegistry.provisionFromSubmission(driver/vehicle/insurance/contract)→markApproved→"
        "readiness→audit(approve_supply_submission/provision_canonical_supply)。RegulatoryRegistry 新增 provision*FromSubmission "
        "internal methods（Portal 不可直呼）。附 INT-SUP-001/002 integration tests。",
        "P1D-WP0,SUP-BE-004", "apps/api/src/modules/fleet-partner/,apps/api/src/modules/regulatory-registry/",
        "Approve provisions canonical records in one tx; revision does not overwrite approved canonical; INT-SUP-001/002 pass",
    ),
    (
        "SUP-BE-006", "Codex", "Codex2",
        "Vehicle fleet affiliation provisioning",
        "依 SD §2.5/§4.6/§1.2：核可時建立 fleet.vehicle_fleet_affiliations（owned_by/managed_by/contracted_under + effective 期間 + "
        "sourceSubmissionId），createVehicleFleetAffiliation internal method，寫 audit(create_vehicle_fleet_affiliation)。"
        "（DriverFleetAffiliation 既有，勿重建。）附 tests（affiliation effective dates）。",
        "P1D-WP0,SUP-BE-005", "apps/api/src/modules/regulatory-registry/,apps/api/src/modules/fleet-partner/",
        "Vehicle affiliation created on approve with effective dates; audited; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "SUP-BE-007", "Codex2", "Claude2",
        "Supply readiness service + reason catalog + readiness APIs",
        "依 SD §1.1/§2.6 + SA §4.9：SupplyReadinessService 對 canonical driver/vehicle 算 ready/not_ready/suspended 與 15 個 "
        "reason code，提供 GET /api/fleet-partner/readiness[/drivers/{id}|/vehicles/{id}]。readiness≠eligibility（SA §4.9）。"
        "附 unit tests（readiness reasons）。",
        "P1D-WP0,SUP-BE-005", "apps/api/src/modules/fleet-partner/",
        "Readiness state + reason codes computed and queryable; unit tests pass; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "SUP-QA-001", "Gemini", "Codex",
        "E2E-019 fleet-supply-onboarding (API level)",
        "依 SD §11.3：建 tests/e2e/E2E-019-fleet-supply-onboarding.sh（fleet partner create driver/vehicle→upload doc metadata→"
        "submit→admin request revision→resubmit→admin approve→canonical driver/vehicle/affiliations created→readiness ready）。"
        "API-level（不依賴尚未設計的 portal UI）。",
        "SUP-BE-006,SUP-BE-007", "tests/e2e/E2E-019-fleet-supply-onboarding.sh",
        "E2E-019 passes against the integration stack",
    ),

    # ════════════════ Wave 2 — Exact-product runtime eligibility ════════════════
    (
        "ELIG-BE-002", "Codex", "Codex2",
        "Exact service product propagation across order/dispatch/task",
        "依 SD §2.7/§4.7/§5.3 + SA §5.3：在 booking→order→dispatch job→candidate→assignment→driver task 全鏈保存 "
        "serviceProductId/Code/Version + eligibilityPolicyVersion（ALTER phase1_orders/phase1_dispatch_jobs/phase1_driver_tasks，"
        "**表名對齊現有 migration**）；intake 解析唯一 exact product（tenant/partner/ops/external adapter；未對應→manual_review，"
        "不猜測、不降級 business_dispatch）。附 tests（exact product preserved）。",
        "P1D-WP0", "apps/api/src/modules/owned-mobility/,apps/api/src/migrations/",
        "Exact product persists end-to-end; no broad-bucket downgrade; unit tests pass; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "ELIG-BE-003", "Codex2", "Codex",
        "RuntimeEligibilityEvaluator + decision persistence",
        "依 SD §5.2/§2.8/§4.8 + SA §5.4-§5.6：RuntimeEligibilityEvaluator（resolve product→load driver/vehicle canonical+readiness→"
        "matrix policy+version→hard constraints→product-specific（airport eligibility）→source-platform binding→location freshness→"
        "soft constraints→decision），寫 mobility.runtime_eligibility_decisions。hard 不可 override、soft override 需 reason+audit"
        "（override_soft_eligibility）。附 tests（airport rejection、platform binding、stale location、hard/soft）。",
        "P1D-WP0,ELIG-BE-002", "apps/api/src/modules/vehicle-eligibility/",
        "Evaluator returns eligible/conditional/ineligible with reasons; airport negative case rejected; decisions persisted; tests pass",
    ),
    (
        "ELIG-BE-004", "Codex", "Codex2",
        "Candidate query eligibility decoration + includeIneligible",
        "依 SD §3.3 + SA §5.6：擴充 GET /api/dispatch/tasks/{dispatchJobId}/candidates response 加 serviceProductContext/"
        "eligibilityDecision/hardReasonCodes/softReasonCodes/missingRequirements/locationState；預設只回 eligible+conditional，"
        "includeIneligible=true 回被排除者與原因。**不得只回空清單/無車**。附 INT-ELIG-001。",
        "P1D-WP0,ELIG-BE-003", "apps/api/src/modules/owned-mobility/,apps/api/src/modules/vehicle-eligibility/",
        "Candidates carry decision+reasons; includeIneligible works; no bare empty list; INT-ELIG-001 passes",
    ),
    (
        "ELIG-BE-005", "Codex2", "Codex",
        "Assignment-time recheck (409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT)",
        "依 SD §3.3/§5.2 + SA §5.7：POST /api/dispatch/assign 在 fresh transaction 內重新 evaluate，仍 eligible 才建立 "
        "assignment+DriverTask（保存 exact product）；否則回 409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT + 最新 reasons。"
        "附 INT-ELIG-002。",
        "P1D-WP0,ELIG-BE-003", "apps/api/src/modules/owned-mobility/",
        "Assignment rechecks and 409s on change; driver task keeps exact product; INT-ELIG-002 passes",
    ),
    (
        "ELIG-FE-001", "Codex", "Codex2",
        "Ops Console: dispatch candidate eligibility panel (canvas-backed, bilingual)",
        "依 docs/05-ui/ops-console-eligibility-and-operational-reports-screen-requirements-20260619.md + canvas ops-screens-*.jsx："
        "候選列顯示 exact product/readiness/eligibility badge/hard+soft reasons/missingRequirements/location freshness/policy "
        "version；includeIneligible 切換；no-supply 顯示原因；assign 409 重評 UX。**走 ops translations.ts t() 雙語，無內聯 "
        "i18n；canvas-first 不自創 UI**。",
        "P1D-WP0,ELIG-BE-004,ELIG-BE-005", "apps/ops-console-web/app/dispatch/,apps/ops-console-web/lib/translations.ts",
        "Candidate panel shows decision+reasons+freshness; includeIneligible toggle; bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "ELIG-MOB-001", "Codex2", "Gemini",
        "Driver App: task/trip card exact service product label (incremental)",
        "依 driver-app hand-off doc §6 + canvas driver-screens-*.jsx：任務/行程卡顯示精確 serviceProductCode（非 broad "
        "business/realtime label）。增量、canvas-first、雙語 t()。",
        "P1D-WP0,ELIG-BE-002", "apps/driver-app/",
        "Task/trip card shows exact product code; bilingual; typecheck+build pass",
    ),
    (
        "ELIG-QA-001", "Gemini", "Codex",
        "E2E-020 service-product-runtime-eligibility",
        "依 SD §11.3：建 tests/e2e/E2E-020-service-product-runtime-eligibility.sh（create airport booking→exact product "
        "preserved→candidate query→ineligible taxi excluded→eligible airport vehicle included→assignment recheck→driver task "
        "exact product）。",
        "ELIG-BE-004,ELIG-BE-005", "tests/e2e/E2E-020-service-product-runtime-eligibility.sh",
        "E2E-020 passes against the integration stack",
    ),

    # ════════════════ Wave 3 — Mobile productization ════════════════
    (
        "MOB-BE-001", "Codex", "Codex2",
        "Batch heartbeat API + telemetry.driver_location_events",
        "依 SD §3.4/§2.9/§4.9：POST /api/driver/location-heartbeats/batch（單次≤100），保留單筆 /api/regulatory-registry/"
        "driver-location；落 telemetry.driver_location_events（unique device_id+sequence_no）。Heartbeat 寫 telemetry 不寫 "
        "business audit（SD §8）。附 tests。",
        "P1D-WP0", "apps/api/src/modules/regulatory-registry/,apps/api/src/migrations/",
        "Batch heartbeat ingests up to 100; events persisted with dedupe index; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "MOB-BE-002", "Codex2", "Codex",
        "Heartbeat idempotency + freshness + current-location rule + tracking-status API",
        "依 SD §5.4/§3.4 + SA §6.5：依 eventId 與 (deviceId,sequenceNo) 去重；current location 只在 recordedAt 較新時更新，"
        "舊事件存 history(outOfOrder)；location freshness 分類 fresh/stale/low_accuracy/missing；GET /api/driver/tracking-status "
        "與 /api/ops/drivers/{id}/tracking-status。附 INT-MOB-001（batch idempotency）。",
        "P1D-WP0,MOB-BE-001", "apps/api/src/modules/regulatory-registry/",
        "Dedupe + out-of-order safe; freshness classified; tracking-status returns; INT-MOB-001 passes",
    ),
    (
        "MOB-APP-001", "Codex", "Gemini",
        "Driver App: online_available continuous tracking",
        "依 SA §6.2：新增 online_available 狀態的背景定位（不再只在 active task 啟動），各狀態節奏（online_available 30s/100m… "
        "incident 5-10s）。讓 dispatcher 能用位置找可派司機。附測試/log。",
        "P1D-WP0,MOB-BE-001", "apps/driver-app/",
        "online_available emits background location at spec cadence; verified on emulator",
    ),
    (
        "MOB-APP-002", "Codex2", "Codex",
        "Driver App: durable SQLite offline queue",
        "依 SD §5.3 + SA §6.4：SQLite pending_location_events（pending/sending/acked/failed_*），online 每 10s flush、batch 50、"
        "exponential backoff、24h retention、>5000 筆壓縮策略（保留所有 state-change + 每分鐘位置 + incident 全量 + arrive/start/"
        "complete 不丟）。送成功才刪、依 sequence 重送。附測試（persistence/dedupe/out-of-order/restart）。",
        "P1D-WP0,MOB-BE-002", "apps/driver-app/",
        "Durable queue survives kill/restart; replays in order; no loss of key events; tests pass",
    ),
    (
        "MOB-APP-003", "Codex", "Claude2",
        "Driver App: permission gate behaviour (+ minimal functional UI; visual per hand-off)",
        "依 SD §6.4 + SA §6.3 + driver-app hand-off doc §5：上線前 gate 檢查 foreground/background location/bound device/valid "
        "identity；foreground denied→不可上線(LOCATION_PERMISSION_DENIED)、background denied→可瀏覽但不可進 online_available/不可接"
        "需追蹤任務(BACKGROUND_LOCATION_REQUIRED)；提供前往設定 deep-link。**只做 gate 行為 + 最小功能性 UI，最終視覺待設計（依 "
        "hand-off VQ）**。附測試（permission gate）。",
        "P1D-WP0,MOB-APP-001", "apps/driver-app/",
        "Gate enforces permission/device/identity; denial reasons + settings deep-link; background-denied cannot go online; tests pass",
    ),
    (
        "MOB-APP-004", "Codex2", "Codex",
        "Driver App: restart recovery + tracking-gap detection",
        "依 SA §6.7/§6.8：App restart 後恢復 active state、重新同步 active task、偵測 tracking gap 並標示（**不得假造連續車跡**），"
        "cross-surface 狀態一致（App/API/Ops）。附測試（restart resume）。",
        "P1D-WP0,MOB-APP-002", "apps/driver-app/",
        "Active state restored after restart; gap detected & surfaced honestly; no fabricated continuity; tests pass",
    ),
    (
        "MOB-OPS-001", "Codex", "Codex2",
        "Ops Console: driver tracking diagnostics (canvas-backed, bilingual)",
        "依 driver-app + ops hand-off + canvas ops-screens-*.jsx：Ops 端顯示 driver tracking-status（freshness/last upload/queue/"
        "state/gap）供 ops_manager 看 stale/gap。串 /api/ops/drivers/{id}/tracking-status。雙語 t()，canvas-first。",
        "P1D-WP0,MOB-BE-002", "apps/ops-console-web/app/,apps/ops-console-web/lib/translations.ts",
        "Ops can see per-driver freshness/gap/queue; bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "MOB-QA-001", "Gemini2", "Codex2",
        "E2E-021 driver-heartbeat-replay (API/emulator level)",
        "依 SD §11.3：建 tests/e2e/E2E-021-driver-heartbeat-replay.sh（send batch with duplicate/out-of-order/offline backlog→"
        "dedupe→current location remains newest→tracking status correct）。",
        "MOB-BE-002", "tests/e2e/E2E-021-driver-heartbeat-replay.sh",
        "E2E-021 passes against the integration stack",
    ),
    (
        "MOB-UAT-001", "Claude", "Claude2",
        "Android physical-device UAT evidence pack (dedicated VM)",
        "依 SD §11.4 UAT-MOB-ANDROID-001 + project_driver_app_ondevice_e2e_emulator：在專用 VM 上以 signed build 跑 install/"
        "permissions/online available/background tracking/app killed-reopen/network switch/5-min offline/full task lifecycle，"
        "產出 evidence pack（SA §6.10）。idle 時 STOP VM。",
        "MOB-APP-003,MOB-APP-004,MOB-QA-001", "docs/05-ui/",
        "Android evidence pack produced per SA §6.10; VM stopped when idle",
    ),
    (
        "MOB-UAT-002", "Claude", "Claude2",
        "iOS physical-device UAT (external_blocked — real device / TestFlight / human)",
        "依 SD §11.4 UAT-MOB-IOS-001：iOS 真機 UAT（Low Power Mode/background indicator/OS termination/user force-quit/reopen "
        "recovery）。**external_blocked**：需實體 iPhone / TestFlight / 真人操作，無法由 autoworker 完成；登記為人工待辦，"
        "鏡像 PH1GC-DRV-MP-002 例外。",
        "MOB-APP-003,MOB-APP-004", "docs/05-ui/",
        "iOS evidence pack produced on a real device (human/TestFlight); not auto-completable",
    ),

    # ════════════════ Wave 4 — Operational reporting ════════════════
    (
        "REP-BE-001", "Codex2", "Codex",
        "Daily dispatch record builder + reporting.dispatch_daily_records",
        "依 SD §5.5/§2.10/§4.10 + SA §7.2/§7.3：DispatchDailyRecordBuilder（read orders in serviceDate→join dispatch trace→first "
        "dispatch/assignment→final assignment→driver task events→redispatch/complaint count→upsert）。arrivedPickupAt 只取 "
        "arrived event，缺則 null + ARRIVAL_EVENT_MISSING（不得用 tripStartedAt 倒推）。每 order 一筆主鍵。附 INT-REP-001。",
        "P1D-WP0", "apps/api/src/modules/reporting/,apps/api/src/migrations/",
        "Daily records rebuilt from real events; one row per order; arrival rule honored; INT-REP-001 passes",
    ),
    (
        "REP-BE-002", "Codex", "Codex2",
        "Dispatchable supply snapshot scheduler (every 5 min)",
        "依 SD §5.5/§4.11 + SA §7.4：DispatchableSupplySnapshotService 每 5 分鐘依 businessArea×serviceProductCode 記錄可派 "
        "vehicle/driver count（readiness ready ∧ online/available ∧ location fresh ∧ exact product eligible），落 "
        "reporting.dispatchable_supply_snapshots，記 source_health。附 tests（coverage rate）。",
        "P1D-WP0,REP-BE-001", "apps/api/src/modules/reporting/",
        "Snapshots written every 5 min with coverage tracking; tests pass; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "REP-BE-003", "Codex2", "Codex",
        "Monthly / six-month operations summary aggregator",
        "依 SD §5.5/§4.12/§2.10 + SA §7.4：OperationsSummaryAggregator 固定口徑算 demandRequestCount/actualDispatchCount/"
        "completedTripCount/cancelledOrderCount、averageDispatchableVehicleCount + validSnapshotCount/expectedSnapshotCount/"
        "snapshotCoverageRate（<95% 標示不完整）、complaintCount by category；六個月由 monthly summary 組合。附 INT-REP-002 + "
        "unit（average formula、coverage、redispatch de-dup、complaint grouping）。",
        "P1D-WP0,REP-BE-002", "apps/api/src/modules/reporting/",
        "Fixed-definition summary metrics + coverage correct; INT-REP-002 passes",
    ),
    (
        "REP-BE-004", "Codex", "Codex2",
        "Report job types + preview API + controlled download",
        "依 SD §3.5/§7：ReportingFilingModule 新增 jobType daily_dispatch_record / six_month_operations_summary（沿用 POST "
        "/api/reports/jobs、GET /api/reports/jobs、GET /api/reports/{jobId}）；GET /api/ops/reports/operations-summary/preview；"
        "匯出 CSV/XLSX/PDF（daily）、PDF/CSV/JSON（summary）走既有 controlled download；on-demand 區間重算；report generation "
        "寫 audit。附 tests。",
        "P1D-WP0,REP-BE-003", "apps/api/src/modules/reporting/",
        "Both job types generate via existing report framework; preview + controlled download + audit work; tests pass",
    ),
    (
        "REP-OPS-001", "Codex2", "Codex",
        "Ops Console: operational reports UI (canvas-backed, bilingual)",
        "依 ops hand-off doc + canvas ops-screens-*.jsx：Reports 頁新增「每日派遣紀錄」「半年營運摘要」，篩選（日期/business "
        "area/service product/order source/tenant·partner/status）、顯示 generatedAt/coverage/freshness/status/download/"
        "regenerate、coverage<95% 警示。雙語 t()，canvas-first。",
        "P1D-WP0,REP-BE-004", "apps/ops-console-web/app/,apps/ops-console-web/lib/translations.ts",
        "Reports page lists both report types with filters + coverage warning; bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "REP-QA-001", "Gemini", "Codex2",
        "E2E-022 operations-reporting",
        "依 SD §11.3：建 tests/e2e/E2E-022-operations-reporting.sh（multiple source orders→assign/redispatch/cancel/complete→"
        "complaints→generate daily report→supply snapshots→six-month summary→verify counts/coverage）。",
        "REP-BE-004", "tests/e2e/E2E-022-operations-reporting.sh",
        "E2E-022 passes against the integration stack",
    ),

    # ════════════════ Verify ════════════════
    (
        "P1D-VERIFY", "Codex2", "Claude2",
        "Wave verification: typecheck/build all, i18n-guard, E2E green, SD §13 DoD checklist, residual report",
        "全部 WP 完成後：pnpm typecheck+build（api + ops-console + driver-app）全綠；新前端 i18n-guard 0 violation（en/zh，"
        "--baseline /tmp/empty.json 驗真修）；E2E-019/020/021/022 通過；對照 SD §13 Definition of Done 1-12 逐項勾稽（含 CTI "
        "明確不在 completion claim 內）；Android UAT evidence pack 存在、iOS UAT 標示 external_blocked；回報殘留清單 + 仍 deferred "
        "的 no-canvas FE（Fleet supply portal、Admin supply-review、Driver tracking/permission 視覺）。",
        "SUP-QA-001,SUP-BE-006,SUP-BE-007,ELIG-FE-001,ELIG-MOB-001,ELIG-QA-001,MOB-APP-003,MOB-APP-004,MOB-OPS-001,MOB-QA-001,MOB-UAT-001,REP-OPS-001,REP-QA-001",
        "docs/05-ui/",
        "All apps typecheck+build; i18n-guard clean; E2E-019/020/021/022 green; SD §13 DoD 1-12 checked; residual + deferred-FE report posted",
    ),
]


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {summary_zh}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "scripts/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"  deps=[{deps.split(',')[0]}{'…' if ',' in deps else ''}]" if deps else "  deps=[] (hub)"
    print(f"  {task_id:14s} {owner:>8s} -> {reviewer:>8s} | {title[:50]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Hub=P1D-WP0 (contracts + migrations + scaffolds); BE depend on WP0 (+direct dep);\n"
        f"canvas-backed FE/mobile/QA depend on their BE; P1D-VERIFY depends on all.\n"
        f"NOT dispatched (no canvas → human design first; hand-off docs delivered):\n"
        f"  SUP-FE-001 Fleet Portal /supply UI, SUP-FE-002 Admin /supply-review UI,\n"
        f"  Driver Tracking-Status screen + Permission-Gate visual (behaviour only via MOB-APP-003).\n"
    )
    ok = 0
    for i, task in enumerate(TASKS):
        if register(task):
            ok += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
