import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  PassengerPushDeviceRevokedError,
  PassengerPushNoSubscriptionError,
  PassengerPushProviderError,
  type PassengerPushReceipt,
} from "./passenger-push.port";
import type {
  PassengerPushTransport,
  PassengerPushTransportRequest,
} from "./passenger-push.adapter";
import {
  buildVapidAuthorizationHeader,
  encryptWebPushPayload,
  isValidUncompressedP256PublicKey,
  isValidWebPushAuthSecret,
  type WebPushVapidConfig,
} from "./web-push-crypto";

export const WEB_PUSH_VAPID_CONFIG = Symbol("WEB_PUSH_VAPID_CONFIG");

/** Web Push (RFC 8030/8291/8292) endpoints reject an expired/gone subscription this way. */
const GONE_HTTP_STATUSES = new Set([404, 410]);

/**
 * Injectable `PassengerPushTransport` for Web Push. Carries no provider
 * account, matching the product decision to stay on the browser Push API
 * instead of adding an external push vendor: every "provider" concept here
 * is just the passenger's own subscription plus this instance's VAPID keys.
 */
@Injectable()
export class WebPushTransport implements PassengerPushTransport {
  constructor(
    @Optional()
    @Inject(WEB_PUSH_VAPID_CONFIG)
    private readonly config?: WebPushVapidConfig | null,
  ) {}

  private resolveVapidConfig(): WebPushVapidConfig | null {
    const publicKey =
      this.config?.publicKey ||
      process.env.PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey =
      this.config?.privateKey ||
      process.env.PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY?.trim();
    const subject =
      this.config?.subject ||
      process.env.PASSENGER_WEBPUSH_VAPID_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject) {
      return null;
    }
    if (!isValidUncompressedP256PublicKey(publicKey)) {
      return null;
    }
    try {
      if (Buffer.from(privateKey, "base64url").length !== 32) {
        return null;
      }
    } catch {
      return null;
    }
    return { publicKey, privateKey, subject };
  }

  /** Real readiness — not merely "an object was injected". */
  isAvailable(): boolean {
    return this.resolveVapidConfig() !== null;
  }

  publicKey(): string | null {
    return this.resolveVapidConfig()?.publicKey ?? null;
  }

  async send(
    request: PassengerPushTransportRequest,
  ): Promise<PassengerPushReceipt> {
    const vapid = this.resolveVapidConfig();
    if (!vapid) {
      throw new Error("Web Push VAPID credentials are not configured.");
    }

    const subscription = request.device?.webPushSubscription;
    if (!subscription) {
      throw new PassengerPushNoSubscriptionError(
        `No active web push subscription for passenger ${request.message.passengerSubjectRef}`,
      );
    }
    if (
      !isValidUncompressedP256PublicKey(subscription.keys.p256dh) ||
      !isValidWebPushAuthSecret(subscription.keys.auth)
    ) {
      throw new PassengerPushNoSubscriptionError(
        `Stored web push subscription for passenger ${request.message.passengerSubjectRef} has malformed keys`,
      );
    }

    const payload = Buffer.from(
      JSON.stringify({
        outboxId: request.message.outboxId,
        orderId: request.message.orderId,
        eventType: request.message.eventType,
        assignmentVersion: request.message.assignmentVersion,
        payload: request.message.payload,
      }),
      "utf8",
    );
    const body = encryptWebPushPayload(payload, subscription.keys);
    const authorization = buildVapidAuthorizationHeader(
      subscription.endpoint,
      vapid,
    );

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "aes128gcm",
        ttl: "86400",
        authorization,
        ...(request.context.requestId
          ? { "x-request-id": request.context.requestId }
          : {}),
      },
      body,
    });

    if (GONE_HTTP_STATUSES.has(res.status)) {
      throw new PassengerPushDeviceRevokedError(
        `Push endpoint reported HTTP ${res.status} (subscription no longer valid) for passenger ${request.message.passengerSubjectRef}`,
      );
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new PassengerPushProviderError(
        `Web Push endpoint returned HTTP ${res.status}: ${errText}`,
        res.status,
      );
    }

    const providerMessageRef =
      res.headers.get("location") || `webpush-${request.message.outboxId}`;
    return {
      providerName: request.providerName,
      providerMessageRef,
    };
  }
}
