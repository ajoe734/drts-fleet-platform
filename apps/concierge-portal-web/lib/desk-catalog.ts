export type ConciergeOperatorMode =
  | "concierge_operator"
  | "call_point_operator";

export type DeskHealth = "healthy" | "degraded";

export type RecordingAvailability = "ops_callback_only" | "ready_inline";

export type RequestedServiceProduct =
  | "standard_taxi"
  | "airport_assist"
  | "medical_discharge";

export type DeskCatalogRecord = {
  deskId: string;
  deskName: string;
  deskType: "concierge" | "call_point";
  siteId: string;
  siteName: string;
  location: string;
  phone: string;
  zoneLabel: string;
  queuePolicy: "realtime" | "queue";
  health: DeskHealth;
  recordingAvailability: RecordingAvailability;
  allowedModes: ConciergeOperatorMode[];
  authorizedProducts: RequestedServiceProduct[];
  authorizedAddressKeywords: string[];
  escalationLabel: string;
  notes: string;
};

export type DeskAccessResult =
  | { allowed: true }
  | { allowed: false; reasonCode: "mode_denied"; message: string };

export type DeskEligibilityResult =
  | { state: "eligible"; message: string }
  | {
      state: "ineligible";
      reasonCode: "product_not_authorized" | "service_area_mismatch";
      message: string;
    };

export const conciergeDeskCatalog: DeskCatalogRecord[] = [
  {
    deskId: "acme-reception",
    deskName: "Acme 大樓大廳櫃台",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000311",
    siteName: "Acme 大樓",
    location: "台北市信義區市府路 1 號 1F",
    phone: "02-5550-0111",
    zoneLabel: "信義市府走廊",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator", "call_point_operator"],
    authorizedProducts: ["standard_taxi", "medical_discharge"],
    authorizedAddressKeywords: ["信義", "市府", "忠孝", "仁愛", "大安"],
    escalationLabel: "營運客服中心與派遣主管",
    notes:
      "櫃台狀態正常，可由客服櫃台與電話站點人員操作；錄音回補仍交由營運端處理。",
  },
  {
    deskId: "tpe-t1-lobby",
    deskName: "第一航廈客服上車點",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000312",
    siteName: "桃園機場第一航廈",
    location: "桃園機場第一航廈 1F",
    phone: "03-390-0001",
    zoneLabel: "機場內環路線",
    queuePolicy: "queue",
    health: "degraded",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator"],
    authorizedProducts: ["standard_taxi", "airport_assist"],
    authorizedAddressKeywords: ["機場", "航廈", "桃園", "南崁"],
    escalationLabel: "機場櫃台營運主管",
    notes: "此櫃台目前標記為降級，用來清楚呈現唯讀備援流程。",
  },
  {
    deskId: "riverside-clinic",
    deskName: "河畔診所電話站點",
    deskType: "call_point",
    siteId: "site-demo-riverside-clinic",
    siteName: "河畔診所",
    location: "新北市板橋區文化路 2 段 188 號",
    phone: "02-7755-2200",
    zoneLabel: "轉乘與出院接送限定",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["call_point_operator"],
    authorizedProducts: ["medical_discharge"],
    authorizedAddressKeywords: ["板橋", "文化路", "新埔", "新北"],
    escalationLabel: "診所交通協調窗口",
    notes: "此站點僅允許電話站點模式與出院接送，可用來驗證拒絕與資格不符流程。",
  },
];

export function getDeskById(deskId: string | null | undefined) {
  if (!deskId) {
    return null;
  }

  return conciergeDeskCatalog.find((desk) => desk.deskId === deskId) ?? null;
}

export function resolveDeskAccess(
  desk: DeskCatalogRecord,
  mode: ConciergeOperatorMode,
): DeskAccessResult {
  if (desk.allowedModes.includes(mode)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reasonCode: "mode_denied",
    message: `${desk.deskName} 僅允許 ${desk.allowedModes
      .map(formatDeskMode)
      .join(" / ")} 操作。`,
  };
}

export function evaluateDeskEligibility(
  desk: DeskCatalogRecord,
  requestedProduct: RequestedServiceProduct,
  pickupAddress: string,
  dropoffAddress: string,
): DeskEligibilityResult {
  if (!desk.authorizedProducts.includes(requestedProduct)) {
    return {
      state: "ineligible",
      reasonCode: "product_not_authorized",
      message: `${desk.deskName} 不可送出${formatRequestedProduct(requestedProduct)}需求。`,
    };
  }

  const normalizedScope = `${pickupAddress} ${dropoffAddress}`.toLowerCase();
  const matchesZone = desk.authorizedAddressKeywords.some((keyword) =>
    normalizedScope.includes(keyword.toLowerCase()),
  );

  if (!matchesZone) {
    return {
      state: "ineligible",
      reasonCode: "service_area_mismatch",
      message: `${desk.deskName} 僅支援${desk.zoneLabel}。`,
    };
  }

  return {
    state: "eligible",
    message: `${desk.deskName} 可處理此代訂需求。`,
  };
}

export function formatDeskMode(mode: ConciergeOperatorMode) {
  return mode === "concierge_operator" ? "客服櫃台人員" : "電話站點人員";
}

export function formatDeskType(type: DeskCatalogRecord["deskType"]) {
  return type === "concierge" ? "客服櫃台" : "電話站點";
}

export function formatDeskHealth(health: DeskHealth) {
  return health === "healthy" ? "正常" : "降級";
}

export function formatQueuePolicy(policy: DeskCatalogRecord["queuePolicy"]) {
  return policy === "realtime" ? "即時處理" : "排隊處理";
}

export function formatRecordingAvailability(
  availability: RecordingAvailability,
) {
  return availability === "ops_callback_only" ? "僅營運端回補" : "可內嵌回補";
}

export function formatRequestedProduct(product: RequestedServiceProduct) {
  switch (product) {
    case "airport_assist":
      return "機場協助";
    case "medical_discharge":
      return "醫療出院接送";
    case "standard_taxi":
      return "一般計程車";
  }
}
