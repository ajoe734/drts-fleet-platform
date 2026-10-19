import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
import { headers } from "next/headers";
import { getServerFleetPartnerClient } from "./api-client.server";
let sessionPartnerId: string;
async function context(partnerId = "fleet-demo-001", selector?: string) {
  sessionPartnerId = partnerId;
  vi.mocked(headers).mockResolvedValue(
    new Headers({
      authorization: "Bearer existing-application-session",
      ...(selector ? { "x-fleet-partner-id": selector } : {}),
    }),
  );
}
describe("getServerFleetPartnerClient verified identity & scope resolution", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("JWT_SECRET", "server-fleet-principal-test-key");
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "");
    vi.stubEnv("DRTS_API_URL", "https://api.test");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    // Narrow selector unit seam. The companion principal/mounted suites run
    // the actual signed-session guard and controller; this is not issuer proof.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            active: true,
            identity: {
              realm: "partner",
              actorType: "partner_user",
              actorId: "verified-owner",
              partnerId: sessionPartnerId,
              scopes: ["billing:read"],
            },
          },
        }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("throws the configuration error when a verified principal has no configured or requested selector", async () => {
    await context();
    await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
      statusCode: 503,
      code: "FLEET_SELECTOR_REQUIRED",
    });
  });
  it("uses DRTS_FLEET_PARTNER_ID only when it matches the backend-verified principal", async () => {
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-demo-001");
    await context();
    expect((await getServerFleetPartnerClient()).fleetPartnerId).toBe(
      "fleet-demo-001",
    );
  });
  it("accepts a requested custom fleet only when it equals the verified canonical partnerId", async () => {
    await context("fleet-custom-999", "fleet-custom-999");
    expect((await getServerFleetPartnerClient()).fleetPartnerId).toBe(
      "fleet-custom-999",
    );
  });
  it("does not let a header override an independently configured conflicting fleet", async () => {
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-demo-001");
    await context("fleet-custom-999", "fleet-custom-999");
    await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
      statusCode: 403,
      code: "FLEET_SCOPE_DENIED",
    });
  });
  it("does not let environment or header selectors manufacture a missing principal", async () => {
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-demo-001");
    vi.mocked(headers).mockResolvedValue(
      new Headers({ "x-fleet-partner-id": "fleet-demo-001" }),
    );
    await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
      statusCode: 401,
      code: "FLEET_PRINCIPAL_REQUIRED",
    });
  });
});
