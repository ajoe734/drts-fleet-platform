import type { Locale } from "@/lib/translations";

type HostDict = Record<string, Record<Locale, string>>;

export const hostTranslations: HostDict = {
  vehiclesPageTitle: {
    zh: "自有車輛 · My Vehicles",
    en: "My Vehicles",
  },
  vehiclesServiceUnavailableTitle: {
    zh: "車主資料服務尚未可用",
    en: "Owner data service unavailable",
  },
  vehiclesEmptyTitle: {
    zh: "尚無車輛",
    en: "No vehicles yet",
  },
  casesNoResolution: {
    zh: "尚未結案，無結論摘要",
    en: "Not yet closed, no resolution summary",
  },
  casesCardTitle: {
    zh: "相關案件 · Cases (去識別化)",
    en: "Related Cases (de-identified)",
  },
  earningsPrevMonth: {
    zh: "← 上月",
    en: "← Prev month",
  },
  earningsNextMonth: {
    zh: "下月 →",
    en: "Next month →",
  },
  earningsCardTitle: {
    zh: "收益摘要 · Earnings",
    en: "Earnings Summary",
  },
  earningsEmptyTitle: {
    zh: "尚無收益紀錄",
    en: "No earnings record yet",
  },
  earningsPendingPolicyTitle: {
    zh: "分潤比例尚未確定 · pending_policy",
    en: "Profit-share ratio not yet determined · pending_policy",
  },
  earningsZeroTitle: {
    zh: "本月零營收 · 合法的零值",
    en: "Zero revenue this month · legitimate zero value",
  },
  maintenanceCardTitle: {
    zh: "維保紀錄 · Maintenance",
    en: "Maintenance Records",
  },
  paginationSummary: {
    zh: "{count} 筆 · 第 {page} / {totalPages} 頁",
    en: "{count} items · page {page} / {totalPages}",
  },
  paginationPrev: {
    zh: "上一頁",
    en: "Previous",
  },
  paginationNext: {
    zh: "下一頁",
    en: "Next",
  },
  tripsCardTitle: {
    zh: "行程 · Trips (去識別化)",
    en: "Trips (de-identified)",
  },
  vehicleSummaryCardTitle: {
    zh: "車輛基本資料 · Vehicle summary",
    en: "Vehicle Summary",
  },
  vehicleTableDetailLink: {
    zh: "詳情 →",
    en: "Details →",
  },
};

export function trHost(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const entry = hostTranslations[key];
  let value = entry ? (entry[locale] ?? entry.zh ?? key) : key;

  if (params) {
    value = value.replace(/\{(\w+)\}/g, (_, token) =>
      String(params[token] ?? `{${token}}`),
    );
  }

  return value;
}
