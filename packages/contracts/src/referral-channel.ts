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
