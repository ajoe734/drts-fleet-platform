import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";

describe("SR-MAIL-001 invitation delivery", () => {
  it("does not claim delivered without a configured transport", async () => {
    const { service, identity } = fixture();
    await service.createTenantUser("sr-mail-unavailable", {
      email: "unavailable@example.test",
      displayName: "Unavailable",
      roleCode: "tenant_viewer",
    });
    expect(identity.listInvitations()[0]?.deliveryStatus).toBe(
      "delivery_failed",
    );
  });
});

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import {
  TenantInvitationDeliveryService,
  guardInvitationTransport,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "sr-mail-001-"));
  directories.push(directory);
  const identity = new IdentityRepository();
  const messages: TransportMessage[] = [];
  let failing = false;
  let now = new Date();
  const transport: MailTransport = {
    provider: "controlled-unit-provider",
    async send(message) {
      if (failing)
        throw new DeliveryTransportError("provider_test_failure", true);
      messages.push(message);
      return {
        provider: this.provider,
        response: "accepted-unit-message",
        providerMessageId: `unit-${messages.length}`,
        acceptedAt: now.toISOString(),
      };
    },
  };
  function restart(provider = transport) {
    const core = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      guardInvitationTransport(provider, identity),
      { now: () => now },
    );
    const delivery = new TenantInvitationDeliveryService(
      core,
      "sender@example.test",
      "https://acceptance.example.test/invitation",
    );
    return { core, delivery };
  }
  const { core, delivery } = restart();
  return {
    ...fixture(delivery, identity),
    core,
    directory,
    messages,
    restart,
    transport,
    fail: (value: boolean) => {
      failing = value;
    },
    advance: () => {
      now = new Date(now.getTime() + 60_000);
    },
  };
}

const command = {
  email: "invitee@example.test",
  displayName: "Invitee",
  roleCode: "tenant_viewer",
};
function proof(message: TransportMessage) {
  return /^Invitation proof: (.+)$/m.exec(message.body)![1]!;
}

describe("durable invitation adapter", () => {
  it("sends a usable one-time proof while keeping SMTP acceptance distinct from delivery", async () => {
    const f = await setup();
    const created = await f.service.createTenantUser("sr-mail-sent", command);
    expect(f.messages).toHaveLength(1);
    const token = proof(f.messages[0]!);
    expect(
      JSON.stringify([
        created,
        f.identity.listInvitations(),
        f.delivery.listDeliveries(),
      ]),
    ).not.toContain(token);
    expect(f.identity.listInvitations()[0]?.deliveryStatus).toBe(
      "pending_delivery",
    );
    expect(f.delivery.listDeliveries()[0]?.status).toBe("sent");
    const url = new URL(f.messages[0]!.body.split("\n")[1]!);
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("invitationToken")).toBe(
      token,
    );
    await expect(
      f.service.acceptTenantInvitation({ invitationToken: token }),
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      f.service.acceptTenantInvitation({ invitationToken: token }),
    ).rejects.toMatchObject({ code: "TENANT_INVITATION_ACCEPTANCE_DENIED" });
    expect((await stat(join(f.directory, "outbox.json"))).mode & 0o777).toBe(
      0o600,
    );
  });

  it("recovers a failed attempt from disk after restart and deduplicates send", async () => {
    const f = await setup();
    f.fail(true);
    await f.service.createTenantUser("sr-mail-restart", command);
    expect(f.delivery.listDeliveries()[0]?.status).toBe("failed");
    expect(f.identity.listInvitations()[0]?.deliveryStatus).not.toBe(
      "delivered",
    );
    f.fail(false);
    f.advance();
    const resumed = f.restart();
    const receipts = await resumed.delivery.drain();
    expect(receipts[0]).toMatchObject({
      status: "sent",
      attempts: [{ outcome: "failed" }, { outcome: "sent" }],
    });
    expect(f.messages).toHaveLength(1);
    const invitation = f.identity.listInvitations()[0]!;
    const repeated = await resumed.delivery.send({
      invitationId: invitation.invitationId,
      tenantId: invitation.tenantId!,
      recipientEmail: command.email,
      displayName: command.displayName,
      expiresAt: invitation.expiresAt,
      rawToken: proof(f.messages[0]!),
    });
    expect(repeated.deliveryId).toBe(receipts[0]!.deliveryId);
    expect(f.messages).toHaveLength(1);
    expect(await resumed.delivery.drain()).toEqual([]);
  });

  it("rejects every superseded, revoked and expired proof", async () => {
    const f = await setup();
    const user = await f.service.createTenantUser("sr-mail-lifecycle", command);
    await f.service.resendTenantInvitation("sr-mail-lifecycle", user.userId);
    await f.service.resendTenantInvitation("sr-mail-lifecycle", user.userId);
    for (const message of f.messages.slice(0, 2))
      await expect(
        f.service.acceptTenantInvitation({ invitationToken: proof(message) }),
      ).rejects.toMatchObject({ code: "TENANT_INVITATION_ACCEPTANCE_DENIED" });
    await f.service.revokeTenantInvitation("sr-mail-lifecycle", user.userId);
    await expect(
      f.service.acceptTenantInvitation({
        invitationToken: proof(f.messages[2]!),
      }),
    ).rejects.toMatchObject({ code: "TENANT_INVITATION_ACCEPTANCE_DENIED" });
    await f.service.resendTenantInvitation("sr-mail-lifecycle", user.userId);
    const invitation = f.identity.listInvitations().at(-1)!;
    await f.identity.upsertInvitationRecord({
      ...invitation,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    await expect(
      f.service.acceptTenantInvitation({
        invitationToken: proof(f.messages[3]!),
      }),
    ).rejects.toMatchObject({ code: "TENANT_INVITATION_ACCEPTANCE_DENIED" });
  });

  it.each(["revoked", "expired", "accepted"])(
    "does not retry a %s invitation after restart",
    async (state) => {
      const f = await setup();
      f.fail(true);
      const user = await f.service.createTenantUser("sr-mail-cancel", command);
      const invitation = f.identity.listInvitations()[0]!;
      if (state === "revoked")
        await f.service.revokeTenantInvitation("sr-mail-cancel", user.userId);
      else if (state === "expired")
        await f.identity.upsertInvitationRecord({
          ...invitation,
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        });
      else {
        const spool = JSON.parse(
          await readFile(join(f.directory, "outbox.json"), "utf8"),
        );
        const entry = Object.values(spool.deliveries)[0] as {
          message: TransportMessage;
        };
        await f.service.acceptTenantInvitation({
          invitationToken: proof(entry.message),
        });
      }
      f.fail(false);
      f.advance();
      const receipts = await f.restart().delivery.drain();
      expect(receipts[0]).toMatchObject({
        status: "failed",
        nextAttemptAt: null,
      });
      expect(receipts[0]?.attempts.at(-1)?.errorCode).toBe(
        "invitation_no_longer_valid",
      );
      expect(f.messages).toHaveLength(0);
    },
  );

  it("does not overwrite revocation when a slow provider finishes", async () => {
    const f = await setup();
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: MailTransport = {
      provider: f.transport.provider,
      async send(message) {
        began();
        await gate;
        return f.transport.send(message);
      },
    };
    const slowFixture = fixture(f.restart(slow).delivery, f.identity);
    const pending = slowFixture.service.createTenantUser(
      "sr-mail-race",
      command,
    );
    await started;
    const invitation = f.identity.listInvitations()[0]!;
    const revokedAt = new Date().toISOString();
    await f.identity.upsertInvitationRecord({ ...invitation, revokedAt });
    release();
    await pending;
    expect(f.identity.listInvitations()[0]?.revokedAt).toBe(revokedAt);
    await expect(
      slowFixture.service.acceptTenantInvitation({
        invitationToken: proof(f.messages[0]!),
      }),
    ).rejects.toMatchObject({ code: "TENANT_INVITATION_ACCEPTANCE_DENIED" });
  });
});
