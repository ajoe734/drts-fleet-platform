import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { headers } from "next/headers";
import { getServerFleetPartnerClient } from "./api-client.server";

describe("getServerFleetPartnerClient identity & scope resolution", () => {
  const originalEnv = process.env.DRTS_FLEET_PARTNER_ID;

  beforeEach(() => {
    delete process.env.DRTS_FLEET_PARTNER_ID;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_FLEET_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_FLEET_PARTNER_ID;
    }
  });

  it("throws configuration error when DRTS_FLEET_PARTNER_ID and x-fleet-partner-id header are missing", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    await expect(getServerFleetPartnerClient()).rejects.toThrow(
      "Missing fleet scope configuration",
    );
  });

  it("uses DRTS_FLEET_PARTNER_ID from environment when set", async () => {
    process.env.DRTS_FLEET_PARTNER_ID = "fleet-demo-001";
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    const { fleetPartnerId } = await getServerFleetPartnerClient();
    expect(fleetPartnerId).toBe("fleet-demo-001");
  });

  it("prioritizes x-fleet-partner-id header over environment variable", async () => {
    process.env.DRTS_FLEET_PARTNER_ID = "fleet-demo-001";
    const reqHeaders = new Headers({
      "x-fleet-partner-id": "fleet-custom-999",
    });
    vi.mocked(headers).mockResolvedValueOnce(reqHeaders);

    const { fleetPartnerId } = await getServerFleetPartnerClient();
    expect(fleetPartnerId).toBe("fleet-custom-999");
  });
});
