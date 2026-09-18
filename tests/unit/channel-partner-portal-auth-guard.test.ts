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
      process.env.DRTS_PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
      process.env.DRTS_TENANT_ID = "tenant-demo-001";
      process.env.DRTS_PARTNER_PROGRAM_ID = "program-referral-community";
      process.env.DRTS_PARTNER_ENTRY_SLUG = "yuhe-residence";
      process.env.DRTS_E2E_ACTOR_TYPE = "platform_admin";
      process.env.DRTS_E2E_SCOPES = "foundation:write,dispatch:write";
      process.env.DRTS_E2E_ENTRY_SLUG = "bogus-public-entry";

      const context = buildReferralPortalBootstrapContext();

      expect(context.partnerId).toBe("partner_ead6bf3d-e858-47cc-bfe1-5a3742524118");
      expect(context.partnerEntrySlug).toBe("yuhe-residence");
      expect(context.defaultHeaders["x-actor-type"]).toBe("partner_api_key");
      expect(context.defaultHeaders["x-scopes"]).toBe("billing:read");
      expect(context.defaultHeaders["x-partner-entry-slug"]).toBe(
        "yuhe-residence",
      );
      expect(context.requestEvidence).toEqual({
        actorType: "partner_api_key",
        partnerEntrySlug: "yuhe-residence",
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

  it("throws explicit configuration error in deployed Dev when formal identity env vars are absent", () => {
    const originalEnv = {
      DRTS_ENV: process.env.DRTS_ENV,
      NODE_ENV: process.env.NODE_ENV,
      DRTS_PARTNER_ID: process.env.DRTS_PARTNER_ID,
      DRTS_TENANT_ID: process.env.DRTS_TENANT_ID,
      DRTS_PARTNER_PROGRAM_ID: process.env.DRTS_PARTNER_PROGRAM_ID,
      DRTS_PARTNER_ENTRY_SLUG: process.env.DRTS_PARTNER_ENTRY_SLUG,
    };

    try {
      process.env.DRTS_ENV = "development";
      process.env.NODE_ENV = "production";
      delete process.env.DRTS_PARTNER_ID;
      delete process.env.DRTS_TENANT_ID;
      delete process.env.DRTS_PARTNER_PROGRAM_ID;
      delete process.env.DRTS_PARTNER_ENTRY_SLUG;

      expect(() => buildReferralPortalBootstrapContext()).toThrow(
        "Missing formal channel partner configuration",
      );
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

