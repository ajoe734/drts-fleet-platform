#!/usr/bin/env bash
# Tail batch for UI-HANDOFF-2026-05-20: 16 tasks that didn't land in the
# original dispatch (scripts/dispatch-ui-handoff-tasks.sh) because the parent
# process was OOM-killed at task #46 of 61.
#
# 9 TN tail + 7 PB. Sleeps 3s between assigns to reduce memory pressure while
# the supervisor is concurrently dispatching workers off the backlog.
#
# Usage: AI_NAME=Claude bash scripts/dispatch-ui-handoff-tasks-tail.sh

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

TN_DEPS="UI-CANVAS-DS-001,UI-CANVAS-TN-CHROME-001"
echo "[TN tail] 9 pages"
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

PB_DEPS="UI-CANVAS-DS-001,UI-CANVAS-PB-CHROME-001"
echo "[PB] 7 pages"
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

echo "tail dispatch done"
