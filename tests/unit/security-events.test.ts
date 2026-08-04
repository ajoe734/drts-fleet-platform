import { describe, expect, it, vi } from "vitest";

import type { IdentityContext, SecurityEventRecord } from "@drts/contracts";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SecurityEventsRepository } from "../../apps/api/src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";
const OTHER_TENANT_ID = "tenant-other-001";

function makeIdentity(
  overrides: Partial<IdentityContext> = {},
): IdentityContext {
  return {
    actorType: "tenant_admin",
    actorId: "tenant-admin-001",
    realm: "tenant",
    authMode: "jwt_bearer",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["identity:users:manage", "identity:credentials:issue"],
    tenantId: TENANT_ID,
    supportedExecutionModes: [
      "discussion_planning",
      "supervisor_managed_execution",
    ],
    ...overrides,
  };
}

describe("security events service", () => {
  it("masks sensitive fields and enforces tenant-bound event queries", async () => {
    const service = new SecurityEventsService();

    service.recordEvent({
      actorId: "tenant-admin-001",
      actorType: "tenant_admin",
      subjectId: "person@example.com",
      realm: "tenant",
      tenantId: TENANT_ID,
      partnerId: null,
      eventType: "tenant_user.invited",
      eventFamily: "invitation",
      outcome: "success",
      severity: "medium",
      targetType: "tenant_user_role",
      targetId: "tenant-user-001",
      sessionId: null,
      tokenId: "refresh-secret-001",
      authMethods: ["jwt_bearer"],
      sourceIp: "203.0.113.19",
      userAgent: "Mozilla/5.0",
      requestId: "req-001",
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: {
        email: "person@example.com",
      },
      maskedContext: {
        email: "person@example.com",
        authorization: "Bearer secret-value",
        deviceId: "ios-device-001",
        headers: {
          cookie: "session-cookie",
        },
      },
    });

    service.recordEvent({
      actorId: "tenant-admin-002",
      actorType: "tenant_admin",
      subjectId: "other@example.com",
      realm: "tenant",
      tenantId: OTHER_TENANT_ID,
      partnerId: null,
      eventType: "tenant_api_key.issued",
      eventFamily: "credential",
      outcome: "success",
      severity: "high",
      targetType: "tenant_api_key",
      targetId: "api-key-002",
      sessionId: null,
      tokenId: "plaintext-key-002",
      authMethods: ["jwt_bearer"],
      sourceIp: "198.51.100.10",
      userAgent: "curl/8.0",
      requestId: "req-002",
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: null,
      maskedContext: {},
    });

    const items = await service.listEvents(makeIdentity(), {
      tenantId: OTHER_TENANT_ID,
      limit: 10,
    });

    expect(items).toHaveLength(1);
    const event = items[0]!;
    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.subjectIdHash).toMatch(/^sha256:/);
    expect(event.tokenIdHash).toMatch(/^sha256:/);
    expect(event.userAgentHash).toMatch(/^sha256:/);
    expect(event.sourceIpPrefix).toBe("203.0.113.0/24");
    expect(event.afterSummary).toMatchObject({
      email: "p***@example.com",
    });
    expect(event.maskedContext).toMatchObject({
      email: "p***@example.com",
      authorization: "[REDACTED]",
      headers: {
        cookie: "[REDACTED]",
      },
    });
    expect((event.maskedContext as { deviceId?: string }).deviceId).toMatch(
      /^sha256:/,
    );
  });

  it("publishes the required auth and governance matrix", () => {
    const service = new SecurityEventsService();

    expect(service.listMatrix().map((entry) => entry.eventType)).toEqual(
      expect.arrayContaining([
        "tenant_bootstrap_session.issued",
        "tenant_user.invited",
        "tenant_api_key.issued",
        "step_up.proof_issued",
        "step_up.denied",
        "step_up.satisfied",
        "break_glass.activated",
      ]),
    );
  });
});

describe("tenant-partner privileged security events", () => {
  it("fails tenant-user invite when required security persistence is unavailable", async () => {
    const repository = {
      append: vi.fn(async () => {
        throw new Error("security events unavailable");
      }),
      isEnabled: () => true,
      reportPersistenceFailure: vi.fn(),
    } as unknown as SecurityEventsRepository;

    const securityEventsService = new SecurityEventsService(repository);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
    );

    const before = service.listTenantUsers(TENANT_ID).length;

    await expect(
      Promise.resolve(
        service.createTenantUser(
          TENANT_ID,
          {
            email: "security-event-fail@example.com",
            displayName: "Security Event Fail",
            roleCode: "tenant_admin",
          },
          "req-fail-001",
          makeIdentity(),
        ),
      ),
    ).rejects.toThrow("security events unavailable");

    expect(service.listTenantUsers(TENANT_ID)).toHaveLength(before);
  });

  it("derives the actor from current identity and redacts plaintext api keys", async () => {
    const securityEventsService = new SecurityEventsService();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
    );

    const identity = makeIdentity({ actorId: "tenant-admin-777" });
    const issued = await Promise.resolve(
      service.issueApiKey(
        TENANT_ID,
        {
          keyName: "Ops Key",
          scopes: ["tenant:reports:read"],
        },
        "req-key-001",
        identity,
      ),
    );

    const items = await securityEventsService.listEvents(identity, {
      eventType: "tenant_api_key.issued",
      limit: 1,
    });

    expect(items).toHaveLength(1);
    const event = items[0] as SecurityEventRecord;
    expect(event.actorId).toBe("tenant-admin-777");
    expect(event.actorType).toBe("tenant_admin");
    expect(event.maskedContext).toMatchObject({
      plaintextKey: "[REDACTED]",
    });
    expect(JSON.stringify(event)).not.toContain(issued.plaintextKey);
  });
});
