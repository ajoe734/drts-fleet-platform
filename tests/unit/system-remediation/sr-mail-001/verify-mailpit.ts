/** Explicit controlled-receiver integration; never a production inbox/browser claim. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { TenantInvitationDeliveryService } from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import type { StoredDelivery } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { fixture } from "./helpers";

async function verify() {
  const directory = process.env.NOTIFICATION_OUTBOX_DIRECTORY;
  assert(directory);
  assert(process.env.MAILPIT_SMTP_PORT);
  const http = new URL(process.env.SR_MAIL_MAILPIT_HTTP!);
  assert.equal(http.protocol, "http:");
  assert.equal(http.hostname, "127.0.0.1");
  const identity = new IdentityRepository();
  const delivery = TenantInvitationDeliveryService.fromEnvironment(identity);
  assert(delivery.isConfigured());
  const { service } = fixture(delivery, identity);
  const tenantId = `sr-mail-001-${randomUUID()}`;
  const command = {
    email: "invitee@sr-mail.invalid",
    displayName: "受邀驗證",
    roleCode: "tenant_viewer",
  };
  const resources: object[] = [];

  async function receivedToken(invitationId: string) {
    const observation = delivery
      .listDeliveries()
      .find((item) => item.invitationId === invitationId)!;
    assert.equal(observation.status, "sent");
    const spool = JSON.parse(
      await readFile(
        join(directory!, "tenant-invitations", "outbox.json"),
        "utf8",
      ),
    );
    const entry = spool.deliveries[observation.deliveryId!] as StoredDelivery;
    const receipt = entry.receipt;
    const ack = receipt.attempts.at(-1)!.acknowledgement!;
    assert(ack.providerMessageId);
    const response = await fetch(
      new URL(
        `/api/v1/message/${encodeURIComponent(ack.providerMessageId)}`,
        http,
      ),
    );
    assert.equal(response.status, 200);
    const received = (await response.json()) as {
      ID: string;
      MessageID: string;
      Text: string;
      To: { Address: string }[];
    };
    assert.equal(received.MessageID, receipt.messageId.slice(1, -1));
    assert.equal(received.To[0]!.Address, command.email);
    assert.equal(received.Text.trim(), entry.message.body);
    const link = new URL(received.Text.split("\n")[1]!.trim());
    const token = new URLSearchParams(link.hash.slice(1)).get(
      "invitationToken",
    );
    assert(token);
    assert(token.startsWith("ti_"));
    assert(
      !JSON.stringify([
        receipt,
        delivery.listDeliveries(),
        identity.listInvitations(),
      ]).includes(token),
    );
    resources.push({
      invitationId,
      deliveryId: receipt.deliveryId,
      messageId: receipt.messageId,
      attemptId: receipt.attempts.at(-1)!.attemptId,
      receiverMessageId: received.ID,
      status: receipt.status,
    });
    return { token, entry };
  }

  const user = await service.createTenantUser(tenantId, command);
  const firstInvitation = identity.listInvitations()[0]!;
  const first = await receivedToken(firstInvitation.invitationId);
  const resent = await service.resendTenantInvitation(tenantId, user.userId);
  const replacement = await receivedToken(resent.invitationId);
  await assert.rejects(
    service.acceptTenantInvitation({ invitationToken: first.token }),
  );
  assert.equal(
    (
      await service.acceptTenantInvitation({
        invitationToken: replacement.token,
      })
    ).accepted,
    true,
  );
  await assert.rejects(
    service.acceptTenantInvitation({ invitationToken: replacement.token }),
  );

  // Recreate both adapter and durable spool reader, then duplicate the original request.
  const restarted = TenantInvitationDeliveryService.fromEnvironment(identity);
  const duplicate = await restarted.send({
    invitationId: resent.invitationId,
    tenantId,
    recipientEmail: command.email,
    displayName: command.displayName,
    expiresAt: resent.expiresAt,
    rawToken: replacement.token,
  });
  assert.equal(duplicate.deliveryId, replacement.entry.receipt.deliveryId);
  assert.deepEqual(await restarted.drain(), []);

  const secondTenant = `${tenantId}-revoke`;
  const secondUser = await service.createTenantUser(secondTenant, command);
  const secondInvitation = identity.listInvitations().at(-1)!;
  const second = await receivedToken(secondInvitation.invitationId);
  await service.revokeTenantInvitation(secondTenant, secondUser.userId);
  await assert.rejects(
    service.acceptTenantInvitation({ invitationToken: second.token }),
  );
  const expiring = await service.resendTenantInvitation(
    secondTenant,
    secondUser.userId,
  );
  const expired = await receivedToken(expiring.invitationId);
  const expireRecord = identity.listInvitations().at(-1)!;
  await identity.upsertInvitationRecord({
    ...expireRecord,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  await assert.rejects(
    service.acceptTenantInvitation({ invitationToken: expired.token }),
  );
  console.log(
    JSON.stringify(
      {
        tenantId,
        userId: user.userId,
        resources,
        providerAcceptedOnly: true,
        oneTimeAcceptance: true,
        oldProofRejected: true,
        revokedAndExpiredProofRejected: true,
        durableDuplicateDeduplicated: true,
        browserActivationTested: false,
        identityDatabaseTested: false,
      },
      null,
      2,
    ),
  );
}
void verify().catch(() => {
  console.error(
    "SR-MAIL-001 controlled receiver verification failed (secret details suppressed)",
  );
  process.exitCode = 1;
});
