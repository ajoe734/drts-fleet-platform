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
