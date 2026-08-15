"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CanvasShell,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  TENANT_CONSOLE_BRAND,
  TENANT_CONSOLE_VERSION,
  createTenantNavEntries,
  findNavItem,
} from "@/lib/navigation";
import { useTranslation } from "@/lib/i18n";
import { getBrowserApiBaseUrl } from "@/lib/runtime-config";
import type { Locale } from "@/lib/translations";

const tenantCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type ApiHealthStatus = "checking" | "healthy" | "degraded" | "down";

const LEGACY_EN_COPY: Record<string, string> = {
  工作面: "Workspace",
  "把租戶營運、帳務與整合狀態收斂到同一個工作面":
    "Tenant operations, billing, and readiness in one workspace",
  "首頁現在對齊 handoff packet：KPI 卡片、進行中訂單、帳務快照、statement 可見性，以及來自後端讀模型的整合提醒。":
    "The home route now matches the handoff packet: KPI cards, active-booking queue, finance snapshot, statement visibility, and integration reminders from backend-owned read models.",
  進行中: "In progress",
  "目前沒有進行中的訂單。": "No active bookings are currently in progress.",
  當期帳單: "Current invoice",
  "此租戶情境目前沒有可用的發票檔案。":
    "Invoice artifacts are not currently available for this tenant context.",
  今日完成: "Completed today",
  本月用量: "Month-to-date usage",
  進行中訂單: "Active bookings",
  "這裡是執行中的履約佇列，不是只有入口卡片。":
    "This is the active fulfillment queue, not just an entry card.",
  查看訂單: "Open bookings",
  建立叫車: "Create booking",
  財務快照: "Finance snapshot",
  "發票、statement 與通知狀態留在首頁即可看到。":
    "Invoice, statement, and notification posture stay visible on the home lane.",
  "目前快照沒有 tenant 可見的 statements。":
    "No tenant-visible statements are available in the current snapshot.",
  整合提醒: "Integration reminders",
  "Checklist 與 governance signals 保持由後端擁有。":
    "Checklist and governance signals stay backend-owned.",
  身分: "Identity",
  租戶授權上下文: "Tenant authority context",
  "儀表板直接從後端讀取租戶身分，因此 actor 與 realm 都以授權來源為準。":
    "The dashboard reads the backend identity context directly so actor and realm stay authority-driven.",
  租戶: "Tenant",
  授權模式: "Auth mode",
  通知: "Notifications",
  近期提醒: "Recent reminders",
  "平台與租戶通知都會留在工作面首頁，無需離開即可查看。":
    "Platform and tenant notifications stay visible on the home lane without leaving the workspace.",
  "目前沒有可顯示的租戶通知。":
    "No tenant notification feed items are currently available.",
  已啟用模組快照: "Enabled module snapshot",
  "功能旗標明細目前無法取得，或沒有任何租戶專屬模組旗標啟用。":
    "Feature flag detail is currently unavailable or no tenant-specific module flag resolved enabled.",
  合作夥伴模式在受限介面中運作: "Partner mode runs in a constrained shell",
  開啟合作夥伴登入: "Open partner sign-in",
  部分資料警告: "Partial data warning",
  "部分儀表板區塊已回退，因為目前的授權來源未回應所有讀取。":
    "Some dashboard slices fell back because the current authority source did not answer every read.",
  "API 金鑰與 Webhook 導入目前沒有任何待辦的檢查清單項目。":
    "API key and webhook onboarding is not currently reporting any open checklist item.",
  "查看 API 金鑰": "Review API keys",
  "查看 Webhook": "Review webhooks",
  乘客通訊錄: "Passenger directory",
  "員工 · 訪客 · 啟用狀態 · 同意書版本 · soft deactivate":
    "Employees · visitors · active state · consent version · soft deactivate",
  重新整理: "Refresh",
  新增: "Add",
  全部: "All",
  員工: "Employee",
  訪客: "Visitor",
  停用: "Disabled",
  乘客: "Passengers",
  已選: "Selected",
  目錄篩選: "Directory filters",
  "依啟用狀態、部門篩選，並以姓名／員工編號／手機搜尋。":
    "Filter by active state and department, then search by name, employee number, or mobile.",
  搜尋: "Search",
  部門: "Department",
  全部部門: "All departments",
  狀態: "Status",
  全部狀態: "All states",
  僅啟用: "Active only",
  僅停用: "Disabled only",
  更新層級: "Refresh tier",
  套用: "Apply",
  清除: "Clear",
  乘客名冊: "Passenger roster",
  乘客明細: "Passenger detail",
  檢視: "View",
  "乘客 ID": "Passenger ID",
  工號: "Employee no.",
  手機: "Mobile",
  "若是套了篩選，則會落在 `filtered_empty`。":
    "if filters are applied, it maps to `filtered_empty`.",
  地址簿: "Address book",
  "常用地點 · tag · 啟用狀態 · 軟停用 only (Q-TEN06)":
    "Frequent places · tags · active state · soft deactivate only (Q-TEN06)",
  "匯出 view": "Export view",
  新增地址: "Add address",
  "資料新鮮度不是 fresh": "Data freshness is not fresh",
  "部分 read-model 讀取失敗": "Some read models failed to load",
  標籤: "Tag",
  負責人: "Owner",
  地址資料讀取失敗: "Address data failed to load",
  "後端沒有回傳可用列表，請先查看 API health 與 request error。":
    "The backend did not return a usable list. Check API health and request errors first.",
  成本中心: "Cost centers",
  "部門 · 月配額 · 預設審批規則 (Q-TEN11)":
    "Departments · monthly quota · default approval rules (Q-TEN11)",
  refresh重新整理: "refresh Refresh",
  目前租戶目錄總數: "Current tenant directory total",
  啟用: "Enabled",
  停用列可用獨立篩選顯示: "Disabled rows can be shown with a separate filter",
  超過配額: "Over quota",
  超額列以危險狀態標記: "Overage rows are marked as dangerous",
  歸屬報表: "Attribution reports",
  已命中成本中心篩選的報表作業: "Report jobs matched by cost-center filters",
  "全部 owner": "All owners",
  "顯示 disabled 成本中心": "Show disabled cost centers",
  "空狀態原因預覽：": "Empty-state reason preview:",
  治理: "Governance",
  審批與配額: "Approval and quota",
  "審批規則、配額狀態、待審項目與 dry-run 評估，現在都集中在同一個由已發布租戶契約支撐的租戶治理介面。":
    "Approval rules, quota posture, pending approvals, and dry-run evaluation are now consolidated into one tenant-governance surface backed by published tenant contracts.",
  規則: "Rules",
  剩餘配額: "Remaining quota",
  審批待辦: "Approval queue",
  帳冊筆數: "Ledger rows",
  所有治理變更都以契約為依據: "All governance changes are contract-driven",
  "本頁直接使用租戶的 approval-rule、quota-policy、approval-request 與 quota-ledger API，不會自行假造前端審批狀態或配額計算。":
    "This page uses the tenant approval-rule, quota-policy, approval-request, and quota-ledger APIs directly, without inventing client-side approval or quota truth.",
  審批連結與其所屬租戶資源緊鄰呈現:
    "Approval links stay next to their tenant resources",
  規則清單: "Rule list",
  "主表格在同一視野內保留優先序、條件摘要、action、審批路徑與狀態，符合 TN_Rules 對齊目標。":
    "The main table keeps priority, condition summary, action, approval path, and status in one view, aligned with TN_Rules.",
  "請在下方建立第一條租戶治理規則，而非自行假設未發布的預設值。":
    "Create the first tenant governance rule below instead of assuming unpublished defaults.",
  建立或編輯規則: "Create or edit rule",
  使用者: "Users",
  "只有 tc_admin 可操作 · tenant_admin / operator / finance / viewer":
    "tc_admin only · tenant_admin / operator / finance / viewer",
  "網站地圖／進入": "Sitemap / entry",
  標頭標籤: "Header labels",
  名冊快照: "Roster snapshot",
  跨應用稽核: "Cross-app audit",
  角色: "Role",
  "依 packet §5.7，必須可按角色檢視。":
    "Per packet §5.7, the roster must be inspectable by role.",
  "active / invited / suspended 都必須分開辨識。":
    "active / invited / suspended must remain distinguishable.",
  "權限／更新": "Permission / refresh",
  "tc_admin 防護 + T5 快照鮮度": "tc_admin guard + T5 snapshot freshness",
  租戶名冊: "Tenant roster",
  "使用者 id · 顯示名稱 · 電子郵件 · 角色 · 狀態 · 邀請時間 · 最後登入 · 更新":
    "User id · display name · email · role · state · invited at · last login · updated",
  通知偏好: "Notification preferences",
  "T5 · 30s 輪詢 · 事件 × 通道矩陣 · spec §9.6.6":
    "T5 · 30s polling · event × channel matrix · spec §9.6.6",
  儲存設定: "Save settings",
  "Webhook channel 尚未設定": "Webhook channel is not configured",
  "目前沒有任何 webhook endpoint,該 channel 將以 not_provisioned 呈現。前往 /webhooks 新增端點後即可啟用。":
    "There is no webhook endpoint yet, so this channel is shown as not_provisioned. Add an endpoint in /webhooks to enable it.",
  事件: "Events",
  事件類型: "Event type",
  訂閱: "Subscriptions",
  "尚未設定 (not_provisioned)": "Not provisioned (not_provisioned)",
  最後更新: "Last updated",
  "事件 × 通道": "Event × channel",
  "每個事件可獨立選擇是否經由 3 個通道送出 · Medium (modal confirm + receipt)":
    "Each event can independently choose delivery through three channels · Medium (modal confirm + receipt)",
  新訂單建立後立即發出: "Sent immediately after a new booking is created",
  "司機接單,在抵達取車點之前":
    "Driver accepts the job before arriving at pickup",
  "訂單取消 (tenant / ops / driver 任一方)":
    "Booking cancelled by tenant, ops, or driver",
  "SLA 設定檔": "SLA profile",
  "wait · arrival · completion 三個門檻 · 單位 = 分鐘 (Q-TEN07)":
    "wait · arrival · completion thresholds · unit = minutes (Q-TEN07)",
  "Refresh cadence · T5 · 30s 自動更新":
    "Refresh cadence · T5 · 30s auto refresh",
  "當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin":
    "Current thresholds · waitThresholdMin / arrivalThresholdMin / completionThresholdMin",
  "變更影響範圍 · Q-TEN07": "Change impact scope · Q-TEN07",
  "waitThresholdMin · 等候門檻": "waitThresholdMin · wait threshold",
  單位: "Unit",
  分鐘: "minutes",
  "超過此分鐘數標記為 wait 違規":
    "Minutes beyond this value are marked as wait violations",
  "arrivalThresholdMin · 抵達門檻": "arrivalThresholdMin · arrival threshold",
  "ETA 與實際抵達差異上限": "Maximum difference between ETA and actual arrival",
  "completionThresholdMin · 完成門檻":
    "completionThresholdMin · completion threshold",
  "預估 vs 實際行車時間差異上限":
    "Maximum difference between estimated and actual trip time",
  "儲存設定 可直接執行": "Save settings can run directly",
  "重算既有訂單 可直接執行": "Recalculate existing bookings can run directly",
  重算既有訂單: "Recalculate existing bookings",
  帳務概覽: "Billing overview",
  "計費檔案、當期用量、發票與 statements":
    "Billing files, current usage, invoices, and statements",
  編輯帳務資料: "Edit billing profile",
  "前往發票 →": "Go to invoices ->",
  "更新頻率 T5 · 租戶慢速 (30 秒)":
    "Refresh cadence T5 · tenant slow (30 seconds)",
  "重新整理層級 T5：tenant slow（30 秒）":
    "Refresh tier T5: tenant slow (30 seconds)",
  本期累計: "Current total",
  "預估結帳 (RUN-RATE)": "Estimated close (run-rate)",
  本期趟次: "Trips this period",
  未設定趟次配額: "Trip quota is not configured",
  平均單筆: "Average per booking",
  帳務設定檔: "Billing profile",
  發票抬頭: "Invoice title",
  統一編號: "Tax ID",
  計費聯絡人: "Billing contact",
  結算方式: "Settlement method",
  發票: "Invoices",
  "發票歷史 · 狀態 / 期別 / id 篩選 · 由 availableActions 驅動的 CTA":
    "Invoice history · status / period / id filters · CTAs driven by availableActions",
  可見發票: "Visible invoices",
  逾期: "Overdue",
  "緊急狀態與一般 `issued` 維持區隔":
    "Urgent states stay distinct from plain `issued`",
  已過期檔案: "Expired files",
  可見金額: "Visible amount",
  發票清單: "Invoice list",
  套用篩選: "Apply filters",
  這個租戶目前還沒有發票: "This tenant does not have invoices yet",
  前往帳務概覽: "Go to billing overview",
  發票上下文: "Invoice context",
  "選擇一筆發票以檢視明細、檔案狀態與深層連結":
    "Select an invoice to inspect details, file state, and deep links",
  報表: "Reports",
  "月用量 · 成本中心拆分 · SLA 摘要 · 短效簽名檔案":
    "Monthly usage · cost-center split · SLA summary · short-lived signed files",
  建立工作: "Create job",
  "更新層級 T6：手動": "Refresh tier T6: manual",
  跨應用報表追溯保持明確: "Cross-app report traceability remains explicit",
  "開啟 Ops 報表": "Open Ops reports",
  "開啟平台 audit": "Open platform audit",
  "租戶 audit": "Tenant audit",
  工作: "Jobs",
  報表工作歷史: "Report job history",
  "排隊／執行中": "Queued / running",
  後端正在產出檔案: "Backend is producing files",
  就緒: "Ready",
  簽名下載仍有效: "Signed download remains valid",
  "失敗／過期": "Failed / expired",
  需要重跑或重新產檔: "Needs rerun or regeneration",
  報表資料無法完整載入: "Report data could not fully load",
  "路由仍可使用，但一個或多個報表讀取來源失敗。":
    "The route is still usable, but one or more report read sources failed.",
  "此路由不自動輪詢。": "This route does not poll automatically.",
  "租戶報表可銜接營運報表或平台治理；依 Q-X03，跨應用深連結會在新分頁開啟。":
    "Tenant reports can connect to operations reports or platform governance; per Q-X03, cross-app deep links open in a new tab.",
  報表佇列: "Report queue",
  "類型、狀態、期別、檔案 TTL 與手動重試都以契約為依據。":
    "Type, state, period, file TTL, and manual retry behavior are contract-driven.",
  類型篩選: "Type filter",
  所有類型: "All types",
  行程摘要: "Trip summary",
  月用量: "Monthly usage",
  成本中心拆分: "Cost-center split",
  事件登錄: "Incident register",
  維運總覽: "Operations overview",
  狀態篩選: "State filter",
  所有狀態: "All states",
  排隊中: "Queued",
  執行中: "Running",
  完成: "Completed",
  失敗: "Failed",
  已過期: "Expired",
  期別篩選: "Period filter",
  對應工作參數中內嵌的期別: "Matches the period embedded in job parameters",
  "對應工作參數中內嵌的期別。":
    "Matches the period embedded in job parameters.",
  此租戶尚未開通報表能力: "Reports are not enabled for this tenant yet",
  "路由可以開啟，但後端尚未為此租戶開通報表能力。請透過跨應用治理連結確認權益、檔案簽章與報表就緒狀態。":
    "The route can open, but the backend has not enabled tenant reports yet. Use the cross-app governance links to confirm entitlements, file signing, and reporting readiness.",
  無法載入報表工作: "Report jobs could not load",
  "頁面框架可用，但報表工作清單讀取失敗。待相依服務恢復後，請重新整理一次。":
    "The page frame is available, but the report job list failed to load. Refresh once the dependent service recovers.",
  目前身分無法操作租戶報表: "Current identity cannot operate tenant reports",
  "報表仍保留在導覽中，但目前身分沒有列出或建立此租戶報表工作的權限。":
    "Reports remain in navigation, but the current identity cannot list or create tenant report jobs.",
  報表相依服務暫時不可用: "Report dependency is temporarily unavailable",
  "後端報表服務目前降級。請等待相依服務恢復後，再手動刷新工作清單。":
    "The backend report service is degraded. Wait for the dependency to recover, then manually refresh the job list.",
  目前篩選沒有符合的工作: "No jobs match the current filters",
  "此租戶有報表歷史，但目前類型、狀態或期別篩選沒有命中。清除篩選即可查看完整佇列。":
    "This tenant has report history, but the current type, state, or period filters do not match. Clear filters to view the full queue.",
  尚未建立任何報表工作: "No report jobs have been created yet",
  "你可以從此頁建立第一個租戶報表工作。後端會負責工作生命週期，並在檔案完成後提供短效簽名下載網址。":
    "Create the first tenant report job from this page. The backend owns the job lifecycle and provides a short-lived signed download URL when the file is ready.",
  建立報表工作: "Create report job",
  "類型、期別與範圍參數直接送入後端佇列。":
    "Type, period, and scope parameters are sent directly into the backend queue.",
  工作類型: "Job type",
  類型: "Type",
  參數: "Parameters",
  建立: "Created",
  格式: "Format",
  到期: "Expires",
  檔案: "File",
  下載: "Download",
  重跑: "Rerun",
  期別: "Period",
  "月報通常使用 YYYY-MM。": "Monthly reports usually use YYYY-MM.",
  "選填的範圍細化，例如 CC-FIN-001。":
    "Optional scope refinement, for example CC-FIN-001.",
  "選填的乘客下鑽，用於範圍匯出。":
    "Optional passenger drill-down for scoped export.",
  狀態覆蓋: "State overrides",
  "六種共用 EmptyReason 變體的手動 QA 捷徑。":
    "Manual QA shortcuts for the six shared EmptyReason variants.",
  即時資料: "Live data",
  跨應用深層連結: "Cross-app deep links",
  "報表可導向檔案下載、租戶 audit 或外部營運後續。":
    "Reports can route to file downloads, tenant audit, or external operations follow-up.",
  "開啟 ops-console 報表以追溯申報／營收":
    "Open ops-console reports for filing / revenue traceability",
  "開啟 platform-admin audit 以治理產出檔案":
    "Open platform-admin audit to govern produced files",
  "查看租戶端報表操作的 audit 收據":
    "View tenant report operation audit receipts",
  開啟: "Open",
  報表操作失敗: "Report operation failed",
  已送出報表清單刷新: "Report list refresh submitted",
  "此路由屬於 T6 手動更新；頁面會重新載入最新的報表作業快照。":
    "This route is T6 manual refresh; the page reloads the latest report job snapshot.",
  報表工作已排入佇列: "Report job queued",
  失敗報表已重新排入佇列: "Failed report requeued",
  "API 金鑰": "API keys",
  "正式／沙盒 · scope · 最近使用 · 撤銷後永久不可復原":
    "Production / sandbox · scope · last used · revocation is permanent",
  "API 文件": "API docs",
  "刷新 T5": "Refresh T5",
  建立金鑰: "Create key",
  清單: "List",
  "建立／輪替": "Create / rotate",
  "Q-TEN09: 完整明文只顯示一次": "Q-TEN09: full plaintext is shown once",
  "T5 更新層級 · 每 30 秒輪詢一次": "T5 refresh tier · polls every 30 seconds",
  可使用: "Usable",
  即將到期: "Expiring soon",
  "7 天內": "within 7 days",
  已撤銷: "Revoked",
  稽核可見: "Audit visible",
  "建立與輪替成功後，都只會在視窗內揭露一次完整 key。關閉後僅保留 key prefix 與 masked suffix，遺失請重新輪替。":
    "After create or rotate succeeds, the full key is revealed only once in the modal. After closing, only the key prefix and masked suffix remain; rotate again if it is lost.",
  "T5 更新層級 · 每 30 秒輪詢一次 · 建議立即刷新":
    "T5 refresh tier · polls every 30 seconds · refresh now recommended",
  "部分 API key 資料無法載入": "Some API key data could not load",
  "30 秒目標": "30 seconds target",
  "建立 API 金鑰": "Create API key",
  "可用操作由 availableActions 決定；高風險動作不再依角色名稱硬編碼。":
    "Available actions are determined by availableActions; high-risk actions are no longer hardcoded by role name.",
  收合: "Collapse",
  開啟表單: "Open form",
  名稱: "Name",
  到期時間: "Expiry time",
  "至少選擇一個已發布 scope。輪替預設沿用原 scope，但可在送出前微調。":
    "Select at least one published scope. Rotation defaults to the original scope, but you can adjust it before submitting.",
  "治理政策尚未載入或未提供允許 scope，暫時無法送出。":
    "Governance policy has not loaded or did not provide allowed scopes, so submission is temporarily unavailable.",
  治理政策不可用: "Governance policy unavailable",
  確認輪替: "Confirm rotation",
  "從上方 CTA 或清單列操作開啟建立／輪替表單。":
    "Open the create / rotate form from the CTA above or a list-row action.",
  可用操作: "Available actions",
  "風險層級與停用原因直接映射 availableActions，空清單與無權限時不再假裝可操作。":
    "Risk level and disabled reasons map directly from availableActions; empty lists and unauthorized states no longer pretend actions are available.",
  輪替金鑰: "Rotate key",
  撤銷金鑰: "Revoke key",
  高: "High",
  "Q-TEN09 plaintext-once modal；scope 與到期時間由治理策略限制。":
    "Q-TEN09 plaintext-once modal; scope and expiry are constrained by governance policy.",
  "立即使舊憑證失效，並重新發出只顯示一次的新明文。":
    "Immediately invalidates the old credential and issues a new plaintext value shown only once.",
  "高風險操作，必須先記錄撤銷原因後才可送出。":
    "High-risk action; a revocation reason must be recorded before submission.",
  目前可執行: "Currently executable",
  "目前可執行。": "Currently executable.",
  "搜尋 key 名稱、ID、scope；並保留已撤銷／已過期視圖供稽核追蹤。":
    "Search key name, ID, and scope; revoked / expired views remain available for audit tracing.",
  治理套件: "Governance package",
  "此租戶整合介面的已發布政策快照。":
    "Published policy snapshot for this tenant integration surface.",
  產生時間: "Generated at",
  預設效期: "Default lifetime",
  最長效期: "Maximum lifetime",
  到期設定: "Expiry setting",
  必填: "Required",
  選填: "Optional",
  緊急例外: "Emergency exception",
  需平台核准: "Requires platform approval",
  未發布: "Unpublished",
  允許範圍: "Allowed scopes",
  深層連結: "Deep links",
  "依 packet 從 API key surface 連到治理、通知、SLA、報表與稽核模組。":
    "Per packet, the API key surface links to governance, notifications, SLA, reports, and audit modules.",
  "對照 aggregated readiness、published scope 與 onboarding checklist。":
    "Compare aggregated readiness, published scope, and onboarding checklist.",
  "Webhook 管理": "Webhook management",
  "檢查 key 對應的 webhook receiver 是否已就緒。":
    "Check whether the webhook receiver associated with the key is ready.",
  "確認 delivery failure 與 onboarding 通知是否已開通。":
    "Confirm delivery failure and onboarding notifications are enabled.",
  "SLA 設定": "SLA settings",
  "檢視整合異常的通知節點與租戶回應時限。":
    "Inspect notification nodes for integration anomalies and tenant response deadlines.",
  報表工作台: "Reports workspace",
  "檢查 API key 對應的報表工作是否已具備可執行與可下載的就緒度。":
    "Check whether report jobs associated with the API key are executable and downloadable.",
  稽核紀錄: "Audit records",
  "Issue / rotate / revoke 後可回到 audit lane 追蹤動作。":
    "After issue / rotate / revoke, return to the audit lane to trace the action.",
  "API 金鑰清單": "API key list",
  前綴: "Prefix",
  遮罩: "Mask",
  最近: "Last used",
  撤銷: "Revoked",
  "API 金鑰清單暫時無法讀取": "API key list is temporarily unavailable",
  "畫面沒有收到 key inventory。請重新整理，若持續失敗再檢查 tenant API 與審核紀錄。":
    "The screen did not receive key inventory. Refresh, and if it keeps failing check the tenant API and audit records.",
  "目前身分沒有管理 API 金鑰的權限":
    "Current identity does not have permission to manage API keys",
  "此租戶會話不是 `tc_admin` 或 `tc_integration_mgr`。你仍可透過其他模組追蹤整合狀態，但建立、輪替、撤銷都會保持停用。":
    "This tenant session is not `tc_admin` or `tc_integration_mgr`. You can still track integration state through other modules, but create, rotate, and revoke remain disabled.",
  治理策略暫時不可用: "Governance policy is temporarily unavailable",
  "Integration governance package 沒有成功載入，因此無法安全判斷 scope catalogue 與期限策略。":
    "The integration governance package did not load, so the scope catalogue and lifetime policy cannot be evaluated safely.",
  "此租戶尚未完成 API key onboarding":
    "This tenant has not completed API key onboarding",
  "沒有既有金鑰，而且治理摘要仍顯示 API key readiness 未完成。請先完成第一組整合憑證與相依模組設定。":
    "There are no existing keys and the governance summary still shows API key readiness incomplete. Complete the first integration credential and dependent module setup first.",
  "目前沒有任何租戶 API 金鑰": "There are no tenant API keys yet",
  "清單保持空白直到第一組憑證發出。建立後只會在當下顯示完整明文，後續僅保留 prefix 與 masked suffix。":
    "The list remains empty until the first credential is issued. After creation, full plaintext is shown only once; later only the prefix and masked suffix remain.",
  "端點 · 事件訂閱 · 投遞紀錄 · 重試政策 — 後端 engine 是否啟用直接決定畫面 (Q-TEN08)":
    "Endpoints · event subscriptions · delivery records · retry policy - backend engine availability directly determines the screen (Q-TEN08)",
  新增端點: "Add endpoint",
  快照: "Snapshot",
  範圍: "Scope",
  就緒度: "Readiness",
  治理政策: "Governance policy",
  "重試／驗證政策來自治理套件。":
    "Retry / verification policy comes from the governance package.",
  測試事件: "Test event",
  重試策略: "Retry policy",
  失敗通知: "Failure notification",
  "Payload 結構描述": "Payload schema",
  "部分 supporting read models 無法載入":
    "Some supporting read models failed to load",
  端點狀態: "Endpoint status",
  投遞健康: "Delivery health",
  "功能旗標 · read-only": "Feature flags · read-only",
  "本租戶可見的 flags · 完整治理在 Platform Admin · GET /api/tenant/feature-flags":
    "Tenant-visible flags · full governance lives in Platform Admin · GET /api/tenant/feature-flags",
  "治理設定 ↗": "Governance settings ↗",
  "唯讀視圖 · per Q-X16": "Read-only view · per Q-X16",
  部分功能旗標資料無法載入: "Some feature-flag data failed to load",
  旗標: "Flags",
  覆寫: "Overrides",
  推行中: "Rolling out",
  租戶覆寫: "Tenant override",
  平台預設: "Platform default",
  功能旗標清單載入失敗: "Feature flag list failed to load",
  租戶設定: "Tenant settings",
  "一般 · 通知預設 · 隱私 · 整合預設":
    "General · notification defaults · privacy · integration defaults",
  一般: "General",
  隱私: "Privacy",
  整合: "Integration",
  "目前 actor 沒有 backend 可用動作":
    "The current actor has no backend available actions",
  "部分 module 仍是 legacy payload": "Some modules still use legacy payloads",
  部分設定資料無法載入: "Some settings data failed to load",
  更新快照: "Refresh snapshot",
  "租戶代碼 · tenant_code": "Tenant code · tenant_code",
  "顯示名稱 · display_name": "Display name · display_name",
  未設定: "Not configured",
  "統一編號 · tax_id": "Tax ID · tax_id",
  "稽核 · cross-actor": "Audit · cross-actor",
  "不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13)":
    "Immutable · 7-year retention · all actor realms acting on tenant resources (Q-TEN13)",
  "export匯出 (簽名 artifact)": "export Export (signed artifact)",
  "跨 actor 可見性 · Q-TEN13": "Cross-actor visibility · Q-TEN13",
  篩選: "Filters",
  "依 actor、module、action、time range 調查 tenant-owned evidence。":
    "Investigate tenant-owned evidence by actor, module, action, and time range.",
  匯出: "Export",
  "操作者 realm": "Actor realm",
  模組: "Module",
  動作: "Action",
  起: "From",
  迄: "To",
  稽核回執: "Audit receipt",
  "支援 action receipt deep link。": "Supports action receipt deep links.",
  空狀態示範: "Empty-state demo",
  無資料: "Not available",
  "達 approval rule 條件,需主管簽核":
    "Approval rule matched; manager sign-off required",
  "簽核通過,訂單繼續派遣": "Approval passed; dispatch continues",
  "簽核退回,訂單需要重新調整": "Approval rejected; booking requires adjustment",
  "月結 invoice 已生成": "Monthly invoice has been generated",
  "Webhook 端點連續失敗 3 次":
    "Webhook endpoint failed three consecutive times",
  "配額使用率 ≥ 80%": "Quota usage is at least 80%",
  狀態概要: "State summary",
  "State variants 自動偵測": "State variants auto-detected",
  "Email 訂閱": "Email subscriptions",
  "Webhook 訂閱": "Webhook subscriptions",
  "Ops console 訂閱": "Ops console subscriptions",
  "EmptyReason 對照": "EmptyReason mapping",
  "六種 EmptyReason 視覺差異 · 配合 Q-X15 統一處理":
    "Six EmptyReason visual variants · handled consistently with Q-X15",
  尚無資料: "No data yet",
  "功能已就緒,目前沒有可顯示的資料。":
    "The feature is ready, but there is no data to display yet.",
  尚未設定: "Not configured",
  "此功能或通道尚未為租戶啟用,需先完成基線設定。":
    "This feature or channel is not enabled for the tenant yet; baseline setup is required.",
  讀取失敗: "Read failed",
  "後端讀取發生錯誤,請稍後重試或檢查連線。":
    "A backend read error occurred. Retry later or check connectivity.",
  權限不足: "Insufficient permission",
  "目前角色無法檢視此資料,請洽 tenant admin。":
    "The current role cannot view this data. Contact the tenant admin.",
  外部服務異常: "External service degraded",
  "相依的外部服務暫時無法使用,稍後會自動恢復。":
    "A dependent external service is temporarily unavailable and should recover automatically.",
  篩選後為空: "Empty after filtering",
  "目前篩選條件下沒有符合的資料,調整條件即可。":
    "No data matches the current filters. Adjust the filters to continue.",
  跨應用導向: "Cross-app routing",
  通知偏好的相關深連結: "notification preference related deep links",
  整合就緒度: "Integration readiness",
  "回到 /integration-governance 查看整體 readiness":
    "Return to /integration-governance to inspect overall readiness",
  "Webhook 端點": "Webhook endpoint",
  "前往 /webhooks 啟用 webhook channel":
    "Go to /webhooks to enable the webhook channel",
  "Webhook 投遞詳細": "Webhook delivery detail",
  "深入 platform-admin 對帳投遞失敗 (Q-X03)":
    "Inspect delivery failures in platform-admin (Q-X03)",
  未知錯誤: "Unknown error",
};

const LEGACY_EN_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /有 ([0-9,]+) 筆訂單需要在 dispatch 或 proof 狀態追蹤處理。/g,
    "$1 booking(s) need follow-up across dispatch or proof states.",
  ],
  [
    /租戶帳務授權可見 ([0-9,]+) 份發票檔案。/g,
    "$1 invoice artifact(s) are visible from tenant billing authority.",
  ],
  [
    /首頁顯示了 ([0-9,]+) 則近期提醒。/g,
    "The home page is showing $1 recent reminder(s).",
  ],
  [
    /有 ([0-9,]+) 項待辦的整合檢查清單。/g,
    "$1 integration checklist item(s) remain open.",
  ],
  [/規則: ([0-9,]+)/g, "Rules: $1"],
  [/啟用: ([0-9,]+)/g, "Enabled: $1"],
  [/待審批: ([0-9,]+)/g, "Pending approval: $1"],
  [/全部 · ([0-9,]+)/g, "All · $1"],
  [/員工 · ([0-9,]+)/g, "Employee · $1"],
  [/訪客 · ([0-9,]+)/g, "Visitor · $1"],
  [/停用 · ([0-9,]+)/g, "Disabled · $1"],
  [/([0-9,]+) 項覆寫/g, "$1 overrides"],
  [
    /快照載入於 ([^，。]+)，更新層級維持 ([^，。]+)。/g,
    "Snapshot loaded at $1. Refresh tier remains $2.",
  ],
  [/快照載入於 ([^，。]+)[，。]/g, "Snapshot loaded at $1. "],
  [/上午/g, "AM"],
  [/下午/g, "PM"],
  [/凌晨/g, "AM"],
  [/秒/g, "seconds"],
  [/分鐘/g, "minutes"],
  [/趟 \/ 月/g, "trips / month"],
  [/趟剩餘/g, "trips remaining"],
  [/API 金鑰/g, "API keys"],
  [/建立金鑰/g, "Create key"],
  [/完整明文/g, "full plaintext"],
  [/清晨/g, "AM"],
  [
    /目前快照建立於 ([^（]+)（([^）]+)前）。頁面可見時會自動刷新；你也可以手動刷新以取得最新狀態。/g,
    "Current snapshot created at $1 ($2 ago). The page refreshes automatically while visible; you can also refresh manually for the latest state.",
  ],
  [
    /ISO 8601 含時區；留空則遵循預設 ([0-9]+) 天。/g,
    "ISO 8601 with timezone; leave blank to follow the default $1-day lifetime.",
  ],
  [
    /預設 ([0-9]+) 天 · 最長 ([0-9]+) 天 · 撤銷效果 ([^。]+)/g,
    "Default $1 days · maximum $2 days · revoke effect $3",
  ],
  [/([0-9]+) 天/g, "$1 days"],
  [/停用原因: ([a-z0-9_]+)/g, "Disabled reason: $1"],
  [/已撤銷 ([^，。]+)/g, "Revoked $1"],
  [/未知報表錯誤。/g, "Unknown report error."],
  [/目前不可用/g, "Currently unavailable"],
  [/需要理由/g, "requires reason"],
  [/清除篩選/g, "Clear filters"],
  [/重新整理清單/g, "Refresh list"],
  [/排入報表佇列/g, "Queue report job"],
  [/送出中.../g, "Submitting..."],
  [/儲存中…/g, "Saving..."],
  [
    /已套用 ([0-9,]+) 個租戶覆寫 · 最後更新/g,
    "$1 tenant override(s) applied · last updated",
  ],
  [
    /工作 ([^ ]+) 已受理。請刷新或等待後端產生簽名檔案。/g,
    "Job $1 has been accepted. Refresh or wait for the backend to generate the signed file.",
  ],
  [
    /替代工作 ([^ ]+) 已用原本類型與範圍受理。/g,
    "Replacement job $1 was accepted with the original type and scope.",
  ],
  [
    /要用相同參數重跑報表工作 ([^ ]+) 嗎？/g,
    "Rerun report job $1 with the same parameters?",
  ],
  [/通知偏好的相關深連結/g, "notification preference related deep links"],
  [/唯讀/g, "Read only"],
];

const LEGACY_EN_SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
]);

function translateLegacyEnglishText(value: string) {
  let next = value;
  const leading = next.match(/^\s*/)?.[0] ?? "";
  const trailing = next.match(/\s*$/)?.[0] ?? "";
  const core = next.trim();
  const exact = LEGACY_EN_COPY[core];

  if (exact) {
    next = leading + exact + trailing;
  }

  for (const [pattern, replacement] of LEGACY_EN_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

function translateLegacyEnglishTree(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !LEGACY_EN_SKIPPED_TAGS.has(parent.tagName)) {
      textNodes.push(textNode);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const current = textNode.nodeValue ?? "";
    const next = translateLegacyEnglishText(current);
    if (next !== current) {
      textNode.nodeValue = next;
    }
  }
}

function LegacyEnglishCopyBridge({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (locale !== "en") {
      return;
    }

    let queued = false;
    let frame = 0;
    const schedule = () => {
      if (queued) {
        return;
      }
      queued = true;
      frame = window.requestAnimationFrame(() => {
        queued = false;
        translateLegacyEnglishTree(document.body);
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    schedule();

    return () => {
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [locale]);

  return null;
}

function normalizeHealthStatus(
  value: unknown,
  responseOk: boolean,
): ApiHealthStatus {
  if (!responseOk) {
    return "degraded";
  }

  const normalized = String(value ?? "healthy").toLowerCase();
  if (normalized === "down" || normalized === "unhealthy") {
    return "down";
  }
  if (normalized === "degraded" || normalized === "warning") {
    return "degraded";
  }
  return "healthy";
}

function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = getBrowserApiBaseUrl().replace(/\/$/, "");

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        setStatus(normalizeHealthStatus(body?.status, response.ok));
      } catch {
        if (!controller.signal.aborted) {
          setStatus("down");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLastCheckedAt(new Date());
        }
      }
    }

    checkHealth();

    return () => controller.abort();
  }, []);

  return { status, lastCheckedAt };
}

function formatCheckedAt(date: Date | null, locale: Locale) {
  if (!date) {
    return null;
  }

  return date.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TenantShellControls({
  locale,
  setLocale,
  t,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}) {
  const { status, lastCheckedAt } = useApiHealth();
  const statusCopy = {
    checking: {
      label: t("shell.health.checking"),
      fg: tenantCanvasTheme.textMuted,
      bg: tenantCanvasTheme.surface,
      border: tenantCanvasTheme.border,
    },
    healthy: {
      label: t("shell.health.healthy"),
      fg: "#5EEAD4",
      bg: "rgba(20, 184, 166, 0.12)",
      border: "rgba(94, 234, 212, 0.32)",
    },
    degraded: {
      label: t("shell.health.degraded"),
      fg: "#FBBF24",
      bg: "rgba(251, 191, 36, 0.12)",
      border: "rgba(251, 191, 36, 0.34)",
    },
    down: {
      label: t("shell.health.down"),
      fg: "#FCA5A5",
      bg: "rgba(248, 113, 113, 0.12)",
      border: "rgba(252, 165, 165, 0.34)",
    },
  } satisfies Record<
    ApiHealthStatus,
    { label: string; fg: string; bg: string; border: string }
  >;
  const current = statusCopy[status];
  const checkedAt = formatCheckedAt(lastCheckedAt, locale);

  return (
    <div style={controlGroupStyle}>
      <div
        aria-label={current.label}
        title={`${current.label}${checkedAt ? ` · ${t("shell.health.lastChecked")} ${checkedAt}` : ""}`}
        style={{
          ...healthPillStyle,
          color: current.fg,
          background: current.bg,
          borderColor: current.border,
        }}
      >
        <span style={{ ...healthDotStyle, background: current.fg }} />
        <span>{current.label}</span>
      </div>
      <button
        type="button"
        title={t("shell.language.switch")}
        aria-label={t("shell.language.switch")}
        style={languageButtonStyle}
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
      >
        <span aria-hidden="true">{t("shell.language.icon")}</span>
        <span>
          {locale === "en" ? t("shell.language.zh") : t("shell.language.en")}
        </span>
      </button>
    </div>
  );
}

export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useTranslation();
  const navEntries = useMemo(() => createTenantNavEntries(t), [t]);
  const activeItem = findNavItem(pathname, navEntries);
  const activeKey = activeItem?.key;

  if (pathname.startsWith("/partner") || pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  return (
    <ManagementThemeProvider defaultDark defaultDensity="compact">
      <div
        data-testid="tenant-console-shell"
        style={{
          height: "100dvh",
          minHeight: "100dvh",
          background: tenantCanvasTheme.bg,
        }}
      >
        <CanvasShell
          theme={tenantCanvasTheme}
          nav={navEntries}
          brandLabel={TENANT_CONSOLE_BRAND}
          brandSubLabel={t("shell.brand.sub")}
          breadcrumb={[
            t("shell.context"),
            activeItem?.label ?? t("shell.breadcrumb.home"),
          ]}
          env={t("shell.env")}
          versionLabel={TENANT_CONSOLE_VERSION}
          searchPlaceholder={t("shell.search")}
          searchWidth={280}
          avatarLabel={locale === "en" ? "YA" : t("shell.identity.actor")}
          style={{ height: "100dvh", minHeight: "100dvh" }}
          topRight={
            <TenantShellControls locale={locale} setLocale={setLocale} t={t} />
          }
          {...(activeKey ? { active: activeKey } : {})}
        >
          <LegacyEnglishCopyBridge locale={locale} />
          {children}
        </CanvasShell>
      </div>
    </ManagementThemeProvider>
  );
}

const controlGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const healthPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const healthDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  flexShrink: 0,
};

const languageButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${tenantCanvasTheme.border}`,
  borderRadius: 999,
  background: tenantCanvasTheme.surface,
  color: tenantCanvasTheme.text,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
