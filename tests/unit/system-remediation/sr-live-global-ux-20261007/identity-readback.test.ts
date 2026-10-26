import { execFileSync } from "node:child_process";
import { Server } from "node:net";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferralEmbedSession } from "@drts/contracts";
import { FIRST_PARTY_PASSENGER_ACTOR_TYPE } from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { GoogleWorkloadIdentityAdapter } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { PassengerAccountService } from "../../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PartnerUserIdentityLinkRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { ReferralEmbedHandoffRepository } from "../../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  signSessionRole,
} from "../../../../apps/bank-console-web/lib/session";
import {
  getBankUserIdentity,
  projectBankSessionReadback,
} from "../../../../apps/bank-console-web/lib/bank-user-identity";
import * as referralSessions from "../../../../apps/referral-embed-web/lib/embed-partner-session";
import {
  getIdentityField,
  validateSessions,
  verifyIdentityReadback,
} from "../../../e2e/system-remediation/sr-live-global-ux-20261007/guards";
import { inventoryAt } from "../../../e2e/system-remediation/sr-live-global-ux-20261007/inventory";
import type {
  Deployment,
  Session,
} from "../../../e2e/system-remediation/sr-live-global-ux-20261007/model";

vi.mock("server-only", () => ({}));
vi.mock(
  "@drts/tenant-auth",
  () => import("../../../../packages/tenant-auth/src/route-handlers"),
);
vi.mock(
  "@drts/tenant-auth/constants",
  () => import("../../../../packages/tenant-auth/src/constants"),
);
vi.mock(
  "@drts/tenant-auth/api-fetch",
  () => import("../../../../packages/tenant-auth/src/api-fetch"),
);
vi.mock(
  "@drts/tenant-auth/verified-tenant-session.server",
  () =>
    import("../../../../packages/tenant-auth/src/verified-tenant-session.server"),
);

const browser = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
  headersMock: () => ({
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
}));

vi.mock("next/headers", () => browser.headersMock());
vi.mock(
  "../../../../apps/referral-embed-web/node_modules/next/headers.js",
  () => browser.headersMock(),
);

type IssuedReferralSession = ReferralEmbedSession & {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  sessionId: string;
};

// Pre-fix literal readback check from global-ux.spec.ts before SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026.
function legacyLiteralReadbackMatches(
  session: Pick<Session, "role" | "identity">,
  body: unknown,
): boolean {
  const subject = getIdentityField(body, session.identity.subjectPath);
  if (subject !== session.identity.expectedSubject) return false;
  const roles = getIdentityField(body, session.identity.rolePath);
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.includes(session.role);
}

describe("SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026 identity readback compatibility", () => {
  beforeEach(() => {
    vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
      throw new Error("identity-readback unit forbids listening sockets");
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00.000Z"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("STRICT_IAP_MODE", "false");
    vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_SECRET", "gux-readback-unit-jwt-secret");
    vi.stubEnv("JWT_ISSUER", "gux-readback-unit-issuer");
    vi.stubEnv("JWT_AUDIENCE", "gux-readback-unit-audience");
    vi.stubEnv(
      "PARTNER_INGRESS_KEY_YUHE_RESIDENCE",
      "unit-configured-entry-credential",
    );
    vi.stubEnv("REFERRAL_EMBED_SESSION_SECRET", "referral-cookie-unit-secret");
    vi.stubEnv(
      "DRTS_GOOGLE_WORKLOAD_IDENTITY_TOKEN",
      "controlled-external-proof",
    );
    browser.jar.clear();
    browser.options.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function issueReferralFixture(consentRequired = false) {
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
      partnerUserRef: "resident-readback-unit",
    });
    const now = new Date().toISOString();
    await handoffs.issue({
      artifact: "unit-single-use-handoff-readback",
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
    const workload = new GoogleWorkloadIdentityAdapter(identities);
    vi.spyOn(workload, "verifyServicePrincipal").mockResolvedValue(
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
    const consumed = (
      await controller.consumeReferralEmbedHandoffArtifact(
        {
          artifact: "unit-single-use-handoff-readback",
          entrySlug: entry.entrySlug,
          entryHost: entry.entryHost!,
        },
        { headers: {} },
      )
    ).data as IssuedReferralSession;
    return { consumed, controller, entry, link, jwt, identities };
  }

  describe("Bank Console 3 roles (bank_program_admin, bank_ops_viewer, bank_finance)", () => {
    function makeTenantJwt(claims: {
      actorId: string;
      tenantId: string;
      sessionId: string;
      roles: readonly string[];
      scopes: readonly string[];
    }): string {
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
        "utf8",
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: claims.actorId,
          actorId: claims.actorId,
          actorType: "tenant_user",
          realm: "tenant",
          tenantId: claims.tenantId,
          sessionId: claims.sessionId,
          roles: [...claims.roles],
          scopes: [...claims.scopes],
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        "utf8",
      ).toString("base64url");
      return `${header}.${payload}.sig`;
    }

    const bankRoleMatrix = [
      {
        canonicalRole: "tenant_admin",
        bankRole: "bank_program_admin",
        scopes: ["tenant:read", "tenant:write"],
      },
      {
        canonicalRole: "tenant_ops_admin",
        bankRole: "bank_ops_viewer",
        scopes: ["tenant:read"],
      },
      {
        canonicalRole: "tenant_viewer",
        bankRole: "bank_ops_viewer",
        scopes: ["tenant:read"],
      },
      {
        canonicalRole: "tenant_finance_admin",
        bankRole: "bank_finance",
        scopes: ["tenant:read", "tenant:billing:read"],
      },
    ] as const;

    it.each(bankRoleMatrix)(
      "projects verified display_role for canonical $canonicalRole -> $bankRole on GET /api/auth/session while preserving canonical roles",
      async ({ canonicalRole, bankRole, scopes }) => {
        const runtimeSha = "a".repeat(40);
        const rawUpstreamEnvelope = deepToSnakeCase(
          toApiSuccessEnvelope({
            active: true,
            identity: {
              actorId: `user-${canonicalRole}`,
              actorType: "tenant_user",
              realm: "tenant",
              tenantId: "tenant-demo-001",
              sessionId: `sess-${canonicalRole}`,
              roles: [canonicalRole],
              scopes: [...scopes],
            },
          }),
        );

        const sessionSpec: Pick<Session, "app" | "role" | "identity"> = {
          app: "bank-console-web",
          role: bankRole,
          identity: {
            path: "/api/auth/session",
            subjectPath: "data.identity.actor_id",
            rolePath: "data.identity.roles",
            expectedSubject: `user-${canonicalRole}`,
          },
        };

        // Old literal check against raw upstream /api/auth/session was RED because
        // data.identity.roles contains canonical tenant_* role codes, not bank_* UI roles.
        expect(
          legacyLiteralReadbackMatches(sessionSpec, rawUpstreamEnvelope),
        ).toBe(false);

        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(JSON.stringify(rawUpstreamEnvelope), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                  "x-drts-candidate-sha": runtimeSha,
                },
              }),
          ),
        );

        const tenantJwt = makeTenantJwt({
          actorId: `user-${canonicalRole}`,
          tenantId: "tenant-demo-001",
          sessionId: `sess-${canonicalRole}`,
          roles: [canonicalRole],
          scopes,
        });
        const signedCookie = signSessionRole(bankRole, "acme");
        const { GET } =
          await import("../../../../apps/bank-console-web/app/api/auth/[...auth]/route");
        const response = await GET(
          new NextRequest("https://bank-console.run.app/api/auth/session", {
            headers: {
              cookie: [
                `drts_tenant_session=${tenantJwt}`,
                `${BANK_CONSOLE_ROLE_COOKIE}=${signedCookie}`,
                `${BANK_CONSOLE_SESSION_COOKIE}=${signedCookie}`,
              ].join("; "),
            },
          }),
          { params: Promise.resolve({ auth: ["session"] }) },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          data: {
            identity: {
              actor_id: string;
              tenant_id: string;
              roles: string[];
              display_role: string;
              display_roles: string[];
            };
          };
        };
        expect(body.data.identity).toMatchObject({
          actor_id: `user-${canonicalRole}`,
          tenant_id: "tenant-demo-001",
          roles: [canonicalRole],
          display_role: bankRole,
          display_roles: [bankRole],
        });

        // Verified by GUX readback guard under both inventory rolePath ("data.identity.roles")
        // and explicit display_role rolePath ("data.identity.display_role").
        for (const rolePath of [
          "data.identity.roles",
          "data.identity.display_role",
          "data.identity.display_roles",
        ]) {
          expect(
            verifyIdentityReadback(
              {
                ...sessionSpec,
                identity: { ...sessionSpec.identity, rolePath },
              },
              body,
              {
                expectedRole: bankRole,
                status: response.status,
                // Cloud Run ingress sets x-drts-candidate-sha, not this Next handler.
                // The complete inventory probe below checks SHA enforcement.
              },
            ),
          ).toEqual({
            subject: `user-${canonicalRole}`,
            effectiveRoles: [bankRole],
            classification: "bank_ui_role",
          });
        }

        // Other Bank roles must be rejected for this canonical tenant role.
        for (const otherBankRole of [
          "bank_program_admin",
          "bank_ops_viewer",
          "bank_finance",
        ] as const) {
          if (otherBankRole === bankRole) continue;
          expect(() =>
            verifyIdentityReadback(
              { ...sessionSpec, role: otherBankRole },
              body,
              { expectedRole: otherBankRole, status: 200 },
            ),
          ).toThrow();
        }
      },
    );

    it("rejects a different selected UI role even when both roles occur in verified tenant claims", () => {
      const identity = {
        actor_id: "self-1",
        tenant_id: "tenant-demo-001",
        realm: "tenant",
        actor_type: "tenant_user",
        roles: ["tenant_admin", "tenant_finance_admin"],
      };
      const roleCookie = signSessionRole("bank_program_admin", "acme");
      const body = projectBankSessionReadback(
        { data: { active: true, identity } },
        {
          signedRoleCookie: roleCookie,
          signedSessionCookie: roleCookie,
        },
      );
      const finance: Pick<Session, "app" | "role" | "identity"> = {
        app: "bank-console-web",
        role: "bank_finance",
        identity: {
          path: "/api/auth/session",
          subjectPath: "data.identity.actor_id",
          rolePath: "data.identity.roles",
          expectedSubject: "self-1",
        },
      };
      expect(() => verifyIdentityReadback(finance, body)).toThrow(
        "bank selected display_role mismatch",
      );
      expect(
        verifyIdentityReadback({ ...finance, role: "bank_program_admin" }, body)
          .effectiveRoles,
      ).toContain("bank_program_admin");
    });

    it("fails closed on signed-out marker, forged cookies, role escalation cookies, cross-tenant cookies, and non-canonical roles", async () => {
      const viewerUpstream = deepToSnakeCase(
        toApiSuccessEnvelope({
          active: true,
          identity: {
            actorId: "viewer-1",
            actorType: "tenant_user",
            realm: "tenant",
            tenantId: "tenant-demo-001",
            sessionId: "sess-viewer-1",
            roles: ["tenant_viewer"],
            scopes: ["tenant:read"],
          },
        }),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify(viewerUpstream), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      );
      const viewerJwt = makeTenantJwt({
        actorId: "viewer-1",
        tenantId: "tenant-demo-001",
        sessionId: "sess-viewer-1",
        roles: ["tenant_viewer"],
        scopes: ["tenant:read"],
      });
      const { GET } =
        await import("../../../../apps/bank-console-web/app/api/auth/[...auth]/route");

      // 1. Signed-out cookie fails closed with 401.
      const signedOutRes = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; drts_bank_console_signed_out=1`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(signedOutRes.status).toBe(401);

      // 2. Forged role cookie signature fails closed with 401.
      const forgedRes = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; ${BANK_CONSOLE_ROLE_COOKIE}=bank_program_admin:acme.forgedsig; ${BANK_CONSOLE_SESSION_COOKIE}=bank_program_admin:acme.forgedsig`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(forgedRes.status).toBe(401);

      // 3. Validly signed bank_program_admin cookie on a tenant_viewer session fails closed with 403 ROLE_MISMATCH.
      const escalatedCookie = signSessionRole("bank_program_admin", "acme");
      const escalatedRes = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; ${BANK_CONSOLE_ROLE_COOKIE}=${escalatedCookie}; ${BANK_CONSOLE_SESSION_COOKIE}=${escalatedCookie}`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(escalatedRes.status).toBe(403);
      await expect(escalatedRes.json()).resolves.toMatchObject({
        active: false,
        error: { code: "ROLE_MISMATCH" },
      });

      // 4. Validly signed bank_ops_viewer cookie for contoso on a tenant_acme session fails closed with 403 TENANT_MISMATCH.
      const foreignBankCookie = signSessionRole("bank_ops_viewer", "contoso");
      const foreignTenantRes = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; ${BANK_CONSOLE_ROLE_COOKIE}=${foreignBankCookie}; ${BANK_CONSOLE_SESSION_COOKIE}=${foreignBankCookie}`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(foreignTenantRes.status).toBe(403);
      await expect(foreignTenantRes.json()).resolves.toMatchObject({
        active: false,
        error: { code: "TENANT_MISMATCH" },
      });

      // Tenant-only sessions remain valid upstream, but cannot claim a selected
      // Bank UI role; partial or disagreeing signed cookies are rejected.
      const noBankCookies = projectBankSessionReadback(viewerUpstream);
      expect(() =>
        verifyIdentityReadback(
          {
            app: "bank-console-web",
            role: "bank_ops_viewer",
            identity: {
              path: "/api/auth/session",
              subjectPath: "data.identity.actor_id",
              rolePath: "data.identity.roles",
              expectedSubject: "viewer-1",
            },
          },
          noBankCookies,
        ),
      ).toThrow();
      const partial = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; ${BANK_CONSOLE_ROLE_COOKIE}=${signSessionRole("bank_ops_viewer", "acme")}`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(partial.status).toBe(401);
      const disagree = await GET(
        new NextRequest("https://bank-console.run.app/api/auth/session", {
          headers: {
            cookie: `drts_tenant_session=${viewerJwt}; ${BANK_CONSOLE_ROLE_COOKIE}=${signSessionRole("bank_ops_viewer", "acme")}; ${BANK_CONSOLE_SESSION_COOKIE}=${signSessionRole("bank_ops_viewer", "contoso")}`,
          },
        }),
        { params: Promise.resolve({ auth: ["session"] }) },
      );
      expect(disagree.status).toBe(401);

      // 5. Empty or non-canonical tenant roles fail closed in both getBankUserIdentity and projectBankSessionReadback.
      for (const badRoles of [
        [],
        ["unknown_role"],
        ["agency_viewer"],
        ["bank_program_admin"],
      ]) {
        const badEnvelope = {
          data: {
            active: true,
            identity: {
              actor_id: "viewer-1",
              actor_type: "tenant_user",
              realm: "tenant",
              tenant_id: "tenant-demo-001",
              session_id: "sess-1",
              roles: badRoles,
              scopes: ["tenant:read"],
            },
          },
        };
        expect(() => projectBankSessionReadback(badEnvelope)).toThrow();
        const badJwt = makeTenantJwt({
          actorId: "viewer-1",
          tenantId: "tenant-demo-001",
          sessionId: "sess-1",
          roles: badRoles,
          scopes: ["tenant:read"],
        });
        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(JSON.stringify(badEnvelope), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
          ),
        );
        await expect(getBankUserIdentity(badJwt)).rejects.toMatchObject({
          status: 401,
        });
      }
    });
  });

  describe("Referral Embed (referral_passenger) GET /api/referral/session", () => {
    function installAuthorityReadback(
      f: Awaited<ReturnType<typeof issueReferralFixture>>,
    ) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (new URL(url).pathname !== "/api/auth/session")
            throw new Error("unexpected authority route");
          const token = new Headers(init?.headers)
            .get("Authorization")
            ?.replace(/^Bearer /, "");
          const verified = token ? await f.jwt.verifyAccessToken(token) : null;
          if (!verified)
            return new Response(
              JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED" } }),
              { status: 401 },
            );
          const body = deepToSnakeCase(
            toApiSuccessEnvelope({
              active: true,
              identity: f.jwt.toRequestIdentity(verified),
            }),
          );
          return Response.json(body);
        }),
      );
    }

    it("returns verified public session readback with opaque recoveryScope and referral_passenger classification without leaking accessToken or drtsPassengerId", async () => {
      const f = await issueReferralFixture(false);
      installAuthorityReadback(f);
      await referralSessions.writeReferralEmbedSession(f.consumed);
      const expectedPublic = referralSessions.toPublicReferralEmbedSession(
        f.consumed,
      );

      // Old POST-only public session DTO omitted data.identity.actor_id and data.identity.actor_type.
      const sessionSpec: Pick<Session, "app" | "role" | "identity"> = {
        app: "referral-embed-web",
        role: "referral_passenger",
        identity: {
          path: "/api/referral/session",
          subjectPath: "data.identity.actor_id",
          rolePath: "data.identity.actor_type",
          expectedSubject: expectedPublic.recoveryScope,
        },
      };
      expect(
        legacyLiteralReadbackMatches(sessionSpec, {
          ok: true,
          session: expectedPublic,
        }),
      ).toBe(false);

      const { GET } =
        await import("../../../../apps/referral-embed-web/app/api/referral/session/route");
      const response = await GET(
        new Request("https://embed.example/api/referral/session", {
          method: "GET",
          headers: { Origin: "https://embed.example" },
        }),
      );
      expect(
        response.status,
        JSON.stringify(await response.clone().json()),
      ).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      const payload = await response.json();

      expect(payload).toMatchObject({
        ok: true,
        session: expectedPublic,
        data: {
          active: true,
          session: expectedPublic,
          identity: {
            actor_id: expectedPublic.recoveryScope,
            subject_alias: expectedPublic.recoveryScope,
            recovery_scope: expectedPublic.recoveryScope,
            actor_type: "referral_passenger",
            realm: "partner",
            roles: ["referral_passenger"],
            partner_entry_slug: f.entry.entrySlug,
            entry_host: f.entry.entryHost,
            handoff_id: f.consumed.handoffId,
            identity_active: true,
          },
        },
      });
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(f.consumed.accessToken);
      expect(serialized).not.toContain(f.consumed.drtsPassengerId);
      expect(serialized).not.toContain("accessToken");
      expect(serialized).not.toContain("drtsPassengerId");

      expect(
        verifyIdentityReadback(sessionSpec, payload, {
          expectedRole: "referral_passenger",
          status: response.status,
          candidateSha: "b".repeat(40),
          expectedRuntimeSha: "b".repeat(40),
        }),
      ).toEqual({
        subject: expectedPublic.recoveryScope,
        effectiveRoles: ["referral_passenger"],
        classification: "referral_public_session",
      });
    });

    it("fails closed with 401/403 when missing, unconsented, expired, bearer-tampered, cross-origin, or cross-entry", async () => {
      const { GET } =
        await import("../../../../apps/referral-embed-web/app/api/referral/session/route");

      // 1. Missing session cookie -> 401.
      const missingRes = await GET(
        new Request("https://embed.example/api/referral/session"),
      );
      expect(missingRes.status).toBe(401);

      // 2. Pending consent (identityActive === false) -> 401.
      const pendingFixture = await issueReferralFixture(true);
      expect(pendingFixture.consumed.identityActive).toBe(false);
      await referralSessions.writeReferralEmbedSession(pendingFixture.consumed);
      const pendingRes = await GET(
        new Request("https://embed.example/api/referral/session"),
      );
      expect(pendingRes.status).toBe(401);

      // 3. Active consented session -> cross-origin rejected with 403.
      const activeFixture = await issueReferralFixture(false);
      installAuthorityReadback(activeFixture);
      await referralSessions.writeReferralEmbedSession(activeFixture.consumed);
      const crossOriginRes = await GET(
        new Request("https://embed.example/api/referral/session", {
          headers: { Origin: "https://evil.example" },
        }),
      );
      expect(crossOriginRes.status).toBe(403);

      // 4. Cross-entry query parameter rejected with 403 SESSION_MISMATCH.
      const crossEntryRes = await GET(
        new Request(
          "https://embed.example/api/referral/session?entrySlug=other-entry",
        ),
      );
      expect(crossEntryRes.status).toBe(403);
      await expect(crossEntryRes.json()).resolves.toMatchObject({
        ok: false,
        code: "SESSION_MISMATCH",
      });

      // 5. Tampered bearer cookie rejected with 401.
      const originalBearer = browser.jar.get("drts_referral_embed_bearer")!;
      browser.jar.set(
        "drts_referral_embed_bearer",
        `${originalBearer}tampered`,
      );
      const tamperedRes = await GET(
        new Request("https://embed.example/api/referral/session"),
      );
      expect(tamperedRes.status).toBe(401);
      browser.jar.set("drts_referral_embed_bearer", originalBearer);

      // 6. Expired session rejected with 401.
      vi.advanceTimersByTime(900_001);
      const expiredRes = await GET(
        new Request("https://embed.example/api/referral/session"),
      );
      expect(expiredRes.status).toBe(401);
    });

    it("rejects revoked durable session and mismatched signed-cookie server claims, without clearing the caller cookie", async () => {
      const f = await issueReferralFixture(false);
      installAuthorityReadback(f);
      const { GET } =
        await import("../../../../apps/referral-embed-web/app/api/referral/session/route");
      const request = () =>
        new Request("https://embed.example/api/referral/session");
      await referralSessions.writeReferralEmbedSession(f.consumed);
      expect((await GET(request())).status).toBe(200);

      // The server response is genuine but may not be substituted for a
      // different tenant/entry/subject stored in a validly signed cookie.
      for (const mutation of [
        { identity: { ...f.consumed.identity, tenantId: "tenant-other" } },
        {
          identity: { ...f.consumed.identity, actorId: "drts_passenger_other" },
        },
        { partnerEntrySlug: "other-entry" },
      ]) {
        await referralSessions.writeReferralEmbedSession({
          ...f.consumed,
          ...mutation,
        });
        expect((await GET(request())).status).toBe(401);
      }
      await referralSessions.writeReferralEmbedSession(f.consumed);
      const signedCookie = browser.jar.get("drts_referral_embed_session");
      await f.identities.revokeSession(f.consumed.sessionId, "unit revocation");
      expect((await GET(request())).status).toBe(401);
      expect(browser.jar.get("drts_referral_embed_session")).toBe(signedCookie);
    });
  });

  describe("Passenger App (first_party_passenger) /api/passenger-app/me actor readback", () => {
    it("verifies active first-party passenger account from PassengerAccountService.getMe wire envelope and rejects inactive or cross-realm payloads", async () => {
      const accountRecord = {
        drtsPassengerId: "drts_passenger_live_001",
        status: "active" as const,
        contactPhoneE164: "+886912345678",
        contactPhoneVerified: true,
        displayName: "王小明",
        email: null,
        contactConsent: true,
        marketingConsent: false,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
      };
      // DB boundary only: production getMe/current still checks actor, expiry,
      // active account and live family against the repository transaction.
      const store = {
        transaction: async (run: (tx: unknown) => Promise<unknown>) =>
          run({
            lockAccount: async () => accountRecord,
            findLiveFamily: async () => ({ sessionId: "fam_001" }),
          }),
      };
      const service = new PassengerAccountService(store as never, {} as never);
      const meResult = await service.getMe({
        authMode: "jwt_bearer",
        actorId: accountRecord.drtsPassengerId,
        subject: accountRecord.drtsPassengerId,
        drtsPassengerId: accountRecord.drtsPassengerId,
        actorType: FIRST_PARTY_PASSENGER_ACTOR_TYPE,
        realm: "passenger",
        sessionId: "fam_001",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } as never);
      const wireEnvelope = deepToSnakeCase(
        toApiSuccessEnvelope(meResult),
      ) as Record<string, unknown>;

      const sessionSpec: Pick<Session, "app" | "role" | "identity"> = {
        app: "passenger-app-web",
        role: FIRST_PARTY_PASSENGER_ACTOR_TYPE,
        identity: {
          path: "/api/passenger-app/me",
          subjectPath: "data.account.drts_passenger_id",
          rolePath: "data.account.status",
          expectedSubject: accountRecord.drtsPassengerId,
        },
      };

      // Old literal check was RED because data.account.status is "active", not "first_party_passenger".
      expect(legacyLiteralReadbackMatches(sessionSpec, wireEnvelope)).toBe(
        false,
      );

      // New GUX readback guard verifies active PassengerAccount and classifies actor as first_party_passenger.
      expect(
        verifyIdentityReadback(sessionSpec, wireEnvelope, {
          expectedRole: FIRST_PARTY_PASSENGER_ACTOR_TYPE,
          status: 200,
          candidateSha: "c".repeat(40),
          expectedRuntimeSha: "c".repeat(40),
        }),
      ).toEqual({
        subject: accountRecord.drtsPassengerId,
        effectiveRoles: ["first_party_passenger"],
        classification: "first_party_passenger_account",
      });

      // Inactive/suspended account or fabricated status="first_party_passenger" fails closed.
      for (const badStatus of [
        "suspended",
        "disabled",
        "deleted",
        "first_party_passenger",
      ]) {
        const mutated = structuredClone(wireEnvelope) as {
          data: { account: Record<string, unknown> };
        };
        mutated.data.account.status = badStatus;
        expect(() => verifyIdentityReadback(sessionSpec, mutated)).toThrow();
      }

      // Cross-subject or injected tenant_id/partner_id fails closed.
      const crossSubject = structuredClone(wireEnvelope) as {
        data: { account: Record<string, unknown> };
      };
      crossSubject.data.account.drts_passenger_id = "drts_passenger_other";
      expect(() => verifyIdentityReadback(sessionSpec, crossSubject)).toThrow();

      const crossRealm = structuredClone(wireEnvelope) as {
        data: { account: Record<string, unknown> };
      };
      crossRealm.data.account.tenant_id = "tenant_acme";
      expect(() => verifyIdentityReadback(sessionSpec, crossRealm)).toThrow();
    });
  });

  describe("Full 21 app-role inventory compatibility (5 affected + 16 preserved direct entries)", () => {
    it("validates all 21 app-role sessions and readback envelopes while rejecting mismatched role, subject, or runtime SHA", () => {
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const manifest = inventoryAt(head);
      const allPairs = manifest.surfaces.flatMap((surface) =>
        surface.roles.map((role) => ({ app: surface.app, role })),
      );
      expect(allPairs).toHaveLength(21);

      const deployment: Deployment = {
        project: "drts-dev-devcc-20260825",
        region: "us-central1",
        runtimeSha: head,
        observedAt: "2026-10-26T00:00:00.000Z",
        services: [
          ...manifest.surfaces.map((s) => ({
            app: s.app,
            service: s.service,
            origin: `https://${s.service}.us-central1.run.app`,
            revisions: [
              {
                name: `${s.service}-rev-1`,
                percent: 100,
                sha: head,
                image: `image@sha256:${"1".repeat(64)}`,
              },
            ],
          })),
          {
            app: "api",
            service: "drts-dev-api",
            origin: "https://drts-dev-api.us-central1.run.app",
            revisions: [
              {
                name: "drts-dev-api-rev-1",
                percent: 100,
                sha: head,
                image: `image@sha256:${"2".repeat(64)}`,
              },
            ],
          },
        ],
      };

      const recoveryScope = "ab".repeat(32);
      const sessions: Session[] = allPairs.map(({ app, role }) => {
        const host = `${manifest.surfaces.find((s) => s.app === app)!.service}.us-central1.run.app`;
        const identity =
          app === "referral-embed-web"
            ? {
                path: "/api/referral/session",
                subjectPath: "data.identity.actor_id",
                rolePath: "data.identity.actor_type",
                expectedSubject: recoveryScope,
              }
            : app === "passenger-app-web"
              ? {
                  path: "/api/passenger-app/me",
                  subjectPath: "data.account.drts_passenger_id",
                  rolePath: "data.account.status",
                  expectedSubject: "drts_passenger_001",
                }
              : app === "channel-partner-portal-web"
                ? {
                    path: "/control-plane-proxy/identity/context",
                    subjectPath: "data.actor_id",
                    rolePath: "data.actor_type",
                    expectedSubject: `actor-${app}-${role}`,
                  }
                : app === "platform-admin-web" || app === "ops-console-web"
                  ? {
                      path: "/control-plane-proxy/auth/session",
                      subjectPath: "data.identity.actor_id",
                      rolePath:
                        role === "ops_observer"
                          ? "data.identity.roles"
                          : "data.identity.actor_type",
                      expectedSubject: `actor-${app}-${role}`,
                    }
                  : app === "fleet-partner-portal-web"
                    ? {
                        path: "/api/auth/session",
                        subjectPath: "data.identity.actor_id",
                        rolePath: "data.identity.actor_type",
                        expectedSubject: `actor-${app}-${role}`,
                      }
                    : {
                        path: "/api/auth/session",
                        subjectPath: "data.identity.actor_id",
                        rolePath: "data.identity.roles",
                        expectedSubject: `actor-${app}-${role}`,
                      };
        return {
          app,
          role,
          kind: "authorized-isolation",
          authorizationRef: "SD-DP-20261007-001",
          subjectAlias: `alias-${app}-${role}`,
          sandboxOnly: true,
          identity,
          storageState: {
            cookies: [
              {
                name: "session_cookie",
                value: "opaque",
                domain: host,
                path: "/",
                expires: -1,
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
              },
            ],
            origins: [],
          },
        };
      });

      validateSessions(sessions, deployment, manifest);

      for (const session of sessions) {
        const body =
          session.app === "bank-console-web"
            ? {
                data: {
                  active: true,
                  identity: {
                    actor_id: session.identity.expectedSubject,
                    actor_type: "tenant_user",
                    realm: "tenant",
                    tenant_id: "tenant-demo-001",
                    roles: [
                      session.role === "bank_program_admin"
                        ? "tenant_admin"
                        : session.role === "bank_finance"
                          ? "tenant_finance_admin"
                          : "tenant_ops_admin",
                    ],
                    display_role: session.role,
                    display_roles: [session.role],
                  },
                },
              }
            : session.app === "referral-embed-web"
              ? {
                  ok: true,
                  session: {
                    recoveryScope,
                    handoffId: "handoff-1",
                    partnerEntrySlug: "yuhe-residence",
                    entryHost: "embed.example",
                    identityActive: true,
                    consent: {
                      requiredScopes: [
                        "trip.manage",
                        "pii.trip",
                        "identity.bind",
                      ],
                      bundleVersion: "v1",
                      grantedAt: "2026-10-26T00:00:00.000Z",
                    },
                  },
                  data: {
                    active: true,
                    session: {
                      recoveryScope,
                      handoffId: "handoff-1",
                      partnerEntrySlug: "yuhe-residence",
                      entryHost: "embed.example",
                      identityActive: true,
                      consent: {
                        requiredScopes: [
                          "trip.manage",
                          "pii.trip",
                          "identity.bind",
                        ],
                        bundleVersion: "v1",
                        grantedAt: "2026-10-26T00:00:00.000Z",
                      },
                    },
                    identity: {
                      actor_id: recoveryScope,
                      subject_alias: recoveryScope,
                      recovery_scope: recoveryScope,
                      actor_type: "referral_passenger",
                      realm: "partner",
                      roles: ["referral_passenger"],
                      partner_entry_slug: "yuhe-residence",
                      entry_host: "embed.example",
                      handoff_id: "handoff-1",
                      identity_active: true,
                    },
                  },
                }
              : session.app === "passenger-app-web"
                ? {
                    data: {
                      account: {
                        drts_passenger_id: session.identity.expectedSubject,
                        status: "active",
                        contact_phone_verified: true,
                        created_at: "2026-10-01T00:00:00.000Z",
                      },
                    },
                  }
                : session.app === "channel-partner-portal-web"
                  ? {
                      data: {
                        actor_id: session.identity.expectedSubject,
                        actor_type: session.role,
                      },
                    }
                  : session.role === "ops_observer"
                    ? {
                        data: {
                          active: true,
                          identity: {
                            actor_id: session.identity.expectedSubject,
                            actor_type: "ops_user",
                            realm: "ops",
                            roles: ["observer"],
                          },
                        },
                      }
                    : session.identity.rolePath === "data.identity.actor_type"
                      ? {
                          data: {
                            active: true,
                            identity: {
                              actor_id: session.identity.expectedSubject,
                              actor_type: session.role,
                            },
                          },
                        }
                      : {
                          data: {
                            active: true,
                            identity: {
                              actor_id: session.identity.expectedSubject,
                              roles: [session.role],
                            },
                          },
                        };

        const result = verifyIdentityReadback(session, body, {
          expectedRole: session.role,
          status: 200,
          candidateSha: head,
          expectedRuntimeSha: head,
        });
        expect(result.subject).toBe(session.identity.expectedSubject);
        expect(result.effectiveRoles).toContain(session.role);

        // Stale runtime SHA or non-200 HTTP status fails closed for every entry.
        expect(() =>
          verifyIdentityReadback(session, body, {
            expectedRole: session.role,
            status: 401,
            candidateSha: head,
            expectedRuntimeSha: head,
          }),
        ).toThrow();
        expect(() =>
          verifyIdentityReadback(session, body, {
            expectedRole: session.role,
            status: 200,
            candidateSha: "0".repeat(40),
            expectedRuntimeSha: head,
          }),
        ).toThrow();
      }

      // ops_observer must reject fixed ops_user role without observer binding.
      const observerSession = sessions.find((s) => s.role === "ops_observer")!;
      expect(() =>
        verifyIdentityReadback(observerSession, {
          data: {
            active: true,
            identity: {
              actor_id: observerSession.identity.expectedSubject,
              actor_type: "ops_user",
              realm: "ops",
              roles: ["ops_user"],
            },
          },
        }),
      ).toThrow();
    }, 30_000);
  });
});
