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

export interface ReferralPassengerTripSnapshot {
  orderId: string;
  orderNo: string;
  status: string;
  statusCode: string;
  etaMin: number | null;
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
  completedAt: string | null;
  createdAt: string;
  quote?: ReferralPassengerFareQuote | null;
  confirmedAt?: string | null;
  feeConfirmation?: ReferralOrderFeeConfirmation | null;
  rating?: ReferralPassengerRatingResult | null;
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
