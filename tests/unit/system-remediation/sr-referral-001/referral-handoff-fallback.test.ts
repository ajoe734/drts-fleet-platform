import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  parseAllowedEntryHosts,
  buildEmbedSecurityDecision,
  CANONICAL_PARTNER_ENTRY_HOSTS,
} from "../../../../apps/referral-embed-web/lib/embed-security";
import { middleware } from "../../../../apps/referral-embed-web/middleware";
import { GET as sessionGetRoute } from "../../../../apps/referral-embed-web/app/api/referral/session/route";
import * as embedApi from "../../../../apps/referral-embed-web/lib/embed-api";
import * as embedPartnerSession from "../../../../apps/referral-embed-web/lib/embed-partner-session";
import {
  resolveEmbedContext,
  buildStandaloneFallbackUrl,
} from "../../../../apps/referral-embed-web/lib/embed-context";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import type { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function buildAuthorityError(status: number, code: string): embedApi.EmbedAuthorityError {
  return Object.assign(new Error(code), {
    name: "EmbedAuthorityError" as const,
    status,
    code,
    details: undefined,
    retryable: false,
  });
}

const mockPartnerEntry = {
  partnerId: "partner_yuhe",
  partnerCode: "yuhe",
  partnerType: "referral_channel" as const,
  programId: "program-referral-community",
  programCode: "REFERRAL_COMMUNITY",
  tenantId: "tenant_demo",
  bankCode: null,
  entrySlug: "yuhe-residence",
  displayName: "御和物業",
  businessDispatchSubtype: "enterprise_dispatch" as const,
  authMode: "partner_api_key" as const,
  eligibilityMode: "none" as const,
  entryHost: "app.yuhe-living.com.tw",
  entryPath: "/embed/yuhe-residence",
  themeAccent: "#0F766E",
  brandingMetadata: {
    displayName: "御和物業",
    themeAccent: "#0F766E",
    supportEmail: null,
    supportPhone: "0800-911-200",
  },
  eligibilityContract: null,
  status: "active" as const,
  activeFlag: true,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  createdAt: "2026-08-01T05:25:49.951Z",
  updatedAt: "2026-08-01T05:25:49.951Z",
  auditMetadata: {
    source: "platform_admin_console",
    requestId: "req-seed-001",
    createdBy: "platform_admin",
    updatedBy: "platform_admin",
  },
};

const mockValidSession = {
  handoffId: "handoff_valid_123",
  partnerEntrySlug: "yuhe-residence",
  entryHost: "app.yuhe-living.com.tw",
  drtsPassengerId: "pax_yuhe_001",
  identityActive: true,
  consent: {
    requiredScopes: ["trip.manage" as const, "pii.trip" as const, "identity.bind" as const],
    bundleVersion: "referral-embed-consent-v1-2026-08-01",
    grantedAt: "2026-09-06T06:00:00Z",
  },
  identity: {
    actorType: "referral_passenger" as const,
    actorId: "yuhe_user_777",
    realm: "partner" as const,
    authMode: "jwt_bearer" as const,
    roleFamilies: ["partner" as const],
    roles: ["referral_passenger"],
    scopes: ["trip.manage", "pii.trip", "identity.bind"],
    tenantId: "tenant_demo",
    partnerId: "partner_yuhe",
    partnerProgramId: "program-referral-community",
    partnerEntrySlug: "yuhe-residence",
    drtsPassengerId: "pax_yuhe_001",
  },
};

describe("SR-REFERRAL-001 Remediation Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("1. EntryHost Security & Canonical Allowlist Alignment", () => {
    it("defaults to canonical partner entry hosts when REFERRAL_EMBED_ALLOWED_HOSTS is unset", () => {
      delete process.env.REFERRAL_EMBED_ALLOWED_HOSTS;
      const hosts = parseAllowedEntryHosts(undefined);
      expect(hosts).toEqual(CANONICAL_PARTNER_ENTRY_HOSTS);
      expect(hosts).toContain("app.yuhe-living.com.tw");
      expect(hosts).toContain("localhost:3005");
    });

    it("allows formal entry host without env var configured, generating valid CSP and allowing frame", () => {
      delete process.env.REFERRAL_EMBED_ALLOWED_HOSTS;
      const decision = buildEmbedSecurityDecision({
        headers: new Headers({
          referer: "https://app.yuhe-living.com.tw/services/transport",
        }),
        requestUrl: new URL("https://referral.drts.tw/embed/yuhe-residence?entryHost=app.yuhe-living.com.tw"),
      });

      expect(decision.block).toBe(false);
      expect(decision.blockReason).toBeNull();
      expect(decision.xFrameOptions).toBeNull();
      expect(decision.contentSecurityPolicy).toContain("frame-ancestors https://app.yuhe-living.com.tw");
    });

    it("fails closed on unauthorized entryHost even when env var is unset", () => {
      delete process.env.REFERRAL_EMBED_ALLOWED_HOSTS;
      const decision = buildEmbedSecurityDecision({
        headers: new Headers(),
        requestUrl: new URL("https://referral.drts.tw/embed/yuhe-residence?entryHost=unauthorized.attacker.com"),
      });

      expect(decision.block).toBe(true);
      expect(decision.blockReason).toBe("entry_host_not_authorized");
      expect(decision.xFrameOptions).toBe("DENY");
      expect(decision.contentSecurityPolicy).toContain("frame-ancestors 'none'");
    });

    it("middleware returns 403 on unauthorized entryHost", () => {
      delete process.env.REFERRAL_EMBED_ALLOWED_HOSTS;
      const req = new NextRequest("https://referral.drts.tw/embed/yuhe-residence?entryHost=unauthorized.attacker.com");
      const res = middleware(req);

      expect(res.status).toBe(403);
      expect(res.headers.get("x-drts-embed-block-reason")).toBe("entry_host_not_authorized");
    });

    it("middleware redirects /embed/[entrySlug] with artifact query to session exchange route", () => {
      delete process.env.REFERRAL_EMBED_ALLOWED_HOSTS;
      const req = new NextRequest(
        "https://referral.drts.tw/embed/yuhe-residence?entryHost=app.yuhe-living.com.tw&artifact=valid-art-123",
      );
      const res = middleware(req);

      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/api/referral/session");
      expect(location.searchParams.get("action")).toBe("exchange");
      expect(location.searchParams.get("artifact")).toBe("valid-art-123");
      expect(location.searchParams.get("entrySlug")).toBe("yuhe-residence");
      expect(location.searchParams.get("entryHost")).toBe("app.yuhe-living.com.tw");
      expect(location.searchParams.get("returnTo")).toBe(
        "/embed/yuhe-residence?entryHost=app.yuhe-living.com.tw",
      );
    });
  });

  describe("2. Partner Test Issuer Authentication (Controller)", () => {
    it("allows partner apiKey holders to issue referral embed handoff artifacts without internal key", async () => {
      const mockIssue = vi.fn().mockResolvedValue({
        artifact: "signed-jwt-artifact-xyz",
        handoffId: "handoff-123",
        partnerEntrySlug: "yuhe-residence",
        entryHost: "app.yuhe-living.com.tw",
        expiresAt: "2026-09-06T07:00:00Z",
      });

      const mockService = {
        issueReferralEmbedHandoffArtifact: mockIssue,
      } as unknown as TenantPartnerService;

      const controller = new TenantPartnerController(
        mockService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      delete process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY;

      const result = await controller.issueReferralEmbedHandoffArtifact(
        {
          entrySlug: "yuhe-residence",
          apiKey: "drts-partner-yuhe-test-key-001",
          partnerUserRef: "resident-99",
        },
        { headers: {} },
        "req-test-001",
      );

      expect(result.data.artifact).toBe("signed-jwt-artifact-xyz");
      expect(mockIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          entrySlug: "yuhe-residence",
          apiKey: "drts-partner-yuhe-test-key-001",
        }),
        "req-test-001",
        { allowInternalBootstrap: false },
      );
    });

    it("requires scoped internal key when caller has no apiKey", async () => {
      const mockService = {
        issueReferralEmbedHandoffArtifact: vi.fn(),
      } as unknown as TenantPartnerService;

      const controller = new TenantPartnerController(
        mockService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY = "secret-handoff-internal-key";

      await expect(
        controller.issueReferralEmbedHandoffArtifact(
          {
            entrySlug: "yuhe-residence",
          },
          { headers: {} },
          "req-test-002",
        ),
      ).rejects.toMatchObject({
        code: "INTERNAL_KEY_REQUIRED",
        status: 401,
      });
    });
  });

  describe("3. Artifact Consumption & Replay / Expiration / Host Rejections", () => {
    it("successfully consumes artifact, establishes session cookie, and redirects cleanly without artifact parameter", async () => {
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockResolvedValue(mockValidSession);
      const writeSpy = vi.spyOn(embedPartnerSession, "writeReferralEmbedSession").mockResolvedValue(undefined);

      const request = new Request(
        "https://referral.drts.tw/api/referral/session?action=exchange&artifact=art-valid&entrySlug=yuhe-residence&entryHost=app.yuhe-living.com.tw&returnTo=/embed/yuhe-residence",
      );

      const response = await sessionGetRoute(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/embed/yuhe-residence");
      expect(redirectUrl.searchParams.has("artifact")).toBe(false);
      expect(writeSpy).toHaveBeenCalledWith(mockValidSession);
    });

    it("handles REFERRAL_HANDOFF_EXPIRED by redirecting to state=reauth&issue=expired", async () => {
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(410, "REFERRAL_HANDOFF_EXPIRED"),
      );
      const clearSpy = vi.spyOn(embedPartnerSession, "clearReferralEmbedSession").mockResolvedValue(undefined);

      const request = new Request(
        "https://referral.drts.tw/api/referral/session?action=exchange&artifact=art-expired&entrySlug=yuhe-residence&entryHost=app.yuhe-living.com.tw&returnTo=/embed/yuhe-residence",
      );

      const response = await sessionGetRoute(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.searchParams.get("state")).toBe("reauth");
      expect(redirectUrl.searchParams.get("issue")).toBe("expired");
      expect(clearSpy).toHaveBeenCalled();
    });

    it("handles REFERRAL_HANDOFF_REPLAYED by redirecting to state=reauth&issue=replayed", async () => {
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(409, "REFERRAL_HANDOFF_REPLAYED"),
      );
      const clearSpy = vi.spyOn(embedPartnerSession, "clearReferralEmbedSession").mockResolvedValue(undefined);

      const request = new Request(
        "https://referral.drts.tw/api/referral/session?action=exchange&artifact=art-replayed&entrySlug=yuhe-residence&entryHost=app.yuhe-living.com.tw&returnTo=/embed/yuhe-residence",
      );

      const response = await sessionGetRoute(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.searchParams.get("state")).toBe("reauth");
      expect(redirectUrl.searchParams.get("issue")).toBe("replayed");
      expect(clearSpy).toHaveBeenCalled();
    });

    it("handles REFERRAL_HANDOFF_HOST_MISMATCH by redirecting to state=unsupported&issue=wrong_host", async () => {
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(403, "REFERRAL_HANDOFF_HOST_MISMATCH"),
      );
      const clearSpy = vi.spyOn(embedPartnerSession, "clearReferralEmbedSession").mockResolvedValue(undefined);

      const request = new Request(
        "https://referral.drts.tw/api/referral/session?action=exchange&artifact=art-wrong-host&entrySlug=yuhe-residence&entryHost=app.yuhe-living.com.tw&returnTo=/embed/yuhe-residence",
      );

      const response = await sessionGetRoute(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.searchParams.get("state")).toBe("unsupported");
      expect(redirectUrl.searchParams.get("issue")).toBe("wrong_host");
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe("4. Embed Context & Truthful Unauthenticated State", () => {
    it("does not declare verified signature when unauthenticated without session", async () => {
      vi.spyOn(embedApi, "getPartnerEntry").mockResolvedValue(mockPartnerEntry);
      vi.spyOn(embedPartnerSession, "getReferralEmbedSession").mockResolvedValue(null);

      const context = await resolveEmbedContext({
        entrySlug: "yuhe-residence",
        state: "handoff",
      });

      expect(context.session).toBeNull();
      expect(context.issues).toContain("fallback:missing_embed_session");
      expect(context.state).toBe("handoff");
    });

    it("maps expired token artifact to reauth:token_expired in context", async () => {
      vi.spyOn(embedApi, "getPartnerEntry").mockResolvedValue(mockPartnerEntry);
      vi.spyOn(embedPartnerSession, "getReferralEmbedSession").mockResolvedValue(null);
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(410, "REFERRAL_HANDOFF_EXPIRED"),
      );

      const context = await resolveEmbedContext({
        entrySlug: "yuhe-residence",
        artifact: "expired-art-xyz",
      });

      expect(context.issues).toContain("reauth:token_expired");
      expect(context.state).toBe("reauth");
    });

    it("maps replayed token artifact to reauth:token_replayed in context", async () => {
      vi.spyOn(embedApi, "getPartnerEntry").mockResolvedValue(mockPartnerEntry);
      vi.spyOn(embedPartnerSession, "getReferralEmbedSession").mockResolvedValue(null);
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(409, "REFERRAL_HANDOFF_REPLAYED"),
      );

      const context = await resolveEmbedContext({
        entrySlug: "yuhe-residence",
        artifact: "replayed-art-xyz",
      });

      expect(context.issues).toContain("reauth:token_replayed");
      expect(context.state).toBe("reauth");
    });

    it("maps host mismatch artifact to unsupported:wrong_host in context", async () => {
      vi.spyOn(embedApi, "getPartnerEntry").mockResolvedValue(mockPartnerEntry);
      vi.spyOn(embedPartnerSession, "getReferralEmbedSession").mockResolvedValue(null);
      vi.spyOn(embedApi, "consumeReferralEmbedHandoffArtifact").mockRejectedValue(
        buildAuthorityError(403, "REFERRAL_HANDOFF_HOST_MISMATCH"),
      );

      const context = await resolveEmbedContext({
        entrySlug: "yuhe-residence",
        artifact: "wrong-host-art-xyz",
      });

      expect(context.issues).toContain("unsupported:wrong_host");
      expect(context.state).toBe("unsupported");
    });
  });

  describe("5. Fallback URL Generation & Screen Design Integrity (No Looping)", () => {
    it("generates standalone URL with complete source attribution parameters", () => {
      process.env.REFERRAL_FALLBACK_URL = "https://ride.drts.com.tw/booking";

      const url = buildStandaloneFallbackUrl({
        entry: mockPartnerEntry,
        session: mockValidSession,
        handoff: { partnerUserRef: "resident-42" },
      });

      expect(url).not.toBeNull();
      const parsed = new URL(url!);
      expect(parsed.origin).toBe("https://ride.drts.com.tw");
      expect(parsed.pathname).toBe("/booking");
      expect(parsed.searchParams.get("source")).toBe("referral_embed");
      expect(parsed.searchParams.get("entrySlug")).toBe("yuhe-residence");
      expect(parsed.searchParams.get("partnerCode")).toBe("yuhe");
      expect(parsed.searchParams.get("partnerUserRef")).toBe("resident-42");
      expect(parsed.searchParams.get("drtsPassengerId")).toBe("pax_yuhe_001");
    });

    it("returns null when no standalone fallback URL is configured", () => {
      delete process.env.REFERRAL_FALLBACK_URL;
      delete process.env.NEXT_PUBLIC_REFERRAL_FALLBACK_URL;

      const url = buildStandaloneFallbackUrl({
        entry: mockPartnerEntry,
        session: null,
        handoff: { partnerUserRef: "resident-999" },
      });

      expect(url).toBeNull();
    });

    it("verifies passenger-embed component template integrity: truthful handoff and non-looping fallback", () => {
      const source = readFileSync(
        new URL("../../../../apps/referral-embed-web/components/passenger-embed.tsx", import.meta.url),
        "utf8",
      );

      const fallbackScreenBlock = source.slice(
        source.indexOf("function FallbackScreen"),
        source.indexOf("function BookScreen"),
      );

      // 1. FallbackScreen must NOT loop back to state: "fallback"
      expect(fallbackScreenBlock).not.toContain('href={buildHref(context, { state: "fallback" })}');

      // 2. FallbackScreen must use buildStandaloneFallbackUrl
      expect(fallbackScreenBlock).toContain("buildStandaloneFallbackUrl(context)");

      // 3. FallbackScreen must render source attributions
      expect(source).toContain("轉介來源資訊");
      expect(source).toContain("context.entry.entrySlug");
      expect(source).toContain("context.entry.partnerCode");
      expect(source).toContain("partnerUserRef");
      expect(source).toContain("context.strings.supportPhone");

      // 4. HandoffScreen must guard signature validity with isAuthenticated / context.session
      expect(source).toContain("const isAuthenticated = Boolean(context.session);");
      expect(source).toContain('value={isAuthenticated ? "valid" : "missing_or_invalid"}');
      expect(source).toContain('label="社區簽章狀態"');
      expect(source).toContain('unauthenticated · 未交接');

      // 5. ReauthScreen must differentiate replayed and expired tokens
      expect(source).toContain('context.issues.some((i) => i.includes("replayed"))');
      expect(source).toContain('context.issues.some((i) => i.includes("expired"))');
      expect(source).toContain("權杖已被使用過 (Replay)");
      expect(source).toContain("單次權杖已重播");
    });
  });
});
