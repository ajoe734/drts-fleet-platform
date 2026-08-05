import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const TENANT_ID = "tenant-demo-001";

describe("tenant partner credential lifecycle integration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails partner credentials closed across entry scope, surfaces dormant-use notice, and auto-revokes elapsed overlap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T08:00:00.000Z"));

    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT =
      "pk_test_beta_ingress_secret";

    const audit = new AuditNotificationService();
    const service = new TenantPartnerService(audit);

    const rotated = service.issuePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      {
        rotationReason: "scheduled_rotation",
        overlapDays: 1,
      },
      "req-integ-partner-001",
    );

    expect(() =>
      service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-beta-airport",
          apiKey: "pk_test_alpha_ingress_secret",
        },
        "req-integ-partner-002",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PARTNER_API_KEY_INVALID",
          }),
        }),
      }),
    );

    vi.setSystemTime(new Date("2026-09-05T08:00:00.000Z"));

    const dormantResolution = service.authenticatePartnerBootstrap(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: rotated.plaintextKey,
      },
      "req-integ-partner-003",
    );
    expect(dormantResolution.identity.actorId).toBe(rotated.credential.keyId);
    expect(audit.listNotifications()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "ops_notice",
          title: "Dormant partner credential used",
        }),
      ]),
    );

    expect(() =>
      service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "pk_test_alpha_ingress_secret",
        },
        "req-integ-partner-004",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PARTNER_API_KEY_REVOKED",
          }),
        }),
      }),
    );

    expect(
      service.listPlatformPartnerIngressCredentials("bank-demo-alpha-airport"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "partner-key-alpha-demo",
          status: "auto_revoked",
          autoRevokedAt: "2026-08-03T08:00:00.000Z",
          revokeReason: "rotation_overlap_elapsed",
        }),
      ]),
    );
  });

  it("keeps webhook retries valid during overlap and fails closed after overlap expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T09:00:00.000Z"));

    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 410 })
      .mockResolvedValueOnce({ ok: false, status: 410 })
      .mockResolvedValueOnce({ ok: false, status: 410 });
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      new WebhookDispatchService(fetchImpl as never),
    );
    const tenantIdentity = {
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: TENANT_ID,
      roles: ["tc_admin"],
      scopes: ["tenant:webhooks:read", "tenant:webhooks:write", "tenant:read"],
      authMode: "jwt_bearer",
    } as const;

    const created = service.createWebhookEndpoint(
      TENANT_ID,
      {
        url: "https://tenant.example/webhooks/overlap-secret",
        secret: "whsec_overlap_v1",
        events: ["booking.created"],
      },
      "req-integ-webhook-001",
    );

    await service.sendTestWebhook(
      TENANT_ID,
      {
        webhookId: created.webhookId,
      },
      "req-integ-webhook-002",
    );

    const [failedDelivery] = service.listWebhookDeliveriesByWebhook(
      TENANT_ID,
      created.webhookId,
      "req-integ-webhook-003",
      tenantIdentity,
    );
    expect(failedDelivery).toMatchObject({
      status: "delivery_failed",
      secretVersion: 1,
    });

    vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));

    const rotated = await Promise.resolve(
      service.rotateWebhookSecret(
        TENANT_ID,
        {
          webhookId: created.webhookId,
          secret: "whsec_overlap_v2",
          rotationReason: "scheduled_rotation",
          overlapDays: 1,
        },
        "req-integ-webhook-004",
        tenantIdentity,
      ),
    );
    expect(rotated).toMatchObject({
      secretVersion: 2,
      overlapEndsAt: "2026-08-03T12:00:00.000Z",
    });

    const retryDuringOverlap = await service.retryWebhookDelivery(
      TENANT_ID,
      created.webhookId,
      failedDelivery.deliveryId,
      "req-integ-webhook-005",
      tenantIdentity,
    );
    expect(retryDuringOverlap).toMatchObject({
      deliveryId: failedDelivery.deliveryId,
      status: "delivery_failed",
      attempt: 2,
      secretVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date("2026-08-04T12:00:00.000Z"));

    const retryAfterOverlap = await service.retryWebhookDelivery(
      TENANT_ID,
      created.webhookId,
      failedDelivery.deliveryId,
      "req-integ-webhook-006",
      tenantIdentity,
    );
    expect(retryAfterOverlap).toMatchObject({
      deliveryId: failedDelivery.deliveryId,
      status: "delivery_failed",
      attempt: 3,
      httpStatus: null,
      secretVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const internalEndpoint = (
      service as unknown as {
        webhookEndpoints: Array<{
          webhookId: string;
          secretCredentials?: Array<{
            secretVersion: number;
            status: string;
            secretValue: string | null;
          }>;
        }>;
      }
    ).webhookEndpoints.find((endpoint) => endpoint.webhookId === created.webhookId);

    expect(internalEndpoint?.secretCredentials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretVersion: 1,
          status: "auto_revoked",
          secretValue: "",
        }),
      ]),
    );
  });

  it("enforces tenant API key single plaintext return, cross-tenant isolation, dual rotation overlap, and auditability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T10:00:00.000Z"));

    const audit = new AuditNotificationService();
    const service = new TenantPartnerService(audit);

    const tenantActor = {
      actorType: "tenant_admin",
      actorId: "user-tenant-admin-01",
      realm: "tenant",
      tenantId: TENANT_ID,
      roles: ["tc_admin"],
      scopes: ["tenant:write", "tenant:read"],
      authMode: "jwt_bearer",
    } as const;

    const issued = await service.issueApiKey(
      TENANT_ID,
      {
        keyName: "Partner Ingress Integration Key",
        scopes: ["tenant:bookings:write", "tenant:reports:read"],
        ownerRef: "usr_partner_owner_001",
        ownerName: "Partner Ops Lead",
        ownerType: "partner_admin",
        purpose: "Automated booking ingestion",
      },
      "req-tenant-key-001",
      tenantActor,
    );

    // 1. Plaintext returned once
    expect(issued.plaintextKey).toMatch(/^tk_/);
    expect(issued.apiKey.keyPrefix).toBeDefined();
    expect(issued.apiKey.maskedSuffix).toBeDefined();
    expect((issued.apiKey as unknown as Record<string, unknown>).plaintextKey).toBeUndefined();

    // 2. Listing keys does not return plaintext
    const keys = service.listApiKeys(TENANT_ID);
    const foundKey = keys.find((k) => k.apiKeyId === issued.apiKey.apiKeyId);
    expect(foundKey).toBeDefined();
    expect(foundKey?.ownerRef).toBe("usr_partner_owner_001");
    expect((foundKey as unknown as Record<string, unknown>).plaintextKey).toBeUndefined();

    // 3. Cross-tenant isolation check: cannot list keys for another tenant
    const otherTenantKeys = service.listApiKeys("tenant-other-999");
    expect(otherTenantKeys.find((k) => k.apiKeyId === issued.apiKey.apiKeyId)).toBeUndefined();

    // 4. Dual rotation overlap
    const rotated = await service.rotateApiKey(
      TENANT_ID,
      issued.apiKey.apiKeyId,
      {
        rotationReason: "scheduled_security_rotation",
        overlapDays: 2,
      },
      "req-tenant-key-002",
      tenantActor,
    );

    expect(rotated.plaintextKey).toMatch(/^tk_/);
    expect(rotated.revokedApiKeyId).toBe(issued.apiKey.apiKeyId);
    expect(rotated.overlapEndsAt).toBe("2026-08-04T10:00:00.000Z");

    // Check old key is in overlap_active status
    const keysAfterRotate = service.listApiKeys(TENANT_ID);
    const oldKeyRecord = keysAfterRotate.find((k) => k.apiKeyId === issued.apiKey.apiKeyId);
    expect(oldKeyRecord?.status).toBe("overlap_active");

    // Fast-forward past overlap
    vi.setSystemTime(new Date("2026-08-05T10:00:00.000Z"));

    // Revoke explicit key
    const revoked = await service.revokeApiKey(
      TENANT_ID,
      rotated.apiKey.apiKeyId,
      "req-tenant-key-003",
      tenantActor,
    );
    expect(revoked.status).toBe("revoked");

    // 5. Auditability check
    const auditLogs = audit.listNotifications();
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: TENANT_ID,
        }),
      ]),
    );
  });
});

