import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "node:net";
import { Reflector } from "../../../apps/api/node_modules/@nestjs/core";
import type { ExecutionContext } from "../../../apps/api/node_modules/@nestjs/common";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { ReferralEmbedHandoffRepository } from "../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { GoogleWorkloadIdentityAdapter } from "../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency/idempotency.service";
import { IdempotencyRepository } from "../../../apps/api/src/common/idempotency/idempotency.repository";
import type { ReferralEmbedSession } from "@drts/contracts";
import * as sessions from "../../../apps/referral-embed-web/lib/embed-partner-session";

const browser = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
}));
vi.mock(
  "../../../apps/referral-embed-web/node_modules/next/headers.js",
  () => ({
    headers: async () => new Headers({ host: "embed.example" }),
    cookies: async () => ({
      get: (name: string) => {
        const value = browser.jar.get(name);
        return value ? { value } : undefined;
      },
      set: (name: string, value: string, options: Record<string, unknown>) => {
        browser.jar.set(name, value);
        browser.options.set(name, options);
      },
      delete: (name: string) => browser.jar.delete(name),
    }),
  }),
);

type IssuedSession = ReferralEmbedSession & {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  sessionId: string;
};

describe("referral real handoff/consent -> canonical JWT -> strict bearer", () => {
  beforeEach(() => {
    vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
      throw new Error("session-auth unit forbids listening sockets");
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T01:00:00.000Z"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("STRICT_IAP_MODE", "false");
    vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_SECRET", "referral-session-unit-signing-key");
    vi.stubEnv("JWT_ISSUER", "referral-unit-issuer");
    vi.stubEnv("JWT_AUDIENCE", "referral-unit-audience");
    vi.stubEnv(
      "PARTNER_INGRESS_KEY_YUHE_RESIDENCE",
      "unit-configured-entry-credential",
    );
    vi.stubEnv("REFERRAL_EMBED_SESSION_SECRET", "referral-cookie-unit-key");
    vi.stubEnv(
      "DRTS_GOOGLE_WORKLOAD_IDENTITY_TOKEN",
      "controlled-external-proof",
    );
    browser.jar.clear();
    browser.options.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function fixture(consentRequired = false) {
    const handoffs = new ReferralEmbedHandoffRepository();
    const links = new PartnerUserIdentityLinkRepository();
    const partner = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      links,
      handoffs,
    );
    const entry = partner.getPartnerEntry("yuhe-residence");
    const link = await links.resolveOrCreate({
      entrySlug: entry.entrySlug,
      partnerUserRef: "resident-unit",
    });
    const now = new Date().toISOString();
    const artifact = await handoffs.issue({
      artifact: "unit-single-use-handoff",
      entrySlug: entry.entrySlug,
      entryHost: entry.entryHost!,
      partnerUserRef: link.partnerUserRef,
      drtsPassengerId: link.drtsPassengerId,
      tenantId: entry.tenantId!,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      consentRequired,
      consentBundleVersion: consentRequired ? null : "unit-consent-v1",
      consentGrantedAt: consentRequired ? null : now,
      issuedAt: now,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    const identities = new IdentityRepository();
    await identities.onModuleInit();
    const jwt = new JwtAuthService(identities, partner);
    // The external Google assertion is the sole controlled trust port. Real
    // handoff/consent, end-user issuer, durable registry and guard are unchanged.
    const workload = new GoogleWorkloadIdentityAdapter(identities);
    const proof = vi
      .spyOn(workload, "verifyServicePrincipal")
      .mockResolvedValue(
        {} as Awaited<
          ReturnType<GoogleWorkloadIdentityAdapter["verifyServicePrincipal"]>
        >,
      );
    const controller = new TenantPartnerController(
      partner,
      undefined!,
      undefined!,
      jwt,
      new IdempotencyService(new IdempotencyRepository()),
      identities,
      undefined,
      undefined,
      undefined,
      undefined,
      workload,
    );
    const command = {
      artifact: "unit-single-use-handoff",
      entrySlug: entry.entrySlug,
      entryHost: entry.entryHost!,
    };
    const consume = async (patch = {}) =>
      (
        await controller.consumeReferralEmbedHandoffArtifact(
          { ...command, ...patch },
          { headers: {} },
        )
      ).data as IssuedSession;
    return {
      consume,
      controller,
      entry,
      link,
      jwt,
      identities,
      artifact,
      command,
      proof,
    };
  }

  async function strictAuthorize(
    jwt: JwtAuthService,
    token: string,
    extras: Record<string, string> = {},
  ) {
    vi.stubEnv("DRTS_ENV", "staging");
    const request = {
      method: "POST",
      originalUrl: "/api/partner/referral/passenger/bookings",
      headers: { authorization: `Bearer ${token}`, ...extras },
    };
    const context = {
      getClass: () => TenantPartnerController,
      getHandler: () => TenantPartnerController.prototype.getSummary,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await new BootstrapAuthGuard(new Reflector(), jwt).canActivate(context);
    return request;
  }

  it("issues the existing real durable bearer for a consumed consented handoff", async () => {
    const f = await fixture();
    const session = await f.consume();
    expect(session.accessToken).toEqual(expect.any(String));
    const payload = await f.jwt.verifyAccessToken(session.accessToken);
    expect(payload).toMatchObject({
      realm: "partner",
      actorType: "referral_passenger",
      partnerEntrySlug: f.entry.entrySlug,
      drtsPassengerId: f.link.drtsPassengerId,
    });
    expect(payload?.scopes).toContain("partner:book");
    expect(await f.identities.getSession(session.sessionId)).toMatchObject({
      status: "active",
      actorId: f.link.drtsPassengerId,
    });
    await expect(
      strictAuthorize(f.jwt, session.accessToken),
    ).resolves.toBeDefined();
    expect(f.proof).toHaveBeenCalledOnce();
  });

  it("withholds business bearer until actual consent is recorded, then issues it", async () => {
    const f = await fixture(true);
    const pending = await f.consume();
    expect(pending.identityActive).toBe(false);
    expect(pending.accessToken).toBeUndefined();
    const result = await f.controller.recordReferralEmbedConsent(
      {
        handoffId: pending.handoffId,
        entrySlug: f.entry.entrySlug,
        entryHost: f.entry.entryHost!,
        currentDrtsPassengerId: f.link.drtsPassengerId,
        currentPartnerEntrySlug: f.entry.entrySlug,
        consentBundle: {
          bundleVersion: "consent-v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      },
      { headers: {} },
    );
    const active = result.data as IssuedSession;
    expect(active.accessToken).toEqual(expect.any(String));
    await expect(
      strictAuthorize(f.jwt, active.accessToken),
    ).resolves.toBeDefined();
  });

  it.each(["replay", "expired", "wrong-host", "cross-subject"])(
    "preserves real %s denial before session issuance",
    async (mode) => {
      const f = await fixture();
      if (mode === "replay") await f.consume();
      if (mode === "expired") vi.advanceTimersByTime(120_001);
      const patch =
        mode === "wrong-host"
          ? { entryHost: "other.example" }
          : mode === "cross-subject"
            ? { currentDrtsPassengerId: "foreign-passenger" }
            : {};
      const codes: Record<string, string> = {
        replay: "REFERRAL_HANDOFF_REPLAYED",
        expired: "REFERRAL_HANDOFF_EXPIRED",
        "wrong-host": "REFERRAL_HANDOFF_HOST_MISMATCH",
        "cross-subject": "SESSION_MISMATCH",
      };
      await expect(f.consume(patch)).rejects.toMatchObject({
        code: codes[mode],
      });
    },
  );

  it("rejects invalidated canonical session on the very next strict business call", async () => {
    const f = await fixture();
    const session = await f.consume();
    expect(session.accessToken).toEqual(expect.any(String));
    await f.jwt.revokeCurrentSession(session.sessionId, "unit-revocation");
    await expect(
      strictAuthorize(f.jwt, session.accessToken),
    ).rejects.toBeDefined();
  });

  it("rejects tampered bearer and forbidden bootstrap header mixing", async () => {
    const f = await fixture();
    const session = await f.consume();
    expect(session.accessToken).toEqual(expect.any(String));
    await expect(
      strictAuthorize(f.jwt, `${session.accessToken}x`),
    ).rejects.toBeDefined();
    await expect(
      strictAuthorize(f.jwt, session.accessToken, { "x-actor-id": "foreign" }),
    ).rejects.toBeDefined();
  });

  it("stores bearer only in HttpOnly cookies and sends no bootstrap authority headers", async () => {
    const f = await fixture();
    const session = await f.consume();
    expect(session.accessToken).toEqual(expect.any(String));
    await sessions.writeReferralEmbedSession(session);
    const active = await sessions.readActiveReferralSession();
    const headers = await sessions.getReferralIdentityHeaders(active);
    expect(headers.Authorization).toBe(`Bearer ${session.accessToken}`);
    expect(
      Object.keys(headers).filter((k) =>
        /^x-(actor|realm|tenant|partner|drts-passenger)/i.test(k),
      ),
    ).toEqual([]);
    expect(
      [...browser.options.values()].every((o) => o.httpOnly === true),
    ).toBe(true);
    const publicSession = sessions.toPublicReferralEmbedSession(active);
    expect(publicSession).not.toHaveProperty("accessToken");
    expect(publicSession).not.toHaveProperty("identity");
    expect(publicSession).not.toHaveProperty("drtsPassengerId");
    browser.jar.set("drts_referral_embed_bearer", "different-token");
    await expect(sessions.readActiveReferralSession()).rejects.toBeDefined();
  });
  it("expires the actual bearer and signed cookie instead of sending stale authority", async () => {
    const f = await fixture();
    const session = await f.consume();
    await sessions.writeReferralEmbedSession(session);
    vi.advanceTimersByTime(900_001);
    await expect(sessions.readActiveReferralSession()).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      strictAuthorize(f.jwt, session.accessToken),
    ).rejects.toBeDefined();
  });

  it("returns only the public session DTO from the actual BFF exchange", async () => {
    const f = await fixture();
    const active = await f.consume();
    const fetchPort = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: active }));
    const { POST } =
      await import("../../../apps/referral-embed-web/app/api/referral/session/route");
    const response = await POST(
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://embed.example",
        },
        body: JSON.stringify({
          action: "exchange",
          artifact: "external-proof",
          entrySlug: f.entry.entrySlug,
          entryHost: f.entry.entryHost,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const payload = await response.json();
    expect(payload.session.identityActive).toBe(true);
    expect(payload.session).not.toHaveProperty("accessToken");
    expect(payload.session).not.toHaveProperty("identity");
    expect(payload.session).not.toHaveProperty("drtsPassengerId");
    expect(JSON.stringify(payload)).not.toContain(active.accessToken);
    expect(fetchPort).toHaveBeenCalledOnce();
    await expect(sessions.readActiveReferralSession()).resolves.toMatchObject({
      accessToken: active.accessToken,
    });
  });

  it("rejects cross-origin session POST before touching authority or current cookies", async () => {
    const fetchPort = vi.spyOn(globalThis, "fetch");
    const { POST } =
      await import("../../../apps/referral-embed-web/app/api/referral/session/route");
    const response = await POST(
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://other.example",
        },
        body: JSON.stringify({
          action: "demo-bootstrap",
          entrySlug: "yuhe-residence",
          entryHost: "other.example",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(fetchPort).not.toHaveBeenCalled();
    expect(browser.jar.size).toBe(0);
  });

  it("does not grant demo authority in staging even when the demo flag was supplied", async () => {
    vi.stubEnv("DRTS_ENV", "staging");
    vi.stubEnv("REFERRAL_EMBED_DEMO", "true");
    const fetchPort = vi.spyOn(globalThis, "fetch");
    const { POST } =
      await import("../../../apps/referral-embed-web/app/api/referral/session/route");
    const response = await POST(
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "demo-bootstrap",
          entrySlug: "yuhe-residence",
          entryHost: "app.example",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(fetchPort).not.toHaveBeenCalled();
    expect(browser.jar.size).toBe(0);
  });

  it("failed exchange preserves an existing cookie and rejects an external returnTo", async () => {
    const f = await fixture();
    const active = await f.consume();
    await sessions.writeReferralEmbedSession(active);
    const before = [...browser.jar.entries()];
    const port = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { error: { code: "REFERRAL_HANDOFF_REPLAYED", message: "Consumed" } },
          { status: 409 },
        ),
      );
    const { POST } =
      await import("../../../apps/referral-embed-web/app/api/referral/session/route");
    const response = await POST(
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exchange",
          artifact: "spent",
          entrySlug: f.entry.entrySlug,
          entryHost: f.entry.entryHost,
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect([...browser.jar.entries()]).toEqual(before);
    port.mockResolvedValue(Response.json({ data: active }));
    const form = new URLSearchParams({
      action: "exchange",
      artifact: "another-valid",
      entrySlug: f.entry.entrySlug,
      entryHost: f.entry.entryHost!,
      returnTo: "https://other.example/capture",
    });
    const redirect = await POST(
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        body: form,
      }),
    );
    expect(redirect.headers.get("location")).toBe("https://embed.example/");
    expect(redirect.headers.get("Cache-Control")).toContain("no-store");
  });

  it("public recovery partition is stable for the same canonical subject and changes across subjects/entries", async () => {
    const f = await fixture();
    const active = await f.consume();
    const first = sessions.toPublicReferralEmbedSession(active);
    const resumed = sessions.toPublicReferralEmbedSession({
      ...active,
      handoffId: "new-real-handoff",
    });
    expect(first.recoveryScope).toMatch(/^[0-9a-f]{64}$/);
    expect(resumed.recoveryScope).toBe(first.recoveryScope);
    expect(
      sessions.toPublicReferralEmbedSession({
        ...active,
        drtsPassengerId: "different-subject",
      }).recoveryScope,
    ).not.toBe(first.recoveryScope);
    expect(
      sessions.toPublicReferralEmbedSession({
        ...active,
        partnerEntrySlug: "different-entry",
      }).recoveryScope,
    ).not.toBe(first.recoveryScope);
    expect(JSON.stringify(first)).not.toContain(active.drtsPassengerId);
  });

  it("requires external workload proof before consuming the original artifact", async () => {
    const f = await fixture();
    f.proof.mockRejectedValueOnce(
      new Error("External workload proof rejected"),
    );
    await expect(f.consume()).rejects.toThrow(
      "External workload proof rejected",
    );
    // The actual single-use artifact is still available; transport denial did
    // not consume it or manufacture an end-user session.
    const active = await f.consume();
    expect(active.accessToken).toEqual(expect.any(String));
    await expect(
      strictAuthorize(f.jwt, active.accessToken),
    ).resolves.toBeDefined();
  });
  it("dev bootstrap uses real artifact/consent/issuer rather than a fabricated demo identity", async () => {
    const f = await fixture();
    vi.stubEnv("REFERRAL_EMBED_DEMO", "true");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.startsWith("/api/partner/entries/"))
        return Response.json({ data: f.entry });
      const body = JSON.parse(String(init?.body ?? "{}"));
      const request = { headers: {}, method: "POST", originalUrl: pathname };
      try {
        if (pathname.endsWith("referral-embed-handoff"))
          return Response.json(
            await f.controller.issueReferralEmbedHandoffArtifact(body, request),
          );
        if (pathname.endsWith("/consume"))
          return Response.json(
            await f.controller.consumeReferralEmbedHandoffArtifact(
              body,
              request,
            ),
          );
        if (pathname.endsWith("/consent"))
          return Response.json(
            await f.controller.recordReferralEmbedConsent(body, request),
          );
      } catch (error) {
        if (error instanceof ApiRequestError)
          return Response.json(error.getResponse(), {
            status: error.getStatus(),
          });
        throw error;
      }
      throw new Error("Unexpected authority path");
    });
    const { POST } =
      await import("../../../apps/referral-embed-web/app/api/referral/session/route");
    const makeRequest = (body: Record<string, unknown>) =>
      new Request("https://embed.example/api/referral/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://embed.example",
        },
        body: JSON.stringify(body),
      });
    const response = await POST(
      makeRequest({
        action: "demo-bootstrap",
        entrySlug: f.entry.entrySlug,
        entryHost: f.entry.entryHost,
      }),
    );
    const pending = await response.json();
    expect(response.status, String(pending.message ?? "")).toBe(200);
    expect(pending.session.identityActive).toBe(false);
    expect(pending.nextPath).toContain("state=consent");
    await expect(sessions.readActiveReferralSession()).rejects.toMatchObject({
      status: 401,
    });
    const grant = await POST(
      makeRequest({
        action: "grant-consent",
        handoffId: pending.session.handoffId,
        entrySlug: f.entry.entrySlug,
        entryHost: f.entry.entryHost,
      }),
    );
    expect(grant.status).toBe(200);
    const publicActive = await grant.json();
    expect(publicActive.session.identityActive).toBe(true);
    expect(publicActive.session).not.toHaveProperty("accessToken");
    const active = await sessions.readActiveReferralSession();
    await expect(
      strictAuthorize(f.jwt, active.accessToken!),
    ).resolves.toBeDefined();
  });
  it.each(["trip", "trips"])(
    "SSR %s propagates an actual owned-read port failure instead of empty successful data",
    async (screen) => {
      const f = await fixture();
      const active = await f.consume();
      await sessions.writeReferralEmbedSession(active);
      vi.stubEnv("REFERRAL_EMBED_ALLOWED_HOSTS", f.entry.entryHost!);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ data: f.entry }),
      );
      const failure = Object.assign(new Error("Owned read unavailable"), {
        status: 503,
        code: "READ_UNAVAILABLE",
      });
      vi.resetModules();
      vi.doMock(
        "../../../apps/referral-embed-web/lib/embed-booking-api",
        () => ({
          getReferralActiveTripServer: vi.fn().mockRejectedValue(failure),
          getReferralTripHistoryServer: vi.fn().mockRejectedValue(failure),
          getReferralTripReceiptServer: vi.fn().mockRejectedValue(failure),
        }),
      );
      // Isolate the presentation port: this test calls the real SSR page and
      // context/session parser; it does not claim mounted passenger UI coverage.
      vi.doMock(
        "../../../apps/referral-embed-web/components/passenger-embed",
        () => ({ PassengerEmbed: () => null }),
      );
      try {
        const { default: Page } =
          await import("../../../apps/referral-embed-web/app/embed/[entrySlug]/page");
        await expect(
          Page({
            params: Promise.resolve({ entrySlug: f.entry.entrySlug }),
            searchParams: Promise.resolve({
              screen,
              entryHost: f.entry.entryHost!,
            }),
          }),
        ).rejects.toBe(failure);
      } finally {
        vi.doUnmock("../../../apps/referral-embed-web/lib/embed-booking-api");
        vi.doUnmock(
          "../../../apps/referral-embed-web/components/passenger-embed",
        );
      }
    },
  );
});
