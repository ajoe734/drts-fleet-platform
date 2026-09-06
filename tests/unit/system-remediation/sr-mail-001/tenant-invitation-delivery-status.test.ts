import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IdentityContext } from "@drts/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  MailTransport,
  ProviderAcknowledgement,
  TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { TenantInvitationDeliveryService } from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// Real invitation issuance/acceptance wired to the SR-NOTIFY-001 durable core
// through a controlled receiver transport (not a live network/SMTP host).
describe("SR-MAIL-001 tenant invitation delivery semantics", () => {
  let directory: string;
  let clock: number;
  const now = () => new Date(clock);

  const tenantAdminIdentity: IdentityContext = {
    authMode: "bootstrap_headers",
    actorType: "tenant_admin",
    actorId: "tenant-user-mail-001",
    realm: "tenant",
    tenantId: "tenant-mail-001",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read", "tenant:write"],
    requestId: "req-sr-mail-001-admin",
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-001-status-outbox-"));
    clock = Date.parse("2026-09-06T09:00:00.000Z");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acceptingTransport(): MailTransport {
    return {
      provider: "controlled-test-receiver",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        const ack: ProviderAcknowledgement = {
          provider: "controlled-test-receiver",
          response: "250 Accepted as controlled-receiver-001",
          providerMessageId: "controlled-receiver-001",
          acceptedAt: now().toISOString(),
        };
        return ack;
      }),
    };
  }

  function buildService(transport: MailTransport | null) {
    const identityRepository = new IdentityRepository();
    const notificationDelivery = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      transport,
      { now, maxAttempts: 3, retryDelayMs: 1_000, leaseMs: 1_000 },
    );
    const invitationDelivery = new TenantInvitationDeliveryService(
      notificationDelivery,
    );
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
      identityRepository,
      invitationDelivery,
    );
    return { identityRepository, invitationDelivery, service };
  }

  it("marks the invitation delivered only after the controlled receiver truly accepts it, and rejects reuse/revoke/expiry", async () => {
    const transport = acceptingTransport();
    const { identityRepository, service } = buildService(transport);

    const created = await service.createTenantUser(
      "tenant-mail-001",
      {
        email: "receiver@controlled-receiver.test",
        displayName: "Controlled Receiver",
        roleCode: "tenant_viewer",
      },
      "req-sr-mail-001-create",
      tenantAdminIdentity,
    );
    expect(created.status).toBe("invited");
    expect(transport.send).toHaveBeenCalledTimes(1);

    const [invitation] = identityRepository
      .listInvitations()
      .filter(
        (candidate) => candidate.email === "receiver@controlled-receiver.test",
      );
    expect(invitation?.deliveryStatus).toBe("delivered");

    const sentMessage = (transport.send as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as TransportMessage;
    const rawTokenMatch = /Invitation code: (\S+)/.exec(sentMessage.body);
    const rawToken = rawTokenMatch?.[1];
    expect(rawToken).toMatch(/^ti_/);
    // The raw proof never appears anywhere outside the transport payload.
    expect(JSON.stringify(created)).not.toContain(rawToken!);
    expect(JSON.stringify(invitation)).not.toContain(rawToken!);

    const accepted = await service.acceptTenantInvitation({
      invitationToken: rawToken!,
    });
    expect(accepted.accepted).toBe(true);

    // Old (already-consumed) token is rejected.
    await expect(
      service.acceptTenantInvitation({ invitationToken: rawToken! }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    // A resend on an already-accepted invitation is rejected (nothing pending).
    await expect(
      service.resendTenantInvitation(
        "tenant-mail-001",
        created.userId,
        "req-sr-mail-001-resend-accepted",
        tenantAdminIdentity,
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("never fakes delivered when the provider is unavailable, and lets a later resend actually deliver", async () => {
    const { identityRepository, service } = buildService(null);

    const created = await service.createTenantUser(
      "tenant-mail-001",
      {
        email: "retry@controlled-receiver.test",
        displayName: "Retry Invitee",
        roleCode: "tenant_viewer",
      },
      "req-sr-mail-001-create-retry",
      tenantAdminIdentity,
    );
    expect(created.status).toBe("invited");

    const [firstInvitation] = identityRepository
      .listInvitations()
      .filter(
        (candidate) => candidate.email === "retry@controlled-receiver.test",
      );
    expect(firstInvitation?.deliveryStatus).toBe("delivery_failed");

    const resent = await service.resendTenantInvitation(
      "tenant-mail-001",
      created.userId,
      "req-sr-mail-001-resend-retry",
      tenantAdminIdentity,
    );
    expect(resent.deliveryStatus).toBe("delivery_failed");
    expect(resent.revokedAt).toBeNull();

    // The superseded first invitation is revoked, not silently left pending.
    const history = identityRepository
      .listInvitations()
      .filter(
        (candidate) => candidate.email === "retry@controlled-receiver.test",
      );
    expect(history).toHaveLength(2);
    expect(history.filter((entry) => entry.revokedAt !== null)).toHaveLength(
      1,
    );
  });

  it("rejects an expired invitation token even though it was genuinely delivered", async () => {
    const transport = acceptingTransport();
    const { identityRepository, service } = buildService(transport);

    await service.createTenantUser(
      "tenant-mail-001",
      {
        email: "expiring@controlled-receiver.test",
        displayName: "Expiring Invitee",
        roleCode: "tenant_viewer",
      },
      "req-sr-mail-001-create-expiring",
      tenantAdminIdentity,
    );

    const [invitation] = identityRepository
      .listInvitations()
      .filter(
        (candidate) =>
          candidate.email === "expiring@controlled-receiver.test",
      );
    expect(invitation?.deliveryStatus).toBe("delivered");

    const sentMessage = (transport.send as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as TransportMessage;
    const rawToken = /Invitation code: (\S+)/.exec(sentMessage.body)?.[1];

    await identityRepository.upsertInvitationRecord({
      ...invitation!,
      expiresAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(
      service.acceptTenantInvitation({ invitationToken: rawToken! }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});
