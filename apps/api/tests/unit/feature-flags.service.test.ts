import { describe, expect, it } from "vitest";

import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

describe("FeatureFlagsService", () => {
  it("seeds map and geofence rollout flags with disabled defaults", async () => {
    const service = new FeatureFlagsService();

    const flags = await service.getAll();
    const byKey = new Map(flags.map((flag) => [flag.key, flag]));

    expect(byKey.get("geoProviderEnabled")?.enabled).toBe(false);
    expect(byKey.get("addressMapPickerEnabled")?.enabled).toBe(false);
    expect(byKey.get("serviceAreaGateEnforced")?.enabled).toBe(false);
    expect(byKey.get("opsRealMapEnabled")?.enabled).toBe(false);
    expect(byKey.get("platformGeometryEditorEnabled")?.enabled).toBe(false);
    expect(byKey.get("driverTripMapEnabled")?.enabled).toBe(false);
  });
});
