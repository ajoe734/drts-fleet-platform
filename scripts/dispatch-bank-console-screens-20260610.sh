#!/usr/bin/env bash
# Dispatch the 8 bank-console-web screen implementation tasks.
#
# DRAFTED 2026-06-10 — DO NOT RUN until CCAT-APP-SCAFFOLD-20260610 has landed on
# dev (the app shell + deploy must exist). Every task hard-depends on the scaffold
# so the supervisor's dependency gate holds them anyway, but running this before
# the scaffold merges just queues them.
#
# Visual authority : docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx + "Bank Console.html"
# Behaviour authority: docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md §5
# App              : apps/bank-console-web
#
# Run from the canonical repo root:
#   bash scripts/dispatch-bank-console-screens-20260610.sh
set -euo pipefail

cd "$(dirname "$0")/.."
export AI_NAME=Claude
export AI_STATUS_ROOT="$PWD"
export ORCH_STATUS_ROOT="$PWD"
export TASK_PHASE="bank-console-screens-202606"
export TASK_PLANNING_REF="docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md"

SCAFFOLD="CCAT-APP-SCAFFOLD-20260610"
CANVAS="docs/05-ui/drts-design-canvas/bank-screens-1.jsx,docs/05-ui/drts-design-canvas/bank-screens-2.jsx,docs/05-ui/drts-design-canvas/bank-screens-3.jsx,docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md"

# Acceptance shared by every screen (comma-separated; NO commas inside an item).
COMMON_ACC="screen matches its BK_* function in docs/05-ui/drts-design-canvas/bank-screens-*.jsx;all cardholder and card references masked;zh-TW primary via central t() no inline locale ternaries;issuer brand (navy+gold) sourced from a @drts/ui-tokens token set not raw hex so scripts/check_ui_realm_tokens.py passes;pnpm --filter @drts/bank-console-web typecheck and build pass"

assign() { # id owner reviewer summary deps artifacts extra_acc "title"
  local id="$1" owner="$2" rev="$3" summary="$4" deps="$5" artifacts="$6" extra="$7" title="$8"
  TASK_SUMMARY_ZH="[依 bank-screens canvas + screen-requirements §5] ${summary}" \
  TASK_DEPENDS_ON="$deps" \
  TASK_ARTIFACTS="$artifacts" \
  TASK_ACCEPTANCE="${extra}${extra:+;}${COMMON_ACC}" \
    bash scripts/ai-status.sh assign "$id" "$owner" "$rev" "$title" \
    && echo "  OK  $id ($owner -> $rev)  deps=[$deps]" \
    || echo "  FAIL $id"
}

A="apps/bank-console-web"

assign "BANK-UI-HOME-20260610" Claude Codex \
"建 bank-console 首頁 / (BK_Home)：期別摘要(各狀態訂單數+未來機場接送)、配額posture、SLA posture、結算posture、近期例外；依角色裁切(admin/ops/finance)。唯讀。" \
"$SCAFFOLD,CCAT-API-USAGE-20260610,CCAT-API-CONTRACTS-20260610,CCAT-API-STATEMENTS-20260610" \
"$A/app/page.tsx,$A/app/layout.tsx,$CANVAS" \
"home shows quota+SLA+settlement posture cards gated by role;figures reconcile with the detail pages" \
"BANK-UI-HOME: bank-console home/overview (BK_Home)"

assign "BANK-UI-BOOKINGS-20260610" Codex Claude \
"建 /bookings (BK_Bookings)：卡友機場訂單列表，欄位=訂單/卡友(遮罩)/方案/去回程/航班+航廈/上下車/時段/派遣狀態/benefit(遮罩)；篩選 方案/方向/狀態/期別/卡友。唯讀、無成本中心欄。需要時擴充 tenant/orders 投影(H4)帶出機場/方案欄位。" \
"$SCAFFOLD" \
"$A/app/bookings/page.tsx,apps/api/src/modules/tenant-partner,$CANVAS" \
"list columns include cardholder(masked) program direction flight terminal state benefit(masked) and NO cost-centre column;filters by program direction state period cardholder work;read-only no dispatch mutation" \
"BANK-UI-BOOKINGS: bank-console bookings list (BK_Bookings)"

assign "BANK-UI-BOOKING-DETAIL-20260610" Claude Codex2 \
"建 /bookings/[bookingId] (BK_BookingDetail)：派遣時間軸(建立→審批→指派→途中→完成/取消)、機場區(航班/航廈/方向)、權益區(方案/benefit遮罩/發卡授權遮罩/本趟配額扣抵)、唯讀深連到 ops 派遣詳情(權限閘門)。" \
"$SCAFFOLD" \
"$A/app/bookings/[bookingId]/page.tsx,apps/api/src/modules/tenant-partner,$CANVAS" \
"dispatch timeline + airport block + benefit block + quota impact rendered;read-only access-gated cross-link to ops detail;no dispatch mutation from this surface" \
"BANK-UI-BOOKING-DETAIL: bank-console booking detail (BK_BookingDetail)"

assign "BANK-UI-CONTRACTS-20260610" Codex2 Claude \
"建 /contracts(+/[contractId]) (BK_Contracts/BK_ContractDetail)：合約清單(期間/狀態healthy-at_risk-breached/達成摘要) + 詳情(SLA目標 準點率/完成率、當期達成vs目標+差距、例外清單連到訂單詳情)。對銀行唯讀(DRTS經ops /contracts持權威)。" \
"$SCAFFOLD,CCAT-API-CONTRACTS-20260610" \
"$A/app/contracts/page.tsx,$A/app/contracts/[contractId]/page.tsx,$CANVAS" \
"list + detail render SLA targets attainment-vs-target and an exception list linking to booking detail;read-only" \
"BANK-UI-CONTRACTS: bank-console contracts + SLA (BK_Contracts/Detail)"

assign "BANK-UI-STATEMENTS-20260610" Claude Codex \
"建 /statements(+/[period]) (BK_Statements/BK_StatementDetail)：期別清單(總額/狀態published-paid-due/開立/到期/下載簽名檔) + 逐趟明細(車資/補助vs自付/benefit遮罩/卡友遮罩/期別總計/金流方向=發卡行付DRTS/簽名檔下載/單筆爭議報DRTS)。" \
"$SCAFFOLD,CCAT-API-STATEMENTS-20260610" \
"$A/app/statements/page.tsx,$A/app/statements/[period]/page.tsx,$CANVAS" \
"per-trip lines show fare subsidised-vs-paid masked benefit/cardholder refs and issuer-pays-DRTS direction;signed-artifact download present;disputed-line flag path exists" \
"BANK-UI-STATEMENTS: bank-console settlement statements (BK_Statements/Detail)"

assign "BANK-UI-PROGRAMS-20260610" Codex Claude \
"建 /programs (BK_Programs)：每方案/期別 — 方案名/碼/發卡行/覆蓋/權益、服務卡友數、禮遇趟次 已用vs配額(剩餘)、趨勢、主要例外、資格政策摘要。配額為頭號指標要清楚。" \
"$SCAFFOLD,CCAT-API-USAGE-20260610" \
"$A/app/programs/page.tsx,$CANVAS" \
"programs page shows cardholders-served and quota consumed-vs-total(remaining) unambiguously per program and period" \
"BANK-UI-PROGRAMS: bank-console programs & quota (BK_Programs)"

assign "BANK-UI-USERS-20260610" Codex2 Claude \
"建 /users (BK_Users)：使用者/角色(bank_program_admin/bank_ops_viewer/bank_finance)/狀態(active/invited/suspended)/最後活動；邀請、改角色、停用/復用(依管理權限)；scoped 到 issuer tenant、全程稽核。" \
"$SCAFFOLD" \
"$A/app/users/page.tsx,$CANVAS" \
"users list with the three bank roles plus admin;invite change-role suspend/reactivate actions gated by admin permission" \
"BANK-UI-USERS: bank-console users & roles (BK_Users)"

assign "BANK-UI-AUDIT-20260610" Codex Claude \
"建 /audit (BK_Audit)：事件(時間/操作者/類型=資格決策-派遣-結算關帳-存取/主體遮罩/原因碼/連結實體→訂單或對帳單)；篩選 類型/操作者/期別/主體。唯讀；自我稽核感知(用 find/some 不用 [0])。" \
"$SCAFFOLD" \
"$A/app/audit/page.tsx,$CANVAS" \
"audit list shows event type actor masked-subject reason-code and a link to the related booking/statement;filterable;read-only" \
"BANK-UI-AUDIT: bank-console audit (BK_Audit)"

echo ""
echo "Dispatched 8 bank-console screen tasks under phase '$TASK_PHASE'."
echo "Supervisor picks them up on next scan; all gated on $SCAFFOLD."
