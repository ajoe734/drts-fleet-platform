#!/usr/bin/env python3
"""Dispatch the design-handoff-20260525 follow-up wave to the supervisor.

Source of truth: docs/05-ui/design-handoff-20260525-implementation-plan.md
(landed in PR #536). Context: the 2026-06-06 claude.ai/design handoff was
archived + gap-analysed; batch C (Ops complaint detail, PR #539) and batch A
(new apps/fleet-partner-portal-web, PR #541) are done; batch B (Platform Admin
Part F) was already built on dev. This wave is the remaining FOLLOW-UPS.

Two waves (pick with --wave):

  foundation  (default) — tasks that operate on files ALREADY on origin/dev,
                safe to start immediately:
                  Fleet-portal BACKEND endpoints + api-client package methods,
                  Part F eligibility data-model + matrix UI, Partner Booking
                  program flows, Driver App state deepening, Tenant Console
                  deepening, design-system token sync.

  portal      — tasks that need the new app from PR #541 to be MERGED to dev
                first (they edit apps/fleet-partner-portal-web): wire the portal
                UI to live data, deploy wiring, e2e smoke. DO NOT dispatch this
                wave until #541 is on dev.

  all         — both waves (only after #541 merges).

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy on
backend). The supervisor availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-design-handoff-followups-20260606.py [--wave foundation|portal|all] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[1]
PHASE = "design-handoff-followups-202606"
PLANNING_REF = "docs/05-ui/design-handoff-20260525-implementation-plan.md"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)

FOUNDATION = [
    # ── Fleet Partner Portal backend (apps/api + @drts/api-client, on dev) ──
    (
        "DH-FLP-BE-ENDPOINTS",
        "Codex",
        "Codex2",
        "Fleet Partner Portal API: dashboard/drivers/vehicles/trips/quality-metrics",
        "依 phase1_final_sd §6.2 + fleet-partner-portal-design-handoff-20260604.md，在 apps/api fleet-partner module 補齊 portal 端點："
        "GET /api/fleet-partner/{dashboard,drivers,vehicles,trips,quality-metrics}（statements 已存在）。"
        "皆為 partner-scoped，以 x-fleet-partner-id header 限定該車行自己的資料（不可跨車行）。"
        "在 packages/contracts 定義各回應 record 型別（shape 對齊 apps/fleet-partner-portal-web/lib/fleet-portal-fixtures.ts 的 fixtures，方便前端直接替換）。加 unit test。",
        "",
        "apps/api/src/modules/fleet-partner/,packages/contracts/src/index.ts,apps/api/tests/unit/",
        "5 portal GET endpoints return partner-scoped data keyed by x-fleet-partner-id; contracts exported; unit tests pass; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "DH-FLP-BE-CLIENT",
        "Codex2",
        "Codex",
        "@drts/api-client: fleet-portal dashboard/drivers/vehicles/trips/quality methods",
        "在 packages/api-client 補上 fleet-portal 自助端點的 client 方法："
        "listFleetPortalDashboard / listFleetPortalDrivers / listFleetPortalVehicles / listFleetPortalTrips / getFleetPortalQualityMetrics"
        "（listFleetPortalStatements 已存在，照其模式）。回傳型別用 DH-FLP-BE-ENDPOINTS 定義的 contracts。"
        "注意：portal 端點需 x-fleet-partner-id header，client 須支援帶入。不在此 task 動 apps/fleet-partner-portal-web（那要等 #541 上 dev）。",
        "DH-FLP-BE-ENDPOINTS",
        "packages/api-client/src/index.ts",
        "5 new fleet-portal client methods typed against the contracts; mirror listFleetPortalStatements; pnpm --filter @drts/api-client typecheck + test pass",
    ),
    # ── Part F eligibility data-model richness (F2/F3) ─────────────────────
    (
        "DH-ADM-ELIG-MODEL",
        "Codex",
        "Codex2",
        "Vehicle Eligibility F3 + Service Product F2 data-model extension",
        "依 phase1 視覺需求 Part F3/F2：目前後端契約缺設計要的格狀態。擴 packages/contracts 的 VehicleEligibilityMatrixRecord 加："
        "conditionallyAllowed、requiredDocuments(string[])、trainingRequired(bool)、permitRequired(bool)（per service-product × license-type 格）；"
        "ServiceProduct 記錄補 allowedLicenseTypes、meterRequired、fixedFareAllowed 的明確欄位（F2 表格欄）。"
        "對應更新 apps/api service-product / vehicle-eligibility module 的 repository/service + migration + unit test。純後端＋契約，UI 在 DH-ADM-ELIG-UI。",
        "",
        "packages/contracts/src/index.ts,apps/api/src/modules/vehicle-eligibility/,apps/api/src/modules/service-product/",
        "Contract + backend expose conditionallyAllowed/requiredDocuments/trainingRequired/permitRequired (eligibility) and allowedLicenseTypes/meterRequired (service product); migration + unit tests pass; pnpm --filter @drts/api typecheck+test pass",
    ),
    (
        "DH-ADM-ELIG-UI",
        "Claude2",
        "Codex",
        "Platform Admin: render F3 matrix cell states + F2 service-product columns",
        "依 Part F2/F3 與 platform-admin design canvas：在 apps/platform-admin-web/app/vehicle-eligibility 的 matrix 每格顯示 allowed / not-allowed / conditionally-allowed / required-documents / training-required / permit-required（用 DH-ADM-ELIG-MODEL 新欄位）；"
        "在 app/service-products 表格補 allowed-license-types、meter-required 欄。沿用 @drts/ui-web canvas 原語＋central t() i18n，不得 inline locale 三元。不要捏造資料，全部讀新契約欄位。",
        "DH-ADM-ELIG-MODEL",
        "apps/platform-admin-web/app/vehicle-eligibility/page.tsx,apps/platform-admin-web/app/service-products/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "Matrix cells show all 6 F3 states from contract; service-products shows F2 license/meter columns; t() i18n; pnpm --filter @drts/platform-admin-web typecheck+build pass",
    ),
    # ── Part C — Partner Booking program-branded flows ─────────────────────
    (
        "DH-PB-PROGRAM-THEME",
        "Claude",
        "Codex",
        "Partner Booking: 3 program-branded flows (theme + landing/eligibility/review/success/tracking)",
        "依 Part C + design canvas pb-screens.jsx：apps/partner-booking-web 目前是泛用流程，需支援 3 個品牌專案 per-program 主題與共用畫面："
        "信用卡機場接送(中信 ride.ctbc)、保險理賠代步(富邦 claim.fubon-ins)、旅行社團體接送(雄獅 booking.lion-travel)，各自 primary/accent 配色與品牌字樣；"
        "共用 landing / eligibility / review(下單前確認) / success / tracking(行程追蹤) / error·manual-review 畫面，依 program 切換主題。program-specific 表單在 DH-PB-PROGRAM-FORMS。沿用既有 [tenantSlug] route group 結構與 canvas 原語＋t()。",
        "",
        "apps/partner-booking-web/app/,apps/partner-booking-web/lib/",
        "Per-program theming switches by program (card/insurance/travel); shared landing/eligibility/review/success/tracking screens render themed; typecheck+build pass",
    ),
    (
        "DH-PB-PROGRAM-FORMS",
        "Gemini",
        "Codex2",
        "Partner Booking: program-specific booking forms (C3)",
        "依 Part C3 + pb-screens.jsx：在 DH-PB-PROGRAM-THEME 之上實作三種專案各自的下單表單欄位："
        "信用卡機場接送（卡別/航班/航廈/接送方向）、保險理賠代步（理賠案號/保單/代步期間/醫療院所）、旅行社團體接送（團號/人數/行李/集合點）。"
        "欄位驗證與 eligibility gating 對齊各 program。沿用 canvas 原語＋central t()。",
        "DH-PB-PROGRAM-THEME",
        "apps/partner-booking-web/app/,apps/partner-booking-web/lib/",
        "Each of the 3 programs renders its own form fields with validation; eligibility gating per program; typecheck+build pass",
    ),
    # ── Part D — Driver App state deepening ────────────────────────────────
    (
        "DH-DRV-STATE-DEEPEN",
        "Codex2",
        "Claude2",
        "Driver App: forwarded/relay, sync_failed, lost_race, SOS-protected, offline states",
        "依 driver-app-design-handoff-packet-20260525 §3.11/§3.13/§5 與 driver-screens-*.jsx：在 apps/driver-app 補齊設計的任務/行程狀態："
        "forwarded 平台單的 relay accept/reject + accept_pending 等候、sync_failed（需派車台處理）、lost_race（其他司機已接）、cancelled_by_platform 補償、"
        "SOS protected access(§5.9/Q-DRV11)、partial offline mode(§3.11)。沿用既有 Expo 元件與 lib，狀態驅動 UI，不得自創設計。加對應 unit test。",
        "",
        "apps/driver-app/app/,apps/driver-app/components/,apps/driver-app/lib/,apps/driver-app/tests/",
        "jobs/trip render forwarded relay + sync_failed + lost_race + cancelled_by_platform states; SOS protected gate; offline banner+queue; unit tests + typecheck pass",
    ),
    # ── Part B — Tenant Console deepening ──────────────────────────────────
    (
        "DH-TEN-DEEPEN",
        "Codex",
        "Gemini",
        "Tenant Console: dashboard cards/charts, booking detail tabs, new-booking program fields, payables/statements",
        "依 tenant-console-design-handoff-packet-20260525 §5 與 tenant-screens-*.jsx：深化既有路由（不新建路由）："
        "/(home) dashboard 必備卡片＋圖表(B3)、/bookings/[id] detail tabs(B4)、/bookings/new 企業派車與信用卡/保險專案欄位(B5)、payables/billing/statements(B6)。"
        "沿用 @drts/ui-web canvas 原語＋central t() i18n，讀既有後端契約，不得捏造資料。",
        "",
        "apps/tenant-console-web/app/,apps/tenant-console-web/lib/translations.ts",
        "dashboard cards+charts, booking detail tabs, new-booking program fields, statements section render per packet; t() i18n; typecheck+build pass",
    ),
    # ── Part H — design system token sync ──────────────────────────────────
    (
        "DH-DS-TOKEN-SYNC",
        "Claude2",
        "Codex",
        "Design system: sync mgmt-tokens + Part H badges/status-colors/table caps",
        "依 Part H 與更新後的 design canvas mgmt-tokens.jsx（PR #536）：把設計的 badge 集、狀態色、表格必備能力同步進 packages/ui-tokens 與 packages/ui-web canvas-tokens/primitives，"
        "確保跨 app（ops/admin/tenant/partner/fleet-portal）一致。不破壞既有 surface accents；補 storybook/視覺驗證。",
        "",
        "packages/ui-tokens/src/,packages/ui-web/src/canvas-tokens.ts,packages/ui-web/src/canvas-primitives/index.tsx",
        "Part H badges/status-colors/table capabilities present in ui-tokens+ui-web; existing surfaces unbroken; pnpm --filter @drts/ui-web typecheck+build pass",
    ),
]

PORTAL = [
    # ── Need PR #541 (apps/fleet-partner-portal-web) merged to dev FIRST ───
    (
        "DH-FLP-UI-WIRE",
        "Claude",
        "Codex",
        "Fleet Portal: wire pages to live /api/fleet-partner/* (replace fixtures)",
        "PREREQ：PR #541 須已合進 dev（本 task 編輯 apps/fleet-partner-portal-web）。"
        "新增 lib/api-client.server.ts（fleet-partner-scoped，control-plane-auth + x-fleet-partner-id 解析），"
        "把 lib/fleet-portal-fixtures.ts seam 後的 10 頁資料改接 DH-FLP-BE-CLIENT 的 client 方法，"
        "保留 graceful fallback（端點不可用時顯示 fixtures + 提示，照 ops detail 模式）。維持 central t() i18n。",
        "DH-FLP-BE-CLIENT",
        "apps/fleet-partner-portal-web/lib/,apps/fleet-partner-portal-web/app/",
        "All 10 routes render live partner-scoped data with graceful fallback; no hardcoded fixtures in the render path; typecheck+lint+build pass",
    ),
    (
        "DH-FLP-DEPLOY",
        "Gemini",
        "Codex2",
        "Fleet Portal: Dockerfile + deploy-dev target + cross-app nav link",
        "PREREQ：PR #541 須已合進 dev。照 apps/ops-console-web 模式為 apps/fleet-partner-portal-web 補 Dockerfile（standalone，port 3007）、"
        "在 .github/workflows/deploy-dev.yml 加 build&push + Cloud Run service（drts-fleet-partner-portal-web）、"
        "在跨 app 連結處註冊 portal（如其他 console 的 cross-app-links）。確認 turbo/workspace 已涵蓋。",
        "DH-FLP-UI-WIRE",
        "apps/fleet-partner-portal-web/Dockerfile,.github/workflows/deploy-dev.yml",
        "Dockerfile builds standalone; deploy-dev builds+pushes+deploys the portal service; cross-app link registered; deploy-dev workflow valid",
    ),
    (
        "DH-FLP-E2E",
        "Codex",
        "Claude2",
        "Fleet Portal: Playwright 10-route smoke + screenshots vs design",
        "PREREQ：DH-FLP-UI-WIRE + DH-FLP-DEPLOY。為 apps/fleet-partner-portal-web 10 路由寫 Playwright smoke（非 404、單一 portal shell、正確標題、必備 tabs/tables/cards、high-risk CTA reason），"
        "1440x950 截圖對照 design-handoffs 的 Fleet Partner Portal.html；遠端 dev 部署後再跑一次。",
        "DH-FLP-UI-WIRE,DH-FLP-DEPLOY",
        "tests/e2e/fleet-partner-portal-*.spec.ts,docs/05-ui/",
        "10 routes pass smoke; single portal shell; screenshot set vs design; remote dev smoke clean after deploy",
    ),
]

WAVES = {"foundation": FOUNDATION, "portal": PORTAL, "all": FOUNDATION + PORTAL}


def register(task, dry_run=False):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    if dry_run:
        dep_note = f"  deps=[{deps}]" if deps else "  deps=[] (independent)"
        print(f"  [dry-run] {task_id:22s} {owner:>8s} -> {reviewer:>8s} | {title[:58]}{dep_note}")
        return True
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
    dep_note = f"  deps=[{deps}]" if deps else "  deps=[] (independent)"
    print(f"  {task_id:22s} {owner:>8s} -> {reviewer:>8s} | {title[:58]}{dep_note}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave", choices=list(WAVES), default="foundation")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tasks = WAVES[args.wave]
    print(
        f"Wave '{args.wave}': registering {len(tasks)} tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
    )
    if args.wave in ("portal", "all"):
        print("NOTE: portal-wave tasks require PR #541 (apps/fleet-partner-portal-web) merged to dev.\n")
    ok = 0
    for i, task in enumerate(tasks):
        if register(task, dry_run=args.dry_run):
            ok += 1
        if not args.dry_run and i < len(tasks) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(tasks)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(tasks) else 1


if __name__ == "__main__":
    sys.exit(main())
