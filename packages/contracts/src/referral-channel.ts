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
  apiKey?: string;
  partnerUserRef: string;
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
  drtsPassengerId: string;
  consentRequired: boolean;
  consentBundleVersion: string | null;
}

export interface ConsumeReferralEmbedHandoffArtifactCommand {
  artifact: string;
  entrySlug: string;
  entryHost: string;
}

export interface RecordReferralEmbedConsentCommand {
  handoffId: string;
  entrySlug: string;
  entryHost: string;
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
  drtsPassengerId: string;
  identityActive: boolean;
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
