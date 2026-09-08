import { describe, expect, it } from "vitest";
import { t as admin } from "../../../../apps/platform-admin-web/lib/translations";
import { translations as ops } from "../../../../apps/ops-console-web/lib/translations";
import { translations as fleet } from "../../../../apps/fleet-partner-portal-web/lib/translations";
import { translations as tenant } from "../../../../apps/tenant-console-web/lib/translations";

describe("SR-ENV-COPY-001 user-facing copy", () => {
  for (const locale of ["en", "zh"] as const) {
    it(`${locale}: keeps the real application ID while removing implementation names`, () => {
      const rendered = admin(
        "supplyReview.detail.confirmApproveIntro",
        locale,
        {
          submissionId: "application-123",
        },
      );
      expect(rendered).toContain("application-123");
      expect(rendered).not.toContain("submissionId");
      expect(admin("supplyReview.err.invalidId", locale)).not.toContain(
        "submissionId",
      );
      for (const value of Object.values(fleet[locale])) {
        expect(value).not.toContain("submissionId");
      }
    });
    it(`${locale}: avoids internal assistant instructions and unverified identity environment`, () => {
      for (const value of Object.values(ops[locale])) {
        expect(value).not.toContain("ActionIntent");
      }
      expect(tenant[locale]["users.identity.actorChip"]).toBe(
        "{actor} / {realm} / {tenantId}",
      );
      expect(ops[locale]["sos.detail.noAttachments"]).not.toMatch(
        /read model|live attachment/,
      );
    });
  }
});
