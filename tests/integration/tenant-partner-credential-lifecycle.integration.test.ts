import type { IdentityContext } from "@drts/contracts";
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
    const tenantIdentity: IdentityContext = {
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: TENANT_ID,
      roles: ["tc_admin"],
      roleFamilies: ["tenant"],
      scopes: ["tenant:webhooks:read", "tenant:webhooks:write", "tenant:read"],
      authMode: "jwt_bearer",
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    const created = await Promise.resolve(
      service.createWebhookEndpoint(
        TENANT_ID,
        {
          url: "https://tenant.example/webhooks/overlap-secret",
          secret: "whsec_overlap_v1",
          events: ["booking.created"],
        },
        "req-integ-webhook-001",
      ),
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
    expect(failedDelivery).toBeDefined();
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
});
