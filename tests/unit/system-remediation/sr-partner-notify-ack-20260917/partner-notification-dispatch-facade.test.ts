import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  WebhookDispatchService,
  type WebhookFetchResponse,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const TENANT_ID = "tenant-demo-001";
const WIRE_EVENT = "passenger.assignment_disclosure_ready.v1";

function jsonResponse(
  status: number,
  body: Record<string, unknown> | null,
): WebhookFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

/**
 * Builds a TenantPartnerService wired to a fully mocked WEBHOOK_FETCH, with
 * one webhook endpoint already created and activated (test_pending -> active)
 * so `dispatchPartnerNotificationAttempt` can reach the live-dispatch path.
 */
async function createHarness(
  fetchImpl: (
    input: string,
    init?: RequestInit,
  ) => Promise<WebhookFetchResponse>,
) {
  const webhookDispatchService = new WebhookDispatchService(fetchImpl);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    webhookDispatchService,
  );
  const facade = new PartnerNotificationDispatchFacade(service);

  const endpoint = service.createWebhookEndpoint(TENANT_ID, {
    url: "https://partner.example.test/webhooks/passenger",
    secret: "whsec_partner_ack_test",
    events: [WIRE_EVENT],
  });
  service.updateWebhookEndpoint(TENANT_ID, endpoint.webhookId, {
    status: "active",
  });

  return { service, facade, webhookId: endpoint.webhookId };
}

function buildWirePayload(overrides: {
  deliveryId: string;
  notificationId: string;
  expiresAt?: string;
  event?: string;
}) {
  return {
    event: overrides.event ?? WIRE_EVENT,
    deliveryId: overrides.deliveryId,
    occurredAt: new Date().toISOString(),
    tenantId: TENANT_ID,
    data: {
      schemaVersion: "1.0" as const,
      notificationId: overrides.notificationId,
      partnerEntrySlug: "yuhe-residence",
      recipient: { partnerUserRef: "partner_user_1" },
      rideRef: "ride_1",
      eventSequence: 1,
      assignmentVersion: 1,
      expiresAt:
        overrides.expiresAt ??
        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      message: "Your ride assignment is ready.",
      navigation: { type: "ride" as const, rideRef: "ride_1" },
    },
  };
}

function acceptedAckBody(deliveryId: string, notificationId: string) {
  return {
    notification_id: notificationId,
    delivery_id: deliveryId,
    partner_entry_slug: "yuhe-residence",
    status: "accepted",
    receipt_id: `partner_receipt_${deliveryId}`,
  };
}

describe("SR-PARTNER-NOTIFY-ACK-20260917: dispatchNotificationAttemptByWebhookId", () => {
  it("returns a validated accepted ack on a matching 200 response and calls the endpoint exactly once", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(200, acceptedAckBody("wd_1", "notif_1")),
      );
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_1",
        notificationId: "notif_1",
      }),
    });

    expect(outcome).toEqual({
      kind: "accepted",
      ack: {
        notificationId: "notif_1",
        deliveryId: "wd_1",
        partnerEntrySlug: "yuhe-residence",
        status: "accepted",
        receiptId: "partner_receipt_wd_1",
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies an HTTP-ok but invalid ack body as partner_ack_invalid / manual_only, never a success", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(204, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_2",
        notificationId: "notif_2",
      }),
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.failure.failureReason).toBe("partner_ack_invalid");
      expect(outcome.failure.retryDisposition).toBe("manual_only");
    }
  });

  it("classifies 401/403 as credential_rejected / configuration_blocked", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_3",
        notificationId: "notif_3",
      }),
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.failure.failureReason).toBe("credential_rejected");
      expect(outcome.failure.retryDisposition).toBe("configuration_blocked");
      expect(outcome.failure.suggestedNextAttemptAt).toBeNull();
    }
  });

  it("classifies 404/410 as endpoint_unavailable / configuration_blocked", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(404, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_4",
        notificationId: "notif_4",
      }),
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.failure.failureReason).toBe("endpoint_unavailable");
      expect(outcome.failure.retryDisposition).toBe("configuration_blocked");
    }
  });

  it("classifies a 503 as provider_transient_error / automatic with a suggested next attempt bounded by the endpoint's own retry policy", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(503, null));
    const { facade, service, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_5",
        notificationId: "notif_5",
      }),
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.failure.failureReason).toBe("provider_transient_error");
      expect(outcome.failure.retryDisposition).toBe("automatic");
      expect(outcome.failure.suggestedNextAttemptAt).not.toBeNull();
    }

    const [endpointView] = service.listWebhookEndpoints(TENANT_ID);
    // One remote HTTP call — but a single transient failure, still within
    // the endpoint's real retry policy (maxAttempts=5), must not disable
    // the shared endpoint on its very first attempt.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(endpointView?.status).toBe("active");
    expect(endpointView?.runtimeMetadata.failedDeliveryCount).toBe(0);
  });

  it("never starts a second automatic HTTP attempt on its own — one façade call is always exactly one remote attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(500, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_6",
        notificationId: "notif_6",
      }),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Advancing time does not cause a hidden retry timer to fire: no timer
    // was scheduled in the first place (forceSingleAttempt).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dedupes the endpoint's failed-delivery count by logical delivery id — only the exhausted final attempt counts, never every attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(500, null));
    const { facade, service, webhookId } = await createHarness(fetchImpl);

    const wirePayload = buildWirePayload({
      deliveryId: "wd_retry_same",
      notificationId: "notif_retry_same",
    });
    const [initialEndpointView] = service.listWebhookEndpoints(TENANT_ID);
    const maxAttempts = initialEndpointView!.retryPolicy.maxAttempts;

    // Every call reuses the same logical deliveryId — exactly what the
    // caller's own fence-transaction retry loop is required to do.
    for (let i = 0; i < maxAttempts; i += 1) {
      const outcome = await facade.dispatchNotificationAttemptByWebhookId({
        tenantId: TENANT_ID,
        webhookId,
        wirePayload,
      });
      if (i < maxAttempts - 1) {
        // Still within the endpoint's approved policy: automatic, endpoint
        // stays active, no disable yet.
        expect(outcome).toMatchObject({
          failure: { failureReason: "provider_transient_error" },
        });
        const [endpointView] = service.listWebhookEndpoints(TENANT_ID);
        expect(endpointView?.status).toBe("active");
        expect(endpointView?.runtimeMetadata.failedDeliveryCount).toBe(0);
      }
    }

    expect(fetchImpl).toHaveBeenCalledTimes(maxAttempts);
    const [exhaustedEndpointView] = service.listWebhookEndpoints(TENANT_ID);
    expect(exhaustedEndpointView?.runtimeMetadata.failedDeliveryCount).toBe(1);

    // One more call past exhaustion must not double-count the same logical
    // delivery a second time.
    await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload,
    });
    const [finalEndpointView] = service.listWebhookEndpoints(TENANT_ID);
    expect(finalEndpointView?.runtimeMetadata.failedDeliveryCount).toBe(1);
  });

  it("rejects an already-expired notification as terminal without making any HTTP attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_expired",
        notificationId: "notif_expired",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    });

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: {
        failureReason: "notification_expired",
        retryDisposition: "terminal",
        suggestedNextAttemptAt: null,
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects dispatch to an endpoint not subscribed to this event as configuration_blocked", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, null));
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_wrong_event",
        notificationId: "notif_wrong_event",
        event: "passenger.receipt_ready.v1",
      }),
    });

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { failureReason: "configuration_blocked" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects dispatch to a disabled endpoint as endpoint_disabled without an HTTP attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, null));
    const { facade, service, webhookId } = await createHarness(fetchImpl);
    service.updateWebhookEndpoint(TENANT_ID, webhookId, {
      status: "disabled",
      disableReason: "manual test disable",
    });

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_disabled",
        notificationId: "notif_disabled",
      }),
    });

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { failureReason: "endpoint_disabled" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects dispatch to a still test_pending endpoint as configuration_blocked (not yet governed ready for live traffic)", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, null));
    const webhookDispatchService = new WebhookDispatchService(fetchImpl);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      webhookDispatchService,
    );
    const facade = new PartnerNotificationDispatchFacade(service);
    const endpoint = service.createWebhookEndpoint(TENANT_ID, {
      url: "https://partner.example.test/webhooks/passenger",
      secret: "whsec_partner_ack_test",
      events: [WIRE_EVENT],
    });
    // Left as test_pending (createWebhookEndpoint's default) — never activated.

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId: endpoint.webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_pending",
        notificationId: "notif_pending",
      }),
    });

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { failureReason: "configuration_blocked" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns typed endpoint_unavailable for an unknown webhookId, never a tenant-wide scan", async () => {
    const fetchImpl = vi.fn();
    const { facade } = await createHarness(fetchImpl);

    await expect(
      facade.dispatchNotificationAttemptByWebhookId({
        tenantId: TENANT_ID,
        webhookId: "wh_does_not_exist",
        wirePayload: buildWirePayload({
          deliveryId: "wd_missing",
          notificationId: "notif_missing",
        }),
      }),
    ).resolves.toMatchObject({
      kind: "failed",
      failure: {
        failureReason: "endpoint_unavailable",
        retryDisposition: "configuration_blocked",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never leaks the signing secret in either an accepted ack or a typed failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(
          200,
          acceptedAckBody("wd_secret_check", "notif_secret_check"),
        ),
      );
    const { facade, webhookId } = await createHarness(fetchImpl);

    const outcome = await facade.dispatchNotificationAttemptByWebhookId({
      tenantId: TENANT_ID,
      webhookId,
      wirePayload: buildWirePayload({
        deliveryId: "wd_secret_check",
        notificationId: "notif_secret_check",
      }),
    });

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("whsec_partner_ack_test");
  });
});
