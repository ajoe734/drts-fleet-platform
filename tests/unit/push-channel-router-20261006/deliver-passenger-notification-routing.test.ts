// PUSH-CHANNEL-ROUTER-20261006 — MultiTaxiService.deliverPassengerNotification
// end-to-end per-order channel dispatch:
//   push-channel-router_resolution_and_no_channel: the four resolutions
//     (partner, first-party skeleton, ambiguous, none) each seal the
//     outbox row with the status/result/failureReason/retryDisposition the
//     design (D2/D3/D6) specifies, through the shared claim/fence/receipt
//     transaction, and are never rescanned afterward.
//   push-channel-router_partner_behaviour_unchanged: a partner-routed order
//     still goes through the untouched deliverPartnerNotification/
//     PartnerNotificationTransport path end to end (byte-identical wire
//     send), covered in depth by
//     tests/unit/system-remediation/sr-partner-notify-transport-20260918;
//     this file adds only the one assertion that the new per-order
//     resolution step is what selects that path, without altering it.
import { describe, expect, it, vi } from "vitest";
import type {
  ConsumerNotificationOutboxRecord,
  OrderFirstPartyNotificationRoute,
} from "@drts/contracts";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import type { PassengerNotificationRouteResolution } from "../../../apps/api/src/modules/multi-taxi/passenger-notification-channel-router";
import { harness as partnerHarness } from "../system-remediation/sr-partner-notify-transport-20260918/transport-harness";

const firstPartyRoute: OrderFirstPartyNotificationRoute = {
  orderId: "order-1",
  tenantId: "tenant-1",
  drtsPassengerId: "passenger-2",
  passengerSubjectRef: "subject-2",
  appId: "app-1",
  notificationPolicyVersion: "first_party_notification_v1",
  consentVersion: "v1",
  rideRef: "ride-1",
  createdAt: new Date().toISOString(),
};

function outboxRow(
  overrides: Partial<ConsumerNotificationOutboxRecord> = {},
): ConsumerNotificationOutboxRecord {
  const now = new Date().toISOString();
  return {
    outboxId: "outbox-1",
    orderId: "order-1",
    passengerSubjectRef: "subject-1",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: {},
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    deliveredAt: null,
    ...overrides,
  };
}

function nonPartnerHarness(resolution: PassengerNotificationRouteResolution) {
  const row = outboxRow();
  let fence = 0;
  let leasedUntil = 0;

  const resolvePassengerNotificationChannel = vi.fn(
    async () => resolution,
  );
  const claimPartnerNotification = vi.fn(async () => {
    const metadata = row.payload.channelRouting as
      | { retryDisposition?: string }
      | undefined;
    if (
      leasedUntil > Date.now() ||
      row.status === "delivered" ||
      (metadata?.retryDisposition && metadata.retryDisposition !== "automatic")
    ) {
      return null;
    }
    fence += 1;
    leasedUntil = Date.now() + 120_000;
    row.attemptCount += 1;
    row.status = "sending";
    return {
      record: structuredClone(row),
      fenceToken: fence,
      attemptLimitReached: false,
    };
  });
  const recordPushDeliveryOutcome = vi.fn(async (input: never) => {
    const typed = input as {
      fenceToken: number;
      deliveryOutcome: Partial<ConsumerNotificationOutboxRecord>;
      channelMetadata?: Record<string, unknown>;
    };
    if (typed.fenceToken !== fence) {
      return { recorded: false, reason: "fence_lost" as const };
    }
    Object.assign(row, typed.deliveryOutcome);
    if (typed.channelMetadata) {
      row.payload = { ...row.payload, channelRouting: typed.channelMetadata };
    }
    leasedUntil = 0;
    return { recorded: true, replayed: false };
  });

  const repository = {
    resolvePassengerNotificationChannel,
    claimPartnerNotification,
    recordPushDeliveryOutcome,
  };
  const passengerPushPort = {
    transportMode: "partner_webhook" as const,
    isAvailable: () => true,
    providerName: () => null,
    send: vi.fn(async () => {
      throw new Error("non-partner channels must never reach send()");
    }),
  };
  const service = new MultiTaxiService(
    {} as never,
    repository as never,
    undefined,
    undefined,
    undefined,
    passengerPushPort,
  );
  return { row, repository, service };
}

describe("push-channel-router_resolution_and_no_channel", () => {
  it("ambiguous (both route snapshots) seals manual_only/provider_error and is never rescanned", async () => {
    const h = nonPartnerHarness({ channel: "ambiguous" });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_error",
      failureReason: "route_ambiguous",
      retryDisposition: "manual_only",
    });
    expect(h.repository.recordPushDeliveryOutcome).toHaveBeenCalledOnce();
    expect(await h.repository.claimPartnerNotification("outbox-1", "w", 120)).toBeNull();
  });

  it("none (no route snapshot) seals D3 no_notification_channel/none/provider_not_configured and is never rescanned", async () => {
    const h = nonPartnerHarness({ channel: "none" });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_not_configured",
      failureReason: "no_notification_channel",
      retryDisposition: "none",
    });
    expect(await h.repository.claimPartnerNotification("outbox-1", "w", 120)).toBeNull();
  });

  it("first_party_app resolves but has no live transport this wave -> configuration_blocked, never rescanned", async () => {
    const h = nonPartnerHarness({ channel: "first_party_app", route: firstPartyRoute });
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_not_configured",
      failureReason: "configuration_blocked",
      retryDisposition: "configuration_blocked",
    });
    expect(await h.repository.claimPartnerNotification("outbox-1", "w", 120)).toBeNull();
  });

  it("a concurrent caller cannot double-seal the same row (shared claim/fence)", async () => {
    const h = nonPartnerHarness({ channel: "none" });
    const results = await Promise.allSettled([
      h.service.deliverPassengerNotification(h.row),
      h.service.deliverPassengerNotification(h.row),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(h.repository.recordPushDeliveryOutcome).toHaveBeenCalledOnce();
  });
});

describe("push-channel-router_partner_behaviour_unchanged", () => {
  it("a partner-routed order still delivers through the unchanged partner path", async () => {
    const h = partnerHarness();
    const outcome = await h.service.deliverPassengerNotification(h.row);
    expect(outcome).toMatchObject({
      result: "delivered",
      deliveryStage: "partner_accepted",
      receiptId: "real-partner-receipt-42",
    });
    expect(h.repository.resolvePassengerNotificationChannel).toHaveBeenCalledWith(
      h.row.orderId,
    );
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});
