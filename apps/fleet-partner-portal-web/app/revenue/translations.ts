// Page-local translations for the Fleet Partner Portal revenue page.
//
// The shared `revenue.pendingTitle` / `revenue.pendingBody` keys in
// `@/lib/translations` only describe "statement generated, please confirm"
// and were previously rendered unconditionally — even when there was no
// current-period statement, or the current statement was already paid. That
// produced the self-contradictory copy in SR-FLEET-SETTLE-001 / R13 ("分潤頁
// 同時說本期對帳單已產生及沒有可操作對帳單"). These keys cover the two
// states the shared dictionary is missing so the banner can be driven by the
// actual statement record instead of always claiming "generated".
import type { Locale } from "../../lib/translations";

type RevenueDict = Record<string, Record<Locale, string>>;

const revenueTranslations: RevenueDict = {
  "revenue.applyPeriod": {
    en: "Apply period",
    zh: "套用期別",
  },
  "revenue.exportUnavailable.noStatement": {
    en: "No statement to export for this period.",
    zh: "此期別沒有可匯出的對帳單。",
  },
  "revenue.exportUnavailable.readFailed": {
    en: "Reload the statement before exporting.",
    zh: "請重新讀取對帳單後再匯出。",
  },
  "revenue.readFailed.title": {
    en: "Unable to load this period",
    zh: "無法讀取此期別",
  },
  "revenue.readFailed.body": {
    en: "The statement for {period} could not be read. Retry to load its actual amount and decision status.",
    zh: "目前無法讀取 {period} 對帳單，請重試以取得實際金額與確認狀態。",
  },
  "revenue.actionsUnavailable": {
    en: "Statement actions will be available after a successful read.",
    zh: "成功讀取對帳單後即可使用相關動作。",
  },
  "revenue.retry": {
    en: "Retry",
    zh: "重試",
  },
  "revenue.confirmedStatement.body": {
    en: "The {period} statement has been confirmed. The saved note and confirmation time appear below.",
    zh: "{period} 對帳單已確認，儲存的備註與確認時間顯示於下方。",
  },
  "revenue.disputedStatement.body": {
    en: "A dispute has been filed for the {period} statement. Follow the linked case below for handling progress.",
    zh: "{period} 對帳單已提出異議，請由下方案件連結查看處理進度。",
  },
  "revenue.noStatement.title": {
    en: "No statement for this period yet",
    zh: "本期尚無對帳單",
  },
  "revenue.noStatement.body": {
    en: "{period} has no statement yet. Statements are generated after the monthly settlement cycle closes — check back later, or review prior periods on the Statements page.",
    zh: "系統尚未產生 {period} 對帳單，通常於月結週期結束後產生；請稍後回來查看，或至「對帳單」頁查看歷史紀錄。",
  },
  "revenue.paidStatement.title": {
    en: "This period is settled",
    zh: "本期已結清",
  },
  "revenue.paidStatement.body": {
    en: "The {period} statement has been paid ({payable}). No confirmation or dispute action is needed.",
    zh: "{period} 對帳單已付款完成（{payable}），無需再確認或提出異議。",
  },
};

export function trRevenue(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const entry = revenueTranslations[key];
  let value = entry ? (entry[locale] ?? entry.zh) : key;
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (_, token) =>
      String(params[token] ?? `{${token}}`),
    );
  }
  return value;
}
