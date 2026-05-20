#!/usr/bin/env bash
# Follow-up dispatch for the 42 UI-HANDOFF-2026-05-20 tasks that didn't
# accumulate a worker commit on the first round. The 20 that did already
# have PRs (#182–#223 incl. recovery/*) landing into dev directly; this
# script only re-queues the missing ones so the supervisor picks them up
# again now that:
#   - claude2 is reauthenticated (#179 / manual reauth)
#   - codex2 cred-share + flock wrapper merged (#180)
#   - all paused lanes have been cleared from provider_pauses
#
# Re-uses the same dispatch shape as scripts/dispatch-ui-handoff-tasks.sh.
# 3s sleep between assigns to avoid the OOM that hit the original batch
# (memory: feedback_supervisor_oom_from_thrashing.md).
#
# Idempotent: assigns update existing task entries; no duplicates.
# Usage: AI_NAME=Claude bash scripts/dispatch-ui-handoff-tasks-followup.sh

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
: "${AI_NAME:=Claude}"
export AI_NAME

dispatch() {
  local id="$1" owner="$2" reviewer="$3" file="$4" design="$5" surface="$6" deps="$7" summary="$8"
  local title="${file##*apps/}: rebuild to match canvas ${design}"
  TASK_TITLE="$title" \
  TASK_SUMMARY_ZH="$summary" \
  TASK_PHASE='UI-HANDOFF-2026-05-20' \
  TASK_DEPENDS_ON="$deps" \
  TASK_ARTIFACTS="$file" \
  TASK_ACCEPTANCE="Visual layout matches ${design}; uses canvas primitives from packages/ui-web (CanvasShell/CanvasPageHeader/CanvasCard/CanvasTable/CanvasPill/CanvasBtn/CanvasBanner/Kpi/CanvasField/CanvasDL); preserve existing server fetch + lib/i18n keys, replace JSX only; pnpm --filter @drts/${surface} typecheck + lint + build pass; side-by-side parity >=95% vs /tmp/driver-app-handoff/driver-app/project/${design}.html section" \
  bash scripts/ai-status.sh assign "$id" "$owner" "$reviewer" "$title" >/dev/null
  echo "  assigned $id ($owner -> $reviewer)"
  sleep 3
}

DRV_DEPS="UI-CANVAS-DS-001,UI-CANVAS-DRV-CHROME-001"
PA_DEPS="UI-CANVAS-DS-001,UI-CANVAS-PA-CHROME-001"
OC_DEPS="UI-CANVAS-DS-001,UI-CANVAS-OC-CHROME-001"
TN_DEPS="UI-CANVAS-DS-001,UI-CANVAS-TN-CHROME-001"
PB_DEPS="UI-CANVAS-DS-001,UI-CANVAS-PB-CHROME-001"

echo "[DRV] 6 missing pages"
dispatch UI-HANDOFF-DRV-PAGE-PROVISIONING-001 Codex2 Claude2 apps/driver-app/app/onboarding.tsx ScreenProvisioning driver-app "$DRV_DEPS" \
  '對齊 ScreenProvisioning (driver-screens-1.jsx)。Device provisioning: 3-step wizard (裝置註冊/駕駛驗證/平台連線) + 啟用警告 banner。Hi-fi mobile (412×892)，深色 theme。'
dispatch UI-HANDOFF-DRV-PAGE-INBOX-001 Codex Claude2 apps/driver-app/app/jobs.tsx ScreenInbox driver-app "$DRV_DEPS" \
  '對齊 ScreenInbox (driver-screens-2.jsx)。Unified task inbox: 篩選 pills + summary KPIs + task cards 含 PlatformBadge + AuthorityBanner 樣式 + 6 種 status state。'
dispatch UI-HANDOFF-DRV-PAGE-EARNINGS-001 Codex2 Claude2 apps/driver-app/app/earnings.tsx ScreenEarnings driver-app "$DRV_DEPS" \
  '對齊 ScreenEarnings (driver-screens-3.jsx)。Big net display + 毛收/平台抽成/待入帳 grid + per-platform breakdown rows + 月結報表 list。'
dispatch UI-HANDOFF-DRV-PAGE-SHIFT-001 Codex2 Claude2 apps/driver-app/app/shift.tsx ScreenShift driver-app "$DRV_DEPS" \
  '對齊 ScreenShift (driver-screens-3.jsx)。班次卡 + 今日總結 KPIs + 多平台可用性 list + 下班打卡 outline danger button。'
dispatch UI-HANDOFF-DRV-PAGE-SOS-001 Codex Claude2 apps/driver-app/app/incident.tsx ScreenSOS driver-app "$DRV_DEPS" \
  '對齊 ScreenSOS (driver-screens-3.jsx)。緊急求援 hero card + 情況 grid + 當前訂單 PlatformBadge + sticky 「長按確認求援」danger button。'
dispatch UI-HANDOFF-DRV-PAGE-SETTINGS-001 Codex2 Claude2 apps/driver-app/app/settings.tsx ScreenSettings driver-app "$DRV_DEPS" \
  '對齊 ScreenSettings (driver-screens-3.jsx)。Profile card + 平台帳號綁定 list + 偏好 list + 其他 list (緊急聯絡人/關於本機/登出)。'

echo "[PA] 10 missing pages"
dispatch UI-HANDOFF-PA-PAGE-TENANTDETAIL-001 Codex Claude2 'apps/platform-admin-web/app/tenants/[tenantId]/page.tsx' PA_TenantDetail platform-admin-web "$PA_DEPS" \
  '對齊 PA_TenantDetail (platform-screens.jsx)。Tabs + Rollout 進度 Stepper + 3 個 status banner + Onboarding package DL + Roles invites Table。'
dispatch UI-HANDOFF-PA-PAGE-USERS-001 Codex2 Claude2 apps/platform-admin-web/app/users/page.tsx PA_Users platform-admin-web "$PA_DEPS" \
  '對齊 PA_Users (platform-screens.jsx)。Platform staff Table (NAME 含 avatar / EMAIL / ROLE / STATUS / 更新)。'
dispatch UI-HANDOFF-PA-PAGE-FLEET-001 Codex2 Claude2 apps/platform-admin-web/app/fleet/page.tsx PA_Fleet platform-admin-web "$PA_DEPS" \
  '對齊 PA_Fleet (platform-screens.jsx)。Tabs + license warn banner + Drivers DataTable。'
dispatch UI-HANDOFF-PA-PAGE-SWITCHBOARD-001 Codex2 Claude2 apps/platform-admin-web/app/switchboard/page.tsx PA_Switchboard platform-admin-web "$PA_DEPS" \
  '對齊 PA_Switchboard (platform-screens.jsx)。Tabs + Public info versions Table + 牌貼 placard preview。'
dispatch UI-HANDOFF-PA-PAGE-RECONDETAIL-001 Codex Claude2 'apps/platform-admin-web/app/payments/[issueId]/page.tsx' PA_ReconDetail platform-admin-web "$PA_DEPS" \
  '對齊 PA_ReconDetail (platform-screens.jsx)。新建 route：Issue summary DL + Timeline + Linked references + Resolution form。'
dispatch UI-HANDOFF-PA-PAGE-HEALTH-001 Codex2 Claude2 apps/platform-admin-web/app/health/page.tsx PA_Health platform-admin-web "$PA_DEPS" \
  '對齊 PA_Health (platform-screens.jsx)。Tabs + 4 KPIs + Active alerts list + Adapter inventory Table。'
dispatch UI-HANDOFF-PA-PAGE-NOTICES-001 Codex2 Claude2 apps/platform-admin-web/app/notices/page.tsx PA_Notices platform-admin-web "$PA_DEPS" \
  '對齊 PA_Notices (platform-screens.jsx)。Tabs + 現行公告 Table + Maintenance mode card with Toggle。'
dispatch UI-HANDOFF-PA-PAGE-AUDIT-001 Codex2 Claude2 apps/platform-admin-web/app/audit/page.tsx PA_Audit platform-admin-web "$PA_DEPS" \
  '對齊 PA_Audit (platform-screens.jsx)。Tabs + module filter pills + Audit log Table。'
dispatch UI-HANDOFF-PA-PAGE-FLAGS-001 Codex2 Claude2 apps/platform-admin-web/app/feature-flags/page.tsx PA_Flags platform-admin-web "$PA_DEPS" \
  '對齊 PA_Flags (platform-screens.jsx)。Feature flags Table with Toggle state column。'
dispatch UI-HANDOFF-PA-PAGE-ADAPTERS-001 Codex2 Claude2 apps/platform-admin-web/app/adapter-registry/page.tsx PA_Adapters platform-admin-web "$PA_DEPS" \
  '對齊 PA_Adapters (platform-screens.jsx)。2-col Card grid，每 adapter 一張 card + status Pill。'

echo "[OC] 12 missing pages"
dispatch UI-HANDOFF-OC-PAGE-DASHBOARD-001 Codex2 Claude2 apps/ops-console-web/app/dashboard/page.tsx OC_Dashboard ops-console-web "$OC_DEPS" \
  '對齊 OC_Dashboard (ops-screens.jsx)。6 KPI tiles + 今日待處理 banner 區 + 健康訊號 list + 當前 dispatch 隊列 Table。'
dispatch UI-HANDOFF-OC-PAGE-CALLCENTER-001 Codex Claude2 apps/ops-console-web/app/callcenter/page.tsx OC_Callcenter ops-console-web "$OC_DEPS" \
  '對齊 OC_Callcenter (ops-screens.jsx)。Tabs + 進行中 sessions list + Session detail card with form fields。'
dispatch UI-HANDOFF-OC-PAGE-COMPLAINTS-001 Codex2 Claude2 apps/ops-console-web/app/complaints/page.tsx OC_Complaints ops-console-web "$OC_DEPS" \
  '對齊 OC_Complaints (ops-screens.jsx)。Tabs + 4 KPIs + Complaints Table。'
dispatch UI-HANDOFF-OC-PAGE-INCIDENTS-001 Codex Claude2 apps/ops-console-web/app/incidents/page.tsx OC_Incidents ops-console-web "$OC_DEPS" \
  '對齊 OC_Incidents (ops-screens.jsx)。Tabs + critical incident danger banner + Incidents Table。'
dispatch UI-HANDOFF-OC-PAGE-REPORTS-001 Codex2 Claude2 apps/ops-console-web/app/reports/page.tsx OC_Reports ops-console-web "$OC_DEPS" \
  '對齊 OC_Reports (ops-screens.jsx)。Tabs + Report jobs Table。'
dispatch UI-HANDOFF-OC-PAGE-REVENUE-001 Codex2 Claude2 apps/ops-console-web/app/revenue/page.tsx OC_Revenue ops-console-web "$OC_DEPS" \
  '對齊 OC_Revenue (ops-screens.jsx)。Tabs + 4 KPIs + 結算矩陣 Table。'
dispatch UI-HANDOFF-OC-PAGE-ATTENDANCE-001 Codex2 Claude2 apps/ops-console-web/app/attendance/page.tsx OC_Attendance ops-console-web "$OC_DEPS" \
  '對齊 OC_Attendance (ops-screens.jsx)。Tabs + 4 KPIs + 當班甘特 grid (24 小時欄位 × 司機列)。'
dispatch UI-HANDOFF-OC-PAGE-MAINTENANCE-001 Codex2 Claude2 apps/ops-console-web/app/maintenance/page.tsx OC_Maintenance ops-console-web "$OC_DEPS" \
  '對齊 OC_Maintenance (ops-screens.jsx)。Tabs + Maintenance work order Table。'
dispatch UI-HANDOFF-OC-PAGE-DRIVERS-001 Codex2 Claude2 apps/ops-console-web/app/drivers/page.tsx OC_Drivers ops-console-web "$OC_DEPS" \
  '對齊 OC_Drivers (ops-screens.jsx)。Tabs + Drivers Table。'
dispatch UI-HANDOFF-OC-PAGE-VEHICLES-001 Codex2 Claude2 apps/ops-console-web/app/vehicles/page.tsx OC_Vehicles ops-console-web "$OC_DEPS" \
  '對齊 OC_Vehicles (ops-screens.jsx)。Vehicles Table。'
dispatch UI-HANDOFF-OC-PAGE-CONTRACTS-001 Codex2 Claude2 apps/ops-console-web/app/contracts/page.tsx OC_Contracts ops-console-web "$OC_DEPS" \
  '對齊 OC_Contracts (ops-screens.jsx)。Contracts Table 含 fleet_lease/partner_program/forwarder 三種 kind。'
dispatch UI-HANDOFF-OC-PAGE-FLAGS-001 Codex2 Claude2 apps/ops-console-web/app/feature-flags/page.tsx OC_Flags ops-console-web "$OC_DEPS" \
  '對齊 OC_Flags (ops-screens.jsx)。只讀 Feature flags Table。'

echo "[TN] 8 missing pages"
dispatch UI-HANDOFF-TN-PAGE-HOME-001 Claude2 Codex2 apps/tenant-console-web/app/page.tsx TN_Home tenant-console-web "$TN_DEPS" \
  '對齊 TN_Home (tenant-screens.jsx)。YAMATO 首頁：問候 + 月配額 + 4 KPIs + 進行中訂單 Table + 提醒 banner 區。'
dispatch UI-HANDOFF-TN-PAGE-BOOKINGS-001 Claude2 Codex2 apps/tenant-console-web/app/bookings/page.tsx TN_Bookings tenant-console-web "$TN_DEPS" \
  '對齊 TN_Bookings (tenant-screens.jsx)。Tabs + Bookings Table。'
dispatch UI-HANDOFF-TN-PAGE-BOOKINGDETAIL-001 Claude2 Codex2 'apps/tenant-console-web/app/bookings/[bookingId]/page.tsx' TN_BookingDetail tenant-console-web "$TN_DEPS" \
  '對齊 TN_BookingDetail (tenant-screens.jsx)。行程資訊 DL + Stepper + Timeline + 駕駛 DL + 計費 DL。'
dispatch UI-HANDOFF-TN-PAGE-NEWBOOKING-001 Claude2 Codex2 apps/tenant-console-web/app/bookings/new/page.tsx TN_NewBooking tenant-console-web "$TN_DEPS" \
  '對齊 TN_NewBooking (tenant-screens.jsx)。2-col layout：行程 form + 關聯與審批 form。'
dispatch UI-HANDOFF-TN-PAGE-PASSENGERS-001 Claude2 Codex2 apps/tenant-console-web/app/passengers/page.tsx TN_Passengers tenant-console-web "$TN_DEPS" \
  '對齊 TN_Passengers (tenant-screens.jsx)。新建 route：Tabs + CSV 匯入 + Passengers Table。'
dispatch UI-HANDOFF-TN-PAGE-ADDRESSES-001 Claude2 Codex2 apps/tenant-console-web/app/addresses/page.tsx TN_Addresses tenant-console-web "$TN_DEPS" \
  '對齊 TN_Addresses (tenant-screens.jsx)。新建 route：Addresses Table 含 TAGS pill 欄位。'
dispatch UI-HANDOFF-TN-PAGE-REPORTS-001 Claude Gemini2 apps/tenant-console-web/app/reports/page.tsx TN_Reports tenant-console-web "$TN_DEPS" \
  '對齊 TN_Reports (tenant-screens.jsx)。新建 route：Report jobs Table。'
dispatch UI-HANDOFF-TN-PAGE-SETTINGS-001 Gemini Claude2 apps/tenant-console-web/app/settings/page.tsx TN_Settings tenant-console-web "$TN_DEPS" \
  '對齊 TN_Settings (tenant-screens.jsx)。Tabs + 一般 form + 當期狀態 DL。'

echo "[PB] 6 missing pages"
dispatch UI-HANDOFF-PB-PAGE-LANDING-001 Gemini2 Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/page.tsx' PB_Landing partner-booking-web "$PB_DEPS" \
  '對齊 PB_Landing (partner-screens.jsx)。CTBC CardHeader (gradient + 金色 EXCLUSIVE chip) + 卡片身份卡 + 可使用服務 list + 禮遇條款 banner。'
dispatch UI-HANDOFF-PB-PAGE-ELIGIBILITY-001 Gemini2 Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/eligibility/page.tsx' PB_Eligibility partner-booking-web "$PB_DEPS" \
  '對齊 PB_Eligibility (partner-screens.jsx)。CardHeader 連結卡片 + 您的權益 PRow list + 授權同意 list + 確認連結 primary button。'
dispatch UI-HANDOFF-PB-PAGE-BOOK-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx' PB_Book partner-booking-web "$PB_DEPS" \
  '對齊 PB_Book (partner-screens.jsx)。CardHeader 建立行程 + Pickup/Drop card + 出發時間 toggle + 服務細節 + 禮遇與費用 gradient card。'
dispatch UI-HANDOFF-PB-PAGE-CONFIRMED-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/confirmed/page.tsx' PB_Confirmed partner-booking-web "$PB_DEPS" \
  '對齊 PB_Confirmed (partner-screens.jsx)。CardHeader 已派車 + 駕駛 avatar card + 地圖區 + ETA + 行程資訊 list。'
dispatch UI-HANDOFF-PB-PAGE-RECEIPT-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/receipt/page.tsx' PB_Receipt partner-booking-web "$PB_DEPS" \
  '對齊 PB_Receipt (partner-screens.jsx)。CardHeader 行程明細 + 時刻 PRow list + 費用拆解 + 款項 gradient card。'
dispatch UI-HANDOFF-PB-PAGE-HELP-001 Gemini Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/help/page.tsx' PB_Help partner-booking-web "$PB_DEPS" \
  '對齊 PB_Help (partner-screens.jsx)。CardHeader 協助 + 24 小時專線 dark-gradient card + FAQ list + 爭議 button。'

echo
echo "=== followup dispatch complete ==="
