import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  PARTNER_PASSENGER_EVENT_DEFAULT_TTL_SECONDS,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
  type PartnerPassengerNotificationWirePayload,
} from "@drts/contracts";
import { PartnerNotificationDispatchFacade } from "../tenant-partner/partner-notification-dispatch.facade";
import { partnerNotificationWireBytes } from "../tenant-partner/partner-notification-wire";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import type {
  PassengerPushTransport,
  PassengerPushTransportRequest,
} from "./passenger-push.adapter";
import type {
  PassengerPushMessage,
  PassengerPushReceipt,
} from "./passenger-push.port";
import {
  PartnerNotificationFailure,
  partnerFailure,
  type StoredPartnerNotificationContext,
} from "./partner-notification.types";

const messages = {
  assignment_disclosure_ready: "車輛已安排，請回行程查看。",
  assignment_replaced: "車輛安排已更新，請回行程查看。",
  eta_changed: "預計抵達時間已更新，請回行程查看。",
  driver_arrived: "司機已抵達，請回行程查看。",
  receipt_ready: "乘車證明已備妥，請回行程查看。",
} as const;

export function notificationExpiresAt(message: PassengerPushMessage): string {
  const createdAt = Date.parse(message.createdAt ?? "");
  if (!Number.isFinite(createdAt)) throw partnerFailure("route_missing");
  const ttlEnd =
    createdAt +
    PARTNER_PASSENGER_EVENT_DEFAULT_TTL_SECONDS[message.eventType] * 1000;
  const supplied =
    typeof message.payload.expiresAt === "string"
      ? Date.parse(message.payload.expiresAt)
      : ttlEnd;
  if (!Number.isFinite(supplied)) throw partnerFailure("notification_expired");
  return new Date(Math.min(ttlEnd, supplied)).toISOString();
}

@Injectable()
export class PartnerNotificationTransport implements PassengerPushTransport {
  constructor(
    private readonly repository: MultiTaxiRepository,
    private readonly facade: PartnerNotificationDispatchFacade,
  ) {}

  isAvailable(): boolean {
    return false;
  }

  async isAvailableFor(message: PassengerPushMessage): Promise<boolean> {
    try {
      if (!this.repository.isEnabled()) return false;
      await this.resolve(
        message,
        await this.repository.findPartnerNotificationContext(message.outboxId),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async resolve(
    message: PassengerPushMessage,
    existing: StoredPartnerNotificationContext | null,
  ) {
    const route = await this.repository.findOrderPartnerNotificationRoute(
      message.orderId,
    );
    if (!route) throw partnerFailure("route_missing", existing);
    if (
      route.passengerSubjectRef !== message.passengerSubjectRef ||
      route.orderId !== message.orderId
    )
      throw partnerFailure("owner_changed", existing);
    if (
      existing &&
      (existing.orderId !== route.orderId ||
        existing.tenantId !== route.tenantId ||
        existing.partnerId !== route.partnerId ||
        existing.entrySlug !== route.entrySlug ||
        existing.wirePayload.data.recipient.partnerUserRef !==
          route.partnerUserRef)
    )
      throw partnerFailure("owner_changed", existing);
    const readiness = await this.facade.resolveNotificationRoute(
      route,
      message.eventType,
    );
    if (!readiness.ready)
      throw new PartnerNotificationFailure(readiness.failure, existing);
    if (
      existing &&
      (existing.bindingId !== readiness.binding.bindingId ||
        existing.webhookId !== readiness.binding.webhookId)
    )
      throw partnerFailure("owner_changed", existing);
    if (
      existing &&
      (existing.bindingVersion !== readiness.binding.version ||
        existing.endpointFingerprint !== readiness.endpointFingerprint)
    )
      throw partnerFailure("configuration_blocked", existing);
    const expiresAt = existing?.expiresAt ?? notificationExpiresAt(message);
    if (Date.parse(expiresAt) <= Date.now())
      throw partnerFailure("notification_expired", existing);
    const relevance = await this.repository.findPartnerNotificationRelevance(
      message.orderId,
    );
    if (!relevance) throw partnerFailure("route_missing", existing);
    if (message.eventType !== "receipt_ready") {
      if (
        ["cancelled", "completed", "closed", "rejected"].includes(
          relevance.status,
        )
      )
        throw partnerFailure("notification_obsolete", existing);
      if (
        message.assignmentVersion !== null &&
        message.assignmentVersion < relevance.assignmentVersion
      )
        throw partnerFailure("notification_superseded", existing);
    }
    return { route, ...readiness, expiresAt };
  }

  async send(
    request: PassengerPushTransportRequest,
  ): Promise<PassengerPushReceipt> {
    if (!this.repository.isEnabled())
      throw partnerFailure("configuration_blocked");
    const { message } = request;
    let context = await this.repository.findPartnerNotificationContext(
      message.outboxId,
    );
    const resolved = await this.resolve(message, context);
    const attemptCount = message.attemptCount;
    if (!attemptCount || !request.context.fenceToken)
      throw new Error("Partner dispatch requires a durable consumer claim");
    if (!context) {
      const eventSequence = message.payload.eventSequence;
      if (
        typeof eventSequence !== "number" ||
        !Number.isSafeInteger(eventSequence) ||
        eventSequence < 1
      )
        throw partnerFailure("route_missing");
      const deliveryId = randomUUID();
      const wirePayload: PartnerPassengerNotificationWirePayload = {
        event: PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[message.eventType],
        deliveryId,
        occurredAt: message.createdAt!,
        tenantId: resolved.route.tenantId,
        data: {
          schemaVersion: "1.0",
          notificationId: message.outboxId,
          partnerEntrySlug: resolved.route.entrySlug,
          recipient: { partnerUserRef: resolved.route.partnerUserRef },
          rideRef: resolved.route.rideRef,
          eventSequence,
          assignmentVersion: message.assignmentVersion,
          expiresAt: resolved.expiresAt,
          message: messages[message.eventType],
          navigation: { type: "ride", rideRef: resolved.route.rideRef },
        },
      };
      // Explicit optional ETA allowlist; never spread source payload or driver details.
      const eta = message.payload.eta as
        | { minutes?: unknown; asOf?: unknown }
        | undefined;
      if (
        [
          "eta_changed",
          "assignment_disclosure_ready",
          "assignment_replaced",
        ].includes(message.eventType) &&
        eta &&
        typeof eta.minutes === "number" &&
        Number.isFinite(eta.minutes) &&
        eta.minutes >= 0 &&
        typeof eta.asOf === "string" &&
        Number.isFinite(Date.parse(eta.asOf))
      ) {
        wirePayload.data.eta = { minutes: eta.minutes, asOf: eta.asOf };
      }
      context = await this.repository.preparePartnerNotificationContext(
        {
          outboxId: message.outboxId,
          deliveryId,
          orderId: message.orderId,
          entrySlug: resolved.route.entrySlug,
          tenantId: resolved.route.tenantId,
          partnerId: resolved.route.partnerId,
          bindingId: resolved.binding.bindingId,
          bindingVersion: resolved.binding.version,
          webhookId: resolved.binding.webhookId,
          endpointFingerprint: resolved.endpointFingerprint,
          wirePayload,
          wirePayloadHash: createHash("sha256")
            .update(partnerNotificationWireBytes(wirePayload))
            .digest("hex"),
          eventSequence,
          expiresAt: resolved.expiresAt,
          retryPolicySnapshot: resolved.retryPolicy,
          deliveryTarget: "partner_endpoint",
          deliveryStage: null,
          retryDisposition: null,
          failureReason: null,
          receiptId: null,
          downstreamStatus: "unknown",
          createdAt: new Date().toISOString(),
          deliveredAt: null,
        },
        request.context.fenceToken,
      );
    }
    if (
      createHash("sha256")
        .update(partnerNotificationWireBytes(context.wirePayload))
        .digest("hex") !== context.wirePayloadHash
    )
      throw partnerFailure("partner_ack_invalid", context);
    if (attemptCount > context.retryPolicySnapshot.maxAttempts) {
      throw new PartnerNotificationFailure(
        {
          failureReason: "provider_transient_error",
          retryDisposition: "terminal",
          suggestedNextAttemptAt: null,
        },
        context,
      );
    }
    // Recheck governance/relevance after durable preparation and immediately before IO.
    await this.resolve(message, context);
    const outcome = await this.facade.dispatchNotificationAttemptByWebhookId({
      tenantId: context.tenantId,
      webhookId: context.webhookId,
      wirePayload: context.wirePayload,
      attemptNumber: attemptCount,
      retryPolicySnapshot: context.retryPolicySnapshot,
    });
    if (outcome.kind === "failed")
      throw new PartnerNotificationFailure(outcome.failure, context);
    const ack = outcome.ack;
    if (
      !ack.receiptId.trim() ||
      ack.notificationId !== message.outboxId ||
      ack.deliveryId !== context.deliveryId ||
      ack.partnerEntrySlug !== context.entrySlug ||
      !["accepted", "duplicate"].includes(ack.status)
    )
      throw partnerFailure("partner_ack_invalid", context);
    const deliveredAt = new Date().toISOString();
    return {
      providerName: "partner_webhook",
      providerMessageRef: ack.receiptId,
      deliveredAt,
      deliveryContext: {
        ...context,
        deliveryStage: "partner_accepted",
        retryDisposition: "none",
        failureReason: null,
        receiptId: ack.receiptId,
        deliveredAt,
      },
    };
  }
}
