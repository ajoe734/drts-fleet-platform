import type { Locale } from "@/lib/translations";
import type { PaymentStatus } from "./payment-exception-model";

const copy = {
  en: {
    title: "Payment exception",
    subtitle:
      "P5-COM-UI-02 · Masked provider reference only · Backend-owned recovery actions",
    loadingTitle: "Loading payment authority",
    loadingBody: "Reading the latest billing state and audit trail.",
    forbiddenTitle: "Payment detail access denied",
    forbiddenBody:
      "This account does not have billing:read authority. No payment data was displayed.",
    notFoundTitle: "Payment exception not found",
    notFoundBody: "No payment exception exists for this order.",
    unavailableTitle: "Payment authority unavailable",
    unavailableBody:
      "The billing read authority is temporarily unavailable. The screen remains fail-closed.",
    errorTitle: "Unable to load payment exception",
    errorBody:
      "No local fallback or cached payment result was shown. Retry the authoritative read.",
    invalidTitle: "Invalid payment authority response",
    invalidBody:
      "The server response did not match the approved read model. No payment result was inferred.",
    retry: "Retry authoritative read",
    paymentInfo: "Payment information",
    order: "Order",
    trip: "Trip",
    amount: "Amount due",
    status: "Status",
    providerReference: "Provider reference",
    attempts: "Capture attempts",
    updatedAt: "Updated",
    unavailable: "Unavailable",
    attemptUnit: "attempts",
    recoveryTitle: "Backend recovery authority",
    recoveryBody:
      "Controls are rendered only from availableActions. A mark-paid action does not exist.",
    noRecoveryActions:
      "The backend did not provide an executable recovery action.",
    auditTitle: "Audit timeline",
    auditEmpty:
      "No canonical payment audit events are available for this record.",
    statusTitle: "Canonical payment states",
    privacyTitle: "Sensitive payment data is not exposed",
    privacyBody:
      "Card numbers, payment method tokens, and raw provider payloads are never returned to this screen.",
    pendingCommand:
      "Recovery command pending canonical contract and mutation authority.",
    confirmAction: "Confirm payment recovery action:",
    reasonPrompt:
      "Enter the operational reason for this payment recovery action.",
    executing: "Submitting recovery",
    commandAccepted: "Recovery command recorded",
    auditReceipt: "Audit receipt",
    commandFailed: "Recovery command was not accepted",
    commandFailedBody:
      "No payment state was inferred. Review the authoritative status and retry with a new request only when appropriate.",
    actor: "Actor",
    request: "Request",
  },
  zh: {
    title: "付款例外",
    subtitle:
      "P5-COM-UI-02 · 僅顯示遮罩 provider reference · 回復動作由後端授權",
    loadingTitle: "正在載入付款 authority",
    loadingBody: "正在讀取最新 billing 狀態與稽核軌跡。",
    forbiddenTitle: "無權檢視付款明細",
    forbiddenBody: "此帳號沒有 billing:read 權限，因此未顯示任何付款資料。",
    notFoundTitle: "找不到付款例外",
    notFoundBody: "此訂單目前沒有付款例外紀錄。",
    unavailableTitle: "付款 authority 暫時不可用",
    unavailableBody:
      "Billing 唯讀 authority 目前無法使用，畫面維持 fail-closed。",
    errorTitle: "無法載入付款例外",
    errorBody:
      "畫面未使用本機 fallback 或快取推定付款結果，請重新取得 authoritative read。",
    invalidTitle: "付款 authority 回應格式無效",
    invalidBody:
      "伺服器回應不符合核准的 read model，因此沒有推定任何付款結果。",
    retry: "重新取得 authoritative read",
    paymentInfo: "付款資訊",
    order: "訂單",
    trip: "行程",
    amount: "應付金額",
    status: "狀態",
    providerReference: "Provider 參照",
    attempts: "請款嘗試",
    updatedAt: "更新時間",
    unavailable: "未取得",
    attemptUnit: "次",
    recoveryTitle: "後端回復 authority",
    recoveryBody:
      "控制項只依 availableActions 呈現；系統不存在 mark-paid 動作。",
    noRecoveryActions: "後端目前未提供可執行的回復動作。",
    auditTitle: "稽核時間軸",
    auditEmpty: "此紀錄目前沒有 canonical 付款稽核事件。",
    statusTitle: "Canonical 付款狀態",
    privacyTitle: "不揭露敏感付款資料",
    privacyBody:
      "此畫面永遠不會收到卡號、payment method token 或原始 provider payload。",
    pendingCommand:
      "Recovery command 尚待 canonical contract 與 mutation authority。",
    confirmAction: "確認執行付款回復動作：",
    reasonPrompt: "請輸入此次付款回復動作的營運原因。",
    executing: "正在送出回復命令",
    commandAccepted: "回復命令已留存",
    auditReceipt: "稽核收據",
    commandFailed: "回復命令未被接受",
    commandFailedBody:
      "系統未推定付款狀態；請先確認 authoritative status，必要時再以新 request 重試。",
    actor: "執行者",
    request: "Request",
  },
} as const;

const statusCopy: Record<Locale, Record<PaymentStatus, string>> = {
  en: {
    not_selected: "Not selected",
    authorized: "Authorized",
    captured: "Completed",
    failed: "Payment failed",
    refunded: "Refunded",
    manual_recovery: "Manual recovery",
  },
  zh: {
    not_selected: "尚未選擇",
    authorized: "已授權",
    captured: "已完成",
    failed: "付款失敗",
    refunded: "已退款",
    manual_recovery: "人工處理中",
  },
};

export type PaymentExceptionCopyKey = keyof (typeof copy)["en"];

export function paymentExceptionCopy(
  locale: Locale,
  key: PaymentExceptionCopyKey,
) {
  return copy[locale][key];
}

export function paymentStatusLabel(locale: Locale, status: PaymentStatus) {
  return statusCopy[locale][status];
}

export function paymentActionLabel(locale: Locale, action: string) {
  if (action === "retry_capture") {
    return locale === "zh" ? "重試請款" : "Retry capture";
  }
  if (action === "begin_manual_recovery") {
    return locale === "zh" ? "開始人工處理" : "Begin manual recovery";
  }
  return action;
}
