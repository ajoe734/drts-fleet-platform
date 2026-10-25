export const PARTNER_TYPES = ["bank_partner", "referral_channel"] as const;
export type KnownPartnerType = (typeof PARTNER_TYPES)[number];
export type PartnerType = KnownPartnerType | (string & {});

export const REFERRAL_REVENUE_SHARE_RATE_TYPES = [
  "percent",
  "per_trip",
] as const;
export type ReferralRevenueShareRateType =
  (typeof REFERRAL_REVENUE_SHARE_RATE_TYPES)[number];

export const REFERRAL_SETTLEMENT_DIRECTIONS = ["drts_pays_partner"] as const;
export type ReferralSettlementDirection =
  (typeof REFERRAL_SETTLEMENT_DIRECTIONS)[number];

export const REFERRAL_SETTLEMENT_CHANNEL_KEYS = ["partner_referral"] as const;
export type ReferralSettlementChannelKey =
  (typeof REFERRAL_SETTLEMENT_CHANNEL_KEYS)[number];

export const REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER =
  "drts_pays_partner" as const;
export const PARTNER_REFERRAL_CHANNEL_KEY = "partner_referral" as const;

export interface ReferralRevenueShareRule {
  ruleId: string;
  partnerId: string;
  partnerEntrySlug: string;
  rateType: ReferralRevenueShareRateType;
  value: number;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  settlementDirection: ReferralSettlementDirection;
  channelKey: ReferralSettlementChannelKey;
  createdAt: string;
  updatedAt: string;
}

export const PARTNER_USER_IDENTITY_LINK_STATUSES = [
  "active",
  "revoked",
] as const;
export type PartnerUserIdentityLinkStatus =
  (typeof PARTNER_USER_IDENTITY_LINK_STATUSES)[number];

export const PARTNER_USER_IDENTITY_CONSENT_SCOPES = [
  "referral_attribution",
  "referral_settlement",
  "passenger_identity_link",
] as const;
export type PartnerUserIdentityConsentScope =
  (typeof PARTNER_USER_IDENTITY_CONSENT_SCOPES)[number];

export interface PartnerUserIdentityLinkRecord {
  entrySlug: string;
  partnerUserRef: string;
  drtsPassengerId: string;
  status: PartnerUserIdentityLinkStatus;
  consentScope: PartnerUserIdentityConsentScope;
  linkedAt: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartnerIngressHandoffCommand {
  entrySlug: string;
  apiKey?: string;
  partnerUserRef: string;
  consentScope?: PartnerUserIdentityConsentScope;
}

export const REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES = [
  "trip.manage",
  "pii.trip",
  "identity.bind",
] as const;
export type ReferralEmbedRequiredConsentScope =
  (typeof REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES)[number];

export interface ReferralEmbedConsentBundle {
  bundleVersion: string;
  grantedScopes: ReferralEmbedRequiredConsentScope[];
  grantedAt: string;
  actorIp?: string | null;
  userAgent?: string | null;
}

export interface CreateReferralEmbedHandoffArtifactCommand {
  entrySlug: string;
  entryHost: string;
  currentDrtsPassengerId?: string;
  currentPartnerEntrySlug?: string;
  apiKey?: string;
  partnerUserRef: string;
  navigationContext?: { orderId: string; screen: string };
  consentBundle?: ReferralEmbedConsentBundle | null;
}

export interface ReferralEmbedHandoffArtifact {
  handoffId: string;
  artifact: string;
  tokenType: "SingleUse";
  expiresIn: "120s";
  expiresAt: string;
  partnerEntrySlug: string;
  entryHost: string;
  currentDrtsPassengerId?: string;
  currentPartnerEntrySlug?: string;
  drtsPassengerId: string;
  consentRequired: boolean;
  consentBundleVersion: string | null;
}

export interface ConsumeReferralEmbedHandoffArtifactCommand {
  artifact: string;
  entrySlug: string;
  entryHost: string;
  currentDrtsPassengerId?: string;
  currentPartnerEntrySlug?: string;
}

export interface RecordReferralEmbedConsentCommand {
  handoffId: string;
  entrySlug: string;
  entryHost: string;
  currentDrtsPassengerId: string;
  currentPartnerEntrySlug: string;
  consentBundle: ReferralEmbedConsentBundle;
}

export interface ReferralEmbedSessionIdentity {
  actorType: "referral_passenger";
  actorId: string;
  realm: "partner";
  authMode: "jwt_bearer";
  roleFamilies: ["partner"];
  roles: string[];
  scopes: string[];
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string;
  drtsPassengerId: string;
}

export interface ReferralEmbedSession {
  handoffId: string;
  partnerEntrySlug: string;
  entryHost: string;
  currentDrtsPassengerId?: string;
  currentPartnerEntrySlug?: string;
  drtsPassengerId: string;
  identityActive: boolean;
  navigationContext?: { orderId: string; screen: string };
  consent: {
    requiredScopes: ReferralEmbedRequiredConsentScope[];
    bundleVersion: string | null;
    grantedAt: string | null;
  };
  identity: ReferralEmbedSessionIdentity;
}

export interface PartnerIngressHandoffSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  partnerEntrySlug: string;
  drtsPassengerId: string;
  identity: {
    actorType: "referral_passenger";
    actorId: string;
    realm: "partner";
    authMode: "jwt_bearer";
    roleFamilies: ["partner"];
    roles: string[];
    scopes: string[];
    tenantId: string | null;
    partnerId: string | null;
    partnerProgramId: string | null;
    partnerEntrySlug: string;
    drtsPassengerId: string;
  };
}

export interface CreateReferralPassengerBookingCommand {
  quoteId: string;
  entrySlug: string;
  /** Optional only for exact replay of already committed pre-fee commands. */
  feeDisclosureVersion?: string;
  feeConfirmed?: boolean;
  partnerUserRef?: string;
  passengerName?: string;
  passengerPhone?: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType?: string;
  idempotencyKey?: string;
  scheduledAt?: string;
}

export interface CancelReferralPassengerTripCommand {
  orderId: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface SubmitReferralPassengerRatingCommand {
  orderId: string;
  score: 1 | 2 | 3 | 4 | 5;
  contactRequested: boolean;
  comment?: string;
  tags?: string[];
  idempotencyKey?: string;
}

export interface ReferralPassengerQuoteCommand {
  entrySlug: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt?: string;
  vehicleType?: string;
}

/** An immutable referral-owned estimate, never an amount collected from a rider. */
export interface ReferralPassengerFareQuoteRecord {
  quoteId: string;
  tenantId: string;
  partnerId: string;
  partnerProgramId: string;
  entrySlug: string;
  drtsPassengerId: string;
  businessDispatchSubtype: string;
  serviceProductCode: string;
  timingMode: "immediate" | "scheduled";
  requestedScheduledAt: string | null;
  pricingAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  vehicleType: string | null;
  currency: "TWD";
  estimatedMin: number;
  estimatedMax: number;
  estimatedMinMinor: number;
  estimatedMaxMinor: number;
  fixedPrice: false;
  isGuaranteed: false;
  quotedFareSource: "platform_pricing_rule";
  quotedFareRuleVersion: string;
  tariffSnapshot: Record<string, unknown>;
  /** Absent on historical quotes, which may only be replayed after commit. */
  feeDisclosureVersion?: string;
  feeContentHash?: string;
  route: Record<string, unknown>;
  breakdown: Record<string, unknown>;
  serviceAreaEvaluation: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  consumedByOrderId: string | null;
  consumedAt: string | null;
}

export interface ReferralFeeOwner {
  tenantId: string;
  partnerId: string;
  partnerProgramId: string;
  entrySlug: string;
  drtsPassengerId: string;
}
export interface ReferralFeeAcknowledgement extends ReferralFeeOwner {
  disclosureVersion: string;
  contentHash: string;
  acknowledgedAt: string;
}
export interface ReferralFeeStatus {
  disclosureVersion: string;
  contentHash: string;
  acknowledgedAt: string | null;
}
export interface AcknowledgeReferralFeesCommand {
  disclosureVersion: string;
  acknowledged: true;
}
export interface ReferralOrderFeeConfirmation extends ReferralFeeOwner {
  orderId: string;
  quoteId: string;
  disclosureVersion: string;
  contentHash: string;
  quotedFareRuleVersion: string;
  acknowledgedAt: string;
  feeConfirmedAt: string;
  summary: {
    pickupAddress: string;
    dropoffAddress: string;
    requestedScheduledAt: string | null;
    vehicleType: string | null;
    estimatedMin: number;
    estimatedMax: number;
  };
}
export interface ReferralBookingIntent {
  feeDisclosureVersion?: string;
  feeConfirmed?: boolean;
  entrySlug: string;
  quoteId: string;
  pickupAddress: string;
  dropoffAddress: string;
  timingMode: "immediate" | "scheduled";
  requestedScheduledAt: string | null;
  vehicleType: string | null;
  passengerName: string;
  passengerPhone: string;
  partnerUserRef: string | null;
}

/** Public immutable estimate; server ownership and full tariff authority remain private. */
export type ReferralPassengerFareQuote = Pick<
  ReferralPassengerFareQuoteRecord,
  | "quoteId"
  | "businessDispatchSubtype"
  | "serviceProductCode"
  | "timingMode"
  | "requestedScheduledAt"
  | "pricingAt"
  | "pickupAddress"
  | "dropoffAddress"
  | "pickup"
  | "dropoff"
  | "vehicleType"
  | "currency"
  | "estimatedMin"
  | "estimatedMax"
  | "estimatedMinMinor"
  | "estimatedMaxMinor"
  | "fixedPrice"
  | "isGuaranteed"
  | "quotedFareSource"
  | "quotedFareRuleVersion"
  | "feeDisclosureVersion"
  | "feeContentHash"
  | "createdAt"
  | "expiresAt"
  | "consumedByOrderId"
  | "consumedAt"
>;

/** Ordinary, voluntary complaints; distinct from immutable trip ratings. */
export type ReferralPassengerComplaintCategory =
  | "service"
  | "fare"
  | "lost_item";
export interface SubmitReferralPassengerComplaintCommand {
  orderId: string;
  category: ReferralPassengerComplaintCategory;
  content: string;
  lostItemDescription?: string;
  contactRequested: boolean;
  idempotencyKey: string;
}
/** Canonical linkage stored with the same owned order/CRM transaction. */
export interface ReferralPassengerComplaintSubmission {
  caseNo: string;
  createdTimelineId: string;
  command: SubmitReferralPassengerComplaintCommand;
  submittedAt: string;
}
export interface ReferralPassengerComplaintRecord {
  orderId: string;
  caseNo: string;
  category: ReferralPassengerComplaintCategory;
  content: string;
  lostItemDescription: string | null;
  contactRequested: boolean;
  idempotencyKey: string;
  submittedAt: string;
  status: string;
  updatedAt: string;
  slaDueAt: string;
}

export interface ReferralPassengerRatingResult {
  orderId: string;
  score: number;
  comment: string | null;
  tags: string[];
  contactRequested: boolean | null;
  complaintCaseNo: string | null;
  submittedAt: string;
}

/** Read-only snapshot of the existing cancellation command policy. */
export interface ReferralPassengerCancellationWindow {
  canCancel: boolean;
  /** Exact existing policy deadline, or null when no finite deadline applies. */
  cancelableUntil: string | null;
  /** Server evaluation time; the command still checks its current order state. */
  asOf: string;
}

export interface ReferralPassengerLiveTracking {
  assignmentId: string;
  driverId: string;
  vehicleId: string;
  observedAt: string;
  locationFreshness: "fresh" | "stale" | "low_accuracy" | "missing";
  location: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    recordedAt: string;
  } | null;
  pickupEta: {
    minutes: number;
    calculatedAt: string;
    estimatedArrivalAt: string;
  } | null;
  dropoffRoute: {
    remainingDistanceMeters: number;
    remainingDurationSeconds: number;
    generatedAt: string;
    estimatedArrivalAt: string;
    provider: string;
  } | null;
  /**
   * This order's own resolved pickup and drop-off points, so the trip map can
   * show where the vehicle is heading. Optional during rolling releases.
   */
  pickupPoint?: { lat: number; lng: number } | null;
  dropoffPoint?: { lat: number; lng: number } | null;
}

export interface ReferralPassengerTripSnapshot {
  orderId: string;
  orderNo: string;
  status: string;
  statusCode: string;
  etaMin: number | null;
  liveTracking?: ReferralPassengerLiveTracking | null;
  /** @deprecated Approximate remaining minutes; use cancellationWindow for policy. */
  cancelWindowMin: number;
  /** Optional during rolling releases. Absence never asserts permission/denial. */
  cancellationWindow?: ReferralPassengerCancellationWindow;
  pickupAddress: string;
  dropoffAddress: string;
  driverName: string | null;
  driverPhoneMasked: string | null;
  plateNumber: string | null;
  vehicleType: string;
  estimatedFare: number | null;
  createdAt: string;
  updatedAt: string;
  rated: boolean;
  quote?: ReferralPassengerFareQuote | null;
  confirmedAt?: string | null;
  feeConfirmation?: ReferralOrderFeeConfirmation | null;
  rating?: ReferralPassengerRatingResult | null;
}

export interface ReferralPassengerActiveTripResult {
  active: boolean;
  trip: ReferralPassengerTripSnapshot | null;
}

export interface ReferralPassengerHistoryItem {
  orderId: string;
  orderNo: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  fareTotal: number | null;
  formattedFare: string;
  cancelledAt?: string | null;
  completedAt: string | null;
  createdAt: string;
  quote?: ReferralPassengerFareQuote | null;
  confirmedAt?: string | null;
  feeConfirmation?: ReferralOrderFeeConfirmation | null;
  rating?: ReferralPassengerRatingResult | null;
}

export interface ReferralPassengerReceiptPdfDocument {
  orderId: string;
  fileName: string;
  mimeType: "application/pdf";
  contentBase64: string;
  bytes: number;
  sha256: string;
  formalTaxReceipt: false;
}

export interface ReferralPassengerReceipt {
  orderId: string;
  orderNo: string;
  status: string;
  completedAt: string | null;
  passengerNameMasked: string;
  passengerPhoneMasked: string;
  driverName: string | null;
  plateNumber: string | null;
  vehicleType: string;
  pickupAddress: string;
  dropoffAddress: string;
  fareBase: number | null;
  fareDistance: number | null;
  fareTime: number | null;
  fareNight?: number | null;
  totalFare: number | null;
  formattedTotal: string;
  paymentChannel: string;
  downloadUrl?: string;
  quote?: ReferralPassengerFareQuote | null;
  confirmedAt?: string | null;
  feeConfirmation?: ReferralOrderFeeConfirmation | null;
  /**
   * E-04 ride-certificate fields, read from the same completed order/task,
   * driver, vehicle, operator and payment-method authorities the formal
   * certificate uses. `null`/absent means the authority has no value; the
   * shared builder below renders it as 未提供 and never substitutes one.
   */
  fleetOperatorName?: string | null;
  /** Completion-time declared surname (not identity verification). */
  driverSurname?: string | null;
  driverSurnameSource?: string | null;
  driverRegistrationMasked?: string | null;
  /** Canonical task.startedAt / task.completedAt. */
  pickupAt?: string | null;
  dropoffAt?: string | null;
  /** Canonical task.actualDistanceKm in metres, as the E-04 event stores it. */
  distanceMeters?: number | null;
  /** Bound method + masked card display from the payment-method authority. */
  paymentMethodDisplay?: string | null;
  /** Formally issued certificate number only; never an order number. */
  certificateNo?: string | null;
}

/** Missing-value text shared by the Referral receipt screen, TXT and PDF. */
export const REFERRAL_RECEIPT_MISSING_VALUE = "未提供";
export const REFERRAL_RECEIPT_CONSUMER_SERVICE_PHONE = "02-2944-0985";
export const REFERRAL_RECEIPT_AUTHORITY_COMPLAINT_PHONE = "1999";
export const REFERRAL_RECEIPT_NOT_TAX_RECEIPT_NOTICE =
  "乘車紀錄，非正式稅務憑證；付款及結算狀態以實際通知為準。";

/** E-04 ride-certificate field labels, shared with the formal certificate renderer. */
export const E04_CERTIFICATE_FIELD_LABELS = {
  fleetOperatorName: "車隊／派遣業者",
  plateNo: "車牌",
  pickupAt: "上車時間",
  dropoffAt: "下車時間",
  routeSummary: "路線",
  fareStart: "起程",
  fareDistance: "續程",
  fareDelay: "延滯計時",
  fareNight: "夜間加成",
  fareTotal: "車資合計",
  paymentMethod: "支付方式",
  consumerServicePhone: "客服電話",
  authorityComplaintPhone: "主管機關申訴電話",
} as const;

const ALREADY_MASKED_SURNAME_SUFFIXES = ["○○", "**", "＊＊"];

/** Fixed-length public redaction; not a claim about the real surname length. */
export function formatE04MaskedSurname(surname: string): string {
  const trimmed = surname.trim();
  if (!trimmed) return trimmed;
  return ALREADY_MASKED_SURNAME_SUFFIXES.some((suffix) =>
    trimmed.endsWith(suffix),
  )
    ? trimmed
    : `${trimmed}○○`;
}

/** yyyy/MM/dd HH:mm:ss in Asia/Taipei; null for an absent/invalid instant. */
export function formatReferralReceiptTaipeiTime(
  value: string | null | undefined,
): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export type ReferralReceiptE04FieldKey =
  | "certificateNo"
  | "fleetOperatorName"
  | "driverName"
  | "driverSurname"
  | "driverRegistrationMasked"
  | "plateNo"
  | "pickupAt"
  | "dropoffAt"
  | "routeSummary"
  | "distance"
  | "fareStart"
  | "fareDistance"
  | "fareDelay"
  | "fareNight"
  | "fareTotal"
  | "paymentMethod"
  | "consumerServicePhone"
  | "authorityComplaintPhone";

export interface ReferralReceiptE04Field {
  key: ReferralReceiptE04FieldKey;
  label: string;
  value: string;
  /** False when the authority has no value and 未提供 is shown. */
  provided: boolean;
}

/**
 * The one E-04 field set for the Referral receipt screen, TXT and PDF. Pure,
 * so the browser view and the server documents cannot drift apart. It only
 * formats facts already on the receipt; it never issues a certificate,
 * asserts payment, or fills a gap from IDs, quotes or sample values.
 */
export function buildReferralReceiptE04Fields(
  receipt: ReferralPassengerReceipt,
): ReferralReceiptE04Field[] {
  const text = (input: string | null | undefined) => {
    const trimmed = typeof input === "string" ? input.trim() : "";
    return trimmed ? trimmed : null;
  };
  const money = (input: number | null | undefined) =>
    typeof input === "number" && Number.isFinite(input) && input >= 0
      ? `NT$ ${input}`
      : null;
  const surname = text(receipt.driverSurname);
  const pickup = text(receipt.pickupAddress);
  const dropoff = text(receipt.dropoffAddress);
  const distance =
    typeof receipt.distanceMeters === "number" &&
    Number.isFinite(receipt.distanceMeters) &&
    receipt.distanceMeters >= 0
      ? `${(receipt.distanceMeters / 1000).toFixed(2)} 公里（${receipt.distanceMeters} 公尺）`
      : null;
  const labels = E04_CERTIFICATE_FIELD_LABELS;
  const rows: Array<[ReferralReceiptE04FieldKey, string, string | null]> = [
    ["certificateNo", "證明編號", text(receipt.certificateNo)],
    [
      "fleetOperatorName",
      labels.fleetOperatorName,
      text(receipt.fleetOperatorName),
    ],
    ["driverName", "司機", text(receipt.driverName)],
    [
      "driverSurname",
      receipt.driverSurnameSource === "driver_profile_declared"
        ? "駕駛自填姓氏（非身分核驗）"
        : "駕駛姓氏",
      surname ? formatE04MaskedSurname(surname) : null,
    ],
    [
      "driverRegistrationMasked",
      "執業登記證號（遮碼）",
      text(receipt.driverRegistrationMasked),
    ],
    ["plateNo", labels.plateNo, text(receipt.plateNumber)],
    [
      "pickupAt",
      `${labels.pickupAt}（臺灣）`,
      formatReferralReceiptTaipeiTime(receipt.pickupAt),
    ],
    [
      "dropoffAt",
      `${labels.dropoffAt}（臺灣）`,
      formatReferralReceiptTaipeiTime(receipt.dropoffAt),
    ],
    [
      "routeSummary",
      labels.routeSummary,
      pickup && dropoff ? `${pickup} → ${dropoff}` : null,
    ],
    ["distance", "實際里程", distance],
    ["fareStart", labels.fareStart, money(receipt.fareBase)],
    ["fareDistance", labels.fareDistance, money(receipt.fareDistance)],
    ["fareDelay", labels.fareDelay, money(receipt.fareTime)],
    ["fareNight", labels.fareNight, money(receipt.fareNight)],
    ["fareTotal", labels.fareTotal, money(receipt.totalFare)],
    ["paymentMethod", labels.paymentMethod, text(receipt.paymentMethodDisplay)],
    [
      "consumerServicePhone",
      labels.consumerServicePhone,
      REFERRAL_RECEIPT_CONSUMER_SERVICE_PHONE,
    ],
    [
      "authorityComplaintPhone",
      labels.authorityComplaintPhone,
      REFERRAL_RECEIPT_AUTHORITY_COMPLAINT_PHONE,
    ],
  ];
  return rows.map(([key, label, value]) => ({
    key,
    label,
    value: value ?? REFERRAL_RECEIPT_MISSING_VALUE,
    provided: value !== null,
  }));
}

export interface ResolvePartnerNotificationNavigationCommand {
  entrySlug: string;
  rideRef: string;
  partnerUserRef: string;
}

export interface PartnerNotificationNavigationResolution {
  handoffArtifact: ReferralEmbedHandoffArtifact;
  destinationUrl: string;
}
