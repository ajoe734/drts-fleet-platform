import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { DriverOnboardingStatus } from "@drts/contracts";
import type { PoolClient } from "pg";
import { ApiRequestError } from "../../common/api-envelope";
import {
  normalizeDriverOnboardingEmail,
  normalizeDriverOnboardingMobile,
} from "../../common/driver-onboarding-contact";
import { DriverDeviceSessionService } from "../auth/driver-device-session.service";
import { maskTaiwanPhone } from "../passenger-app/otp/twilio-sms.adapter";
import {
  DriverOnboardingOutboxRepository,
  type DriverOnboardingChannel,
  type DriverOnboardingDeliveryClaim,
} from "./driver-onboarding-outbox.repository";
import {
  DRIVER_ONBOARDING_TRANSPORT,
  type DriverOnboardingPayload,
  type DriverOnboardingTransport,
} from "./driver-onboarding-transport";

const MAX_ATTEMPTS = 4;
const CHANNELS = ["email", "sms"] as const;
type FinalStatus = Exclude<DriverOnboardingStatus, "sending">;

function readDeliveryKey(): Buffer {
  const key = process.env.DRIVER_ONBOARDING_DELIVERY_KEY?.trim();
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "DRIVER_ONBOARDING_DELIVERY_UNAVAILABLE",
      "Driver onboarding delivery encryption is unavailable.",
    );
  }
  return Buffer.from(key, "hex");
}

function seal(
  payload: DriverOnboardingPayload,
  deliveryId: string,
  key: Buffer,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(deliveryId, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function open(claim: DriverOnboardingDeliveryClaim, key: Buffer) {
  const [version, iv, tag, encrypted, extra] =
    claim.encrypted_payload.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) {
    throw new Error("invalid_delivery_payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(claim.delivery_id, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const payload = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as DriverOnboardingPayload;
  if (
    typeof payload.recipient !== "string" ||
    !/^[0-9]{6}$/.test(payload.registrationCode) ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.activationToken) ||
    !Number.isFinite(Date.parse(payload.expiresAt))
  ) {
    throw new Error("invalid_delivery_payload");
  }
  return payload;
}

function maskRecipient(channel: DriverOnboardingChannel, recipient: string) {
  if (channel === "sms") return maskTaiwanPhone(recipient);
  const at = recipient.lastIndexOf("@");
  return `${recipient[0]}***@${recipient.slice(at + 1)}`;
}

@Injectable()
export class DriverOnboardingDeliveryService {
  constructor(
    private readonly outbox: DriverOnboardingOutboxRepository,
    private readonly deviceSessions: DriverDeviceSessionService,
    @Inject(DRIVER_ONBOARDING_TRANSPORT)
    private readonly transport: DriverOnboardingTransport,
  ) {}

  isEnabled(): boolean {
    return process.env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED === "true";
  }

  requireDatabase(): void {
    if (!this.outbox.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DRIVER_ONBOARDING_DELIVERY_UNAVAILABLE",
        "Driver onboarding delivery storage is unavailable.",
      );
    }
  }

  async enqueue(
    executor: PoolClient,
    input: {
      submissionId: string;
      driverId: string;
      mobile: string | null | undefined;
      email: string | null | undefined;
    },
  ): Promise<void> {
    const mobile = normalizeDriverOnboardingMobile(input.mobile);
    const email = normalizeDriverOnboardingEmail(input.email);
    if (!mobile) {
      for (const channel of CHANNELS) {
        await this.outbox.enqueue(executor, {
          deliveryId: randomUUID(),
          submissionId: input.submissionId,
          invitationId: null,
          channel,
          maskedRecipient: null,
          reasonCode: "mobile_contact_missing",
          encryptedPayload: null,
          expiresAt: null,
        });
      }
      return;
    }

    const key = readDeliveryKey();
    const { invitation, registrationCode, activationToken } =
      await this.deviceSessions.issueOnboardingInvitation(
        { driverId: input.driverId, mobile },
        executor,
      );
    for (const channel of CHANNELS) {
      const recipient = channel === "email" ? email : mobile;
      const deliveryId = randomUUID();
      const { invitationId, expiresAt } = invitation;
      await this.outbox.enqueue(executor, {
        deliveryId,
        submissionId: input.submissionId,
        invitationId,
        channel,
        maskedRecipient: recipient ? maskRecipient(channel, recipient) : null,
        reasonCode: recipient ? null : "contact_missing",
        encryptedPayload: recipient
          ? seal(
              { recipient, registrationCode, activationToken, expiresAt },
              deliveryId,
              key,
            )
          : null,
        expiresAt,
      });
    }
  }

  async getSummary(submissionId: string) {
    if (!this.isEnabled() || !this.outbox.isEnabled()) return undefined;
    const summary = await this.outbox.getSummary(submissionId);
    return summary.length ? summary : undefined;
  }

  async drain() {
    const counts: Partial<Record<FinalStatus, number>> = {};
    if (!this.isEnabled()) return { enabled: false, processed: 0, counts };
    this.requireDatabase();
    const key = readDeliveryKey();
    const claims = await this.outbox.claimDue();
    const results = await Promise.allSettled(
      claims.map((claim) => this.deliver(claim, key)),
    );
    let processed = 0;
    for (const result of results) {
      if (result.status === "rejected") {
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "DRIVER_ONBOARDING_DELIVERY_UNAVAILABLE",
          "Unable to finalize the driver onboarding delivery batch.",
        );
      }
      if (result.value) {
        counts[result.value] = (counts[result.value] ?? 0) + 1;
        processed++;
      }
    }
    return { enabled: true, processed, counts };
  }

  private async deliver(
    claim: DriverOnboardingDeliveryClaim,
    key: Buffer,
  ): Promise<FinalStatus | null> {
    let payload: DriverOnboardingPayload;
    try {
      payload = open(claim, key);
    } catch {
      return this.finish(claim, "failed", "encrypted_payload_invalid");
    }
    if (Date.parse(payload.expiresAt) <= Date.now()) {
      return this.finish(claim, "expired", "invitation_expired");
    }
    let eligible: boolean;
    try {
      eligible = await this.deviceSessions.canDeliverOnboardingInvitation(
        claim.invitation_id,
      );
    } catch {
      return this.retryOrFail(claim, "eligibility_check_unavailable");
    }
    if (!eligible)
      return this.finish(claim, "skipped", "invitation_ineligible");

    let outcome: Awaited<ReturnType<DriverOnboardingTransport["send"]>>;
    try {
      outcome = await this.transport.send(
        claim.channel,
        claim.delivery_id,
        payload,
      );
    } catch {
      return this.finish(claim, "uncertain", "acknowledgement_unknown");
    }
    if (outcome.status === "accepted" || outcome.status === "delivered") {
      return this.finish(claim, outcome.status, null);
    }
    if (outcome.status === "failed" && outcome.retryable) {
      return this.retryOrFail(claim, outcome.reasonCode);
    }
    return this.finish(claim, outcome.status, outcome.reasonCode);
  }

  private async retryOrFail(
    claim: DriverOnboardingDeliveryClaim,
    reasonCode: string,
  ) {
    if (claim.attempt_count < MAX_ATTEMPTS) {
      return this.finish(
        claim,
        "queued",
        reasonCode,
        60 * 2 ** (claim.attempt_count - 1),
      );
    }
    return this.finish(claim, "failed", reasonCode);
  }

  private async finish(
    claim: DriverOnboardingDeliveryClaim,
    status: FinalStatus,
    reasonCode: string | null,
    retryDelaySeconds?: number,
  ): Promise<FinalStatus | null> {
    return (await this.outbox.finish(
      claim,
      status,
      reasonCode,
      retryDelaySeconds,
    ))
      ? status
      : null;
  }
}
