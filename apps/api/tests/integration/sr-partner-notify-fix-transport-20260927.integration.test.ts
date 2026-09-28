import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { partnerNotificationHttpsFetch } from "../../src/modules/tenant-partner/partner-notification-https";

describe("explicit_controlled_receiver_optin_tested", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails locally if test env but DRTS_ALLOW_LOCAL_WEBHOOKS is not explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // DRTS_ALLOW_LOCAL_WEBHOOKS is unset
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:80/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("fails locally if production even if DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:80/`)).rejects.toThrow("partner_endpoint_not_public_https");
  });

  it("succeeds locally if test env and DRTS_ALLOW_LOCAL_WEBHOOKS is explicitly true (mock external)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ALLOW_LOCAL_WEBHOOKS", "true");
    // Explicit opt-in allows the fetch to proceed (thus hitting ECONNREFUSED) without throwing the security exception
    await expect(partnerNotificationHttpsFetch(`http://127.0.0.1:80/`)).rejects.toThrowError(
        /ECONNREFUSED|ENOTFOUND|EADDRNOTAVAIL/
      );
  });
});
