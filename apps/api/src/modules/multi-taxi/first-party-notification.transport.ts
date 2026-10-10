import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  FIRST_PARTY_PUSH_RETRY_POLICY,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
  type FirstPartyPushDeliveryContext,
  type FirstPartyPushMessage,
  type OrderFirstPartyNotificationRoute,
  type PassengerNotificationFailureReason,
  type PartnerNotificationRetryDisposition,
} from "@drts/contracts";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { PassengerPushDevicesService } from "../passenger-push-devices/passenger-push-devices.service";
import type { PassengerPushTransportRequest } from "./passenger-push.adapter";
import { notificationExpiresAt } from "./partner-notification.transport";

export type FirstPartyDeviceOutcome = {
  deviceId: string;
  kind: FirstPartyPushProviderResult["kind"];
  messageId: string | null;
  errorCode: string | null;
};
/** Storage extension stays private to this transport; partner/public contracts stay intact. */
export interface StoredFirstPartyContext extends Omit<
  FirstPartyPushDeliveryContext,
  "failureReason"
> {
  routeSnapshot: OrderFirstPartyNotificationRoute;
  retryPolicySnapshot: {
    maxAttempts: number;
    initialDelaySeconds: number;
    backoffMultiplier: number;
    maxDelaySeconds: number;
  };
  deviceOutcomes: FirstPartyDeviceOutcome[];
  failureReason: PassengerNotificationFailureReason | null;
}
export type FirstPartyDeliveryMetadata = Pick<
  StoredFirstPartyContext,
  | "deliveryTarget"
  | "deliveryStage"
  | "retryDisposition"
  | "failureReason"
  | "expiresAt"
  | "receiptId"
  | "deviceOutcomes"
>;
export type FirstPartyReceipt = {
  providerName: string;
  providerMessageRef: string;
  deliveredAt: string;
  deliveryContext: StoredFirstPartyContext;
};

export class FirstPartyPushFailure extends Error {
  constructor(
    readonly failure: {
      failureReason: PassengerNotificationFailureReason;
      retryDisposition: PartnerNotificationRetryDisposition;
      suggestedNextAttemptAt: string | null;
    },
    readonly deliveryContext: StoredFirstPartyContext | null = null,
  ) {
    super(failure.failureReason);
    this.name = "FirstPartyPushFailure";
  }
}
export function firstPartyFailure(
  failureReason: PassengerNotificationFailureReason,
  context: StoredFirstPartyContext | null = null,
) {
  return new FirstPartyPushFailure(
    {
      failureReason,
      retryDisposition: [
        "configuration_blocked",
        "credential_rejected",
      ].includes(failureReason)
        ? "configuration_blocked"
        : "terminal",
      suggestedNextAttemptAt: null,
    },
    context,
  );
}
export interface FirstPartyPushDeviceTarget {
  deviceId: string;
  token: string;
}
/** Server-owned check of the captured context/recipient after credential IO.
 * false skips only this device; domain and persistence failures retain identity.
 * This is never populated from a client payload or serialized into the context.
 */
export type FirstPartyPushLateValidation = (
  signal: AbortSignal,
) => Promise<boolean>;
export type FirstPartyPushProviderResult =
  | { kind: "accepted"; messageId: string }
  | { kind: "invalid"; errorCode?: string }
  | { kind: "transient"; retryAfterSeconds?: number; errorCode?: string }
  | { kind: "credential_rejected"; errorCode?: string }
  | { kind: "configuration_blocked"; errorCode?: string }
  | { kind: "internal_error" }
  | { kind: "ineligible" }
  | { kind: "expired" };
export const FIRST_PARTY_PUSH_PROVIDER = Symbol("FIRST_PARTY_PUSH_PROVIDER");
export interface FirstPartyPushProvider {
  isConfigured(): boolean;
  send(
    message: FirstPartyPushMessage,
    target: FirstPartyPushDeviceTarget,
    validateBeforeSend: FirstPartyPushLateValidation,
  ): Promise<FirstPartyPushProviderResult>;
}

@Injectable()
export class FirstPartyNotificationTransport {
  constructor(
    @Inject(MultiTaxiRepository)
    private readonly repository: MultiTaxiRepository,
    @Inject(PassengerPushDevicesService)
    private readonly deviceResolver: PassengerPushDevicesService,
    @Inject(FIRST_PARTY_PUSH_PROVIDER)
    private readonly provider: FirstPartyPushProvider,
  ) {}

  private async checkRelevance(
    request: PassengerPushTransportRequest,
    context: StoredFirstPartyContext | null,
  ) {
    const { message } = request;
    const route = await this.repository.findOrderFirstPartyNotificationRoute(
      message.orderId,
    );
    if (!route) throw firstPartyFailure("route_missing", context);
    if (
      route.orderId !== message.orderId ||
      route.passengerSubjectRef !== message.passengerSubjectRef ||
      (context &&
        (context.orderId !== route.orderId ||
          context.tenantId !== route.tenantId ||
          context.routeSnapshot.drtsPassengerId !== route.drtsPassengerId ||
          context.routeSnapshot.appId !== route.appId ||
          context.routeSnapshot.passengerSubjectRef !==
            route.passengerSubjectRef ||
          context.routeSnapshot.rideRef !== route.rideRef))
    ) {
      throw firstPartyFailure("owner_changed", context);
    }
    const relevance = await this.repository.findPartnerNotificationRelevance(
      message.orderId,
    );
    if (!relevance) throw firstPartyFailure("route_missing", context);
    if (
      message.eventType !== "receipt_ready" &&
      message.eventType !== "trip_cancelled"
    ) {
      if (
        ["cancelled", "completed", "closed", "rejected"].includes(
          relevance.status,
        )
      )
        throw firstPartyFailure("notification_obsolete", context);
      if (
        message.assignmentVersion !== null &&
        message.assignmentVersion < relevance.assignmentVersion
      )
        throw firstPartyFailure("notification_superseded", context);
    }
    if (
      Date.parse(context?.expiresAt ?? notificationExpiresAt(message)) <=
      Date.now()
    )
      throw firstPartyFailure("notification_expired", context);
    return route;
  }

  async send(
    request: PassengerPushTransportRequest,
  ): Promise<FirstPartyReceipt> {
    const { message, context: fenceContext } = request;
    // Even a direct provider/transport call must stay dormant without configuration.
    if (
      process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED !== "true" ||
      !this.provider.isConfigured()
    )
      throw firstPartyFailure("configuration_blocked");
    const attemptCount = message.attemptCount;
    if (!attemptCount || !fenceContext.fenceToken)
      throw new Error("First-party dispatch requires a durable consumer claim");
    const loaded =
      await this.repository.findFirstPartyNotificationContextAndTokens(
        message.outboxId,
      );
    let context = loaded?.context ?? null;
    const route = await this.checkRelevance(request, context);
    if (!context) {
      const eventSequence = message.payload.eventSequence;
      const event = PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[message.eventType];
      if (
        typeof eventSequence !== "number" ||
        !Number.isSafeInteger(eventSequence) ||
        eventSequence < 1 ||
        !event
      )
        throw firstPartyFailure("route_missing");
      const devices = await this.deviceResolver.resolveActiveDevices(
        route.drtsPassengerId,
      );
      const expiresAt = notificationExpiresAt(message);
      const wireMessage: FirstPartyPushMessage = {
        notification: { title: "乘車通知", body: "請查看最新乘車資訊" },
        data: {
          notification_id: message.outboxId,
          event,
          ride_ref: route.rideRef,
          event_sequence: String(eventSequence),
          expires_at: expiresAt,
        },
      };
      context = await this.repository.prepareFirstPartyNotificationContext(
        {
          outboxId: message.outboxId,
          orderId: message.orderId,
          tenantId: route.tenantId,
          routeSnapshot: route,
          retryPolicySnapshot: { ...FIRST_PARTY_PUSH_RETRY_POLICY },
          deviceOutcomes: [],
          targetDevices: devices
            .filter((d) => d.appId === route.appId)
            .map((d) => ({ deviceId: d.deviceId, tokenSha256: d.tokenSha256 })),
          wireMessage,
          wireMessageHash: createHash("sha256")
            .update(JSON.stringify(wireMessage))
            .digest("hex"),
          eventSequence,
          expiresAt,
          deliveryTarget: "first_party_device",
          deliveryStage: null,
          retryDisposition: null,
          failureReason: null,
          receiptId: null,
        },
        fenceContext.fenceToken,
      );
    }
    const policy = context.retryPolicySnapshot;
    if (attemptCount > policy.maxAttempts)
      throw firstPartyFailure("provider_transient_error", context);
    const outcomes = new Map(
      context.deviceOutcomes.map((o) => [o.deviceId, o]),
    );
    let firstReceiptId =
      context.deviceOutcomes.find((o) => o.kind === "accepted")?.messageId ??
      null;
    let blocked: "credential_rejected" | "configuration_blocked" | null = null;
    let transient = false;
    let maxRetryAfter = 0;
    for (const target of context.targetDevices) {
      if (
        ["accepted", "invalid"].includes(
          outcomes.get(target.deviceId)?.kind ?? "",
        )
      )
        continue;
      // Early checks avoid credential IO for known-ineligible work. The provider
      // must repeat these after metadata IO using the same captured identities.
      try {
        await this.checkRelevance(request, context);
      } catch (error) {
        if (firstReceiptId) break;
        throw error;
      }
      const token = await this.repository.findFirstPartyNotificationDeviceToken(
        context,
        target,
        fenceContext.fenceToken,
      );
      if (!token) continue;
      const capturedContext = context;
      let result: FirstPartyPushProviderResult;
      try {
        result = await this.provider.send(
          capturedContext.wireMessage,
          { deviceId: target.deviceId, token },
          async (signal) => {
            signal.throwIfAborted();
            await this.checkRelevance(request, capturedContext);
            signal.throwIfAborted();
            const currentToken =
              await this.repository.findFirstPartyNotificationDeviceToken(
                capturedContext,
                target,
                fenceContext.fenceToken!,
              );
            // Never replace the captured token or select a new recipient.
            return currentToken === token;
          },
        );
      } catch (error) {
        // Preserve already accepted device evidence, but never hide a lost
        // persistence fence as a successful or retryable provider outcome.
        if (firstReceiptId && error instanceof FirstPartyPushFailure) break;
        throw error;
      }
      if (result.kind === "ineligible") continue;
      outcomes.set(target.deviceId, {
        deviceId: target.deviceId,
        kind: result.kind,
        messageId: result.kind === "accepted" ? result.messageId : null,
        errorCode: "errorCode" in result ? (result.errorCode ?? null) : null,
      });
      context = { ...context, deviceOutcomes: [...outcomes.values()] };
      if (result.kind === "accepted") firstReceiptId ??= result.messageId;
      else if (result.kind === "invalid")
        await this.deviceResolver.invalidateDevice(
          target.deviceId,
          "provider_invalid",
          target.tokenSha256,
        );
      else if (
        result.kind === "credential_rejected" ||
        result.kind === "configuration_blocked"
      )
        blocked = result.kind;
      else if (result.kind === "expired") {
        if (firstReceiptId) break;
        throw firstPartyFailure("notification_expired", context);
      } else {
        transient = true;
        if (result.kind === "transient")
          maxRetryAfter = Math.max(
            maxRetryAfter,
            result.retryAfterSeconds ?? 0,
          );
      }
    }
    if (firstReceiptId) {
      const deliveredAt = new Date().toISOString();
      return {
        providerName: "first_party_app",
        providerMessageRef: firstReceiptId,
        deliveredAt,
        deliveryContext: {
          ...context,
          deliveryStage: "provider_accepted",
          retryDisposition: "none",
          failureReason: null,
          receiptId: firstReceiptId,
          deliveredAt,
        },
      };
    }
    if (blocked) throw firstPartyFailure(blocked, context);
    if (!transient) throw firstPartyFailure("no_active_device", context);
    const ownDelay = Math.min(
      policy.maxDelaySeconds,
      policy.initialDelaySeconds *
        policy.backoffMultiplier ** (attemptCount - 1),
    );
    const next = Date.now() + Math.max(ownDelay, maxRetryAfter) * 1000;
    if (attemptCount >= policy.maxAttempts)
      throw firstPartyFailure("provider_transient_error", context);
    if (next >= Date.parse(context.expiresAt))
      throw firstPartyFailure("notification_expired", context);
    throw new FirstPartyPushFailure(
      {
        failureReason: "provider_transient_error",
        retryDisposition: "automatic",
        suggestedNextAttemptAt: new Date(next).toISOString(),
      },
      context,
    );
  }
}
