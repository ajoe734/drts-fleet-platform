import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  MailOutbox,
  MailTransport,
  OutboxState,
  ProviderAcknowledgement,
  TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { TenantInvitationDeliveryService } from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_A = "tenant-sr-mail-readback-a";
const TENANT_B = "tenant-sr-mail-readback-b";

function identity(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "actor-1",
    realm: "tenant",
    tenantId: TENANT_A,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read"],
    supportedExecutionModes: ["discussion_planning"],
    ...overrides,
  };
}

/** Simulates a Gmail-origin provider acknowledgement (the '... - gsmtp' reply
 * format with no "queued as" token) so the readback path is exercised against
 * a realistic, already-extracted providerMessageId end to end. */
function gmailStyleTransport(): MailTransport {
  return {
    provider: "remote-smtp",
    send: vi.fn(
      async (message: TransportMessage): Promise<ProviderAcknowledgement> => ({
        provider: "remote-smtp",
        response:
          "250 2.0.0 OK  1696150000 d9-20020a170902bd8900b001234567890asi1234567plh.100 - gsmtp",
        providerMessageId:
          "d9-20020a170902bd8900b001234567890asi1234567plh.100",
        acceptedAt: new Date(message.deliveryId.length).toISOString(),
      }),
    ),
  };
}

describe("SR-MAIL-DELIVERY-READBACK-20261001 mail delivery readback", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-delivery-readback-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function createFixture() {
    const identityRepository = new IdentityRepository();
    const notificationDeliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      gmailStyleTransport(),
    );
    const tenantInvitationDelivery = new TenantInvitationDeliveryService(
      notificationDeliveryService,
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
      tenantInvitationDelivery,
      notificationDeliveryService,
    );
    return { identityRepository, notificationDeliveryService, service };
  }

  async function createInvitedUser(
    service: TenantPartnerService,
    tenantId: string,
    email: string,
  ) {
    return service.createTenantUser(
      tenantId,
      { email, displayName: "Invitee", roleCode: "tenant_viewer" },
      "req-create",
      identity({ tenantId, roles: [], scopes: [] }),
    );
  }

  it("records a queryable deliveryId on invitation creation and resolves it to a sent receipt with a masked Gmail acknowledgement", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-create@example.test",
    );

    expect(created.invitation).not.toBeNull();
    expect(created.invitation?.deliveryId).toMatch(/^[0-9a-f-]{36}$/);

    const receipt = await service.getMailDeliveryReceipt(
      TENANT_A,
      created.invitation!.deliveryId!,
      "req-read",
      identity(),
    );

    expect(receipt).not.toBeNull();
    expect(receipt).toMatchObject({
      deliveryId: created.invitation!.deliveryId,
      tenantId: TENANT_A,
      status: "sent",
    });
    expect(receipt!.sentAt).not.toBeNull();
    expect(receipt!.attempts).toHaveLength(1);

    const ack = receipt!.attempts[0]!.acknowledgement!;
    expect(ack.provider).toBe("remote-smtp");
    expect(ack.providerMessageId).toBe(
      "d9-20020a170902bd8900b001234567890asi1234567plh.100",
    );
    // The full raw provider response must never cross the API boundary unmasked.
    expect(ack.response).not.toBe(
      "250 2.0.0 OK  1696150000 d9-20020a170902bd8900b001234567890asi1234567plh.100 - gsmtp",
    );
    expect(ack.response.length).toBeLessThan(
      "250 2.0.0 OK  1696150000 d9-20020a170902bd8900b001234567890asi1234567plh.100 - gsmtp"
        .length,
    );

    // Never return message body, invitation token, or SMTP credentials.
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("ti_");
    expect(serialized).not.toMatch(/REMOTE_SMTP/);
  });

  it("carries the deliveryId through resend and revoke responses, each resolvable via the readback endpoint", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-resend@example.test",
    );

    const resent = await service.resendTenantInvitation(
      TENANT_A,
      created.userId,
      "req-resend",
      identity(),
    );
    expect(resent.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resent.deliveryId).not.toBe(created.invitation?.deliveryId);

    const resentReceipt = await service.getMailDeliveryReceipt(
      TENANT_A,
      resent.deliveryId!,
      "req-read-resent",
      identity(),
    );
    expect(resentReceipt?.status).toBe("sent");

    const revoked = await service.revokeTenantInvitation(
      TENANT_A,
      created.userId,
      "req-revoke",
      identity(),
    );
    // Revoke returns the view for the still-pending (resent) invitation record,
    // which already carries the same resend deliveryId.
    expect(revoked.deliveryId).toBe(resent.deliveryId);
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("denies a tenant identity reading another tenant's delivery (platform/ops scope required for cross-tenant)", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-cross-tenant@example.test",
    );

    await expect(
      service.getMailDeliveryReceipt(
        TENANT_A,
        created.invitation!.deliveryId!,
        "req-cross-tenant",
        identity({ tenantId: TENANT_B }),
      ),
    ).rejects.toMatchObject({
      code: "EVIDENCE_ACCESS_FORBIDDEN",
      getStatus: expect.any(Function),
    });

    try {
      await service.getMailDeliveryReceipt(
        TENANT_A,
        created.invitation!.deliveryId!,
        "req-cross-tenant-status",
        identity({ tenantId: TENANT_B }),
      );
      expect.unreachable("expected ApiRequestError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(403);
    }
  });

  it("denies a same-tenant identity that lacks the required read scope", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-missing-scope@example.test",
    );

    await expect(
      service.getMailDeliveryReceipt(
        TENANT_A,
        created.invitation!.deliveryId!,
        "req-missing-scope",
        identity({ tenantId: TENANT_A, scopes: ["unrelated:scope"] }),
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_ACCESS_FORBIDDEN" });
  });

  it("allows platform and ops identities to read across tenants", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-cross-platform@example.test",
    );

    const asPlatform = await service.getMailDeliveryReceipt(
      TENANT_A,
      created.invitation!.deliveryId!,
      "req-platform",
      identity({
        realm: "platform",
        actorType: "platform_admin",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: [],
        scopes: [],
      }),
    );
    expect(asPlatform?.deliveryId).toBe(created.invitation!.deliveryId);

    const asOps = await service.getMailDeliveryReceipt(
      TENANT_A,
      created.invitation!.deliveryId!,
      "req-ops",
      identity({
        realm: "ops",
        actorType: "ops_user",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: [],
        scopes: [],
      }),
    );
    expect(asOps?.deliveryId).toBe(created.invitation!.deliveryId);
  });

  it("returns null for an unknown deliveryId within an authorized tenant", async () => {
    const { service } = createFixture();
    await createInvitedUser(service, TENANT_A, "invitee-notfound@example.test");

    const result = await service.getMailDeliveryReceipt(
      TENANT_A,
      "00000000-0000-0000-0000-000000000000",
      "req-notfound",
      identity(),
    );

    expect(result).toBeNull();
  });

  it("returns null when a known deliveryId is looked up under the wrong tenant, even with platform access", async () => {
    const { service } = createFixture();
    const created = await createInvitedUser(
      service,
      TENANT_A,
      "invitee-wrong-tenant-id@example.test",
    );

    const result = await service.getMailDeliveryReceipt(
      TENANT_B,
      created.invitation!.deliveryId!,
      "req-wrong-tenant",
      identity({
        realm: "platform",
        actorType: "platform_admin",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: [],
        scopes: [],
      }),
    );

    expect(result).toBeNull();
  });

  it("keeps the real, queryable deliveryId when enqueue succeeds but the ack-persistence transaction after dispatch throws", async () => {
    // Wraps a real FileMailOutbox so enqueue (transaction #1) and dispatch's
    // claim (transaction #2) commit for real, then injects a single
    // transient failure on transaction #3 -- dispatch's post-send
    // ack-persistence commit, after the provider has already been called.
    // This is the exact point R2 flagged: `deliver()`'s single try/catch
    // used to collapse this into a synthetic, non-queryable error id even
    // though the outbox already has a durable, queryable record.
    let transactionCount = 0;
    const realOutbox = new FileMailOutbox(directory);
    const flakyOutbox: MailOutbox = {
      async transaction<T>(operation: (state: OutboxState) => T): Promise<T> {
        transactionCount += 1;
        if (transactionCount === 3) {
          throw new Error("notification_outbox_transient_failure");
        }
        return realOutbox.transaction(operation);
      },
    };
    const notificationDeliveryService = new NotificationDeliveryService(
      flakyOutbox,
      gmailStyleTransport(),
    );
    const tenantInvitationDelivery = new TenantInvitationDeliveryService(
      notificationDeliveryService,
    );

    const result = await tenantInvitationDelivery.send({
      invitationId: "invitation-ack-persist-failure",
      tenantId: TENANT_A,
      recipientEmail: "invitee-ack-failure@example.test",
      displayName: "Invitee",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      rawToken: "raw-token-not-logged",
    });

    expect(transactionCount).toBe(3);
    // Never fabricate a delivered outcome just because dispatch was reached.
    expect(result.status).not.toBe("sent");
    expect(result.providerMessageId).toBeNull();
    // The defect: a synthetic, never-queryable id discarded the real one.
    expect(result.queryable).toBe(true);
    expect(result.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.deliveryId).not.toMatch(/^error-/);

    // The real test: the same deliveryId resolves through the production
    // readback path, not just through the raw outbox.
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new IdentityRepository(),
      new IdentityRepository(),
      tenantInvitationDelivery,
      notificationDeliveryService,
    );
    const receipt = await service.getMailDeliveryReceipt(
      TENANT_A,
      result.deliveryId,
      "req-read-after-ack-failure",
      identity(),
    );
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe("queued");
    expect(receipt!.attempts).toHaveLength(1);
    expect(receipt!.attempts[0]!.outcome).toBe("started");
  });
});
