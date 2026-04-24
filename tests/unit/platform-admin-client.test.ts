import { describe, expect, it } from "vitest";

import { getPlatformAdminClient } from "../../apps/platform-admin-web/lib/platform-admin-client-factory";

describe("platform admin client stability", () => {
  it("reuses the same client for the same control-plane proxy base URL", () => {
    const baseUrl = "/control-plane-proxy";

    const first = getPlatformAdminClient(baseUrl);
    const second = getPlatformAdminClient(baseUrl);

    expect(second).toBe(first);
  });

  it("creates distinct clients for distinct base URLs", () => {
    const controlPlaneClient = getPlatformAdminClient("/control-plane-proxy");
    const directApiClient = getPlatformAdminClient(
      "https://api.staging.drts-fleet.cctech-support.com",
    );

    expect(directApiClient).not.toBe(controlPlaneClient);
  });
});
