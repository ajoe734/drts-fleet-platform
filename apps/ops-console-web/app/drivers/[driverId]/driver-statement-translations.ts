import type { Locale } from "../../../lib/translations";

const zh = {
  "panel.title": "產生司機對帳單",
  "panel.description":
    "請為司機 {driverId} 指定明確結算月份（YYYY-MM），送出產生對帳單命令並核對讀回之對帳單紀錄。",
  "field.driverLabel": "司機編號",
  "field.periodMonthLabel": "對帳月份（YYYY-MM）",
  "field.periodMonthPlaceholder": "YYYY-MM",
  "field.periodMonthHint":
    "請輸入明確月份（例如 2026-03），系統不會自動套用歷史最新月份。",
  "action.submit": "送出產生對帳單",
  "action.submitting": "正在產生對帳單…",
  "action.cancel": "取消",
  "action.retry": "重試相同請求",
  "status.busy":
    "正在為司機 {driverId}（{periodMonth}）送出對帳單產生請求並等待清單讀回…",
  "status.idempotencyKey": "冪等鍵：{idempotencyKey}",
  "receipt.title": "司機對帳單已產生並完成清單讀回核對",
  "receipt.summary":
    "對帳單 {statementId} · 司機 {driverId}（{periodMonth}）· 單號 {receiptNo} · 淨額 {netAmount}",
  "receipt.meta":
    "費率方案版本 {feePlanVersion} · {lineCount} 筆行程明細 · 撥款狀態：{payoutStatus}",
  "receipt.boundaryNotice":
    "此操作僅建立司機對帳單，不代表已完成撥款入帳、銀行匯款或金流商結算；讀回結果來自 GET /api/driver-statements?period={periodMonth}，不作為跨副本 SQL 即時一致性證明。",
  "error.missingMonthTitle": "必須指定對帳月份",
  "error.missingMonthBody":
    "送出前請先為司機 {driverId} 輸入明確的 YYYY-MM 對帳月份。",
  "error.validationTitle": "對帳單產生驗證失敗（{driverId} · {periodMonth}）",
  "error.noEligibleTitle":
    "指定對帳月份無符合資格行程（{driverId} · {periodMonth}）",
  "error.forbiddenTitle": "無權限執行對帳單產生（{driverId} · {periodMonth}）",
  "error.serverTitle": "對帳單服務發生錯誤（{driverId} · {periodMonth}）",
  "error.genericTitle": "對帳單產生失敗（{driverId} · {periodMonth}）",
  "error.readbackMissingTitle":
    "找不到司機 {driverId}（{periodMonth}）之讀回對帳單",
  "error.readbackMissingBody":
    "POST /api/driver-statements/generate 已回應，但 GET /api/driver-statements?period={periodMonth} 未讀回司機 {driverId} 於 {periodMonth} 的對應紀錄。系統不會偽造對帳單號，請以相同冪等請求重試。",
  "error.retryHint": "以相同司機與月份重試將沿用冪等鍵 {idempotencyKey}。",
} as const;

export type DriverStatementTranslationKey = keyof typeof zh;

const en: Record<DriverStatementTranslationKey, string> = {
  "panel.title": "Generate driver statement",
  "panel.description":
    "Select an explicit settlement month (YYYY-MM) for driver {driverId}, submit the generation command, and verify the readback statement record.",
  "field.driverLabel": "Driver ID",
  "field.periodMonthLabel": "Statement period (YYYY-MM)",
  "field.periodMonthPlaceholder": "YYYY-MM",
  "field.periodMonthHint":
    "Enter an explicit month such as 2026-03. Latest statement history is not assumed.",
  "action.submit": "Submit statement generation",
  "action.submitting": "Generating statement…",
  "action.cancel": "Cancel",
  "action.retry": "Retry same intent",
  "status.busy":
    "Submitting statement generation for {driverId} ({periodMonth}) and awaiting typed list readback…",
  "status.idempotencyKey": "Idempotency key: {idempotencyKey}",
  "receipt.title": "Driver statement generated and verified via list readback",
  "receipt.summary":
    "Statement {statementId} for driver {driverId} ({periodMonth}) · Receipt {receiptNo} · Net {netAmount}",
  "receipt.meta":
    "Fee plan {feePlanVersion} · {lineCount} trip line(s) · Payout status: {payoutStatus}",
  "receipt.boundaryNotice":
    "This operation records a driver statement only and does not execute payout disbursement, bank transfer, or payment provider settlement. Readback reflects GET /api/driver-statements?period={periodMonth} and does not prove cross-replica SQL freshness.",
  "error.missingMonthTitle": "Statement month required",
  "error.missingMonthBody":
    "Enter an explicit YYYY-MM period month for driver {driverId} before submitting.",
  "error.validationTitle":
    "Statement generation validation failed ({driverId} · {periodMonth})",
  "error.noEligibleTitle":
    "No eligible trips for statement period ({driverId} · {periodMonth})",
  "error.forbiddenTitle":
    "Permission denied for statement generation ({driverId} · {periodMonth})",
  "error.serverTitle": "Statement service error ({driverId} · {periodMonth})",
  "error.genericTitle":
    "Statement generation failed ({driverId} · {periodMonth})",
  "error.readbackMissingTitle":
    "Statement readback missing for {driverId} ({periodMonth})",
  "error.readbackMissingBody":
    "POST /api/driver-statements/generate completed, but GET /api/driver-statements?period={periodMonth} returned no matching record for driver {driverId} and period {periodMonth}. No statement ID or receipt was fabricated; you may retry the same request.",
  "error.retryHint":
    "Retrying with the same driver and month reuses idempotency key {idempotencyKey}.",
};

export function driverStatementT(
  locale: Locale,
  key: DriverStatementTranslationKey,
  params?: Record<string, string | number>,
): string {
  const dictionary = locale === "en" ? en : zh;
  let value: string = dictionary[key];
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replaceAll(`{${paramKey}}`, String(paramValue));
    }
  }
  return value;
}
