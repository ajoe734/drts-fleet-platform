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
    deskName: "Acme Lobby Desk",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000311",
    siteName: "Acme Tower",
    location: "台北市信義區市府路 1 號 1F",
    phone: "02-5550-0111",
    zoneLabel: "Xinyi / City Hall corridor",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator", "call_point_operator"],
    authorizedProducts: ["standard_taxi", "medical_discharge"],
    authorizedAddressKeywords: ["信義", "市府", "忠孝", "仁愛", "大安"],
    escalationLabel: "Ops callcenter / dispatch manager",
    notes:
      "Healthy desk with both concierge and call-point operators allowed. Recording callback still lands in ops.",
  },
  {
    deskId: "tpe-t1-lobby",
    deskName: "T1 Concierge Pick-up Point",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000312",
    siteName: "Taoyuan Airport T1",
    location: "桃園機場第一航廈 1F",
    phone: "03-390-0001",
    zoneLabel: "Airport inner-loop",
    queuePolicy: "queue",
    health: "degraded",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator"],
    authorizedProducts: ["standard_taxi", "airport_assist"],
    authorizedAddressKeywords: ["機場", "航廈", "桃園", "南崁"],
    escalationLabel: "Ops airport desk supervisor",
    notes:
      "Route is intentionally degraded to make the read-only fallback explicit for SYS-UI-005.",
  },
  {
    deskId: "riverside-clinic",
    deskName: "Riverside Clinic Call Point",
    deskType: "call_point",
    siteId: "site-demo-riverside-clinic",
    siteName: "Riverside Clinic",
    location: "新北市板橋區文化路 2 段 188 號",
    phone: "02-7755-2200",
    zoneLabel: "Boarding transfer / discharge only",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["call_point_operator"],
    authorizedProducts: ["medical_discharge"],
    authorizedAddressKeywords: ["板橋", "文化路", "新埔", "新北"],
    escalationLabel: "Clinic transport coordinator",
    notes:
      "This desk is useful for denied and ineligible routing because it only allows call-point mode and discharge trips.",
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
    message: `${desk.deskName} only allows ${desk.allowedModes.join(" / ")}.`,
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
      message: `${desk.deskName} cannot submit ${requestedProduct} requests.`,
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
      message: `${desk.deskName} only covers ${desk.zoneLabel}.`,
    };
  }

  return {
    state: "eligible",
    message: `${desk.deskName} is authorized for this assisted-entry request.`,
  };
}

export function formatDeskMode(mode: ConciergeOperatorMode) {
  return mode === "concierge_operator"
    ? "Concierge operator"
    : "Call-point operator";
}
