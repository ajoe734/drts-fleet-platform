import { describe, expect, it } from "vitest";

import { buildReferralPortalBootstrapContext } from "../../apps/channel-partner-portal-web/lib/referral-bootstrap-identity";

describe("channel partner portal bootstrap auth guard", () => {
  it("ignores public actor and scope override attempts", () => {
    const originalEnv = {
      DRTS_PARTNER_ID: process.env.DRTS_PARTNER_ID,
      DRTS_TENANT_ID: process.env.DRTS_TENANT_ID,
      DRTS_PARTNER_PROGRAM_ID: process.env.DRTS_PARTNER_PROGRAM_ID,
      DRTS_PARTNER_ENTRY_SLUG: process.env.DRTS_PARTNER_ENTRY_SLUG,
      DRTS_E2E_ACTOR_TYPE: process.env.DRTS_E2E_ACTOR_TYPE,
      DRTS_E2E_SCOPES: process.env.DRTS_E2E_SCOPES,
      DRTS_E2E_ENTRY_SLUG: process.env.DRTS_E2E_ENTRY_SLUG,
    };

    try {
      process.env.DRTS_PARTNER_ID = "partner-referral-demo-001";
      process.env.DRTS_TENANT_ID = "tenant-demo-001";
      process.env.DRTS_PARTNER_PROGRAM_ID = "program-referral-community";
      process.env.DRTS_PARTNER_ENTRY_SLUG = "referral-demo-community";
      process.env.DRTS_E2E_ACTOR_TYPE = "platform_admin";
      process.env.DRTS_E2E_SCOPES = "foundation:write,dispatch:write";
      process.env.DRTS_E2E_ENTRY_SLUG = "bogus-public-entry";

      const context = buildReferralPortalBootstrapContext();

      expect(context.partnerId).toBe("partner-referral-demo-001");
      expect(context.partnerEntrySlug).toBe("referral-demo-community");
      expect(context.defaultHeaders["x-actor-type"]).toBe("partner_api_key");
      expect(context.defaultHeaders["x-scopes"]).toBe("billing:read");
      expect(context.defaultHeaders["x-partner-entry-slug"]).toBe(
        "referral-demo-community",
      );
      expect(context.requestEvidence).toEqual({
        actorType: "partner_api_key",
        partnerEntrySlug: "referral-demo-community",
        scopes: ["billing:read"],
      });
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
