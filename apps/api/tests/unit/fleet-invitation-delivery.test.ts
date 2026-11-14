import { describe, expect, it, vi } from "vitest";

import {
  FleetInvitationDeliveryService,
  buildFleetInvitationEmailBody,
  type FleetInvitationDeliveryRequest,
} from "../../src/modules/fleet-partner/fleet-invitation-delivery.service";
import { NotificationDeliveryService } from "../../src/modules/notification-delivery/notification-delivery.service";
import type {
  MailOutbox,
  MailTransport,
  OutboxState,
  PlatformTransportMessage,
  ProviderAcknowledgement,
} from "../../src/modules/notification-delivery/notification-delivery.types";

// FLEET-ONB-003 SA/SD §7: Fleet staff invitation delivery is platform mail,
// never retained in the tenant outbox (the body carries the one-time
// token). Structure mirrors how AgencyInvitationDeliveryService's own
// transport contract is exercised: only an acknowledged `sendPlatform` call
// counts as "sent".
function neverCalledOutbox(): MailOutbox {
  return {
    transaction: vi.fn(async (operation: (state: OutboxState) => unknown) => {
      throw new Error(
        `platform mail must never touch the tenant outbox: ${operation}`,
      );
    }),
  };
}

function acceptingTransport() {
  return {
    provider: "controlled-test-receiver",
    send: vi.fn(),
    sendPlatform: vi.fn(
      async (message: PlatformTransportMessage): Promise<ProviderAcknowledgement> => ({
        provider: "controlled-test-receiver",
        response: "250 Accepted",
        providerMessageId: `msg-${message.deliveryId}`,
        acceptedAt: "2026-11-14T00:00:00.000Z",
      }),
    ),
  } satisfies MailTransport;
}

function request(
  overrides: Partial<FleetInvitationDeliveryRequest> = {},
): FleetInvitationDeliveryRequest {
  return {
    invitationId: "invitation_fleet_001",
    fleetPartnerId: "fleet-demo-001",
    entrySlug: "fleet-demo-001",
    recipientEmail: "invitee@fleet.example.org",
    expiresAt: "2026-11-15T00:00:00.000Z",
    rawToken: "fi_super-secret-one-time-proof",
    ...overrides,
  };
}

describe("FleetInvitationDeliveryService", () => {
  it("delivers through sendPlatform and reports sent", async () => {
    const transport = acceptingTransport();
    const delivery = new NotificationDeliveryService(
      neverCalledOutbox(),
      transport,
    );
    const service = new FleetInvitationDeliveryService(delivery);

    const record = await service.send(request());

    expect(transport.sendPlatform).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tenantId: null,
        recipientEmail: "invitee@fleet.example.org",
      }),
    );
    expect(record).toMatchObject({
      invitationId: "invitation_fleet_001",
      fleetPartnerId: "fleet-demo-001",
      entrySlug: "fleet-demo-001",
      recipientEmail: "invitee@fleet.example.org",
      status: "sent",
    });
    expect(record).not.toHaveProperty("rawToken");
  });

  it("puts the raw token only in the email body, never in the returned record", async () => {
    const transport = acceptingTransport();
    const delivery = new NotificationDeliveryService(
      neverCalledOutbox(),
      transport,
    );
    const service = new FleetInvitationDeliveryService(delivery);
    const input = request();

    const record = await service.send(input);

    const sentMessage = transport.sendPlatform.mock
      .calls[0]?.[0] as PlatformTransportMessage;
    expect(sentMessage.body).toContain(input.rawToken);
    expect(JSON.stringify(record)).not.toContain(input.rawToken);
  });

  it("reports unavailable without calling the transport when no delivery service is wired", async () => {
    const service = new FleetInvitationDeliveryService(null);

    const record = await service.send(request());

    expect(record).toMatchObject({ status: "unavailable" });
  });

  it("defaults to unavailable with the bare no-arg constructor", async () => {
    const service = new FleetInvitationDeliveryService();

    const record = await service.send(request());

    expect(record.status).toBe("unavailable");
  });

  it("reports unavailable (never fabricates sent) when the transport has no sendPlatform", async () => {
    const transport: MailTransport = {
      provider: "legacy-tenant-only",
      send: vi.fn(),
    };
    const delivery = new NotificationDeliveryService(
      neverCalledOutbox(),
      transport,
    );
    const service = new FleetInvitationDeliveryService(delivery);

    const record = await service.send(request());

    expect(record.status).toBe("unavailable");
  });

  it("reports failed when the provider acknowledgement does not match the transport", async () => {
    const transport: MailTransport = {
      provider: "controlled-test-receiver",
      send: vi.fn(),
      sendPlatform: vi.fn(async () => ({
        provider: "a-different-provider",
        response: "250 Accepted",
        providerMessageId: null,
        acceptedAt: "2026-11-14T00:00:00.000Z",
      })),
    };
    const delivery = new NotificationDeliveryService(
      neverCalledOutbox(),
      transport,
    );
    const service = new FleetInvitationDeliveryService(delivery);

    const record = await service.send(request());

    expect(record.status).toBe("failed");
  });

  it("reports failed and never throws when the transport rejects", async () => {
    const transport: MailTransport = {
      provider: "controlled-test-receiver",
      send: vi.fn(),
      sendPlatform: vi.fn(async () => {
        throw new Error("synthetic transport failure");
      }),
    };
    const delivery = new NotificationDeliveryService(
      neverCalledOutbox(),
      transport,
    );
    const service = new FleetInvitationDeliveryService(delivery);

    await expect(service.send(request())).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("builds the email body with an accept link when FLEET_INVITATION_ACCEPT_URL_BASE is set", () => {
    const body = buildFleetInvitationEmailBody(
      request({ rawToken: "fi_token_for_link" }),
      "https://fleet.example.org/invite",
    );
    expect(body).toContain(
      "https://fleet.example.org/invite?token=fi_token_for_link",
    );
  });

  it("falls back to a bare invitation code when no accept URL base is configured", () => {
    const body = buildFleetInvitationEmailBody(
      request({ rawToken: "fi_token_bare" }),
      undefined,
    );
    expect(body).toContain("Invitation code: fi_token_bare");
    expect(body).not.toContain("http");
  });
});
