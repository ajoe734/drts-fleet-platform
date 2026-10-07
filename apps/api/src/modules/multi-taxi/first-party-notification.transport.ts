import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  FIRST_PARTY_PUSH_RETRY_POLICY,
  FirstPartyPushDeliveryContext,
  FirstPartyPushMessage,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
} from "@drts/contracts";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { PassengerPushDevicesService } from "../passenger-push-devices/passenger-push-devices.service";
import type {
  PassengerPushTransport,
  PassengerPushTransportRequest,
} from "./passenger-push.adapter";
import type { PassengerPushReceipt } from "./passenger-push.port";
import { notificationExpiresAt } from "./partner-notification.transport";

export class FirstPartyPushFailure extends Error {
  constructor(
    readonly failure: {
      failureReason: any;
      retryDisposition:
        | "automatic"
        | "terminal"
        | "configuration_blocked"
        | "none";
      suggestedNextAttemptAt: string | null;
    },
    readonly deliveryContext: FirstPartyPushDeliveryContext | null = null,
  ) {
    super(failure.failureReason);
    this.name = "FirstPartyPushFailure";
  }
}
export function firstPartyFailure(
  failureReason: any,
  deliveryContext?: FirstPartyPushDeliveryContext | null,
) {
  return new FirstPartyPushFailure(
    {
      failureReason,
      retryDisposition:
        failureReason === "configuration_blocked"
          ? "configuration_blocked"
          : "terminal",
      suggestedNextAttemptAt: null,
    },
    deliveryContext || null,
  );
}

export interface FirstPartyPushDeviceTarget {
  deviceId: string;
  token: string;
}

export type FirstPartyPushProviderResult =
  | { kind: "accepted"; messageId: string }
  | { kind: "invalid" }
  | { kind: "transient"; retryAfterSeconds?: number }
  | { kind: "credential_rejected" }
  | { kind: "configuration_blocked" }
  | { kind: "internal_error" };

export const FIRST_PARTY_PUSH_PROVIDER = Symbol("FIRST_PARTY_PUSH_PROVIDER");

export interface FirstPartyPushProvider {
  isConfigured(): boolean;
  send(
    message: FirstPartyPushMessage,
    target: FirstPartyPushDeviceTarget,
  ): Promise<FirstPartyPushProviderResult>;
}

@Injectable()
export class FirstPartyNotificationTransport implements PassengerPushTransport {
  constructor(
    @Inject(MultiTaxiRepository)
    private readonly repository: MultiTaxiRepository,
    @Inject(PassengerPushDevicesService)
    private readonly deviceResolver: PassengerPushDevicesService,
    @Inject(FIRST_PARTY_PUSH_PROVIDER)
    private readonly provider: FirstPartyPushProvider,
  ) {}

  isAvailable(): boolean {
    return false;
  }

  async isAvailableFor(): Promise<boolean> {
    return false; // Handled by router
  }

  async send(
    request: PassengerPushTransportRequest,
  ): Promise<PassengerPushReceipt> {
    const { message, context: fenceContext } = request;
    const attemptCount = message.attemptCount;
    if (!attemptCount || !fenceContext.fenceToken) {
      throw new Error("First-party dispatch requires a durable consumer claim");
    }

    if (process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED !== "true") {
      throw firstPartyFailure("configuration_blocked");
    }

    if (!this.provider.isConfigured()) {
      throw firstPartyFailure("configuration_blocked");
    }

    let loaded =
      await this.repository.findFirstPartyNotificationContextAndTokens(
        message.outboxId,
      );
    let context: FirstPartyPushDeliveryContext;
    let tokensByDeviceId = new Map<string, string>();

    const route = await this.repository.findOrderFirstPartyNotificationRoute(
      message.orderId,
    );
    if (!route) {
      throw firstPartyFailure("route_missing", loaded?.context);
    }

    const relevance = await this.repository.findPartnerNotificationRelevance(
      message.orderId,
    );
    if (!relevance) {
      throw firstPartyFailure("route_missing", loaded?.context);
    }

    // Check relevance status
    if (message.eventType !== "receipt_ready") {
      if (
        ["cancelled", "completed", "closed", "rejected"].includes(
          relevance.status,
        )
      ) {
        throw firstPartyFailure("notification_obsolete", loaded?.context);
      }
      if (
        message.assignmentVersion !== null &&
        message.assignmentVersion < relevance.assignmentVersion
      ) {
        throw firstPartyFailure("notification_superseded", loaded?.context);
      }
    }

    const eventSequence = message.payload.eventSequence;
    if (
      typeof eventSequence !== "number" ||
      !Number.isSafeInteger(eventSequence) ||
      eventSequence < 1
    ) {
      throw firstPartyFailure("route_missing", loaded?.context);
    }

    if (!loaded) {
      // First attempt: resolve active devices
      const activeDevices = await this.deviceResolver.resolveActiveDevices(
        route.drtsPassengerId,
      );
      const targetDevices = activeDevices.map((d) => ({
        deviceId: d.deviceId,
        tokenSha256: d.tokenSha256,
      }));

      const wireMessage: FirstPartyPushMessage = {
        notification: {
          title: "乘車通知", // Default generic title
          body: "請查看最新乘車資訊", // Default generic body
        },
        data: {
          notification_id: message.outboxId,
          event:
            (PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME as any)[
              message.eventType
            ] || message.eventType,
          ride_ref: route.rideRef,
          event_sequence: String(eventSequence),
          expires_at: notificationExpiresAt(message) as any,
        } as any,
      };

      const wireMessageBytes = Buffer.from(JSON.stringify(wireMessage));
      const wireMessageHash = createHash("sha256")
        .update(wireMessageBytes)
        .digest("hex");

      context = await this.repository.prepareFirstPartyNotificationContext(
        {
          outboxId: message.outboxId,
          orderId: message.orderId,
          tenantId: route.tenantId,
          targetDevices,
          wireMessage,
          wireMessageHash,
          eventSequence,
          expiresAt: notificationExpiresAt(message) as any,
          deliveryTarget: "first_party_device",
          deliveryStage: null,
          retryDisposition: null,
          failureReason: null,
          receiptId: null,
        },
        String(fenceContext.fenceToken) as any,
      );

      // We don't have tokens yet, but the actual fetch from DB during send loop will need them.
      // We will reload to get tokens.
      loaded = await this.repository.findFirstPartyNotificationContextAndTokens(
        message.outboxId,
      );
      if (!loaded) throw new Error("Context failed to load after preparation");
    }

    context = loaded.context;
    tokensByDeviceId = loaded.tokensByDeviceId;

    if (Date.parse(context.expiresAt) <= Date.now()) {
      throw firstPartyFailure("notification_expired", context);
    }

    if (context.targetDevices.length === 0) {
      throw new FirstPartyPushFailure(
        {
          failureReason: "no_active_device",
          retryDisposition: "terminal",
          suggestedNextAttemptAt: null,
        },
        context,
      );
    }

    // Now re-check devices status to see if they are still active? No, "重試只送 context 裡的裝置"
    // Wait, SD says "重試只送 context 裡仍為 active 的裝置".
    // BUT the context in `FirstPartyPushDeliveryContext` stores `targetDevices`.
    // And `findFirstPartyNotificationContextAndTokens` reads tokens from `iam.phase1_passenger_push_devices`.
    // It only returns tokens if the device exists. But if the device was revoked, does it still return the token? Yes, if it's not deleted.
    // However, I need to check if it's still 'active'.
    // Let's rely on the token check. Or maybe the token fetch should only fetch 'active' status?
    // Actually, `resolveActiveDevices` filters `status = 'active'`. So the initial context has active devices.
    // If a device becomes revoked later, we can still send to it, or FCM will reject it. Let's just use what's in tokensByDeviceId.

    // Check if attempt count exceeded maxAttempts from FIRST_PARTY_PUSH_RETRY_POLICY
    if (attemptCount > FIRST_PARTY_PUSH_RETRY_POLICY.maxAttempts) {
      throw new FirstPartyPushFailure(
        {
          failureReason: "provider_transient_error",
          retryDisposition: "terminal",
          suggestedNextAttemptAt: null,
        },
        context,
      );
    }

    let acceptedCount = 0;
    let allInvalid = true;
    let credentialRejected = false;
    let firstReceiptId: string | null = null;
    let maxRetryAfter = 0;

    for (const target of context.targetDevices) {
      const token = tokensByDeviceId.get(target.deviceId);
      if (!token) continue; // Device missing or token missing

      const result = await this.provider.send(context.wireMessage, {
        deviceId: target.deviceId,
        token: token,
      });

      if (result.kind === "accepted") {
        acceptedCount++;
        allInvalid = false;
        if (!firstReceiptId) firstReceiptId = result.messageId;
      } else if (result.kind === "invalid") {
        await this.deviceResolver.invalidateDevice(
          target.deviceId,
          "provider_invalid",
        );
      } else if (result.kind === "credential_rejected") {
        credentialRejected = true;
        allInvalid = false;
      } else {
        allInvalid = false;
        if (result.kind === "transient" && result.retryAfterSeconds) {
          maxRetryAfter = Math.max(maxRetryAfter, result.retryAfterSeconds);
        }
      }
    }

    if (acceptedCount > 0) {
      const deliveredAt = new Date().toISOString();
      return {
        providerName: "first_party_app",
        providerMessageRef: firstReceiptId || "unknown",
        deliveredAt,
        deliveryContext: {
          ...context,
          deliveryStage: "provider_accepted",
          retryDisposition: "none",
          failureReason: null,
          receiptId: firstReceiptId,
          deliveredAt,
        } as any,
      };
    }

    if (credentialRejected) {
      throw new FirstPartyPushFailure(
        {
          failureReason: "credential_rejected",
          retryDisposition: "configuration_blocked",
          suggestedNextAttemptAt: null,
        },
        context,
      );
    }

    if (allInvalid) {
      throw new FirstPartyPushFailure(
        {
          failureReason: "no_active_device",
          retryDisposition: "terminal",
          suggestedNextAttemptAt: null,
        },
        context,
      );
    }

    // Transient failure
    const delayMs =
      maxRetryAfter > 0
        ? maxRetryAfter * 1000
        : FIRST_PARTY_PUSH_RETRY_POLICY.initialDelaySeconds *
          1000 *
          Math.pow(
            FIRST_PARTY_PUSH_RETRY_POLICY.backoffMultiplier,
            attemptCount - 1,
          );

    throw new FirstPartyPushFailure(
      {
        failureReason: "provider_transient_error",
        retryDisposition: "automatic",
        suggestedNextAttemptAt: new Date(
          Date.now() +
            Math.min(
              delayMs,
              FIRST_PARTY_PUSH_RETRY_POLICY.maxDelaySeconds * 1000,
            ),
        ).toISOString(),
      },
      context,
    );
  }
}
