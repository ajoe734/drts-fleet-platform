import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function expectApiRequestCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`Expected ApiRequestError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe(code);
  }
}

describe("IAM credential expiry negative matrix", () => {
  it("fails closed for invalid tenant API key expiry windows", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const now = Date.now();

    const issued = await service.issueApiKey("tenant-demo-001", {
      keyName: "IAM-UAT bounded key",
      scopes: ["tenant:bookings:write", "tenant:reports:read"],
    });

    const defaultExpiry = Date.parse(issued.apiKey.expiresAt ?? "");
    expect(defaultExpiry).toBeGreaterThan(now + 50 * 24 * 60 * 60 * 1000);
    expect(defaultExpiry).toBeLessThan(now + 61 * 24 * 60 * 60 * 1000);
    expect(issued.apiKey.scopes).toEqual(["reports:read", "tenant:write"]);

    expectApiRequestCode(
      () =>
        service.issueApiKey("tenant-demo-001", {
          keyName: "IAM-UAT invalid key",
          scopes: ["tenant:write"],
          expiresAt: "not-an-iso-date",
        }),
      "TENANT_API_KEY_EXPIRY_INVALID",
    );

    expectApiRequestCode(
      () =>
        service.issueApiKey("tenant-demo-001", {
          keyName: "IAM-UAT past key",
          scopes: ["tenant:write"],
          expiresAt: new Date(now - 60_000).toISOString(),
        }),
      "TENANT_API_KEY_EXPIRY_PAST",
    );

    expectApiRequestCode(
      () =>
        service.issueApiKey("tenant-demo-001", {
          keyName: "IAM-UAT long key",
          scopes: ["tenant:write"],
          expiresAt: new Date(
            now + 120 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      "TENANT_API_KEY_EXPIRY_TOO_FAR",
    );
  });
});
