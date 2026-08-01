import { Injectable } from "@nestjs/common";

import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
  type PartnerUserIdentityLinkRecord,
  type ReferralRevenueShareRule,
} from "@drts/contracts";

const REFERRAL_REVENUE_SHARE_RULE_SEED: readonly ReferralRevenueShareRule[] =
  Object.freeze([
    Object.freeze({
      ruleId: "referral-rule-342de003-aed1-4f55-8dd2-bbd7738a2731",
      partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
      partnerEntrySlug: "yuhe-residence",
      rateType: "percent" as const,
      value: 10,
      currency: "TWD",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      createdAt: "2026-08-01T05:25:58.237Z",
      updatedAt: "2026-08-01T05:25:58.237Z",
    }),
    Object.freeze({
      ruleId: "referral-rule-demo-001",
      partnerId: "partner-referral-demo-001",
      partnerEntrySlug: "referral-demo-community",
      rateType: "percent" as const,
      value: 15,
      currency: "NTD",
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }),
  ]);

const PARTNER_USER_IDENTITY_LINK_SEED: readonly PartnerUserIdentityLinkRecord[] =
  Object.freeze([
    Object.freeze({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-demo-001",
      drtsPassengerId: "psg-demo-001",
      status: "active" as const,
      consentScope: "referral_attribution" as const,
      linkedAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-06-12T09:30:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-12T09:30:00.000Z",
    }),
  ]);

@Injectable()
export class ReferralChannelScaffoldService {
  listRevenueShareRules(entrySlug?: string): ReferralRevenueShareRule[] {
    return REFERRAL_REVENUE_SHARE_RULE_SEED.filter(
      (rule) => !entrySlug || rule.partnerEntrySlug === entrySlug,
    ).map((rule) => ({ ...rule }));
  }

  listIdentityLinks(entrySlug?: string): PartnerUserIdentityLinkRecord[] {
    return PARTNER_USER_IDENTITY_LINK_SEED.filter(
      (link) => !entrySlug || link.entrySlug === entrySlug,
    ).map((link) => ({ ...link }));
  }
}
