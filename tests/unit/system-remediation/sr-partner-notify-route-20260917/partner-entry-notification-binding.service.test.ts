import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  computeEndpointFingerprint,
  PartnerEntryNotificationBindingService,
} from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.service";
import { PartnerEntryNotificationBindingRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.repository";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  WebhookDispatchService,
  type WebhookFetchResponse,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

const ENTRY_SLUG = "route-test-entry";
const WIRE_EVENT = "passenger.assignment_disclosure_ready.v1";
const TEST_WIRE_EVENT = "passenger.notification.test.v1";

const PLATFORM_IDENTITY: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "platform_admin",
  actorId: "admin-1",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  scopes: ["foundation:read", "foundation:write"],
  requestId: null,
};

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

function acceptedAckBody(deliveryId: string, notificationId: string) {
  return {
    notification_id: notificationId,
    delivery_id: deliveryId,
    partner_entry_slug: ENTRY_SLUG,
    status: "accepted",
    receipt_id: `receipt_${deliveryId}`,
  };
}

async function createHarness(
  fetchImpl: (
    input: string,
    init?: RequestInit,
  ) => Promise<WebhookFetchResponse>,
) {
  const webhookDispatchService = new WebhookDispatchService(fetchImpl);
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    webhookDispatchService,
  );
  const dispatchFacade = new PartnerNotificationDispatchFacade(
    tenantPartnerService,
  );
  const bindingRepository = new PartnerEntryNotificationBindingRepository();
  const bindingService = new PartnerEntryNotificationBindingService(
    bindingRepository,
    tenantPartnerService,
    dispatchFacade,
  );

  const entry = tenantPartnerService.createPlatformPartnerEntry({
    tenantId: "tenant-demo-001",
    partnerCode: "yuhe",
    partnerType: "bank_partner",
    programId: "program-1",
    entrySlug: ENTRY_SLUG,
    displayName: "Yuhe Residence",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
  });

  const createdEndpoint = tenantPartnerService.createWebhookEndpoint(
    entry.tenantId,
    {
      url: "https://partner.example.test/webhooks/passenger",
      secret: "whsec_partner_route_test",
      events: [WIRE_EVENT, TEST_WIRE_EVENT],
    },
  );
  const endpoint = tenantPartnerService.updateWebhookEndpoint(
    entry.tenantId,
    createdEndpoint.webhookId,
    { status: "active" },
  );

  return { tenantPartnerService, bindingService, bindingRepository, entry, endpoint };
}

describe("PartnerEntryNotificationBindingService", () => {
  it("putBinding creates a test_pending binding scoped to the entry's own tenant/partner", async () => {
    const { bindingService, entry, endpoint } = await createHarness(async () =>
      jsonResponse(200, null),
    );
    const binding = await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );
    expect(binding.tenantId).toBe(entry.tenantId);
    expect(binding.partnerId).toBe(entry.partnerId);
    expect(binding.state).toBe("test_pending");
    expect(binding.version).toBe(1);
  });

  it("putBinding rejects an event type the endpoint isn't subscribed to", async () => {
    const { bindingService, endpoint } = await createHarness(async () =>
      jsonResponse(200, null),
    );
    await expect(
      bindingService.putBinding(
        ENTRY_SLUG,
        {
          webhookId: endpoint.webhookId,
          // endpoint only subscribes to assignment_disclosure_ready + test
          eventTypes: ["driver_arrived"],
          expectedVersion: 0,
        },
        PLATFORM_IDENTITY,
      ),
    ).rejects.toThrow(ApiRequestError);
  });

  it("putBinding 404s a webhookId that doesn't belong to the entry's tenant", async () => {
    const { bindingService } = await createHarness(async () =>
      jsonResponse(200, null),
    );
    await expect(
      bindingService.putBinding(
        ENTRY_SLUG,
        {
          webhookId: "not-a-real-webhook",
          eventTypes: ["assignment_disclosure_ready"],
          expectedVersion: 0,
        },
        PLATFORM_IDENTITY,
      ),
    ).rejects.toThrow(ApiRequestError);
  });

  it("putBinding 403s a tenant-scoped identity outside the entry's tenant (resource scope check)", async () => {
    const { bindingService, endpoint } = await createHarness(async () =>
      jsonResponse(200, null),
    );
    const foreignTenantIdentity: BootstrapRequestIdentity = {
      ...PLATFORM_IDENTITY,
      tenantId: "some-other-tenant",
    };
    await expect(
      bindingService.putBinding(
        ENTRY_SLUG,
        {
          webhookId: endpoint.webhookId,
          eventTypes: ["assignment_disclosure_ready"],
          expectedVersion: 0,
        },
        foreignTenantIdentity,
      ),
    ).rejects.toThrow(ApiRequestError);
  });

  it("testBinding runs a passenger.notification.test.v1 dispatch and records the current endpoint fingerprint on success", async () => {
    const { bindingService, endpoint } = await createHarness(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse(200, acceptedAckBody(body.delivery_id, body.data.notification_id));
    });
    await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );

    const result = await bindingService.testBinding(ENTRY_SLUG, PLATFORM_IDENTITY);
    expect(result.kind).toBe("accepted");

    const binding = await bindingService.getBinding(ENTRY_SLUG, PLATFORM_IDENTITY);
    expect(binding.validatedAt).not.toBeNull();
    expect(binding.validatedEndpointFingerprint).toBe(
      computeEndpointFingerprint(endpoint),
    );
    // test does not itself flip state to ready
    expect(binding.state).toBe("test_pending");
  });

  it("enableBinding rejects when there is no successful test yet", async () => {
    const { bindingService, endpoint } = await createHarness(async () =>
      jsonResponse(200, null),
    );
    const binding = await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );
    await expect(
      bindingService.enableBinding(ENTRY_SLUG, binding.version, PLATFORM_IDENTITY),
    ).rejects.toThrow(ApiRequestError);
  });

  it("enableBinding rejects a stale validation after the endpoint URL rotates (fingerprint mismatch)", async () => {
    const { bindingService, tenantPartnerService, entry, endpoint } = await createHarness(
      async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse(200, acceptedAckBody(body.delivery_id, body.data.notification_id));
      },
    );
    const binding = await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );
    await bindingService.testBinding(ENTRY_SLUG, PLATFORM_IDENTITY);

    // Endpoint URL rotates after the successful test.
    tenantPartnerService.updateWebhookEndpoint(entry.tenantId, endpoint.webhookId, {
      url: "https://partner.example.test/webhooks/passenger-v2",
    });

    await expect(
      bindingService.enableBinding(ENTRY_SLUG, binding.version, PLATFORM_IDENTITY),
    ).rejects.toThrow(ApiRequestError);
  });

  it("enableBinding succeeds once validated against the current endpoint, and disableBinding reverts it", async () => {
    const { bindingService, endpoint } = await createHarness(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse(200, acceptedAckBody(body.delivery_id, body.data.notification_id));
    });
    const binding = await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );
    await bindingService.testBinding(ENTRY_SLUG, PLATFORM_IDENTITY);

    const enabled = await bindingService.enableBinding(
      ENTRY_SLUG,
      binding.version,
      PLATFORM_IDENTITY,
    );
    expect(enabled.state).toBe("ready");

    const disabled = await bindingService.disableBinding(
      ENTRY_SLUG,
      enabled.version,
      PLATFORM_IDENTITY,
    );
    expect(disabled.state).toBe("disabled");
  });

  it("testBinding surfaces a typed failure (not an accepted ack) on an invalid partner response, without touching validation state", async () => {
    const { bindingService, endpoint } = await createHarness(async () =>
      jsonResponse(204, null),
    );
    await bindingService.putBinding(
      ENTRY_SLUG,
      {
        webhookId: endpoint.webhookId,
        eventTypes: ["assignment_disclosure_ready"],
        expectedVersion: 0,
      },
      PLATFORM_IDENTITY,
    );

    const result = await bindingService.testBinding(ENTRY_SLUG, PLATFORM_IDENTITY);
    expect(result.kind).toBe("failed");

    const binding = await bindingService.getBinding(ENTRY_SLUG, PLATFORM_IDENTITY);
    expect(binding.validatedAt).toBeNull();
    expect(binding.validatedEndpointFingerprint).toBeNull();
  });
});

describe("computeEndpointFingerprint", () => {
  const base = {
    url: "https://partner.example.test/webhooks/passenger",
    events: ["passenger.assignment_disclosure_ready.v1"],
    secretVersion: 1,
    ownerRef: "owner-1",
    status: "active" as const,
  };

  it("is deterministic for identical inputs", () => {
    expect(computeEndpointFingerprint(base)).toBe(computeEndpointFingerprint({ ...base }));
  });

  it("changes when url, events, secretVersion, or ownerRef change", () => {
    const fp = computeEndpointFingerprint(base);
    expect(computeEndpointFingerprint({ ...base, url: base.url + "/v2" })).not.toBe(fp);
    expect(
      computeEndpointFingerprint({ ...base, events: [...base.events, "passenger.eta_changed.v1"] }),
    ).not.toBe(fp);
    expect(computeEndpointFingerprint({ ...base, secretVersion: 2 })).not.toBe(fp);
    expect(computeEndpointFingerprint({ ...base, ownerRef: "owner-2" })).not.toBe(fp);
  });

  it("is insensitive to event array order", () => {
    const a = computeEndpointFingerprint({
      ...base,
      events: ["passenger.eta_changed.v1", "passenger.driver_arrived.v1"],
    });
    const b = computeEndpointFingerprint({
      ...base,
      events: ["passenger.driver_arrived.v1", "passenger.eta_changed.v1"],
    });
    expect(a).toBe(b);
  });
});
