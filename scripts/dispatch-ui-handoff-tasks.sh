#!/usr/bin/env bash
# Batch dispatch UI-HANDOFF-* tasks to the supervisor task list (ai-status.json).
#
# Source: Claude Design handoff at /tmp/driver-app-handoff/ — the 5-surface
# DRTS frontend redesign (Driver App + Platform Admin + Ops Console + Tenant
# Console + Partner Booking). Created 2026-05-20.
#
# Idempotent: `ai-status.sh assign` updates an existing task with the same id
# instead of duplicating, so this script can be re-run safely.
#
# Each entry registers one page rebuild task with:
# - owner / reviewer drawn from the standard workload ratio
#   (Codex/Codex2 take 70% per feedback_agent_workload_ratio.md)
# - artifact = the actual page file under apps/<surface>/app/
# - design_fn = the matching <Surface>Screens.jsx component name
# - planning_ref points to the handoff JSX in /tmp/driver-app-handoff/
#
# Dependencies UI-CANVAS-DS-001 / UI-CANVAS-<SURFACE>-CHROME-001 are listed for
# traceability; they're already review_approved so won't actually block.
#
# Usage: AI_NAME=Claude bash scripts/dispatch-ui-handoff-tasks.sh

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
}

# Design reference: /tmp/driver-app-handoff/driver-app/project/{driver|platform|ops|tenant|partner}-screens.jsx

echo "[DRV] driver-app — 9 pages"
DRV_DEPS="UI-CANVAS-DS-001,UI-CANVAS-DRV-CHROME-001"
dispatch UI-HANDOFF-DRV-PAGE-PROVISIONING-001 Codex2 Claude2 apps/driver-app/app/onboarding.tsx ScreenProvisioning driver-app "$DRV_DEPS" \
  '對齊 ScreenProvisioning (driver-screens-1.jsx)。Device provisioning: 3-step wizard (裝置註冊/駕駛驗證/平台連線) + 啟用警告 banner。Hi-fi mobile (412×892)，深色 theme。'
dispatch UI-HANDOFF-DRV-PAGE-WORKSPACE-001 Codex Claude2 apps/driver-app/app/index.tsx ScreenWorkspace driver-app "$DRV_DEPS" \
  '對齊 ScreenWorkspace (driver-screens-1.jsx)。Driver home cockpit: 早安問候 + hero next-action card + KPI row + 緊急 reauth alert + 平台連線 list + quick tiles。Variant A 為預設。'
dispatch UI-HANDOFF-DRV-PAGE-INBOX-001 Codex Claude2 apps/driver-app/app/jobs.tsx ScreenInbox driver-app "$DRV_DEPS" \
  '對齊 ScreenInbox (driver-screens-2.jsx)。Unified task inbox: 篩選 pills + summary KPIs + task cards 含 PlatformBadge + AuthorityBanner 樣式 + 6 種 status state (in_progress/offered/accept_pending/completed/lost_race/sync_failed)。'
dispatch UI-HANDOFF-DRV-PAGE-TRIP-001 Codex Claude2 apps/driver-app/app/trip.tsx ScreenTrip driver-app "$DRV_DEPS" \
  '對齊 ScreenTrip (driver-screens-2.jsx)。Active trip: AuthorityBanner (owned vs forwarded) + MapPlaceholder + RouteStop + status state pills + sticky bottom action bar。處理 7 種 state: owned_active/forwarded_offered/forwarded_pending/forwarded_confirmed/forwarded_lost/sync_failed。'
dispatch UI-HANDOFF-DRV-PAGE-PLATFORM-001 Codex Claude2 apps/driver-app/app/platform-presence.tsx ScreenPlatform driver-app "$DRV_DEPS" \
  '對齊 ScreenPlatform (driver-screens-3.jsx)。Platform presence: 3 個 platform card (online/reauth) + 今日趟次 + token expiry + Switch 切換上下線 + 警告 banner for reauth-required。'
dispatch UI-HANDOFF-DRV-PAGE-EARNINGS-001 Codex2 Claude2 apps/driver-app/app/earnings.tsx ScreenEarnings driver-app "$DRV_DEPS" \
  '對齊 ScreenEarnings (driver-screens-3.jsx)。Big net display + 毛收/平台抽成/待入帳 grid + per-platform breakdown rows (PlatformBadge + authority tag) + 月結報表 list。'
dispatch UI-HANDOFF-DRV-PAGE-SHIFT-001 Codex2 Claude2 apps/driver-app/app/shift.tsx ScreenShift driver-app "$DRV_DEPS" \
  '對齊 ScreenShift (driver-screens-3.jsx)。班次卡 (上班中 + 計時 + 車輛/起始里程/起始位置/預計下班) + 今日總結 KPIs + 多平台可用性 list + 下班打卡 outline danger button (sticky bottom)。'
dispatch UI-HANDOFF-DRV-PAGE-SOS-001 Codex Claude2 apps/driver-app/app/incident.tsx ScreenSOS driver-app "$DRV_DEPS" \
  '對齊 ScreenSOS (driver-screens-3.jsx)。緊急求援 hero card (danger tone) + 情況 grid (6 個情況 chips) + 當前訂單 PlatformBadge + sticky 「長按確認求援」danger button。'
dispatch UI-HANDOFF-DRV-PAGE-SETTINGS-001 Codex2 Claude2 apps/driver-app/app/settings.tsx ScreenSettings driver-app "$DRV_DEPS" \
  '對齊 ScreenSettings (driver-screens-3.jsx)。Profile card + 平台帳號綁定 list (3 platforms, 含 reauth warn chip) + 偏好 list (語言/最大接單距離/自動接單/通知) + 其他 list (緊急聯絡人/關於本機/登出 danger)。'

echo
echo "[PA] platform-admin-web — 16 pages"
PA_DEPS="UI-CANVAS-DS-001,UI-CANVAS-PA-CHROME-001"
dispatch UI-HANDOFF-PA-PAGE-HOME-001 Codex Claude2 apps/platform-admin-web/app/page.tsx PA_Home platform-admin-web "$PA_DEPS" \
  '對齊 PA_Home (platform-screens.jsx)。Governance 首頁：4 KPI tiles (活躍租戶/合作夥伴/活躍司機/待結算對帳) + 今日治理待辦 banner 區 + 模組捷徑 grid + 近期高敏感操作 audit table。'
dispatch UI-HANDOFF-PA-PAGE-TENANTS-001 Codex Claude2 apps/platform-admin-web/app/tenants/page.tsx PA_Tenants platform-admin-web "$PA_DEPS" \
  '對齊 PA_Tenants (platform-screens.jsx)。Tenants 列表：stage filter pills (全部/sandbox/pilot/production/rollback_hold) + DataTable (TENANT/STAGE/MODULES/配額/介接/更新)。'
dispatch UI-HANDOFF-PA-PAGE-TENANTDETAIL-001 Codex Claude2 'apps/platform-admin-web/app/tenants/[tenantId]/page.tsx' PA_TenantDetail platform-admin-web "$PA_DEPS" \
  '對齊 PA_TenantDetail (platform-screens.jsx)。Tabs (Overview/Modules/Onboarding/Rollout/Roles/Webhook baseline/Billing baseline/Audit) + Rollout 進度 Stepper + 3 個 status banner + Onboarding package DL + Roles invites Table。'
dispatch UI-HANDOFF-PA-PAGE-PARTNERS-001 Codex Claude2 apps/platform-admin-web/app/partners/page.tsx PA_Partners platform-admin-web "$PA_DEPS" \
  '對齊 PA_Partners (platform-screens.jsx)。Partner entry list: ENTRY (含 accent 色塊 + slug) + PROGRAM/SUBTYPE/AUTH/ELIGIBILITY/STATUS/READINESS。'
dispatch UI-HANDOFF-PA-PAGE-PARTNERDETAIL-001 Codex Claude2 'apps/platform-admin-web/app/partners/[entrySlug]/page.tsx' PA_PartnerDetail platform-admin-web "$PA_DEPS" \
  '對齊 PA_PartnerDetail (platform-screens.jsx)。Tabs (Overview/Branding/Auth/Eligibility/Credentials/Audit) + Entry 基本資料 DL + Readiness 檢查 list + Active credentials Table。'
dispatch UI-HANDOFF-PA-PAGE-USERS-001 Codex2 Claude2 apps/platform-admin-web/app/users/page.tsx PA_Users platform-admin-web "$PA_DEPS" \
  '對齊 PA_Users (platform-screens.jsx)。Platform staff Table (NAME 含 avatar / EMAIL / ROLE / STATUS / 更新)。'
dispatch UI-HANDOFF-PA-PAGE-FLEET-001 Codex2 Claude2 apps/platform-admin-web/app/fleet/page.tsx PA_Fleet platform-admin-web "$PA_DEPS" \
  '對齊 PA_Fleet (platform-screens.jsx)。Tabs (Drivers/Vehicles/Contracts/Exclusivity/Offboarding) + license warn banner + DataTable (DRIVER/VEHICLE/STATUS/SHIFT/LICENSE/EXCLUSIVITY/評分)。'
dispatch UI-HANDOFF-PA-PAGE-SWITCHBOARD-001 Codex2 Claude2 apps/platform-admin-web/app/switchboard/page.tsx PA_Switchboard platform-admin-web "$PA_DEPS" \
  '對齊 PA_Switchboard (platform-screens.jsx)。Tabs (版本/牌貼/公開聯絡/歷史) + Public info versions Table + 牌貼 placard preview。'
dispatch UI-HANDOFF-PA-PAGE-PRICING-001 Codex Claude2 apps/platform-admin-web/app/pricing/page.tsx PA_Pricing platform-admin-web "$PA_DEPS" \
  '對齊 PA_Pricing (platform-screens.jsx)。Tabs (Pricing rules/Driver fee plans/Override governance) + canonical fare authority info banner + Pricing rules Table + 服務 bucket fee 拆解 4-card grid。'
dispatch UI-HANDOFF-PA-PAGE-PAYMENTS-001 Codex Claude2 apps/platform-admin-web/app/payments/page.tsx PA_Payments platform-admin-web "$PA_DEPS" \
  '對齊 PA_Payments (platform-screens.jsx)。Tabs (Settlement matrix/Tenant invoices/Driver statements/Reimbursements/Reconciliation issues) + 4 KPIs + Reconciliation issues Table (含 reopen 率告警)。'
dispatch UI-HANDOFF-PA-PAGE-RECONDETAIL-001 Codex Claude2 'apps/platform-admin-web/app/payments/[issueId]/page.tsx' PA_ReconDetail platform-admin-web "$PA_DEPS" \
  '對齊 PA_ReconDetail (platform-screens.jsx)。新建 route：Issue summary DL + Timeline events + Linked references DL + Resolution form (resolution code Select + summary Input + actions)。'
dispatch UI-HANDOFF-PA-PAGE-HEALTH-001 Codex2 Claude2 apps/platform-admin-web/app/health/page.tsx PA_Health platform-admin-web "$PA_DEPS" \
  '對齊 PA_Health (platform-screens.jsx)。Tabs (Alerts/Dispatch/Webhook/Filing/Adapters) + 4 KPIs (dispatch lag/webhook queue/eligibility queue/reporting failures) + Active alerts list + Adapter inventory Table。'
dispatch UI-HANDOFF-PA-PAGE-NOTICES-001 Codex2 Claude2 apps/platform-admin-web/app/notices/page.tsx PA_Notices platform-admin-web "$PA_DEPS" \
  '對齊 PA_Notices (platform-screens.jsx)。Tabs (公告/維護模式) + 現行公告 Table + Maintenance mode card (Toggle + 原因/起始/結束 Inputs)。'
dispatch UI-HANDOFF-PA-PAGE-AUDIT-001 Codex2 Claude2 apps/platform-admin-web/app/audit/page.tsx PA_Audit platform-admin-web "$PA_DEPS" \
  '對齊 PA_Audit (platform-screens.jsx)。Tabs (Audit log/Retention policies/Legal holds/Deletion exceptions) + module filter pills + Audit log Table (WHEN/ACTOR TYPE/ACTOR/MODULE/ACTION 含 accent 色/RESOURCE/REQUEST)。'
dispatch UI-HANDOFF-PA-PAGE-FLAGS-001 Codex2 Claude2 apps/platform-admin-web/app/feature-flags/page.tsx PA_Flags platform-admin-web "$PA_DEPS" \
  '對齊 PA_Flags (platform-screens.jsx)。Feature flags Table (KEY mono / SCOPE / STATE Toggle / UPDATED BY / AT)。'
dispatch UI-HANDOFF-PA-PAGE-ADAPTERS-001 Codex2 Claude2 apps/platform-admin-web/app/adapter-registry/page.tsx PA_Adapters platform-admin-web "$PA_DEPS" \
  '對齊 PA_Adapters (platform-screens.jsx)。2-col Card grid，每 adapter 一張 card (source/id/kind + LATENCY/LAST EVENT/ORDERS 24H DL + status Pill)。'

echo
echo "[OC] ops-console-web — 14 pages"
OC_DEPS="UI-CANVAS-DS-001,UI-CANVAS-OC-CHROME-001"
# OC-DASHBOARD already assigned via pilot; re-assigning is idempotent.
dispatch UI-HANDOFF-OC-PAGE-DASHBOARD-001 Codex2 Claude2 apps/ops-console-web/app/dashboard/page.tsx OC_Dashboard ops-console-web "$OC_DEPS" \
  '對齊 OC_Dashboard (ops-screens.jsx)。即時值班 dashboard：6 個 KPI tiles (進行中/dispatch queue/可派/位置失聯/客訴未結/事故) + 今日待處理 banner 區 + 健康訊號 list + 當前 dispatch 隊列 Table。'
dispatch UI-HANDOFF-OC-PAGE-DISPATCH-001 Codex Claude2 apps/ops-console-web/app/dispatch/page.tsx OC_DispatchOwned ops-console-web "$OC_DEPS" \
  '對齊 OC_DispatchOwned + OC_DispatchForwarded (ops-screens.jsx)。Tabs (Owned 自營/Forwarded 外部/Override governance/No-supply) + state filter pills + Dispatch queue Table (ORDER/TENANT/PICKUP→DROP/WIN/SVC/STATE/DRIVER/ETA/CAND/GATE)。Forwarded tab 含 mismatch column 與 adapter degraded banner。'
dispatch UI-HANDOFF-OC-PAGE-DISPATCHDETAIL-001 Codex Claude2 'apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx' OC_DispatchDetail ops-console-web "$OC_DEPS" \
  '對齊 OC_DispatchDetail (ops-screens.jsx)。Candidate driver Table + Compliance gates DL + 訂單狀態 Stepper + 活動 Timeline + actions (聯絡乘客/request override/指派候選 #1)。'
dispatch UI-HANDOFF-OC-PAGE-CALLCENTER-001 Codex Claude2 apps/ops-console-web/app/callcenter/page.tsx OC_Callcenter ops-console-web "$OC_DEPS" \
  '對齊 OC_Callcenter (ops-screens.jsx)。Tabs (Sessions/Callback queue/Recordings) + 進行中 sessions list + Session detail card (DL + form fields for pickup/drop/window/passenger/service bucket/quoted fare + 建立 phone order action)。'
dispatch UI-HANDOFF-OC-PAGE-COMPLAINTS-001 Codex2 Claude2 apps/ops-console-web/app/complaints/page.tsx OC_Complaints ops-console-web "$OC_DEPS" \
  '對齊 OC_Complaints (ops-screens.jsx)。Tabs (全部/我負責/SLA breach/已升級事故) + 4 KPIs (未結客訴/平均處理/升級事故/reopen 率) + Complaints Table (CASE/CATEGORY/SEV/DESC/ORDER/SLA/OWNER/STATUS)。'
dispatch UI-HANDOFF-OC-PAGE-INCIDENTS-001 Codex Claude2 apps/ops-console-web/app/incidents/page.tsx OC_Incidents ops-console-web "$OC_DEPS" \
  '對齊 OC_Incidents (ops-screens.jsx)。Tabs (Active/Resolved/Closed) + critical incident danger banner + Incidents Table (INC/TITLE/CAT/SEV/STATUS/DRIVER/OCCURRED/RECOVERY)。'
dispatch UI-HANDOFF-OC-PAGE-INCIDENTDETAIL-001 Codex Claude2 'apps/ops-console-web/app/incidents/[incidentId]/page.tsx' OC_IncidentDetail ops-console-web "$OC_DEPS" \
  '對齊 OC_IncidentDetail (ops-screens.jsx)。新建 route：事件摘要 DL + Timeline + Service recovery actions DL + 關聯 DL (complaint/order/tenant/audit)。'
dispatch UI-HANDOFF-OC-PAGE-REPORTS-001 Codex2 Claude2 apps/ops-console-web/app/reports/page.tsx OC_Reports ops-console-web "$OC_DEPS" \
  '對齊 OC_Reports (ops-screens.jsx)。Tabs (Report jobs/Filing packages/Schedules) + Report jobs Table (JOB/KIND/PERIOD/FORMAT/STATUS/EXPIRES/CREATED)。'
dispatch UI-HANDOFF-OC-PAGE-REVENUE-001 Codex2 Claude2 apps/ops-console-web/app/revenue/page.tsx OC_Revenue ops-console-web "$OC_DEPS" \
  '對齊 OC_Revenue (ops-screens.jsx)。Tabs (Insight/Channel mix/Settlement matrix/Mismatch review) + 4 KPIs + 結算矩陣 Table (渠道/BILLED/DRIVER FEE/SERVICE FEE/RECON OPEN/STATUS)。'
dispatch UI-HANDOFF-OC-PAGE-ATTENDANCE-001 Codex2 Claude2 apps/ops-console-web/app/attendance/page.tsx OC_Attendance ops-console-web "$OC_DEPS" \
  '對齊 OC_Attendance (ops-screens.jsx)。Tabs (今日/本週/異常) + 4 KPIs + 當班甘特 grid (24 小時欄位 × 8 司機列 with 班次 bar 標記)。'
dispatch UI-HANDOFF-OC-PAGE-MAINTENANCE-001 Codex2 Claude2 apps/ops-console-web/app/maintenance/page.tsx OC_Maintenance ops-console-web "$OC_DEPS" \
  '對齊 OC_Maintenance (ops-screens.jsx)。Tabs (全部/排程中/進行中/已完成/逾期) + Maintenance work order Table (WO/車輛/類別/STATUS/排定/技師/費用)。'
dispatch UI-HANDOFF-OC-PAGE-DRIVERS-001 Codex2 Claude2 apps/ops-console-web/app/drivers/page.tsx OC_Drivers ops-console-web "$OC_DEPS" \
  '對齊 OC_Drivers (ops-screens.jsx)。Tabs (全部/可派/在班/下班) + Drivers Table (DRIVER 含 phone/車輛/STATUS/SHIFT/LICENSE/EXCL./評分)。'
dispatch UI-HANDOFF-OC-PAGE-VEHICLES-001 Codex2 Claude2 apps/ops-console-web/app/vehicles/page.tsx OC_Vehicles ops-console-web "$OC_DEPS" \
  '對齊 OC_Vehicles (ops-screens.jsx)。Vehicles Table (PLATE/MODEL/YEAR/DISPATCHABLE/CONTRACT/INSURANCE/DEBRAND DUE)。'
dispatch UI-HANDOFF-OC-PAGE-CONTRACTS-001 Codex2 Claude2 apps/ops-console-web/app/contracts/page.tsx OC_Contracts ops-console-web "$OC_DEPS" \
  '對齊 OC_Contracts (ops-screens.jsx)。Contracts Table (CONTRACT/COUNTERPARTY/KIND/TERM/REVENUE SHARE/STATUS) 含 fleet_lease/partner_program/forwarder 三種 kind。'
dispatch UI-HANDOFF-OC-PAGE-FLAGS-001 Codex2 Claude2 apps/ops-console-web/app/feature-flags/page.tsx OC_Flags ops-console-web "$OC_DEPS" \
  '對齊 OC_Flags (ops-screens.jsx)。只讀 Feature flags Table (KEY/SCOPE/STATE enabled-pill/UPDATED BY/AT)。'

echo
echo "[TN] tenant-console-web — 15 pages"
TN_DEPS="UI-CANVAS-DS-001,UI-CANVAS-TN-CHROME-001"
dispatch UI-HANDOFF-TN-PAGE-HOME-001 Claude2 Codex2 apps/tenant-console-web/app/page.tsx TN_Home tenant-console-web "$TN_DEPS" \
  '對齊 TN_Home (tenant-screens.jsx)。YAMATO 首頁：問候 + 月配額提示 + 4 KPIs (進行中/今日已完成/本月用量/當期帳單) + 進行中訂單 Table + 提醒 banner 區 (webhook 暫停 warn / 維護 info / SLA 達標 success)。'
dispatch UI-HANDOFF-TN-PAGE-BOOKINGS-001 Claude2 Codex2 apps/tenant-console-web/app/bookings/page.tsx TN_Bookings tenant-console-web "$TN_DEPS" \
  '對齊 TN_Bookings (tenant-screens.jsx)。Tabs (全部/進行中/預約/已完成/取消) + Bookings Table (BK/ORDER/TYPE/PICKUP→DROP/WIN/PASS./CC/STATE)。'
dispatch UI-HANDOFF-TN-PAGE-BOOKINGDETAIL-001 Claude2 Codex2 'apps/tenant-console-web/app/bookings/[bookingId]/page.tsx' TN_BookingDetail tenant-console-web "$TN_DEPS" \
  '對齊 TN_BookingDetail (tenant-screens.jsx)。行程資訊 DL + 行程時間軸 Stepper + 活動 Timeline + 駕駛 DL + 計費 DL。'
dispatch UI-HANDOFF-TN-PAGE-NEWBOOKING-001 Claude2 Codex2 apps/tenant-console-web/app/bookings/new/page.tsx TN_NewBooking tenant-console-web "$TN_DEPS" \
  '對齊 TN_NewBooking (tenant-screens.jsx)。2-col layout：行程 form (8 fields) + 關聯與審批 form (passenger/cost center/專案碼/批註 + 預估費用 DL + actions)。'
dispatch UI-HANDOFF-TN-PAGE-PASSENGERS-001 Claude2 Codex2 apps/tenant-console-web/app/passengers/page.tsx TN_Passengers tenant-console-web "$TN_DEPS" \
  '對齊 TN_Passengers (tenant-screens.jsx)。新建 route：Tabs (全部/員工/訪客/停用) + CSV 匯入 action + Passengers Table (NAME/EMP ID/DEPT/MOBILE/EMAIL/STATE)。'
dispatch UI-HANDOFF-TN-PAGE-ADDRESSES-001 Claude2 Codex2 apps/tenant-console-web/app/addresses/page.tsx TN_Addresses tenant-console-web "$TN_DEPS" \
  '對齊 TN_Addresses (tenant-screens.jsx)。新建 route：Addresses Table (NAME/ADDRESS/TAGS 用 Pill/OWNER/STATE)。'
dispatch UI-HANDOFF-TN-PAGE-COSTCENTER-001 Claude Gemini2 apps/tenant-console-web/app/cost-centers/page.tsx TN_CostCenter tenant-console-web "$TN_DEPS" \
  '對齊 TN_CostCenter (tenant-screens.jsx)。Cost centers Table (CODE/NAME/OWNER/月配額/本月使用/審批)，含 ∞ 配額顯示與審批規則文字。'
dispatch UI-HANDOFF-TN-PAGE-RULES-001 Claude Gemini2 apps/tenant-console-web/app/rules/page.tsx TN_Rules tenant-console-web "$TN_DEPS" \
  '對齊 TN_Rules (tenant-screens.jsx)。新建 route：Approval rules Table (PRI/條件 condition expression/動作/審批者/STATE active-pill)。'
dispatch UI-HANDOFF-TN-PAGE-INVOICES-001 Claude Gemini2 apps/tenant-console-web/app/invoices/page.tsx TN_Invoices tenant-console-web "$TN_DEPS" \
  '對齊 TN_Invoices (tenant-screens.jsx)。新建 route：4 KPIs (當期/行程數/平均單筆/爭議筆數) + Invoices Table (INVOICE/PERIOD/AMOUNT/STATUS/DUE/ISSUED)。'
dispatch UI-HANDOFF-TN-PAGE-REPORTS-001 Claude Gemini2 apps/tenant-console-web/app/reports/page.tsx TN_Reports tenant-console-web "$TN_DEPS" \
  '對齊 TN_Reports (tenant-screens.jsx)。新建 route：Report jobs Table (JOB/KIND/PERIOD/FORMAT/STATUS/EXPIRES/CREATED)。'
dispatch UI-HANDOFF-TN-PAGE-APIKEYS-001 Claude Gemini2 apps/tenant-console-web/app/api-keys/page.tsx TN_ApiKeys tenant-console-web "$TN_DEPS" \
  '對齊 TN_ApiKeys (tenant-screens.jsx)。建立金鑰時顯示完整值之 info banner + API keys Table (NAME/PREFIX/MASK/SCOPE/LAST/EXPIRES/STATE)。'
dispatch UI-HANDOFF-TN-PAGE-WEBHOOKS-001 Claude Gemini2 apps/tenant-console-web/app/webhooks/page.tsx TN_Webhooks tenant-console-web "$TN_DEPS" \
  '對齊 TN_Webhooks (tenant-screens.jsx)。Tabs (Endpoints/Deliveries/Replay) + Endpoints Table (URL/EVENTS pills/STATE/LAST) + 近 24h 投遞 dense Table (DLV/WH/EVENT/CODE pill 2xx/3xx 顏色/TRIES/AT/DUR)。'
dispatch UI-HANDOFF-TN-PAGE-AUDIT-001 Gemini Claude2 apps/tenant-console-web/app/audit/page.tsx TN_Audit tenant-console-web "$TN_DEPS" \
  '對齊 TN_Audit (tenant-screens.jsx)。Audit Table (AT/ACTOR/TYPE/MODULE/ACTION mono/RESOURCE/REQ)。'
dispatch UI-HANDOFF-TN-PAGE-USERS-001 Gemini Claude2 apps/tenant-console-web/app/users/page.tsx TN_Users tenant-console-web "$TN_DEPS" \
  '對齊 TN_Users (tenant-screens.jsx)。Users Table (NAME/EMAIL/ROLE accent-pill for admin/STATE/UPDATED)。'
dispatch UI-HANDOFF-TN-PAGE-SETTINGS-001 Gemini Claude2 apps/tenant-console-web/app/settings/page.tsx TN_Settings tenant-console-web "$TN_DEPS" \
  '對齊 TN_Settings (tenant-screens.jsx)。Tabs (一般/通知/隱私/整合) + 一般 form (租戶代碼/顯示名稱/統一編號/計費聯絡人/語系/時區) + 當期狀態 DL (階段/啟用模組/配額/webhook 簽章/隱私/同意書版本)。'

echo
echo "[PB] partner-booking-web — 7 pages (CTBC World Elite brand)"
PB_DEPS="UI-CANVAS-DS-001,UI-CANVAS-PB-CHROME-001"
dispatch UI-HANDOFF-PB-PAGE-LANDING-001 Gemini2 Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/page.tsx' PB_Landing partner-booking-web "$PB_DEPS" \
  '對齊 PB_Landing (partner-screens.jsx)。CTBC CardHeader (gradient + 金色 EXCLUSIVE chip) + 卡片身份卡 (mask + eligible chip + 本年度剩餘趟次 progress bar) + 可使用服務 list + 禮遇條款 banner + 立即叫車 primary button。iOS 390px frame。'
dispatch UI-HANDOFF-PB-PAGE-ELIGIBILITY-001 Gemini2 Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/eligibility/page.tsx' PB_Eligibility partner-booking-web "$PB_DEPS" \
  '對齊 PB_Eligibility (partner-screens.jsx)。CardHeader 連結卡片 + 您的權益 PRow list + 授權同意 list (3 已勾選 check marks) + 確認連結 primary button。'
dispatch UI-HANDOFF-PB-PAGE-BOOK-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx' PB_Book partner-booking-web "$PB_DEPS" \
  '對齊 PB_Book (partner-screens.jsx)。CardHeader 建立行程 + Pickup/Drop card + 出發時間 3-button toggle + 服務細節 list + 禮遇與費用 gradient card 含 World Elite −NT$ 1,580 + 確認預約 primary button。'
dispatch UI-HANDOFF-PB-PAGE-CONFIRMED-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/confirmed/page.tsx' PB_Confirmed partner-booking-web "$PB_DEPS" \
  '對齊 PB_Confirmed (partner-screens.jsx)。CardHeader 已派車 + 駕駛 avatar card (含撥話 round button) + 地圖區 (stylized SVG route) + ETA 8 min + 行程資訊 list + 取消/客服 buttons。'
dispatch UI-HANDOFF-PB-PAGE-TRIPS-001 Gemini Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/trips/page.tsx' PB_Trips partner-booking-web "$PB_DEPS" \
  '對齊 PB_Trips (partner-screens.jsx)。CardHeader 我的行程 + 年度禮遇 progress card (gold gradient) + Trips list (日期 + 路線 + 狀態 chip + 費用)。'
dispatch UI-HANDOFF-PB-PAGE-RECEIPT-001 Copilot Claude2 'apps/partner-booking-web/app/[tenantSlug]/(authenticated)/receipt/page.tsx' PB_Receipt partner-booking-web "$PB_DEPS" \
  '對齊 PB_Receipt (partner-screens.jsx)。CardHeader 行程明細 + 時刻 PRow list (出發/抵達/行車/距離) + 費用拆解 PRow list + World Elite 禮遇 -NT$ 1,580 + 您支付 NT$ 0 + 款項 gradient card + 下載 PDF / 聯絡客服 buttons。'
dispatch UI-HANDOFF-PB-PAGE-HELP-001 Gemini Claude2 'apps/partner-booking-web/app/[tenantSlug]/(public)/help/page.tsx' PB_Help partner-booking-web "$PB_DEPS" \
  '對齊 PB_Help (partner-screens.jsx)。CardHeader 協助 + 24 小時專線 dark-gradient card 含 0800-024-365 mono + 常見問題 FAQ list + 爭議或客訴 card + 提出爭議 button。'

echo
echo "Done. Run: python3 -c \"import json; d=json.load(open('ai-status.json')); print(sum(1 for t in d['tasks'] if t.get('phase')=='UI-HANDOFF-2026-05-20'))\""
