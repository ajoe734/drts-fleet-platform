import type { Translator } from "./translations";

export type ConciergeOperatorMode =
  | "concierge_operator"
  | "call_point_operator";

export type DeskHealth = "healthy" | "degraded";

export type RecordingAvailability = "ops_callback_only" | "ready_inline";

export type RequestedServiceProduct =
  | "standard_taxi"
  | "airport_assist"
  | "medical_discharge";

type DeskTranslationKey =
  | "desk.acme.name"
  | "desk.acme.site"
  | "desk.acme.location"
  | "desk.acme.zone"
  | "desk.acme.escalation"
  | "desk.acme.notes"
  | "desk.t1.name"
  | "desk.t1.site"
  | "desk.t1.location"
  | "desk.t1.zone"
  | "desk.t1.escalation"
  | "desk.t1.notes"
  | "desk.riverside.name"
  | "desk.riverside.site"
  | "desk.riverside.location"
  | "desk.riverside.zone"
  | "desk.riverside.escalation"
  | "desk.riverside.notes";

export type DeskCatalogRecord = {
  deskId: string;
  deskNameKey: DeskTranslationKey;
  deskType: "concierge" | "call_point";
  siteId: string;
  siteNameKey: DeskTranslationKey;
  locationKey: DeskTranslationKey;
  phone: string;
  zoneLabelKey: DeskTranslationKey;
  queuePolicy: "realtime" | "queue";
  health: DeskHealth;
  recordingAvailability: RecordingAvailability;
  allowedModes: ConciergeOperatorMode[];
  authorizedProducts: RequestedServiceProduct[];
  authorizedAddressKeywords: string[];
  escalationLabelKey: DeskTranslationKey;
  notesKey: DeskTranslationKey;
};

export type LocalizedDeskCatalogRecord = Omit<
  DeskCatalogRecord,
  | "deskNameKey"
  | "siteNameKey"
  | "locationKey"
  | "zoneLabelKey"
  | "escalationLabelKey"
  | "notesKey"
> & {
  deskName: string;
  siteName: string;
  location: string;
  zoneLabel: string;
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
    deskNameKey: "desk.acme.name",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000311",
    siteNameKey: "desk.acme.site",
    locationKey: "desk.acme.location",
    phone: "02-5550-0111",
    zoneLabelKey: "desk.acme.zone",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator", "call_point_operator"],
    authorizedProducts: ["standard_taxi", "medical_discharge"],
    authorizedAddressKeywords: [
      "信義",
      "市府",
      "忠孝",
      "仁愛",
      "大安",
      "xinyi",
      "city hall",
      "ren'ai",
      "renai",
      "daan",
    ],
    escalationLabelKey: "desk.acme.escalation",
    notesKey: "desk.acme.notes",
  },
  {
    deskId: "tpe-t1-lobby",
    deskNameKey: "desk.t1.name",
    deskType: "concierge",
    siteId: "10000000-0000-0000-0000-000000000312",
    siteNameKey: "desk.t1.site",
    locationKey: "desk.t1.location",
    phone: "03-390-0001",
    zoneLabelKey: "desk.t1.zone",
    queuePolicy: "queue",
    health: "degraded",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["concierge_operator"],
    authorizedProducts: ["standard_taxi", "airport_assist"],
    authorizedAddressKeywords: [
      "機場",
      "航廈",
      "桃園",
      "南崁",
      "airport",
      "terminal",
      "taoyuan",
      "nankan",
    ],
    escalationLabelKey: "desk.t1.escalation",
    notesKey: "desk.t1.notes",
  },
  {
    deskId: "riverside-clinic",
    deskNameKey: "desk.riverside.name",
    deskType: "call_point",
    siteId: "site-demo-riverside-clinic",
    siteNameKey: "desk.riverside.site",
    locationKey: "desk.riverside.location",
    phone: "02-7755-2200",
    zoneLabelKey: "desk.riverside.zone",
    queuePolicy: "realtime",
    health: "healthy",
    recordingAvailability: "ops_callback_only",
    allowedModes: ["call_point_operator"],
    authorizedProducts: ["medical_discharge"],
    authorizedAddressKeywords: [
      "板橋",
      "文化路",
      "新埔",
      "新北",
      "banqiao",
      "wenhua",
      "new taipei",
    ],
    escalationLabelKey: "desk.riverside.escalation",
    notesKey: "desk.riverside.notes",
  },
];

export function getDeskById(deskId: string | null | undefined) {
  if (!deskId) {
    return null;
  }

  return conciergeDeskCatalog.find((desk) => desk.deskId === deskId) ?? null;
}

export function localizeDeskRecord(
  desk: DeskCatalogRecord | null | undefined,
  t: Translator,
): LocalizedDeskCatalogRecord | null {
  if (!desk) {
    return null;
  }

  return {
    ...desk,
    deskName: t(desk.deskNameKey),
    siteName: t(desk.siteNameKey),
    location: t(desk.locationKey),
    zoneLabel: t(desk.zoneLabelKey),
    escalationLabel: t(desk.escalationLabelKey),
    notes: t(desk.notesKey),
  };
}

export function formatDeskMode(mode: ConciergeOperatorMode, t: Translator) {
  return t(`desk.mode.${mode}`);
}

export function formatDeskHealth(health: DeskHealth, t: Translator) {
  return t(`desk.health.${health}`);
}

export function formatQueuePolicy(
  queuePolicy: DeskCatalogRecord["queuePolicy"],
  t: Translator,
) {
  return t(`desk.queue.${queuePolicy}`);
}

export function formatRecordingAvailability(
  availability: RecordingAvailability,
  t: Translator,
) {
  return t(`desk.recording.${availability}`);
}

export function formatRequestedProduct(
  product: RequestedServiceProduct,
  t: Translator,
) {
  return t(`desk.product.${product}`);
}

export function resolveDeskAccess(
  desk: DeskCatalogRecord,
  mode: ConciergeOperatorMode,
  t: Translator,
): DeskAccessResult {
  if (desk.allowedModes.includes(mode)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reasonCode: "mode_denied",
    message: t("desk.access.denied", {
      deskName: t(desk.deskNameKey),
      allowedModes: desk.allowedModes
        .map((item) => formatDeskMode(item, t))
        .join(" / "),
    }),
  };
}

export function evaluateDeskEligibility(
  desk: DeskCatalogRecord,
  requestedProduct: RequestedServiceProduct,
  pickupAddress: string,
  dropoffAddress: string,
  t: Translator,
): DeskEligibilityResult {
  const productEligibility = evaluateDeskProductEligibility(
    desk,
    requestedProduct,
    t,
  );
  if (productEligibility.state === "ineligible") {
    return productEligibility;
  }

  return evaluateDeskTextServiceAreaEligibility(
    desk,
    pickupAddress,
    dropoffAddress,
    t,
  );
}

export function evaluateDeskProductEligibility(
  desk: DeskCatalogRecord,
  requestedProduct: RequestedServiceProduct,
  t: Translator,
): DeskEligibilityResult {
  if (!desk.authorizedProducts.includes(requestedProduct)) {
    return {
      state: "ineligible",
      reasonCode: "product_not_authorized",
      message: t("desk.eligibility.productDenied", {
        deskName: t(desk.deskNameKey),
        product: formatRequestedProduct(requestedProduct, t),
      }),
    };
  }

  return {
    state: "eligible",
    message: t("desk.eligibility.allowed", {
      deskName: t(desk.deskNameKey),
    }),
  };
}

export function evaluateDeskTextServiceAreaEligibility(
  desk: DeskCatalogRecord,
  pickupAddress: string,
  dropoffAddress: string,
  t: Translator,
): DeskEligibilityResult {
  const normalizedScope = `${pickupAddress} ${dropoffAddress}`.toLowerCase();
  const matchesZone = desk.authorizedAddressKeywords.some((keyword) =>
    normalizedScope.includes(keyword.toLowerCase()),
  );

  if (!matchesZone) {
    return {
      state: "ineligible",
      reasonCode: "service_area_mismatch",
      message: t("desk.eligibility.zoneDenied", {
        deskName: t(desk.deskNameKey),
        zoneLabel: t(desk.zoneLabelKey),
      }),
    };
  }

  return {
    state: "eligible",
    message: t("desk.eligibility.allowed", {
      deskName: t(desk.deskNameKey),
    }),
  };
}
