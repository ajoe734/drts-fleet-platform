// Page-local translations for the Fleet Partner Portal statements list,
// statement detail, and statement export surfaces added for
// SR-FLEET-SETTLE-001. Kept local (not in the shared dictionary) because
// `apps/fleet-partner-portal-web/lib/translations.ts` is outside this task's
// write scope; see docs/04-uat/system-remediation-20260906/SR-FLEET-SETTLE-001.md
// for the full scope note.
import type { Locale } from "../../lib/translations";

type StatementsDict = Record<string, Record<Locale, string>>;

const statementsTranslations: StatementsDict = {
  "statements.empty.title": {
    en: "No statements yet",
    zh: "目前尚無對帳單",
  },
  "statements.empty.body": {
    en: "This fleet partner has no generated statements. This is not a failure — statements appear here after the monthly settlement cycle produces one.",
    zh: "此車行尚無已產生的對帳單。這不是錯誤，月結週期產生對帳單後會顯示在此。",
  },
  "statements.detail.linkList": {
    en: "Statement detail & export",
    zh: "對帳單明細與匯出",
  },
  "statements.detail.exportAll": {
    en: "Export all (CSV)",
    zh: "匯出全部（CSV）",
  },
  "statements.detail.backToList": {
    en: "← Back to statements",
    zh: "← 返回對帳單列表",
  },
  "statements.detail.title": {
    en: "Statement detail",
    zh: "對帳單明細",
  },
  "statements.detail.summaryTitle": {
    en: "Summary",
    zh: "摘要",
  },
  "statements.detail.linesTitle": {
    en: "Line items",
    zh: "逐筆明細",
  },
  "statements.detail.exportOne": {
    en: "Download this statement (CSV)",
    zh: "下載此對帳單（CSV）",
  },
  "statements.detail.notFound.title": {
    en: "Statement not found",
    zh: "找不到此對帳單",
  },
  "statements.detail.notFound.body": {
    en: "This statement id does not belong to your fleet partner account, or does not exist.",
    zh: "此對帳單編號不屬於貴車行帳戶，或不存在。",
  },
  "statements.detail.noLines": {
    en: "No line items are recorded for this statement.",
    zh: "此對帳單目前沒有逐筆明細紀錄。",
  },
  "statements.detail.confirmDisputeUnavailable": {
    en: "Confirming or disputing this statement with a durable, readable-back record is not wired to a real backend endpoint yet. This is tracked as an open blocker on SR-FLEET-SETTLE-001, not a hidden failure.",
    zh: "確認／爭議此對帳單並產生可回讀的正式紀錄尚未串接真實後端。此為 SR-FLEET-SETTLE-001 待補項目，非隱藏性失敗。",
  },
  "statements.column.trips": {
    en: "Trips",
    zh: "趟次",
  },
  "statements.column.period": {
    en: "Period",
    zh: "期別",
  },
  "statements.column.status": {
    en: "Status",
    zh: "狀態",
  },
  "statements.column.payable": {
    en: "Payable",
    zh: "應付金額",
  },
  "statements.column.reimbursement": {
    en: "Reimbursement",
    zh: "補款",
  },
  "statements.column.formula": {
    en: "Formula",
    zh: "計算方式",
  },
  "statements.column.order": {
    en: "Order",
    zh: "訂單",
  },
  "statements.column.driver": {
    en: "Driver",
    zh: "司機",
  },
  "statements.column.grossEarning": {
    en: "Gross earning",
    zh: "毛額",
  },
  "statements.column.driverNet": {
    en: "Driver net",
    zh: "司機淨額",
  },
  "statements.column.share": {
    en: "Fleet share",
    zh: "車行分潤",
  },
  "statements.column.sponsorFunded": {
    en: "Sponsor-funded",
    zh: "卡友贊助",
  },
  "statements.column.completedAt": {
    en: "Completed at",
    zh: "完成時間",
  },
};

export function trStatements(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const entry = statementsTranslations[key];
  let value = entry ? (entry[locale] ?? entry.zh) : key;
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (_, token) =>
      String(params[token] ?? `{${token}}`),
    );
  }
  return value;
}
