import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { TenantsService } from "../../apps/api/src/modules/platform-admin/tenants.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("default tenant authority fences", () => {
  it("does not seed the demo tenant in production", () => {
    process.env.APP_ENV = "production";

    const service = new TenantsService({
      recordAuditLog: () => undefined,
    } as never);

    expect(service.list()).toEqual([]);
  });

  it("forbids default tenant fallback in production", () => {
    process.env.APP_ENV = "production";

    const service = Object.create(
      TenantPartnerService.prototype,
    ) as TenantPartnerService;

    let error: ApiRequestError | null = null;
    try {
      service.getDefaultTenantId();
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("DEFAULT_TENANT_FORBIDDEN");
  });
});
