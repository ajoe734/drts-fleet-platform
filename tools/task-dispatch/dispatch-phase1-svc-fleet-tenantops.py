#!/usr/bin/env python3
"""Dispatch the Phase 1 net-new execution wave (Service Product / Fleet Partner /
Tenant Business Operations) to the supervisor.

Source of truth (archived 2026-06-04):
  - SA: docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md
  - SD: docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md
  - Index: docs/02-architecture/phase1_final_sasd_index_20260604.md

Why this wave:
  The final Phase 1 SA/SD re-baseline Phase 1 around three P0 pillars that the
  current build does NOT yet have. Verified against the live repo before
  dispatch: `ServiceProduct`, `VehicleServiceCapability` / eligibility-matrix,
  `FleetPartner` and `RevenueShare` are ABSENT from apps/api/src — this wave is
  genuinely net-new, not a duplicate of the 987 existing task-briefs. Existing
  modules (partner-booking, tenant-partner, owned-mobility, billing-settlement,
  platform-earnings, forwarder, platform-presence) are EXTENDED, not rebuilt.

Guardrails baked into the briefs (operator standing rules):
  - No LLM UI design / canvas-first: Platform Admin & Ops Console new pages have
    canvas (docs/05-ui/drts-design-canvas/platform-screens-3.jsx, ops-screens-3.jsx)
    → buildable. The Fleet Partner Portal is a BRAND-NEW app with no canvas →
    it gets a design-handoff DOC task only (FLEET-PORTAL-HANDOFF), never an
    autoworker UI build. Its frontend build is deferred to a later P1 wave.
  - Lovable boundary: Tenant Business Ops Portal frontend is tenant-commute-hub
    (off-limits) → BE-TENBIZ-001 is BFF/API only on the drts side.
  - Bilingual: every new frontend goes through central lib/translations.ts t()
    (consistent with the in-flight i18n wave) — no inline i18n.

Design (maximize parallel, minimize deps — per operator):
  - P1NEW-WP0 is the ONLY foundation hub: lands all SD §2/§6 contracts in
    packages/contracts/src/ and scaffolds the three new modules so downstream
    backend/frontend tasks don't collide.
  - Backend tasks depend on WP0 (+ their direct backend dep where enforcement
    genuinely needs the model). Frontend tasks depend on WP0 + their backend.
  - P1NEW-VERIFY depends on the whole set.

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy); the
supervisor availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-phase1-svc-fleet-tenantops.py
  (to register against a different canonical root, set AI_STATUS_ROOT=/path)
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[2]
PHASE = "phase1-svc-fleet-tenantops-20260604"
PLANNING_REF = "docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Foundation hub (the one necessary dependency) ──────────────────────
    (
        "P1NEW-WP0",
        "Claude2",
        "Codex2",
        "Contracts + module scaffolds for service-product / vehicle-eligibility / fleet-partner",
        "依 SD §1/§2/§6：(1) 於 packages/contracts/src/ 新增並 export 所有新 domain 型別："
        "ServiceProductType/ServiceTiming/VehicleLicenseType/ServiceProductRecord/"
        "VehicleServiceCapabilityRecord/TenantServiceProgramRecord/FleetPartnerRecord/"
        "DriverFleetAffiliationRecord/FleetPartnerRevenueShareRuleRecord，並補 §2.4 error codes "
        "（SERVICE_PRODUCT_INACTIVE/VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT/"
        "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT/AIRPORT_PERMIT_REQUIRED/FIXED_FARE_NOT_ALLOWED/"
        "NO_ELIGIBLE_SUPPLY_FOR_SERVICE_PRODUCT）。(2) 在 apps/api/src/modules/ 建立空模組骨架 "
        "service-product/、vehicle-eligibility/、fleet-partner/（module + controller stub + 註冊到 app module），"
        "讓後續 WP 不互相衝突。本任務不實作商業邏輯，只下契約與骨架。",
        "",
        "packages/contracts/src/,apps/api/src/modules/service-product/,apps/api/src/modules/vehicle-eligibility/,apps/api/src/modules/fleet-partner/",
        "Contracts compile & are exported from packages/contracts; three empty modules registered; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass",
    ),

    # ════════════════ Backend P0 ════════════════
    (
        "BE-SVC-001", "Codex", "Codex2",
        "service-product registry + admin CRUD API",
        "依 SD §2.1/§2.2/§8.2：在 apps/api/src/modules/service-product 實作 service product registry 與 "
        "GET/POST/PUT /api/admin/service-products（含 timing/active/defaultBillingMode/"
        "defaultProofRequirements），所有變更寫 audit（§8.4）。附 unit tests。",
        "P1NEW-WP0", "apps/api/src/modules/service-product/",
        "Admin CRUD works; create/update audited; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "BE-SVC-002", "Codex2", "Codex",
        "vehicle-eligibility capability + matrix admin API",
        "依 SD §2.1/§2.2：實作 VehicleServiceCapability 與 GET/PUT /api/admin/vehicle-eligibility-matrix"
        "（licenseType→supportedProducts、seat/luggage、airportPermit、businessDispatchEligible、"
        "taxiMeterRequired、fixedFareAllowed、platformForwardingAllowed、effective 期間），變更寫 audit。附 tests。",
        "P1NEW-WP0", "apps/api/src/modules/vehicle-eligibility/",
        "Matrix get/update works; audited; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "BE-SVC-003", "Codex", "Claude2",
        "Dispatch eligibility enforcement + eligible-supply / eligible-products APIs",
        "依 SD §2.3/§2.4：在所有 dispatch/reservation/forwarder driver matching 前置 enforcement pipeline"
        "（serviceProduct→tenantServiceProgram→license→driver qual→capacity→airport permit→fixed fare→"
        "forwarding eligibility→proof→final eligible supply），違反回 §2.4 error code；提供 "
        "GET /api/ops/dispatch/eligible-supply?serviceProduct=… 與 GET /api/driver/eligible-products。"
        "務必接上 owned-mobility/forwarder 既有 matching，不另建第二套派遣引擎。附 tests。",
        "P1NEW-WP0,BE-SVC-001,BE-SVC-002", "apps/api/src/modules/vehicle-eligibility/,apps/api/src/modules/owned-mobility/",
        "Ineligible vehicle rejected with explicit error code; eligible-supply + eligible-products return correctly; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "BE-FLEET-001", "Codex2", "Codex",
        "fleet-partner module: FleetPartner + DriverFleetAffiliation + admin API",
        "依 SD §6.1/§6.2：實作 FleetPartner 與 DriverFleetAffiliation 模型，及 "
        "GET/POST/GET{id}/PUT{id} /api/admin/fleet-partners、GET /api/admin/fleet-partners/{id}/drivers、"
        "POST /api/admin/drivers/{driverId}/fleet-affiliations，變更寫 audit（§8.4）。附 tests。",
        "P1NEW-WP0", "apps/api/src/modules/fleet-partner/",
        "Fleet partner CRUD + driver affiliation works; audited; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "BE-FLEET-002", "Codex", "Codex2",
        "Revenue share rules + fleet statement calculation + statements API",
        "依 SD §6.1/§6.3：實作 FleetPartnerRevenueShareRule（appliesTo/formula/rateBps/fixedAmountMinor/effective）"
        "與 statement 計算流程（completed trip→driver earning→affiliation resolved→rule matched→line item→"
        "monthly statement→payout status），及 revenue-share-rules 與 fleet-partners/{id}/statements API。"
        "接上 billing-settlement / platform-earnings，不重算 driver earning。附 tests。",
        "P1NEW-WP0,BE-FLEET-001", "apps/api/src/modules/fleet-partner/,apps/api/src/modules/billing-settlement/",
        "Revenue share rule CRUD; fleet partner share + monthly statement computed from completed trips; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "BE-TENBIZ-001", "Codex2", "Claude2",
        "Tenant business-ops APIs: dashboard + orders/trips + payables + service-programs (BFF/API only)",
        "依 SD §3：實作 GET /api/tenant/dashboard（TenantDashboardSummary）、GET /api/tenant/orders[/{id}]、"
        "GET /api/tenant/trips（TenantOrderListQuery filters：serviceProduct/costCenter/program/rider/"
        "sourcePlatform/invoiceStatus）、GET /api/tenant/payables/summary|line-items、/statements、/invoices、"
        "GET /api/tenant/service-programs[/{programId}]。擴充 tenant-partner / billing-settlement，"
        "**僅後端/BFF，不動 tenant-commute-hub（Lovable）前端**。附 tests。",
        "P1NEW-WP0", "apps/api/src/modules/tenant-partner/,apps/api/src/modules/billing-settlement/",
        "Dashboard/orders/payables/service-programs APIs return per SD §3 shapes; no tenant-commute-hub edits; pnpm --filter @drts/api typecheck + test pass",
    ),

    # ════════════════ Frontend P0 (canvas-backed, bilingual) ════════════════
    (
        "ADM-SVC-001", "Codex", "Codex2",
        "Platform Admin: Service Products page",
        "依 SD §7.6/§8 與 canvas docs/05-ui/drts-design-canvas/platform-screens-3.jsx：在 "
        "apps/platform-admin-web 建 Service Products 管理頁（list/create/edit，串 /api/admin/service-products）。"
        "**走 lib/translations.ts t() 雙語 en+zh，無內聯 i18n**；先查 design canvas 不得自創 UI。",
        "P1NEW-WP0,BE-SVC-001", "apps/platform-admin-web/app/service-products/,apps/platform-admin-web/lib/translations.ts",
        "Page lists/creates/edits service products via API; bilingual via t(); i18n-guard clean; typecheck+build pass",
    ),
    (
        "ADM-SVC-002", "Codex2", "Codex",
        "Platform Admin: Vehicle Eligibility Matrix page",
        "依 SD §8.3 與 platform-screens-3.jsx canvas：建 Vehicle Eligibility Matrix 編輯頁"
        "（串 GET/PUT /api/admin/vehicle-eligibility-matrix）。雙語 t()，無內聯 i18n；canvas-first。",
        "P1NEW-WP0,BE-SVC-002", "apps/platform-admin-web/app/vehicle-eligibility/,apps/platform-admin-web/lib/translations.ts",
        "Matrix view/edit via API; bilingual via t(); i18n-guard clean; typecheck+build pass",
    ),
    (
        "ADM-FLEET-001", "Codex", "Codex2",
        "Platform Admin: Fleet Partners / Affiliations / Revenue Share / Statements pages",
        "依 SD §7.6/§8.1 與 platform-screens-3.jsx canvas：建 Fleet Partners（list/detail）、Driver Affiliations、"
        "Revenue Share Rules、Fleet Statements 管理頁，串 /api/admin/fleet-partners*。雙語 t()，無內聯 i18n；canvas-first。",
        "P1NEW-WP0,BE-FLEET-001,BE-FLEET-002", "apps/platform-admin-web/app/fleet-partners/,apps/platform-admin-web/lib/translations.ts",
        "Fleet partner mgmt pages work via API; bilingual via t(); i18n-guard clean; typecheck+build pass",
    ),
    (
        "DRV-SVC-001", "Codex2", "Gemini",
        "Driver App: service-aware task card + grouped earnings",
        "依 SD §5.1/§5.3 與 Driver App canvas：task card 顯示 serviceProduct/sourcePlatform/tenant program、"
        "vehicle eligibility summary、route/fare authority、routeLocked/fixedPrice、proofRequired、"
        "fleetPartnerAttribution；earnings 依 platform/serviceProduct/tenant/fleet 分組（串 "
        "/api/driver/eligible-products、/api/driver/earnings?groupBy=…）。雙語 t()；canvas-first。",
        "P1NEW-WP0,BE-SVC-003", "apps/driver-app/",
        "Task card is service/platform/fleet aware; earnings grouped views work; bilingual; typecheck+build pass",
    ),
    (
        "OPS-SVC-001", "Codex", "Codex2",
        "Ops Console: service-product dispatch filter + eligibility-failed reason + manual review queue + fleet attribution",
        "依 SD §7 與 canvas docs/05-ui/drts-design-canvas/ops-screens-3.jsx：dispatch board 加 serviceProduct/"
        "reservation-realtime/license/fleet/approvalState/eligibility-failed-reason filters 與 eligible-supply/"
        "no-supply-reason panels；新增 Manual Review Queue（§7.2 queue types）與 incident/complaint fleet attribution。"
        "**走 ops translations.ts t() 雙語，無內聯 i18n**；canvas-first。",
        "P1NEW-WP0,BE-SVC-003", "apps/ops-console-web/app/dispatch/,apps/ops-console-web/lib/translations.ts",
        "Dispatch board filters by service product + shows eligibility-failed reason; manual review queue present; bilingual; i18n-guard clean; typecheck+build pass",
    ),

    # ════════════════ Design handoff (NO LLM UI build) ════════════════
    (
        "FLEET-PORTAL-HANDOFF", "Claude", "Claude2",
        "Fleet Partner Portal: business-flow + screen-requirements design-handoff doc (NO UI code)",
        "依 feedback_no_llm_ui_design / feedback_must_check_design_canvas：Fleet Partner Portal 是全新 app 且無 "
        "design canvas，**禁止由 LLM 自創 UI**。本任務只產出 docs/05-ui/fleet-partner-portal-design-handoff-20260604.md："
        "business flows（SA §4.6 Flow F）、§7.5 的 9 個 P0 screens 之 screen-requirements、串接的 "
        "/api/fleet-partner/* 契約（SD §6.2），交付人工視覺設計團隊。不寫任何前端程式碼，不建立 app。",
        "P1NEW-WP0,BE-FLEET-002", "docs/05-ui/fleet-partner-portal-design-handoff-20260604.md",
        "Handoff doc covers Flow F + 9 P0 screens + /api/fleet-partner/* contracts; NO frontend code committed",
    ),

    # ════════════════ E2E / Verify ════════════════
    (
        "E2E-SVC-013", "Gemini", "Codex",
        "E2E-013 service-product-eligibility",
        "依 SD §9：建 E2E-013-service-product-eligibility.sh（create service product→configure vehicle "
        "eligibility→booking requiring airport transfer→ineligible taxi rejected→eligible airport vehicle "
        "accepted→dispatch eligible supply returned）。",
        "BE-SVC-003", "tests/e2e/E2E-013-service-product-eligibility.sh",
        "E2E-013 passes at least in staging",
    ),
    (
        "E2E-FLEET-014", "Gemini2", "Codex2",
        "E2E-014 fleet-partner-revenue-share",
        "依 SD §9：建 E2E-014-fleet-partner-revenue-share.sh（create fleet partner→affiliate driver→"
        "create revenue share rule→driver completes trip→driver earnings→fleet share→fleet statement）。",
        "BE-FLEET-002", "tests/e2e/E2E-014-fleet-partner-revenue-share.sh",
        "E2E-014 passes at least in staging",
    ),
    (
        "E2E-TENBIZ-012", "Codex", "Codex2",
        "E2E-012 tenant-business-operations",
        "依 SD §9：建 E2E-012-tenant-business-operations.sh（tenant login→create booking→trip completed→"
        "dashboard counts→payable summary→statement→report export incl order/user/cost center/service product）。",
        "BE-TENBIZ-001", "tests/e2e/E2E-012-tenant-business-operations.sh",
        "E2E-012 passes at least in staging",
    ),
    (
        "P1NEW-VERIFY", "Codex2", "Claude2",
        "Wave verification: typecheck/build all, i18n-guard, E2E green, residual report",
        "全部 WP 完成後：pnpm typecheck + build 兩前端與 api 全綠；新前端頁 i18n-guard 0 violation（en/zh）；"
        "E2E-012/013/014 通過；對照 SD §11 Acceptance Criteria 1-12 逐項勾稽並回報殘留清單。",
        "P1NEW-WP0,BE-SVC-001,BE-SVC-002,BE-SVC-003,BE-FLEET-001,BE-FLEET-002,BE-TENBIZ-001,ADM-SVC-001,ADM-SVC-002,ADM-FLEET-001,DRV-SVC-001,OPS-SVC-001,FLEET-PORTAL-HANDOFF,E2E-SVC-013,E2E-FLEET-014,E2E-TENBIZ-012",
        "docs/05-ui/",
        "All apps typecheck+build; i18n-guard clean; E2E-012/013/014 green; SD §11 AC 1-12 checked; residual report posted",
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
    cmd = ["bash", "tools/development-orchestrator/bin/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"  deps=[{deps.split(',')[0]}{'…' if ',' in deps else ''}]" if deps else "  deps=[] (hub)"
    print(f"  {task_id:20s} {owner:>8s} -> {reviewer:>8s} | {title[:52]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Hub=P1NEW-WP0 (contracts + module scaffolds); backend+frontend depend on WP0 (+ direct BE dep);\n"
        f"P1NEW-VERIFY depends on all.\n"
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
