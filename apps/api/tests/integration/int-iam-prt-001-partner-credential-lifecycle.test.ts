import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type {
  PersistTenantPartnerChanges,
  TenantPartnerState,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../src/modules/tenant-partner/webhook-dispatch.service";

const TENANT_A = "tenant-demo-001";
const TENANT_B = "tenant-demo-002";

function cloneState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createEmptyTenantPartnerState(): TenantPartnerState {
  return {
    notificationPreferences: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    slaProfiles: [],
    partnerEntries: [],
    partnerIngressCredentials: [],
    partnerEligibilityVerifications: [],
    approvalRules: [],
    approvalRequests: [],
    approvalDecisions: [],
    passengers: [],
    addresses: [],
    costCenters: [],
    quotaPolicies: [],
    quotaLedger: [],
    quotaMonthlySnapshots: [],
    userRoles: [],
    apiKeys: [],
  };
}

function mergeByKey<T>(
  current: readonly T[],
  incoming: readonly T[] | undefined,
  keyOf: (value: T) => string,
) {
  const merged = new Map(current.map((value) => [keyOf(value), value]));
  for (const value of incoming ?? []) {
    merged.set(keyOf(value), value);
  }
  return [...merged.values()];
}

/**
 * Durable double for the jsonb snapshot tables that back tenant API keys and
 * webhook endpoints. It survives across service instances so a rotation can be
 * replayed through an API restart, which is the seam the unit suite cannot
 * reach.
 */
function createDurableTenantPartnerRepository() {
  let state = createEmptyTenantPartnerState();

  return {
    isEnabled: vi.fn(() => true),
    loadState: vi.fn(async () => cloneState(state)),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      state = {
        ...state,
        webhookEndpoints: mergeByKey(
          state.webhookEndpoints,
          changes.webhookEndpoints,
          (value) => value.webhookId,
        ),
        webhookDeliveries: mergeByKey(
          state.webhookDeliveries,
          changes.webhookDeliveries,
          (value) => value.deliveryId,
        ),
        partnerIngressCredentials: mergeByKey(
          state.partnerIngressCredentials,
          changes.partnerIngressCredentials,
          (value) => value.keyId,
        ),
        apiKeys: mergeByKey(
          state.apiKeys,
          changes.apiKeys,
          (value) => value.apiKeyId,
        ),
      };
    }),
    reportPersistenceFailure: vi.fn(),
    getState: () => cloneState(state),
  };
}

type DurableRepository = ReturnType<typeof createDurableTenantPartnerRepository>;

async function createCredentialSurface(
  repository: DurableRepository,
  fetchImpl?: ReturnType<typeof vi.fn>,
) {
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository as never,
    fetchImpl ? new WebhookDispatchService(fetchImpl as never) : undefined,
    [],
  );
  await service.onModuleInit();

  // Only the credential endpoints are exercised here, so the billing, owned
  // mobility, and JWT collaborators stay unwired.
  const controller = new TenantPartnerController(
    service,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  return { service, controller };
}

function expectErrorCode(error: unknown) {
  return (
    error as { getResponse: () => { error: { code: string } } }
  ).getResponse().error.code;
}

describe("IAM-PRT-001 partner credential lifecycle across restart", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("carries owner expiry and rotation overlap through the tenant control surface and an API restart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));

    const repository = createDurableTenantPartnerRepository();
    const { controller } = await createCredentialSurface(repository);

    const issued = await controller.issueApiKey(
      {
        keyName: "Nightly reconciliation",
        scopes: ["tenant:write"],
        ownerRef: "tenant-admin-001",
        ownerName: "Tenant Admin",
        ownerType: "tenant_admin",
        purpose: "nightly reconciliation",
      },
      null,
      TENANT_A,
      "req-iam-prt-001-issue",
    );

    expect(issued.data.plaintextKey).toEqual(expect.any(String));
    expect(issued.data.apiKey).toMatchObject({
      ownerRef: "tenant-admin-001",
      ownerName: "Tenant Admin",
      ownerType: "tenant_admin",
      purpose: "nightly reconciliation",
      status: "active",
      lastUsedAt: null,
    });
    expect(issued.data.apiKey.expiresAt).toEqual(expect.any(String));

    const plaintextKey = issued.data.plaintextKey;
    const listed = controller.listApiKeys(TENANT_A, "req-iam-prt-001-list");
    expect(JSON.stringify(listed)).not.toContain(plaintextKey);
    expect(JSON.stringify(listed)).not.toContain("keyHash");

    vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
    const rotated = await controller.rotateApiKey(
      issued.data.apiKey.apiKeyId,
      { overlapDays: 2 },
      null,
      TENANT_A,
      "req-iam-prt-001-rotate",
    );

    expect(rotated.data.plaintextKey).not.toBe(plaintextKey);
    expect(rotated.data.revokedApiKeyId).toBe(issued.data.apiKey.apiKeyId);

    // Restart the API against the persisted snapshot: owner, expiry, and the
    // rotation overlap must all survive the reload.
    const restarted = await createCredentialSurface(repository);
    const afterRestart = restarted.controller.listApiKeys(
      TENANT_A,
      "req-iam-prt-001-restart-list",
    );

    expect(afterRestart.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: rotated.data.apiKey.apiKeyId,
          status: "active",
          ownerRef: "tenant-admin-001",
          purpose: "nightly reconciliation",
          rotatedFromApiKeyId: issued.data.apiKey.apiKeyId,
        }),
        expect.objectContaining({
          apiKeyId: issued.data.apiKey.apiKeyId,
          status: "overlap_active",
          ownerName: "Tenant Admin",
          expiresAt: issued.data.apiKey.expiresAt,
          overlapEndsAt: "2026-08-05T00:00:00.000Z",
          supersededByApiKeyId: rotated.data.apiKey.apiKeyId,
        }),
      ]),
    );

    // The overlap window still elapses on the restarted instance.
    vi.setSystemTime(new Date("2026-08-06T00:00:00.000Z"));
    const afterOverlap = restarted.controller.listApiKeys(
      TENANT_A,
      "req-iam-prt-001-overlap-list",
    );
    expect(afterOverlap.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: issued.data.apiKey.apiKeyId,
          status: "auto_revoked",
          autoRevokedAt: "2026-08-05T00:00:00.000Z",
          revokeReason: "rotation_overlap_elapsed",
        }),
      ]),
    );
  });

  it("fails closed when a revoked auto-revoked or expired tenant API key is rotated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));

    const repository = createDurableTenantPartnerRepository();
    const { controller } = await createCredentialSurface(repository);

    const manual = await controller.issueApiKey(
      { keyName: "Manual revoke key", scopes: ["tenant:write"] },
      null,
      TENANT_A,
      "req-iam-prt-001-manual-issue",
    );
    await controller.revokeApiKey(
      manual.data.apiKey.apiKeyId,
      null,
      TENANT_A,
      "req-iam-prt-001-manual-revoke",
    );

    await expect(
      controller.rotateApiKey(
        manual.data.apiKey.apiKeyId,
        { overlapDays: 2 },
        null,
        TENANT_A,
        "req-iam-prt-001-manual-rotate",
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "TENANT_API_KEY_NOT_ROTATABLE",
          }),
        }),
      }),
    );

    expect(
      controller.listApiKeys(TENANT_A, "req-iam-prt-001-manual-list").data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: manual.data.apiKey.apiKeyId,
          status: "revoked",
          revokeReason: "manual_revoke",
          overlapEndsAt: null,
          supersededByApiKeyId: null,
        }),
      ]),
    );

    // An auto-revoked key must not be rotated back into a fresh overlap window,
    // and the failed rotation must not retire the live key as a side effect.
    const first = await controller.issueApiKey(
      { keyName: "Overlap key", scopes: ["tenant:write"] },
      null,
      TENANT_B,
      "req-iam-prt-001-auto-issue",
    );
    const second = await controller.rotateApiKey(
      first.data.apiKey.apiKeyId,
      { overlapDays: 1 },
      null,
      TENANT_B,
      "req-iam-prt-001-auto-rotate",
    );

    vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));
    await expect(
      controller.rotateApiKey(
        first.data.apiKey.apiKeyId,
        { overlapDays: 2 },
        null,
        TENANT_B,
        "req-iam-prt-001-auto-rerotate",
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "TENANT_API_KEY_NOT_ROTATABLE",
          }),
        }),
      }),
    );

    expect(
      controller.listApiKeys(TENANT_B, "req-iam-prt-001-auto-list").data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: first.data.apiKey.apiKeyId,
          status: "auto_revoked",
          revokeReason: "rotation_overlap_elapsed",
          supersededByApiKeyId: second.data.apiKey.apiKeyId,
        }),
        expect.objectContaining({
          apiKeyId: second.data.apiKey.apiKeyId,
          status: "active",
        }),
      ]),
    );

    // Expiry is owned by the credential, so an elapsed key is equally unrotatable.
    const expiring = await controller.issueApiKey(
      {
        keyName: "Short lived key",
        scopes: ["tenant:write"],
        expiresAt: "2026-08-06T00:00:00.000Z",
      },
      null,
      TENANT_A,
      "req-iam-prt-001-expiring-issue",
    );

    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    try {
      await controller.rotateApiKey(
        expiring.data.apiKey.apiKeyId,
        { overlapDays: 2 },
        null,
        TENANT_A,
        "req-iam-prt-001-expiring-rotate",
      );
      throw new Error("Expected expired tenant API key rotation to fail.");
    } catch (error) {
      expect(expectErrorCode(error)).toBe("TENANT_API_KEY_NOT_ROTATABLE");
    }

    expect(
      controller.listApiKeys(TENANT_A, "req-iam-prt-001-expiring-list").data
        .items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: expiring.data.apiKey.apiKeyId,
          status: "expired",
          overlapEndsAt: null,
        }),
      ]),
    );
  });

  it("isolates tenant API key reads and lifecycle commands across tenants", async () => {
    const repository = createDurableTenantPartnerRepository();
    const { controller } = await createCredentialSurface(repository);

    const tenantAKey = await controller.issueApiKey(
      { keyName: "Tenant A key", scopes: ["tenant:write"] },
      null,
      TENANT_A,
      "req-iam-prt-001-cross-issue",
    );

    const tenantBView = controller.listApiKeys(
      TENANT_B,
      "req-iam-prt-001-cross-list",
    );
    expect(
      tenantBView.data.items.some(
        (item) => item.apiKeyId === tenantAKey.data.apiKey.apiKeyId,
      ),
    ).toBe(false);

    for (const attempt of [
      () =>
        controller.rotateApiKey(
          tenantAKey.data.apiKey.apiKeyId,
          { overlapDays: 1 },
          null,
          TENANT_B,
          "req-iam-prt-001-cross-rotate",
        ),
      () =>
        controller.revokeApiKey(
          tenantAKey.data.apiKey.apiKeyId,
          null,
          TENANT_B,
          "req-iam-prt-001-cross-revoke",
        ),
    ]) {
      await expect(attempt()).rejects.toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: "API_KEY_NOT_FOUND" }),
          }),
        }),
      );
    }

    expect(
      controller.listApiKeys(TENANT_A, "req-iam-prt-001-cross-owner-list").data
        .items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: tenantAKey.data.apiKey.apiKeyId,
          status: "active",
        }),
      ]),
    );
  });

  it("never returns expired webhook secret material to a signing window on rotation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));

    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 410 });
    const repository = createDurableTenantPartnerRepository();
    const { service } = await createCredentialSurface(repository, fetchImpl);

    const tenantAdminIdentity = {
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: TENANT_A,
      roles: ["tc_admin"],
      scopes: ["tenant:webhooks:read", "tenant:webhooks:write", "tenant:read"],
    } as const;

    const created = service.createWebhookEndpoint(
      TENANT_A,
      {
        url: "https://tenant.example/webhooks/iam-prt-001",
        secret: "whsec_expiring_v1",
        events: ["booking.created"],
        expiresAt: "2026-08-04T00:00:00.000Z",
      },
      "req-iam-prt-001-webhook-create",
    );

    await service.sendTestWebhook(
      TENANT_A,
      { webhookId: created.webhookId },
      "req-iam-prt-001-webhook-test",
    );
    const [failedDelivery] = service.listWebhookDeliveriesByWebhook(
      TENANT_A,
      created.webhookId,
      "req-iam-prt-001-webhook-deliveries",
      tenantAdminIdentity,
    );
    expect(failedDelivery).toMatchObject({
      status: "delivery_failed",
      secretVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // v1 expires before the operator gets around to rotating it.
    vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));
    const rotated = service.rotateWebhookSecret(
      TENANT_A,
      {
        webhookId: created.webhookId,
        secret: "whsec_expiring_v2",
        rotationReason: "expired_secret_recovery",
        overlapDays: 2,
      },
      "req-iam-prt-001-webhook-rotate",
    );
    expect(rotated).toMatchObject({ secretVersion: 2 });

    const [endpoint] = service
      .listWebhookEndpoints(TENANT_A)
      .filter((candidate) => candidate.webhookId === created.webhookId);
    expect(endpoint.secretHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretVersion: 1,
          overlapEndsAt: null,
          supersededByVersion: 2,
        }),
        expect.objectContaining({ secretVersion: 2, status: "active" }),
      ]),
    );
    const retiredSecret = endpoint.secretHistory?.find(
      (record) => record.secretVersion === 1,
    );
    expect(retiredSecret?.status).not.toBe("active");
    expect(retiredSecret?.status).not.toBe("overlap_active");

    // A v1 retry must fail closed instead of signing with resurrected material.
    const retried = await service.retryWebhookDelivery(
      TENANT_A,
      created.webhookId,
      failedDelivery.deliveryId,
      "req-iam-prt-001-webhook-retry",
      tenantAdminIdentity,
    );
    expect(retried).toMatchObject({
      deliveryId: failedDelivery.deliveryId,
      status: "delivery_failed",
      httpStatus: null,
      secretVersion: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
