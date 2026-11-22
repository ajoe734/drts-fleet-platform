import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DriverSupplyDraft,
  SupplySubmissionRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import type { DriverDeviceSessionService } from "../../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverOnboardingDeliveryService } from "../../../apps/api/src/modules/driver-onboarding/driver-onboarding-delivery.service";
import {
  DriverOnboardingOutboxRepository,
  type DriverOnboardingDeliveryClaim,
} from "../../../apps/api/src/modules/driver-onboarding/driver-onboarding-outbox.repository";
import { DriverOnboardingScheduledController } from "../../../apps/api/src/modules/driver-onboarding/driver-onboarding-scheduled.controller";
import { PlatformDriverOnboardingTransport } from "../../../apps/api/src/modules/driver-onboarding/driver-onboarding-transport";
import { SupplyReviewService } from "../../../apps/api/src/modules/fleet-partner/supply-review.service";
import { DeliveryTransportError } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import {
  approvalRecords,
  OnboardingSqlPort,
  services,
} from "../normal-onboarding-supply-pair-20261020/fixture";

const registrationCode = "012345";
const activationToken = "a".repeat(43);
const expiresAt = "2097-02-03T02:00:00.000Z";
const invitationId = "inv-driver-123";
const input = {
  submissionId: "submission-1",
  driverId: "driver-1",
  mobile: "0912-345-678",
  email: "test@driver.example",
};
const action = { expectedRevisionNo: 2, reasonCode: "all_documents_valid" };

function issueInvitation() {
  return {
    invitation: { invitationId, expiresAt },
    registrationCode,
    activationToken,
  };
}

beforeEach(() => {
  vi.stubEnv("DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("DRIVER_ONBOARDING_DELIVERY_KEY", "00".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function deliveryFixture() {
  const outbox = {
    claimDue: vi.fn<() => Promise<DriverOnboardingDeliveryClaim[]>>(),
    enqueue: vi.fn<DriverOnboardingOutboxRepository["enqueue"]>(),
    finish: vi
      .fn<DriverOnboardingOutboxRepository["finish"]>()
      .mockResolvedValue(true),
    isEnabled: () => true,
  };
  const authority = {
    issueOnboardingInvitation: vi.fn().mockImplementation(issueInvitation),
    canDeliverOnboardingInvitation: vi.fn().mockResolvedValue(true),
  };
  const transport = new PlatformDriverOnboardingTransport(
    {
      provider: "unit-mail",
      send: vi.fn(),
      sendPlatform: vi.fn().mockResolvedValue({
        provider: "unit-mail",
        response: "250 Accepted",
        acceptedAt: "2026-11-22T16:00:00.000Z",
      }),
    },
    { sendDriverOnboarding: vi.fn().mockResolvedValue({ status: "sent" }) },
    "no-reply@example.com",
  );
  const send = vi.spyOn(transport, "send");
  const service = new DriverOnboardingDeliveryService(
    outbox as unknown as DriverOnboardingOutboxRepository,
    authority as unknown as DriverDeviceSessionService,
    transport,
  );

  async function enqueue() {
    await service.enqueue({} as never, input);
    const claims = outbox.enqueue.mock.calls.map(([, entry]) => ({
      delivery_id: entry.deliveryId,
      invitation_id: entry.invitationId!,
      lease_id: "worker-lease",
      channel: entry.channel,
      attempt_count: 1,
      encrypted_payload: entry.encryptedPayload!,
    }));
    outbox.claimDue.mockResolvedValue(claims);
    return claims;
  }
  return { service, outbox, authority, send, enqueue };
}

describe("driver onboarding delivery", () => {
  it("creates one invitation and queues separately encrypted, masked records", async () => {
    const f = deliveryFixture();
    const claims = await f.enqueue();
    expect(f.authority.issueOnboardingInvitation).toHaveBeenCalledTimes(1);
    expect(f.authority.issueOnboardingInvitation).toHaveBeenCalledWith(
      { driverId: input.driverId, mobile: "+886912345678" },
      {},
    );
    for (const channel of ["email", "sms"]) {
      const record = f.outbox.enqueue.mock.calls.find(
        ([, delivery]) => delivery.channel === channel,
      )?.[1];
      expect(record).toMatchObject({
        channel,
        invitationId,
        expiresAt,
        maskedRecipient: expect.stringContaining("***"),
        encryptedPayload: expect.stringMatching(/^v1\./),
      });
      expect(JSON.stringify(record)).not.toContain(activationToken);
      expect(JSON.stringify(record)).not.toContain(input.email);
    }
    expect(claims[0]!.encrypted_payload).not.toBe(claims[1]!.encrypted_payload);
    await expect(f.service.drain()).resolves.toEqual({
      counts: { accepted: 2 },
      enabled: true,
      processed: 2,
    });
    expect(
      f.send.mock.calls.map(([, , payload]) => payload.registrationCode),
    ).toEqual([registrationCode, registrationCode]);
    expect(
      f.send.mock.calls.map(([, , payload]) => payload.activationToken),
    ).toEqual([activationToken, activationToken]);
  });

  it("does not resend when the provider outcome is unknown, and retries a known rejected channel", async () => {
    const f = deliveryFixture();
    const [email, sms] = await f.enqueue();
    f.send
      .mockResolvedValueOnce({
        status: "uncertain",
        reasonCode: "acknowledgement_unknown",
      })
      .mockResolvedValueOnce({
        status: "failed",
        reasonCode: "provider_rejected",
        retryable: true,
      });
    await expect(f.service.drain()).resolves.toMatchObject({
      counts: { uncertain: 1, queued: 1 },
    });
    expect(f.outbox.finish).toHaveBeenCalledWith(
      email,
      "uncertain",
      "acknowledgement_unknown",
      undefined,
    );
    expect(f.outbox.finish).toHaveBeenCalledWith(
      sms,
      "queued",
      "provider_rejected",
      60,
    );
  });

  it("stops undelivered notifications after the invitation is used or the driver is ineligible", async () => {
    const f = deliveryFixture();
    await f.enqueue();
    f.authority.canDeliverOnboardingInvitation.mockResolvedValue(false);
    await expect(f.service.drain()).resolves.toMatchObject({
      counts: { skipped: 2 },
    });
    expect(f.send).not.toHaveBeenCalled();
  });

  it("skips Email for an already submitted legacy record without Email", async () => {
    const f = deliveryFixture();
    await f.service.enqueue({} as never, { ...input, email: null });
    expect(f.outbox.enqueue.mock.calls[0]?.[1]).toMatchObject({
      channel: "email",
      encryptedPayload: null,
      reasonCode: "contact_missing",
    });
    expect(f.outbox.enqueue.mock.calls[1]?.[1]).toMatchObject({
      channel: "sms",
      encryptedPayload: expect.stringMatching(/^v1\./),
    });
  });

  it("sends the same fragment link in both messages, with a six-digit fallback", async () => {
    const sendPlatform = vi
      .fn()
      .mockRejectedValue(new DeliveryTransportError("SMTP_REPLY_450", true));
    const sendDriverOnboarding = vi
      .fn()
      .mockResolvedValue({ status: "sent", deliveryStatus: "queued" });
    const transport = new PlatformDriverOnboardingTransport(
      { provider: "unit-mail", send: vi.fn(), sendPlatform },
      { sendDriverOnboarding },
      "no-reply@example.com",
    );
    const payload = { activationToken, registrationCode, expiresAt };
    await expect(
      transport.send("email", "delivery-123", {
        ...payload,
        recipient: input.email,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });
    await expect(
      transport.send("sms", "delivery-456", {
        ...payload,
        recipient: input.mobile,
      }),
    ).resolves.toEqual({ status: "accepted" });
    const link = `https://api.smarttransport.tw/driver-activate#token=${activationToken}`;
    const emailBody = sendPlatform.mock.calls[0]![0].body;
    const smsBody = sendDriverOnboarding.mock.calls[0]![1];
    for (const body of [emailBody, smsBody]) {
      expect(body).toContain(link);
      expect(body).toContain(registrationCode);
    }
  });

  it("only lets the dedicated OIDC system grant drain the queue", async () => {
    const drain = vi.fn().mockResolvedValue({ enabled: true, processed: 0 });
    const controller = new DriverOnboardingScheduledController({
      drain,
    } as never);
    const identity = {
      realm: "system",
      actorType: "system",
      scopes: ["driver:onboarding:notify"],
    } as BootstrapRequestIdentity;
    await expect(controller.drain(identity)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(drain).not.toHaveBeenCalled();
    await expect(
      controller.drain({ ...identity, issuer: "https://accounts.google.com" }),
    ).resolves.toMatchObject({ data: { enabled: true } });
  });
});

async function approvalFixture() {
  const database = new OnboardingSqlPort();
  const { registry, submissions } = services(database);
  const { driver } = approvalRecords(registry);
  const pending: SupplySubmissionRecord = {
    ...driver,
    canonicalDriverId: null,
    status: "in_review",
    revisionNo: 2,
  };
  const draft: DriverSupplyDraft = {
    submissionId: pending.submissionId,
    name: "Driver test fixture",
    email: input.email,
    mobile: input.mobile,
    professionalDriverLicenseNo: "UNIT-LICENSE",
    professionalDriverLicenseExpiry: "2097-01-01",
    taxiDriverRegistrationNo: "UNIT-TAXI",
    taxiDriverRegistrationArea: "TPE",
    taxiDriverRegistrationExpiry: "2097-01-01",
    supportedServiceProductCodes: ["taxi_realtime"],
  };
  await submissions.persistChanges({
    submissions: [pending],
    driverDrafts: [draft],
  });
  const enqueue = vi
    .fn<DriverOnboardingDeliveryService["enqueue"]>()
    .mockImplementation(async (executor, entry) => {
      await executor.query(
        "INSERT INTO iam.driver_device_invitations (invitation_id, driver_id) VALUES ($1, $2)",
        [invitationId, entry.driverId],
      );
      await executor.query(
        "INSERT INTO fleet.driver_onboarding_deliveries (delivery_id, invitation_id) VALUES ($1, $2)",
        ["synthetic-notification-id", invitationId],
      );
    });
  const review = new SupplyReviewService(registry, submissions, {
    isEnabled: () => true,
    enqueue,
  } as unknown as DriverOnboardingDeliveryService);
  return { pending, database, registry, review, enqueue };
}

describe("driver onboarding approval transaction", () => {
  it("publishes the new driver and approval-triggered notification only after commit", async () => {
    const { pending, database, registry, review, enqueue } =
      await approvalFixture();
    const beforeDrivers = registry.listDrivers();
    database.beforeCommit = () => {
      expect(registry.listDrivers()).toEqual(beforeDrivers);
      expect(database.table("iam.driver_device_invitations").size).toBe(0);
      expect(database.table("fleet.driver_onboarding_deliveries").size).toBe(0);
    };
    const approved = await review.approveSubmission(
      pending.submissionId,
      action,
      "unit-reviewer",
    );
    expect(approved.status).toBe("approved");
    expect(registry.listDrivers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ driverId: approved.canonicalDriverId }),
      ]),
    );
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: input.email }),
    );
    expect(database.table("fleet.driver_onboarding_deliveries").size).toBe(1);
    await expect(
      review.approveSubmission(pending.submissionId, action, "unit-reviewer"),
    ).rejects.toMatchObject({
      code: "SUBMISSION_REVISION_CONFLICT",
    });
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("does not leave a cached driver or committed notification when persistence rolls back", async () => {
    const { pending, database, registry, review } = await approvalFixture();
    const beforeDrivers = registry.listDrivers();
    database.failSql = /^INSERT INTO fleet\.driver_onboarding_deliveries/;
    await expect(
      review.approveSubmission(pending.submissionId, action, "unit-reviewer"),
    ).rejects.toThrow();
    expect(registry.listDrivers()).toEqual(beforeDrivers);
    expect(database.table("iam.driver_device_invitations").size).toBe(0);
    expect(database.table("fleet.driver_onboarding_deliveries").size).toBe(0);
    expect(
      database.table("fleet.supply_submissions").get(pending.submissionId)
        ?.status,
    ).toBe("in_review");
  });
});
