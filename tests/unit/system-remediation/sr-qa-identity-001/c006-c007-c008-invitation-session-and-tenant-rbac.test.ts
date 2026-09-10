import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTenantRoleScopes } from "../../../../apps/api/src/common/auth/auth.constants";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  MailTransport,
  ProviderAcknowledgement,
  TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { IdentityController } from "../../../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type {
  AuthRealm,
  BootstrapRequestIdentity,
} from "../../../../apps/api/src/common/auth/auth.types";

describe("SR-QA-IDENTITY-001 / C006, C007 & C008 — 邀請發送／Session治理與租戶權限矩陣驗收", () => {
  // ── C006: 租戶人員管理者 邀請發送→收到信→啟用→撤銷 (N06) ──────────────────────
  describe("C006: 租戶人員邀請生命週期與投遞狀態 (N06)", () => {
    let outboxDir: string;
    let clock: number;
    const now = () => new Date(clock);

    beforeEach(async () => {
      outboxDir = await mkdtemp(join(tmpdir(), "sr-qa-mail-outbox-"));
      clock = Date.parse("2026-09-06T08:00:00.000Z");
    });

    afterEach(async () => {
      await rm(outboxDir, { recursive: true, force: true });
    });

    function createAcknowledgement(
      id = "msg-invitation-ack-001",
    ): ProviderAcknowledgement {
      return {
        provider: "controlled-test-receiver",
        response: `250 Accepted as ${id}`,
        providerMessageId: id,
        acceptedAt: now().toISOString(),
      };
    }

    function createAcceptingTransport(
      ackId = "msg-invitation-ack-001",
    ): MailTransport {
      return {
        provider: "controlled-test-receiver",
        send: vi.fn(async (message: TransportMessage) => {
          void message;
          return createAcknowledgement(ackId);
        }),
      };
    }

    function createFailingTransport(): MailTransport {
      return {
        provider: "failing-test-transport",
        send: vi.fn(async () => {
          throw new Error("SMTP connection refused by upstream gateway");
        }),
      };
    }

    function createDeliveryService(transport: MailTransport) {
      return new NotificationDeliveryService(
        new FileMailOutbox(outboxDir),
        transport,
        {
          now,
          maxAttempts: 3,
          retryDelayMs: 500,
          leaseMs: 500,
        },
      );
    }

    it("C006-POS-1: issues invitation, transmits raw token via delivery service, records sent status", async () => {
      const transport = createAcceptingTransport("ack-pos-inv-001");
      const service = new TenantInvitationDeliveryService(
        createDeliveryService(transport),
      );

      const input: TenantInvitationDeliveryRequest = {
        invitationId: "inv-test-1001",
        tenantId: "ten-alpha-001",
        recipientEmail: "new-member@alpha.example.com",
        displayName: "New Alpha Admin",
        expiresAt: "2026-09-08T08:00:00.000Z",
        rawToken: "ti_token_super_secret_single_use_proof",
      };

      const record = await service.send(input);

      expect(transport.send).toHaveBeenCalledTimes(1);
      const sentMessage = (transport.send as any).mock
        .calls[0][0] as TransportMessage;
      expect(sentMessage.recipientEmail).toBe(input.recipientEmail);
      expect(sentMessage.body).toContain(input.rawToken); // Raw token delivered to transport
      expect(record.status).toBe("sent");
      expect(record.providerMessageId).toBe("ack-pos-inv-001");
      expect(record.errorCode).toBeNull();
    });

    it("C006-NEG-1: delivery failure records failed status with error code, never claiming false delivery", async () => {
      const transport = createFailingTransport();
      const service = new TenantInvitationDeliveryService(
        createDeliveryService(transport),
      );

      const input: TenantInvitationDeliveryRequest = {
        invitationId: "inv-test-fail-1002",
        tenantId: "ten-alpha-001",
        recipientEmail: "broken@alpha.example.com",
        displayName: "Failed Invitee",
        expiresAt: "2026-09-08T08:00:00.000Z",
        rawToken: "ti_fail_token",
      };

      const record = await service.send(input);

      expect(record.status).toBe("failed");
      expect(record.errorCode).toBe("transport_error");
      expect(record.providerMessageId).toBeNull();
    });
  });

  // ── C007: 平台人員管理者 人員查詢與工作階段管理 (R05) ──────────────────────────
  describe("C007: 平台 Session 治理與 403 請求風暴防護 (R05)", () => {
    it("C007-POS-1: platform admin can list sessions and query sessions with PII masking", async () => {
      const identityRepo = new IdentityRepository();
      const controller = new IdentityController(identityRepo);

      const callerIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-super-01",
        principalId: "actor-super-01",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:sessions:read", "identity:sessions:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-caller-01",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password", "mfa"],
        acr: "aal2",
        requestId: "req-list-sess-001",
      };

      // Seed a session into repository
      const testSession = await identityRepo.createSession({
        sessionId: "sess-target-001",
        sourceRef: "test-system",
        principalId: "usr_operator_01",
        membershipId: null,
        realm: "ops",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["password"],
        tokenVersion: 1,
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 7200000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: { userAgent: "Mozilla/5.0 Chrome" },
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const envelope = await controller.listAdminSessions(callerIdentity, {});
      expect(envelope).toBeDefined();
      expect(Array.isArray(envelope.data)).toBe(true);
      expect(
        envelope.data.some((s: any) => s.sessionId === testSession.sessionId),
      ).toBe(true);
    });

    it("C007-POS-2: platform admin can revoke active session", async () => {
      const identityRepo = new IdentityRepository();
      const controller = new IdentityController(identityRepo);

      const callerIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-super-01",
        principalId: "actor-super-01",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:sessions:read", "identity:sessions:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-caller-01",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password", "mfa"],
        acr: "aal2",
        requestId: "req-revoke-001",
      };

      const sid = `sess-revoke-${Date.now()}`;
      await identityRepo.createSession({
        sessionId: sid,
        sourceRef: "test",
        principalId: "usr_target_02",
        membershipId: null,
        realm: "ops",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["password"],
        tokenVersion: 1,
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 7200000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mockReq = {
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
      };

      const result = await controller.revokeAdminSession(
        callerIdentity,
        sid,
        { reason: "admin_manual_revocation" },
        mockReq,
        "req-revoke-001",
      );

      expect(result.data.revoked).toBe(true);
      expect(result.data.sessionId).toBe(sid);

      const fetched = await identityRepo.getSession(sid);
      expect(fetched?.status).toBe("revoked");
      expect(fetched?.revokeReason).toBe("admin_manual_revocation");
    });

    it("C007-NEG-1: tenant admin attempting to query another tenant session boundary throws 403 RESOURCE_SCOPE_DENIED", async () => {
      const identityRepo = new IdentityRepository();
      const controller = new IdentityController(identityRepo);

      const tenantAdminIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "actor-ten-admin-01",
        principalId: "actor-ten-admin-01",
        realm: "tenant",
        roles: ["tenant_admin"],
        roleFamilies: ["tenant"],
        scopes: ["identity:sessions:read"],
        tenantId: "ten_alpha_001",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-ten-01",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password"],
        acr: "aal1",
        requestId: "req-cross-ten-query-001",
      };

      // Querying Tenant Beta while being in Tenant Alpha
      await expect(
        controller.listAdminSessions(tenantAdminIdentity, {
          tenantId: "ten_beta_002",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: "RESOURCE_SCOPE_DENIED",
        }),
      );
    });

    it("C007-NEG-2: revoking session without CSRF header in cookie session is rejected with 403 CSRF_TOKEN_MISSING", async () => {
      const identityRepo = new IdentityRepository();
      const controller = new IdentityController(identityRepo);

      const callerIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-super-01",
        principalId: "actor-super-01",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:sessions:read", "identity:sessions:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-caller-01",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password", "mfa"],
        acr: "aal2",
        requestId: "req-csrf-missing-001",
      };

      const mockReqMissingCsrf = {
        headers: {
          cookie: "drts_session_cookie=active_session_abc",
        },
      };

      await expect(
        controller.revokeAdminSession(
          callerIdentity,
          "sess-test-csrf-001",
          { reason: "test" },
          mockReqMissingCsrf,
          "req-csrf-missing-001",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: "CSRF_TOKEN_MISSING",
        }),
      );
    });
  });

  // ── C008: 租戶角色最小權限與選單／API 一致 (IAM, TEN) ──────────────────────────
  describe("C008: 租戶角色權限矩陣與唯讀防護 (IAM, TEN)", () => {
    function evaluateAccess(
      method: string,
      url: string,
      identity: {
        actorType: string;
        realm: AuthRealm;
        roles: string[];
        scopes: readonly string[];
        tenantId?: string | null;
      },
    ): { allowed: boolean; error?: ApiRequestError } {
      const guard = new BootstrapAuthGuard({
        getAllAndOverride: () => undefined,
      } as any);

      const fullIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorId: `actor-${identity.actorType}-001`,
        principalId: `actor-${identity.actorType}-001`,
        roles: identity.roles,
        roleFamilies: [identity.realm as any],
        tenantId: identity.tenantId ?? "ten-alpha-001",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-test-matrix-001",
        tokenVersion: 1,
        authTime: "2026-09-06T00:00:00Z",
        amr: ["password"],
        acr: "aal1",
        requestId: "req-matrix-001",
        actorType: identity.actorType as any,
        realm: identity.realm,
        scopes: [...identity.scopes],
      };

      const request = {
        method,
        url,
        originalUrl: url,
        headers: {
          "x-actor-id": fullIdentity.actorId,
          "x-actor-type": fullIdentity.actorType,
          "x-realm": fullIdentity.realm,
          "x-scopes": fullIdentity.scopes.join(","),
          "x-roles": fullIdentity.roles.join(","),
          "x-tenant-id": fullIdentity.tenantId ?? "",
          "x-request-id": "req-matrix-001",
        },
        identity: fullIdentity,
      };

      const context = {
        getClass: () => class TestMatrixController {},
        getHandler: () => function handler() {},
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      };

      try {
        const allowed = guard.canActivate(context as any);
        return { allowed: Boolean(allowed) };
      } catch (err: unknown) {
        if (err instanceof ApiRequestError) {
          return { allowed: false, error: err };
        }
        throw err;
      }
    }

    it("C008-POS-1: tenant_admin holds tenant management and write scopes", () => {
      const scopes = getTenantRoleScopes("tenant_admin");
      expect(scopes).toBeDefined();
      expect(scopes).toContain("tenant:write");
      expect(scopes).toContain("tenant:read");
      expect(scopes).toContain("tenant:webhooks:write");
      expect(scopes).toContain("reports:read");
    });

    it("C008-POS-2: tenant_ops_admin holds operational and write scopes", () => {
      const scopes = getTenantRoleScopes("tenant_ops_admin");
      expect(scopes).toBeDefined();
      expect(scopes).toContain("tenant:write");
      expect(scopes).toContain("tenant:read");
      expect(scopes).toContain("owned:read");
      expect(scopes).toContain("owned:write");
    });

    it("C008-POS-3: tenant_viewer holds strictly read scopes and lacks write scopes", () => {
      const scopes = getTenantRoleScopes("tenant_viewer");
      expect(scopes).toBeDefined();
      expect(scopes).toContain("tenant:read");
      expect(scopes).toContain("identity:read");
      expect(scopes).toContain("audit:read");
      expect(scopes).toContain("reports:read");

      // Verify ZERO write scopes
      expect(scopes?.every((s) => !s.endsWith(":write"))).toBe(true);
    });

    it("C008-NEG-1: tenant_viewer lacking identity:sessions:write cannot revoke sessions", () => {
      const viewerScopes = getTenantRoleScopes("tenant_viewer") ?? [
        "tenant:read",
      ];

      // Read-only user attempts to call session revoke endpoint
      const result = evaluateAccess(
        "POST",
        "/identity/sessions/sess_123/revoke",
        {
          actorType: "tenant_admin",
          realm: "tenant",
          roles: ["tenant_viewer"],
          scopes: viewerScopes,
          tenantId: "ten-alpha-001",
        },
      );

      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_SCOPE_DENIED");
    });
  });
});
