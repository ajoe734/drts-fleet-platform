import { afterEach, describe, expect, it, vi } from "vitest";

import { validateInternalKey } from "../../apps/api/src/common/auth/internal-key.middleware";
import { DriverActivationLinksController } from "../../apps/api/src/modules/auth/driver-activation-links.controller";

describe("Driver activation HTTPS association", () => {
  const controller = new DriverActivationLinksController();
  afterEach(() => vi.unstubAllEnvs());

  it("associates the iOS app only with the exact registration path", () => {
    vi.stubEnv(
      "DRIVER_ONBOARDING_IOS_APP_ID",
      "ABCDEFGHIJ.com.cctechsupport.drts.driver",
    );
    expect(controller.appleAssociation()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDEFGHIJ.com.cctechsupport.drts.driver"],
            components: [{ "/": "/driver-activate" }],
          },
        ],
      },
    });
  });

  it("publishes configured Android signing fingerprints for the driver package", () => {
    const fingerprint = new Array(32).fill("AA").join(":");
    vi.stubEnv(
      "DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS",
      `${fingerprint.toLowerCase()},${fingerprint}`,
    );
    expect(controller.androidAssociation()).toMatchObject([
      {
        target: {
          package_name: "com.cctechsupport.drts.driver",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ]);
  });

  it("keeps signature configuration fail-closed and browsers on a static fallback", () => {
    vi.stubEnv("DRIVER_ONBOARDING_IOS_APP_ID", "");
    vi.stubEnv("DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS", "invalid");
    expect(() => controller.appleAssociation()).toThrow(
      "association is unavailable",
    );
    expect(() => controller.androidAssociation()).toThrow(
      "association is unavailable",
    );
    expect(controller.activationFallback()).toContain("六位數代碼");
    expect(controller.activationFallback()).not.toMatch(
      /<script|drts-driver:|token=/i,
    );
  });
});

describe("Driver activation strict ingress", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["GET", "/.well-known/apple-app-site-association"],
    ["GET", "/.well-known/assetlinks.json"],
    ["GET", "/driver-activate"],
    ["POST", "/api/auth/driver/device/register"],
    ["POST", "/api/auth/driver/device/refresh"],
  ])(
    "routes %s %s to its own proof or public metadata handler",
    async (method, url) => {
      vi.stubEnv("DRTS_ENV", "production");
      await expect(
        validateInternalKey({ method, originalUrl: url }, "synthetic-key"),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    ["POST", "/driver-activate"],
    ["GET", "/.well-known/assetlinks.json/other"],
    ["POST", "/api/auth/driver/device/invite"],
    ["POST", "/api/auth/driver/device/revoke"],
  ])("keeps adjacent %s %s routes protected", async (method, url) => {
    vi.stubEnv("DRTS_ENV", "production");
    await expect(
      validateInternalKey({ method, originalUrl: url }, "synthetic-key"),
    ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
  });
});
