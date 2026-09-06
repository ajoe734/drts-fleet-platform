import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { IdentityRepository } from "../identity/identity.repository";
import { FileMailOutbox } from "../notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type DeliveryReceipt,
  type MailTransport,
} from "../notification-delivery/notification-delivery.types";
import { createMailpitSmtpTransportFromEnv } from "../notification-delivery/smtp-mail.transport";

export type TenantInvitationDeliveryRequest = {
  invitationId: string;
  tenantId: string;
  recipientEmail: string;
  displayName: string;
  expiresAt: string;
  rawToken: string;
};

export type TenantInvitationDeliveryResult = {
  invitationId: string;
  status: "queued" | "sent" | "failed";
  deliveryId: string | null;
  sentAt: string | null;
};

/** Revalidates canonical proof immediately before every send, including restart retries. */
export function guardInvitationTransport(
  transport: MailTransport | null,
  identity: IdentityRepository,
): MailTransport {
  return {
    provider: transport?.provider ?? "unavailable",
    async send(message) {
      const match = /^Invitation proof: (ti_[A-Za-z0-9_-]+)$/m.exec(
        message.body,
      );
      const invitation = match
        ? await identity.findInvitationByTokenHash(
            createHash("sha256").update(match[1]!).digest("hex"),
          )
        : null;
      if (
        !invitation ||
        invitation.tenantId !== message.tenantId ||
        invitation.email !== message.recipientEmail ||
        message.idempotencyKey !==
          `tenant-invitation:${invitation.invitationId}` ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        Date.parse(invitation.expiresAt) <= Date.now()
      ) {
        throw new DeliveryTransportError("invitation_no_longer_valid", false);
      }
      if (!transport)
        throw new DeliveryTransportError("provider_unavailable", true);
      return transport.send(message);
    },
  };
}

/** Content belongs only to the private durable spool and transport, never logs or API receipts. */
@Injectable()
export class TenantInvitationDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TenantInvitationDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  // Bounded diagnostics retained for existing callers; never the delivery authority.
  private readonly observations: TenantInvitationDeliveryResult[] = [];

  constructor(
    private readonly delivery?: NotificationDeliveryService,
    private readonly fromEmail?: string,
    private readonly acceptanceUrl?: string,
  ) {}

  static fromEnvironment(
    identity: IdentityRepository,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    const directory = env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
    if (!directory) return new TenantInvitationDeliveryService();
    return new TenantInvitationDeliveryService(
      new NotificationDeliveryService(
        new FileMailOutbox(join(directory, "tenant-invitations")),
        guardInvitationTransport(
          createMailpitSmtpTransportFromEnv(env),
          identity,
        ),
      ),
      env.TENANT_INVITATION_FROM_EMAIL?.trim(),
      env.TENANT_INVITATION_ACCEPT_URL?.trim(),
    );
  }

  onModuleInit() {
    if (!this.delivery) return;
    const drain = () => {
      if (this.draining) return;
      this.draining = true;
      void this.drain()
        .catch(() => {
          this.logger.warn("Tenant invitation outbox retry unavailable");
        })
        .finally(() => {
          this.draining = false;
        });
    };
    drain();
    this.timer = setInterval(drain, 1_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isConfigured() {
    return Boolean(this.delivery && this.fromEmail && this.acceptanceUrl);
  }

  async drain() {
    return this.delivery ? this.delivery.drain() : [];
  }

  async send(
    request: TenantInvitationDeliveryRequest,
  ): Promise<TenantInvitationDeliveryResult> {
    let receipt: DeliveryReceipt | null = null;
    if (this.delivery && this.fromEmail && this.acceptanceUrl) {
      // A configured acceptance page must consume the fragment and POST the proof
      // to the canonical acceptance API. Fragments stay out of server access logs.
      const link = new URL(this.acceptanceUrl);
      if (
        link.protocol !== "https:" ||
        link.username ||
        link.password ||
        link.search ||
        link.hash
      ) {
        throw new Error("invitation_acceptance_url_invalid");
      }
      link.hash = new URLSearchParams({
        invitationToken: request.rawToken,
      }).toString();
      const queued = await this.delivery.enqueue({
        tenantId: request.tenantId,
        idempotencyKey: `tenant-invitation:${request.invitationId}`,
        recipientEmail: request.recipientEmail,
        fromEmail: this.fromEmail,
        subject: "DRTS 租戶帳號邀請",
        body: [
          "您收到 DRTS 租戶帳號邀請。請使用下方連結啟用帳號：",
          link.toString(),
          `有效期限：${request.expiresAt}`,
          "此邀請限使用一次；重新寄送後，舊邀請將失效。",
          `Invitation proof: ${request.rawToken}`,
        ].join("\n"),
      });
      receipt = await this.delivery.dispatch(
        request.tenantId,
        queued.deliveryId,
      );
    }
    const result: TenantInvitationDeliveryResult = {
      invitationId: request.invitationId,
      status: receipt?.status ?? "failed",
      deliveryId: receipt?.deliveryId ?? null,
      sentAt: receipt?.sentAt ?? null,
    };
    this.observations.unshift(result);
    this.observations.length = Math.min(this.observations.length, 100);
    return { ...result };
  }

  listDeliveries() {
    return this.observations.map((result) => ({ ...result }));
  }
}
