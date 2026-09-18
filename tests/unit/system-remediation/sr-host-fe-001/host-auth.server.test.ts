import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only — host-auth.server.ts is a server-only module.
vi.mock("server-only", () => ({}));

// Mock next/headers — same pattern as
// apps/fleet-partner-portal-web/lib/api-client.server.test.ts.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { headers } from "next/headers";
import { getServerHostClient } from "../../../../apps/fleet-partner-portal-web/app/host/lib/host-auth.server";

describe("SR-HOST-FE-001: getServerHostClient identity & scope resolution", () => {
  const originalEnv = process.env.DRTS_HOST_PARTNER_ID;

  beforeEach(() => {
    delete process.env.DRTS_HOST_PARTNER_ID;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_HOST_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_HOST_PARTNER_ID;
    }
  });

  it("throws a distinct configuration error when DRTS_HOST_PARTNER_ID and x-host-partner-id header are both missing", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    await expect(getServerHostClient()).rejects.toThrow(
      "Missing host scope configuration",
    );
  });

  it("resolves the partner id from DRTS_HOST_PARTNER_ID when set", async () => {
    process.env.DRTS_HOST_PARTNER_ID = "host-partner-001";
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    const { partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-001");
  });

  it("prefers the inbound x-host-partner-id header over the environment override", async () => {
    process.env.DRTS_HOST_PARTNER_ID = "host-partner-env";
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "x-host-partner-id": "host-partner-header" }),
    );

    const { partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-header");
  });

  it("never reuses the fleet-admin x-fleet-partner-id header (different actor, different scope)", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "x-fleet-partner-id": "fleet-admin-001" }),
    );

    await expect(getServerHostClient()).rejects.toThrow(
      "Missing host scope configuration",
    );
  });
});
