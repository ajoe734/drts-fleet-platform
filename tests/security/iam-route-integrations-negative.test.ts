import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { TeslaIntegrationService } from "../../apps/api/src/modules/tesla-integration/tesla-integration.service";

const driverIdentity: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "driver_user",
  actorId: "drv-demo-001",
  realm: "driver",
  tenantId: null,
  roleFamilies: ["driver"],
  roles: ["driver_user"],
  scopes: ["owned:read", "owned:write"],
  requestId: "iam-route-integrations-negative",
};

function createTeslaService() {
  return new TeslaIntegrationService(undefined, {
    listSupplyPairs: () => [
      { vehicleId: "veh-demo-001", driverId: "drv-demo-001" },
    ],
  } as never);
}

describe("IAM sandbox and Tesla route boundaries", () => {
  it("rejects a cross-driver vehicle target even with an owned scope", () => {
    const service = createTeslaService();

    expect(() =>
      service.assertIdentityCanAccessVehicle(driverIdentity, "veh-demo-004"),
    ).toThrow(ApiRequestError);

    try {
      service.assertIdentityCanAccessVehicle(driverIdentity, "veh-demo-004");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe(
        "TESLA_VEHICLE_BINDING_DENIED",
      );
    }
  });

  it("permits the canonical driver/vehicle assignment only", () => {
    expect(() =>
      createTeslaService().assertIdentityCanAccessVehicle(
        driverIdentity,
        "veh-demo-001",
      ),
    ).not.toThrow();
  });

  it("does not expose OAuth or virtual-key secret material in Tesla results", () => {
    const service = createTeslaService();
    const response = service.beginOAuth({
      businessAccountId: "biz-demo-001",
      region: "north_america",
      authorizationCode: "authorization-code-must-stay-server-side",
    });

    expect(response).not.toHaveProperty("authorizationCode");
    expect(response).not.toHaveProperty("accessToken");
    expect(response).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(response)).not.toContain(
      "authorization-code-must-stay-server-side",
    );
  });
});
