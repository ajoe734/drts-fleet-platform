import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type ProviderAcknowledgement,
  type TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

// This is a controlled receiver (an injected test transport), not a live
// SMTP/network integration; SR-NOTIFY-001's own suite carries that evidence.
describe("SR-MAIL-001 tenant invitation email delivery", () => {
  let directory: string;
  let clock: number;
  const now = () => new Date(clock);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-001-outbox-"));
    clock = Date.parse("2026-09-06T08:00:00.000Z");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acknowledgement(
    id = "controlled-receiver-message-001",
  ): ProviderAcknowledgement {
    return {
      provider: "controlled-test-receiver",
      response: `250 Accepted as ${id}`,
      providerMessageId: id,
      acceptedAt: now().toISOString(),
    };
  }

  function acceptingTransport() {
    return {
      provider: "controlled-test-receiver",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        return acknowledgement();
      }),
    };
  }

  function deliveryService(transport: MailTransport | null = null) {
    return new NotificationDeliveryService(
      new FileMailOutbox(directory),
      transport,
      {
        now,
        maxAttempts: 3,
        retryDelayMs: 1_000,
        leaseMs: 1_000,
      },
    );
  }

  function request(
    overrides: Partial<TenantInvitationDeliveryRequest> = {},
  ): TenantInvitationDeliveryRequest {
    return {
      invitationId: `invitation_${Math.random().toString(36).slice(2)}`,
      tenantId: "tenant-controlled-001",
      recipientEmail: "invitee@controlled-receiver.test",
      displayName: "Controlled Invitee",
      expiresAt: "2026-09-07T08:00:00.000Z",
      rawToken: "ti_super-secret-one-time-proof",
      ...overrides,
    };
  }

  it("delivers a real invitation to the controlled receiver and reports sent", async () => {
    const transport = acceptingTransport();
    const service = new TenantInvitationDeliveryService(
      deliveryService(transport),
    );
    const input = request();

    const record = await service.send(input);

    expect(transport.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tenantId: input.tenantId,
        recipientEmail: input.recipientEmail,
      }),
    );
    // The raw token only ever reaches the transport payload.
    const sentMessage = transport.send.mock.calls[0]?.[0] as TransportMessage;
    expect(sentMessage.body).toContain(input.rawToken);

    expect(record).toMatchObject({
      invitationId: input.invitationId,
      tenantId: input.tenantId,
      recipientEmail: input.recipientEmail,
      status: "sent",
      providerMessageId: "controlled-receiver-message-001",
      errorCode: null,
    });
    expect(record.sentAt).toBe(now().toISOString());
    expect(record).not.toHaveProperty("rawToken");
  });

  it("never resends an invitation that already succeeded (idempotent retry after restart)", async () => {
    const transport = acceptingTransport();
    const service = deliveryService(transport);
    const input = request();

    const first = await new TenantInvitationDeliveryService(service).send(
      input,
    );
    // A fresh adapter instance simulates a process restart reusing the same
    // durable outbox directory.
    const retry = await new TenantInvitationDeliveryService(service).send(
      input,
    );

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(retry).toMatchObject({
      status: "sent",
      deliveryId: first.deliveryId,
    });
    expect(retry.sentAt).toBe(first.sentAt);
  });

  it("scopes idempotent delivery identity to the tenant", async () => {
    const transport = acceptingTransport();
    const service = new TenantInvitationDeliveryService(
      deliveryService(transport),
    );
    const tenantA = await service.send(
      request({ tenantId: "tenant-a", invitationId: "invitation_shared" }),
    );
    const tenantB = await service.send(
      request({ tenantId: "tenant-b", invitationId: "invitation_shared" }),
    );

    expect(tenantA.deliveryId).not.toBe(tenantB.deliveryId);
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("reports a failed (never delivered) status when the provider is unconfigured", async () => {
    const service = deliveryService(null);
    expect(service.availability()).toBe("unavailable");
    const adapter = new TenantInvitationDeliveryService(service);

    const record = await adapter.send(request());

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toMatch(/unavailable/);
  });

  it("reports an explicit unavailable status without touching storage when no delivery service is wired", async () => {
    const adapter = new TenantInvitationDeliveryService(null);

    const record = await adapter.send(request());

    expect(record).toMatchObject({
      status: "unavailable",
      sentAt: null,
      messageId: null,
      errorCode: "notification_outbox_unavailable",
    });
  });

  it("defaults to unavailable (never fakes delivered) with the bare no-arg constructor", async () => {
    const adapter = new TenantInvitationDeliveryService();

    const record = await adapter.send(request());

    expect(record.status).toBe("unavailable");
    expect(record.sentAt).toBeNull();
  });

  it("surfaces a permanent provider rejection as failed and stops retrying", async () => {
    const transport = {
      provider: "controlled-test-receiver",
      send: vi.fn(async () => {
        throw new DeliveryTransportError("recipient_rejected", false);
      }),
    };
    const adapter = new TenantInvitationDeliveryService(
      deliveryService(transport),
    );

    const record = await adapter.send(request());

    expect(record).toMatchObject({
      status: "failed",
      sentAt: null,
      errorCode: "recipient_rejected",
    });
  });

  it("never crashes the caller on an invalid recipient address and reports a bounded error code", async () => {
    const transport = acceptingTransport();
    const adapter = new TenantInvitationDeliveryService(
      deliveryService(transport),
    );

    const record = await adapter.send(
      request({ recipientEmail: "not-a-valid-email" }),
    );

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toMatch(/^[a-z][a-z0-9_]{0,99}$/i);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("keeps arbitrary exception content (including the raw token) out of the returned delivery record", async () => {
    const service = deliveryService(acceptingTransport());
    const input = request();
    vi.spyOn(service, "enqueue").mockRejectedValueOnce(
      new Error(`storage exploded while writing ${input.rawToken}`),
    );
    const adapter = new TenantInvitationDeliveryService(service);

    const record = await adapter.send(input);

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toBe("tenant_invitation_delivery_error");
    expect(JSON.stringify(record)).not.toContain(input.rawToken);
  });

  it("lists deliveries most-recent first without ever exposing the raw token or leaking mutation", async () => {
    const transport = acceptingTransport();
    const adapter = new TenantInvitationDeliveryService(
      deliveryService(transport),
    );
    await adapter.send(request({ invitationId: "invitation_list_1" }));
    await adapter.send(request({ invitationId: "invitation_list_2" }));

    const listed = adapter.listDeliveries();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.invitationId).toBe("invitation_list_2");
    expect(listed.every((entry) => !("rawToken" in entry))).toBe(true);
    listed[0]!.status = "unavailable";
    expect(adapter.listDeliveries()[0]?.status).toBe("sent");
  });
});
