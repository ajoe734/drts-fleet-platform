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
