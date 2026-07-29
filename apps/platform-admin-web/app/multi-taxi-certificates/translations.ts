import type { CertificateSupportState } from "./certificate-support-model";

export type CertificateSupportLocale = "en" | "zh";
export type CertificateTone =
  | "success"
  | "info"
  | "neutral"
  | "danger"
  | "warn";

const zhCopy = {
  stateCatalogTitle: "支援狀態 × 6",
  pageTitle: "電子乘車證明支援 · Certificate Support",
  pageSubtitle: "P5-COM-UI-03 · 搜尋、開啟與稽核重產電子乘車證明",
  readOnlySupport: "canonical writer",
  authorityTitle: "既有憑證 authority",
  authorityBody:
    "本頁只讀取 reporting.multi_taxi_electronic_receipts；缺少的法定欄位顯示「未取得」，不以前端推算或補零。",
  searchCardTitle: "定位乘車證明",
  searchAria: "搜尋訂單、行程或證明編號",
  searchPlaceholder: "訂單 / 行程 / 證明編號",
  stateAria: "乘車證明狀態",
  allStates: "全部狀態",
  searchButton: "搜尋既有證明",
  loadingTitle: "讀取乘車證明",
  loadingBody: "正在查詢伺服器權威資料。",
  accessDeniedTitle: "無存取權",
  accessDeniedSearchBody:
    "需要 Platform Admin 的 foundation:read；頁面不會顯示憑證資料。",
  readFailedTitle: "讀取失敗",
  readFailedBody: "無法取得既有乘車證明。可重新執行只讀查詢，不會觸發重產生。",
  retryRead: "重新讀取",
  emptyTitle: "沒有符合的既有乘車證明",
  emptyBody: "此結果為 unavailable；請確認訂單、行程或證明編號。",
  resultsTitle: "搜尋結果 · {count} 筆",
  orderLabel: "訂單",
  tripLabel: "行程",
  plateLabel: "車牌",
  issuedLabel: "簽發",
  openDetail: "開啟明細",
  detailLoadingBody: "正在讀取既有憑證與法定欄位。",
  detailAccessDeniedBody:
    "需要 Platform Admin 的 foundation:read；憑證資料未顯示。",
  detailUnavailableTitle: "乘車證明不可用",
  detailUnavailableBody: "找不到指定的既有乘車證明，沒有產生替代資料。",
  detailFailedTitle: "乘車證明讀取失敗",
  detailFailedBody: "可重新執行查詢；系統不會在資料來源失敗時產生替代憑證。",
  detailPageTitle: "電子乘車證明 · {certificateNo}",
  detailPageSubtitle: "P5-COM-UI-03 · 既有憑證明細 · 缺值不補零",
  backToSearch: "返回乘車證明搜尋",
  supersededTitle: "版本已被取代",
  supersededBody: "後續憑證：{certificateId}。本頁不把舊版標示為有效版本。",
  legalFieldsTitle: "法定乘車證明欄位",
  fieldCertificateVersion: "證明編號 / 版本",
  fieldOrderTrip: "訂單 / 行程",
  fieldPlate: "車號",
  fieldPickup: "上車時間",
  fieldDropoff: "下車時間",
  fieldDuration: "行駛時間",
  fieldRoute: "路線",
  fieldDistance: "里程",
  fieldFare: "車資",
  fieldToll: "通行費",
  fieldServicePhone: "客服電話",
  fieldComplaintPhone: "主管機關申訴電話",
  fieldIssuedAt: "簽發時間",
  openHtml: "開啟 HTML",
  openPdf: "開啟 PDF",
  artifactsUnavailable: "既有 HTML/PDF 連結未取得",
  regenerationDisabled: "重新產生 · 命令未核准",
  regenerationTitle: "重新產生",
  regenerationSubtitle: "audited idempotent command",
  disabled: "disabled",
  regenerationBody: "重產命令目前不可用。",
  regenerationReasonLabel: "重產原因（必填，將寫入稽核紀錄）",
  regenerationAction: "產生新版本",
  regenerating: "產生中…",
  regenerationUnavailableBody:
    "writer、資料庫或目前版本狀態不允許重產；系統不會降級成假動作。",
  regenerationScopeBody: "需要 Platform Admin 的 foundation:write 才能重產。",
  regenerationSuccess: "新版本已產生",
  regenerationAudit: "Audit ID：{auditId}",
  regenerationFailed: "重產失敗",
  unavailableValue: "未取得",
} as const;

export type CertificateSupportCopyKey = keyof typeof zhCopy;

const enCopy: Record<CertificateSupportCopyKey, string> = {
  stateCatalogTitle: "Six support states",
  pageTitle: "Electronic Ride Certificate Support",
  pageSubtitle:
    "P5-COM-UI-03 · Find, open, and auditably regenerate ride certificates",
  readOnlySupport: "Canonical writer",
  authorityTitle: "Existing certificate authority",
  authorityBody:
    "This page only reads reporting.multi_taxi_electronic_receipts. Missing legal fields remain unavailable and are never inferred or replaced with zero.",
  searchCardTitle: "Find a ride certificate",
  searchAria: "Search by order, trip, or certificate number",
  searchPlaceholder: "Order / trip / certificate number",
  stateAria: "Ride certificate state",
  allStates: "All states",
  searchButton: "Search existing certificates",
  loadingTitle: "Loading ride certificates",
  loadingBody: "Reading authoritative server data.",
  accessDeniedTitle: "Access denied",
  accessDeniedSearchBody:
    "Platform Admin foundation:read is required. Certificate data is not displayed.",
  readFailedTitle: "Read failed",
  readFailedBody:
    "Existing certificates could not be read. Retrying only repeats the read and does not regenerate a certificate.",
  retryRead: "Retry read",
  emptyTitle: "No matching existing certificate",
  emptyBody:
    "This result is unavailable. Check the order, trip, or certificate number.",
  resultsTitle: "Search results · {count}",
  orderLabel: "Order",
  tripLabel: "Trip",
  plateLabel: "Plate",
  issuedLabel: "Issued",
  openDetail: "Open details",
  detailLoadingBody: "Reading the existing certificate and legal fields.",
  detailAccessDeniedBody:
    "Platform Admin foundation:read is required. Certificate data is not displayed.",
  detailUnavailableTitle: "Ride certificate unavailable",
  detailUnavailableBody:
    "The requested existing certificate was not found. No substitute data was generated.",
  detailFailedTitle: "Ride certificate read failed",
  detailFailedBody:
    "The read may be retried. No substitute certificate is generated when authority data fails.",
  detailPageTitle: "Electronic Ride Certificate · {certificateNo}",
  detailPageSubtitle:
    "P5-COM-UI-03 · Existing certificate details · Missing values stay unavailable",
  backToSearch: "Back to certificate search",
  supersededTitle: "Version superseded",
  supersededBody:
    "Replacement certificate: {certificateId}. This older version is not presented as current.",
  legalFieldsTitle: "Legal ride certificate fields",
  fieldCertificateVersion: "Certificate number / version",
  fieldOrderTrip: "Order / trip",
  fieldPlate: "Plate number",
  fieldPickup: "Pickup time",
  fieldDropoff: "Drop-off time",
  fieldDuration: "Travel duration",
  fieldRoute: "Route",
  fieldDistance: "Distance",
  fieldFare: "Fare",
  fieldToll: "Toll",
  fieldServicePhone: "Customer service phone",
  fieldComplaintPhone: "Authority complaint phone",
  fieldIssuedAt: "Issued at",
  openHtml: "Open HTML",
  openPdf: "Open PDF",
  artifactsUnavailable: "Existing HTML/PDF links are unavailable",
  regenerationDisabled: "Regenerate · Command not approved",
  regenerationTitle: "Regeneration",
  regenerationSubtitle: "audited idempotent command",
  disabled: "disabled",
  regenerationBody: "The regeneration command is currently unavailable.",
  regenerationReasonLabel:
    "Regeneration reason (required and written to the audit trail)",
  regenerationAction: "Generate new version",
  regenerating: "Generating…",
  regenerationUnavailableBody:
    "The writer, database, or current version state does not allow regeneration. No placeholder action is exposed.",
  regenerationScopeBody:
    "Platform Admin foundation:write is required to regenerate.",
  regenerationSuccess: "New version generated",
  regenerationAudit: "Audit ID: {auditId}",
  regenerationFailed: "Regeneration failed",
  unavailableValue: "Unavailable",
};

const copyByLocale: Record<
  CertificateSupportLocale,
  Record<CertificateSupportCopyKey, string>
> = {
  en: enCopy,
  zh: zhCopy,
};

const stateCopyByLocale: Record<
  CertificateSupportLocale,
  Record<
    CertificateSupportState,
    { label: string; detail: string; tone: CertificateTone }
  >
> = {
  zh: {
    available: {
      label: "可開啟",
      detail: "既有乘車證明可供檢視；檔案連結仍以伺服器回傳為準。",
      tone: "success",
    },
    generating: {
      label: "產生中",
      detail: "乘車證明準備中，請稍後重新讀取。",
      tone: "info",
    },
    unavailable: {
      label: "不可用",
      detail: "目前沒有可開啟的既有乘車證明。",
      tone: "neutral",
    },
    failed: {
      label: "產生失敗",
      detail: "證明產生失敗；本頁僅能重新讀取，不能自行重產生。",
      tone: "danger",
    },
    access_denied: {
      label: "無存取權",
      detail: "目前登入身份沒有讀取乘車證明的權限。",
      tone: "neutral",
    },
    superseded: {
      label: "已被新版取代",
      detail: "此版本僅供辨識，應改開啟後續有效版本。",
      tone: "warn",
    },
  },
  en: {
    available: {
      label: "Available",
      detail:
        "The existing certificate can be viewed. Artifact links remain authoritative server data.",
      tone: "success",
    },
    generating: {
      label: "Generating",
      detail: "The ride certificate is being prepared. Retry the read later.",
      tone: "info",
    },
    unavailable: {
      label: "Unavailable",
      detail: "No existing ride certificate can currently be opened.",
      tone: "neutral",
    },
    failed: {
      label: "Generation failed",
      detail:
        "Certificate generation failed. This page can only retry the read and cannot regenerate it.",
      tone: "danger",
    },
    access_denied: {
      label: "Access denied",
      detail:
        "The current identity does not have permission to read ride certificates.",
      tone: "neutral",
    },
    superseded: {
      label: "Superseded",
      detail:
        "This version is retained for identification. Open the replacement version instead.",
      tone: "warn",
    },
  },
};

export function certificateSupportCopy(
  locale: CertificateSupportLocale,
  key: CertificateSupportCopyKey,
  params: Record<string, string | number> = {},
) {
  return copyByLocale[locale][key].replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

export function certificateStateCopy(
  locale: CertificateSupportLocale,
  state: CertificateSupportState,
) {
  return stateCopyByLocale[locale][state];
}

export function displayCertificateValue(
  locale: CertificateSupportLocale,
  value: string | number | null,
) {
  return value === null || value === ""
    ? certificateSupportCopy(locale, "unavailableValue")
    : String(value);
}

export function formatCertificateMoney(
  locale: CertificateSupportLocale,
  value: number | null,
  currency = "NTD",
) {
  if (value === null) {
    return certificateSupportCopy(locale, "unavailableValue");
  }
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatCertificateDuration(
  locale: CertificateSupportLocale,
  seconds: number | null,
) {
  if (seconds === null) {
    return certificateSupportCopy(locale, "unavailableValue");
  }
  const minutes = Math.floor(seconds / 60);
  return locale === "zh" ? `${minutes} 分` : `${minutes} min`;
}

export function formatCertificateDistance(
  locale: CertificateSupportLocale,
  meters: number | null,
) {
  if (meters === null) {
    return certificateSupportCopy(locale, "unavailableValue");
  }
  const numberLocale = locale === "zh" ? "zh-TW" : "en-US";
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString(numberLocale, {
        maximumFractionDigits: 1,
      })} km`
    : `${meters.toLocaleString(numberLocale)} m`;
}

export function formatCertificateDateTime(
  locale: CertificateSupportLocale,
  value: string | null,
) {
  if (!value) {
    return certificateSupportCopy(locale, "unavailableValue");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
}
