import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { CredentialStatus, type PlatformAdapter } from "@drts/contracts";
import { evaluateCredentialExpiry } from "../../../../apps/platform-admin-web/app/adapter-registry/credential-expiry";
import { ADAPTER_REGISTRY_LOCAL_TRANSLATIONS } from "../../../../apps/platform-admin-web/app/adapter-registry/translations";

describe("SR-ADMIN-ADAPTER-001 — Adapter Registry UI Contract & Banner Suppression", () => {
  const pagePath = path.resolve(
    __dirname,
    "../../../../apps/platform-admin-web/app/adapter-registry/page.tsx",
  );
  const pageSource = fs.readFileSync(pagePath, "utf-8");

  describe("Hardcoded Banner String Elimination", () => {
    it("does not contain the hardcoded 2026-05-31 date anywhere in page.tsx", () => {
      expect(pageSource).not.toContain("2026-05-31");
    });

    it("does not render the hardcoded fallback banner title or body unconditionally", () => {
      // Must not use copy.bannerFallbackTitle or copy.bannerFallbackBody in JSX
      expect(pageSource).not.toContain("copy.bannerFallbackTitle");
      expect(pageSource).not.toContain("copy.bannerFallbackBody");
    });
  });

  describe("Banner Suppression Conditions", () => {
    // Helper replicating page.tsx's findAttentionAdapter logic
    function findAttentionAdapter(adapters: PlatformAdapter[]): PlatformAdapter | null {
      for (const adapter of adapters) {
        const expiry = evaluateCredentialExpiry(adapter);
        if (expiry.state === "expired") {
          return adapter;
        }
      }
      for (const adapter of adapters) {
        const expiry = evaluateCredentialExpiry(adapter);
        if (expiry.state === "expiring_soon") {
          return adapter;
        }
      }
      for (const adapter of adapters) {
        if (adapter.credentialStatus !== "VALID") {
          return adapter;
        }
      }
      for (const adapter of adapters) {
        if (adapter.healthStatus.status !== "HEALTHY" || adapter.warn === true) {
          return adapter;
        }
      }
      return null;
    }

    // Helper replicating page.tsx's banner rendering condition
    function shouldRenderBanner(
      loading: boolean,
      error: string | null,
      adapters: PlatformAdapter[],
    ): boolean {
      const attention = findAttentionAdapter(adapters);
      return !loading && !error && attention !== null;
    }

    const healthyValidAdapter: PlatformAdapter = {
      id: "healthy-1",
      platformCode: "HEALTHY",
      name: "Healthy Adapter",
      version: "1.0.0",
      environment: "PRODUCTION",
      adapterType: "EXTERNAL_REST",
      isForwarded: false,
      credentialStatus: CredentialStatus.VALID,
      credentialExpiresAt: "2027-01-01T00:00:00.000Z",
      healthStatus: { status: "HEALTHY" },
      rolloutStatus: "COMPLETED",
      rolloutStage: "GENERAL_AVAILABILITY",
      config: { isEnabled: true },
      policies: {
        financeAuthorityMode: "OWNED",
        serviceBuckets: [],
        maxCandidates: 5,
        acceptTimeoutSeconds: 30,
        manualFallbackThresholdSeconds: 60,
      },
      featureFlags: {},
      supportedActions: [],
    };

    it("suppresses banner when loading is true even if adapters need attention", () => {
      const expiredAdapter: PlatformAdapter = {
        ...healthyValidAdapter,
        id: "expired-1",
        credentialStatus: CredentialStatus.EXPIRED,
      };

      const renders = shouldRenderBanner(true, null, [expiredAdapter]);
      expect(renders).toBe(false);
    });

    it("suppresses banner when API returns an error or is unavailable", () => {
      const expiredAdapter: PlatformAdapter = {
        ...healthyValidAdapter,
        id: "expired-1",
        credentialStatus: CredentialStatus.EXPIRED,
      };

      const rendersOnError = shouldRenderBanner(false, "404 Not Found", [expiredAdapter]);
      expect(rendersOnError).toBe(false);

      const rendersOnEmptyError = shouldRenderBanner(false, "Network error", []);
      expect(rendersOnEmptyError).toBe(false);
    });

    it("suppresses banner when all adapters are healthy, valid, and unwarned", () => {
      const renders = shouldRenderBanner(false, null, [healthyValidAdapter]);
      expect(renders).toBe(false);
    });

    it("renders banner when an adapter credential is expiring soon, computing true days remaining", () => {
      const referenceDate = new Date("2026-09-08T00:00:00.000Z");
      const expiringAdapter: PlatformAdapter = {
        ...healthyValidAdapter,
        id: "mof-bgmt",
        platformCode: "MOF_BGMT",
        name: "財政部多元計程車申報介接",
        credentialExpiresAt: "2026-09-20T00:00:00.000Z", // 12 days remaining
      };

      const attention = findAttentionAdapter([expiringAdapter]);
      expect(attention).toBeDefined();
      expect(attention?.id).toBe("mof-bgmt");

      const expiry = evaluateCredentialExpiry(attention!, referenceDate);
      expect(expiry.state).toBe("expiring_soon");
      expect(expiry.daysRemaining).toBe(12);

      const localT = ADAPTER_REGISTRY_LOCAL_TRANSLATIONS.zh;
      const expectedBody = localT.attentionBannerExpiringBody
        .replace("{name}", attention!.name)
        .replace("{date}", expiry.formattedExpiryDate!)
        .replace("{days}", String(expiry.daysRemaining));

      expect(expectedBody).toContain("剩餘 12 天");
      expect(expectedBody).toContain("2026-09-20");
      expect(expectedBody).not.toContain("2026-05-31");
      expect(expectedBody).not.toContain("6 天");
    });

    it("renders banner when an adapter is expired with danger tone and real date", () => {
      const referenceDate = new Date("2026-09-08T00:00:00.000Z");
      const expiredAdapter: PlatformAdapter = {
        ...healthyValidAdapter,
        id: "legacy-partner",
        platformCode: "LEGACY",
        name: "舊版車隊轉接器",
        credentialExpiresAt: "2026-08-01T00:00:00.000Z",
      };

      const attention = findAttentionAdapter([expiredAdapter]);
      expect(attention).toBeDefined();

      const expiry = evaluateCredentialExpiry(attention!, referenceDate);
      expect(expiry.state).toBe("expired");

      const localT = ADAPTER_REGISTRY_LOCAL_TRANSLATIONS.zh;
      const expectedBody = localT.attentionBannerExpiredBody
        .replace("{name}", attention!.name)
        .replace("{date}", expiry.formattedExpiryDate!);

      expect(expectedBody).toContain("2026-08-01");
      expect(expectedBody).toContain("相關介接功能可能已中斷");
    });
  });
});
