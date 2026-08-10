import { describe, expect, it } from "vitest";

import {
  formatReferralPortalEvidence,
  mergeReferralPortalEvidence,
  type ReferralPortalEvidence,
} from "../../apps/channel-partner-portal-web/lib/referral-portal-evidence";

function makeEvidence(
  source: "live" | "fallback",
  sourceDetails?: Record<string, "live" | "fallback">,
): ReferralPortalEvidence {
  return {
    actorType: "partner_api_key",
    partnerEntrySlug: "yuhe-residence",
    scopes: ["billing:read"],
    source,
    ...(sourceDetails ? { sourceDetails } : {}),
  };
}

describe("channel partner portal data evidence", () => {
  it("aggregates dashboard and revenue sources fail-closed", () => {
    const merged = mergeReferralPortalEvidence(
      makeEvidence("live", { dashboard: "live" }),
      makeEvidence("fallback", { revenue: "fallback" }),
    );

    expect(merged.source).toBe("fallback");
    expect(merged.sourceDetails).toEqual({
      dashboard: "live",
      revenue: "fallback",
    });
    expect(formatReferralPortalEvidence(merged)).toContain(
      "drts-data-source:fallback",
    );
    expect(formatReferralPortalEvidence(merged)).toContain(
      "drts-data-source-dashboard:live",
    );
    expect(formatReferralPortalEvidence(merged)).toContain(
      "drts-data-source-revenue:fallback",
    );
  });
});
