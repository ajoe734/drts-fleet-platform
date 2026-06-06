// Central bilingual strings for the Fleet Partner Portal chrome and page
// headers. Row-level data carries its own zh/en in the fixtures module.
// Follows the platform i18n rule: pages call t(), no inline locale ternaries.

export type Locale = "zh" | "en";

type Dict = Record<string, string>;

const zh: Dict = {
  "app.name": "車行夥伴入口",
  "app.sub": "Fleet Partner Portal",
  "app.brandMark": "FLP",
  "common.search": "搜尋…",
  "common.export": "匯出",
  "common.filter": "篩選",

  "nav.workspace": "工作面 · Workspace",
  "nav.supply": "供給管理 · Supply",
  "nav.revenue": "分潤 · Revenue",
  "nav.qualityGroup": "品質與責任 · Quality & Responsibility",
  "nav.dashboard": "營運總覽 · Dashboard",
  "nav.drivers": "司機 · Drivers",
  "nav.vehicles": "車輛 · Vehicles",
  "nav.trips": "趟次 · Trips",
  "nav.revenueShare": "分潤 · Revenue Share",
  "nav.statements": "對帳單 · Statements",
  "nav.documents": "文件 · Documents",
  "nav.training": "訓練 · Training",
  "nav.cases": "事故 / 申訴 · Incidents",
  "nav.quality": "品質指標 · Quality Metrics",

  "dashboard.title": "車行營運總覽",
  "dashboard.subtitle": "大都會車隊 · 2026 年 6 月 · METRO_FLEET",
  "dashboard.recruit": "招募司機",
  "dashboard.attention": "需要您處理",
  "dashboard.attentionSub": "文件缺件 → 品質責任 → 訓練落後",
  "dashboard.supply": "服務別供給",
  "dashboard.supplySub": "可接各 service product 的司機數",
  "dashboard.recentTrips": "近期趟次 · top 5",
  "dashboard.gotoTrips": "前往趟次",

  "drivers.title": "司機",
  "drivers.subtitle": "旗下司機歸屬 · 服務資格 · 文件 / 訓練狀態",
  "vehicles.title": "車輛",
  "vehicles.subtitle": "車輛狀態 · 服務資格 · 保險與檢驗",
  "vehicles.add": "新增車輛",
  "trips.title": "趟次",
  "trips.subtitle": "旗下司機所有趟次 · 含分潤金額 · service product",

  "revenue.title": "分潤 · Revenue Share",
  "revenue.subtitle": "當期分潤組成 · 逐趟 / 獎金 / 管理費 / 罰則",
  "revenue.period": "期別",
  "revenue.exportLines": "匯出明細",
  "revenue.payable": "應付金額 · payable",
  "revenue.rules": "分潤規則 · revenue share rules",
  "revenue.actions": "動作",
  "revenue.pendingTitle": "當期對帳單待確認",
  "revenue.pendingBody": "2026-05 分潤對帳單已產生，請於 6/10 前確認。",
  "revenue.dispute": "提出異議",
  "revenue.confirm": "確認對帳單",

  "statements.title": "對帳單 · Statements",
  "statements.subtitle": "月結分潤對帳單 · 可下載簽名 artifact",
  "documents.title": "文件 · Documents",
  "documents.subtitle":
    "缺件追蹤 · 證照 / 保險 / 服務資格 · owner 區分車行與司機",
  "documents.warnTitle": "缺件期間影響派工",
  "documents.warnBody":
    "缺件或過期文件會使司機 / 車輛無法接對應的 service product 任務。請優先處理機場接送與保險代步相關資格。",
  "training.title": "訓練 · Training",
  "training.subtitle": "服務訓練完成率 · 未完成者無法接對應 service product",
  "training.courses": "課程完成度",
  "cases.title": "事故 / 申訴",
  "cases.subtitle": "責任歸屬車行 / 共同 / 平台 · 車行需處理屬於車行責任的案件",
  "quality.title": "品質指標 · Quality Metrics",
  "quality.subtitle": "車行整體品質 · 影響分潤績效獎金與合作評等",
  "quality.responsibility": "品質責任說明",

  "data.fixtureNotice":
    "目前顯示為設計示意資料（design fixtures）。/api/fleet-partner/* portal 端點上線後將改接真實資料。",
};

const en: Dict = {
  "app.name": "Fleet Partner Portal",
  "app.sub": "車行夥伴入口",
  "app.brandMark": "FLP",
  "common.search": "Search…",
  "common.export": "Export",
  "common.filter": "Filter",

  "nav.workspace": "Workspace",
  "nav.supply": "Supply",
  "nav.revenue": "Revenue",
  "nav.qualityGroup": "Quality & Responsibility",
  "nav.dashboard": "Dashboard",
  "nav.drivers": "Drivers",
  "nav.vehicles": "Vehicles",
  "nav.trips": "Trips",
  "nav.revenueShare": "Revenue Share",
  "nav.statements": "Statements",
  "nav.documents": "Documents",
  "nav.training": "Training",
  "nav.cases": "Incidents / Complaints",
  "nav.quality": "Quality Metrics",

  "dashboard.title": "Fleet Operations Overview",
  "dashboard.subtitle": "Metro Fleet · Jun 2026 · METRO_FLEET",
  "dashboard.recruit": "Recruit drivers",
  "dashboard.attention": "Needs your attention",
  "dashboard.attentionSub":
    "Missing docs → quality responsibility → training gaps",
  "dashboard.supply": "Supply by service product",
  "dashboard.supplySub": "Drivers eligible per service product",
  "dashboard.recentTrips": "Recent trips · top 5",
  "dashboard.gotoTrips": "Go to trips",

  "drivers.title": "Drivers",
  "drivers.subtitle":
    "Affiliation · service eligibility · document / training status",
  "vehicles.title": "Vehicles",
  "vehicles.subtitle":
    "Vehicle status · service eligibility · insurance & inspection",
  "vehicles.add": "Add vehicle",
  "trips.title": "Trips",
  "trips.subtitle":
    "All trips by affiliated drivers · commission · service product",

  "revenue.title": "Revenue Share",
  "revenue.subtitle":
    "Current-period composition · per-trip / bonus / fee / penalty",
  "revenue.period": "Period",
  "revenue.exportLines": "Export lines",
  "revenue.payable": "Payable",
  "revenue.rules": "Revenue share rules",
  "revenue.actions": "Actions",
  "revenue.pendingTitle": "Current statement pending confirmation",
  "revenue.pendingBody":
    "The 2026-05 revenue-share statement is ready. Please confirm before 6/10.",
  "revenue.dispute": "Raise dispute",
  "revenue.confirm": "Confirm statement",

  "statements.title": "Statements",
  "statements.subtitle":
    "Monthly revenue-share statements · signed artifact download",
  "documents.title": "Documents",
  "documents.subtitle":
    "Missing-document tracking · license / insurance / eligibility · fleet vs driver owner",
  "documents.warnTitle": "Missing documents block dispatch",
  "documents.warnBody":
    "Missing or expired documents stop a driver / vehicle from taking the matching service product. Prioritise airport-transfer and insurance-replacement eligibility.",
  "training.title": "Training",
  "training.subtitle":
    "Service training completion · incomplete drivers cannot take the matching service product",
  "training.courses": "Course completion",
  "cases.title": "Incidents / Complaints",
  "cases.subtitle":
    "Responsibility fleet / shared / platform · the fleet handles fleet-owned cases",
  "quality.title": "Quality Metrics",
  "quality.subtitle":
    "Overall fleet quality · drives performance bonus and partnership rating",
  "quality.responsibility": "Quality responsibility",

  "data.fixtureNotice":
    "Showing design fixtures. Real data will load once the /api/fleet-partner/* portal endpoints ship.",
};

export const translations: Record<Locale, Dict> = { zh, en };

export function t(key: string, locale: Locale): string {
  return translations[locale]?.[key] ?? translations.zh[key] ?? key;
}
