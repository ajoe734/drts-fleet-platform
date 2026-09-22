import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { partnerFailure } from "./partner-notification.types";

import {
  PassengerPushDeviceExpiredError,
  PassengerPushDeviceRevokedError,
  PassengerPushProviderError,
  PassengerPushTenantMismatchError,
  type PassengerPushMessage,
  type PassengerPushSendContext,
  type PassengerPushPort,
  type PassengerPushReceipt,
} from "./passenger-push.port";

/**
 * A Web Push subscription's real shape: its own `endpoint` plus the
 * subscriber's `p256dh`/`auth` keys (all base64url, straight from the
 * browser's `PushSubscription.toJSON()`). This must never be flattened into
 * `deviceToken` — the built-in HTTP transport's single-config-endpoint +
 * opaque-token shape does not fit a per-subscription push service endpoint
 * plus its own encryption keys.
 */
export interface WebPushSubscriptionDetails {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PassengerDeviceRecord {
  deviceId: string;
  passengerSubjectRef: string;
  deviceToken: string;
  status: "active" | "expired" | "revoked";
  tenantId?: string | null | undefined;
  expiresAt?: string | null | undefined;
  webPushSubscription?: WebPushSubscriptionDetails | null | undefined;
}

export interface PassengerDeviceResolver {
  resolveDevice(
    passengerSubjectRef: string,
    context?: {
      tenantId?: string | undefined;
      requestId?: string | undefined;
      /** Present so a resolver can look up an order-scoped subscription. */
      orderId?: string | undefined;
    },
  ): Promise<PassengerDeviceRecord | null> | PassengerDeviceRecord | null;
}

export interface PassengerPushTransportRequest {
  endpoint?: string | undefined;
  providerName: string;
  message: PassengerPushMessage;
  device?: PassengerDeviceRecord | null | undefined;
  context: PassengerPushSendContext;
}

export interface PassengerPushTransport {
  send(request: PassengerPushTransportRequest): Promise<PassengerPushReceipt>;
  /**
   * When present, `PassengerPushAdapter.isAvailable()` defers to this instead
   * of treating the transport's mere presence as availability — an injected
   * transport object with no real credentials (e.g. Web Push without VAPID
   * keys configured) must not be reported as deliverable.
   */
  isAvailable?(): boolean;
  isAvailableFor?(message: PassengerPushMessage): Promise<boolean>;
}

export interface PassengerPushAdapterConfig {
  transportMode?: "partner_webhook" | "legacy";
  providerName?: string | undefined;
  endpointUrl?: string | undefined;
  apiKey?: string | undefined;
  authToken?: string | undefined;
}

export const PASSENGER_PUSH_ADAPTER_CONFIG = Symbol(
  "PASSENGER_PUSH_ADAPTER_CONFIG",
);
export const PASSENGER_PUSH_TRANSPORT = Symbol("PASSENGER_PUSH_TRANSPORT");
export const PASSENGER_DEVICE_RESOLVER = Symbol("PASSENGER_DEVICE_RESOLVER");

/**
 * PassengerPushAdapter provides a production push notification adapter with:
 * 1. Absence of provider credentials fails safe to unconfigured/unavailable
 *    (preventing fabricated "delivered" status when credentials are missing).
 * 2. Injectable real transport interface allowing controlled receiver verification.
 * 3. Pre-send passenger device lifecycle validation (expired, revoked, tenant mismatch).
 * 4. Reliable receipt extraction and error classification.
 */
@Injectable()
export class PassengerPushAdapter implements PassengerPushPort {
  private readonly logger = new Logger(PassengerPushAdapter.name);

  constructor(
    @Optional()
    @Inject(PASSENGER_PUSH_ADAPTER_CONFIG)
    private readonly config?: PassengerPushAdapterConfig | null,
    @Optional()
    @Inject(PASSENGER_PUSH_TRANSPORT)
    private readonly transport?: PassengerPushTransport | null,
    @Optional()
    @Inject(PASSENGER_DEVICE_RESOLVER)
    private readonly deviceResolver?: PassengerDeviceResolver | null,
  ) {}

  get transportMode() {
    return this.config?.transportMode ?? "legacy";
  }

  async isAvailableFor(message: PassengerPushMessage): Promise<boolean> {
    if (this.transportMode === "partner_webhook") {
      return (await this.transport?.isAvailableFor?.(message)) ?? false;
    }
    return this.isAvailable();
  }

  isAvailable(): boolean {
    // A partner route is required; object presence is not entry readiness.
    if (this.transportMode === "partner_webhook") return false;
    if (this.transport) {
      // An injected transport's mere presence is not proof it can actually
      // send: Web Push, for example, still needs VAPID keys. Defer to the
      // transport's own readiness check when it exposes one instead of
      // reporting available on object presence alone.
      return this.transport.isAvailable ? this.transport.isAvailable() : true;
    }
    if (
      this.config?.apiKey ||
      this.config?.authToken ||
      (this.config?.endpointUrl && this.config?.providerName)
    ) {
      return true;
    }
    const envApiKey = process.env.PASSENGER_PUSH_API_KEY?.trim();
    const envAuthToken = process.env.PASSENGER_PUSH_AUTH_TOKEN?.trim();
    const envEndpoint =
      process.env.PASSENGER_PUSH_ENDPOINT?.trim() ||
      process.env.PASSENGER_PUSH_PROVIDER_URL?.trim();
    const envProviderName = process.env.PASSENGER_PUSH_PROVIDER_NAME?.trim();

    if (envApiKey || envAuthToken || (envEndpoint && envProviderName)) {
      return true;
    }
    return false;
  }

  providerName(): string | null {
    if (this.transportMode === "partner_webhook") return "partner_webhook";
    if (!this.isAvailable()) {
      return null;
    }
    return (
      this.config?.providerName?.trim() ||
      process.env.PASSENGER_PUSH_PROVIDER_NAME?.trim() ||
      "passenger-push-adapter"
    );
  }

  async send(
    message: PassengerPushMessage,
    context: PassengerPushSendContext,
  ): Promise<PassengerPushReceipt> {
    if (this.transportMode === "partner_webhook") {
      if (!this.transport) throw partnerFailure("configuration_blocked");
      return this.transport.send({
        providerName: "partner_webhook",
        message,
        context,
      });
    }
    if (!this.isAvailable()) {
      throw new Error(
        "Passenger push provider is not provisioned; no notification can be delivered.",
      );
    }

    let device: PassengerDeviceRecord | null = null;
    if (this.deviceResolver) {
      const tenantId =
        typeof message.payload?.tenantId === "string"
          ? message.payload.tenantId
          : undefined;
      device = await this.deviceResolver.resolveDevice(
        message.passengerSubjectRef,
        {
          ...(tenantId !== undefined ? { tenantId } : {}),
          ...(context.requestId !== undefined
            ? { requestId: context.requestId }
            : {}),
          orderId: message.orderId,
        },
      );

      if (device) {
        if (
          device.status === "expired" ||
          (device.expiresAt &&
            new Date(device.expiresAt).getTime() <= Date.now())
        ) {
          throw new PassengerPushDeviceExpiredError(
            `Device for passenger ${message.passengerSubjectRef} has expired`,
          );
        }
        if (device.status === "revoked") {
          throw new PassengerPushDeviceRevokedError(
            `Device for passenger ${message.passengerSubjectRef} has been revoked`,
          );
        }
        if (tenantId && device.tenantId && device.tenantId !== tenantId) {
          throw new PassengerPushTenantMismatchError(
            `Device tenant ${device.tenantId} does not match notification tenant ${tenantId}`,
          );
        }
      }
    }

    if (this.transport) {
      return await this.transport.send({
        providerName: this.providerName() ?? "injected-transport",
        endpoint:
          this.config?.endpointUrl || process.env.PASSENGER_PUSH_ENDPOINT,
        message,
        device,
        context,
      });
    }

    const endpoint =
      this.config?.endpointUrl ||
      process.env.PASSENGER_PUSH_ENDPOINT?.trim() ||
      process.env.PASSENGER_PUSH_PROVIDER_URL?.trim();
    const apiKey =
      this.config?.apiKey || process.env.PASSENGER_PUSH_API_KEY?.trim();
    const authToken =
      this.config?.authToken || process.env.PASSENGER_PUSH_AUTH_TOKEN?.trim();

    if (!endpoint) {
      throw new Error(
        "Push provider endpoint is not configured for outbound transmission.",
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...(context.requestId ? { "x-request-id": context.requestId } : {}),
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        outboxId: message.outboxId,
        orderId: message.orderId,
        passengerSubjectRef: message.passengerSubjectRef,
        eventType: message.eventType,
        assignmentVersion: message.assignmentVersion,
        deviceToken: device?.deviceToken,
        payload: message.payload,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      this.logger.warn(
        `Push provider returned HTTP ${res.status} for outbox ${message.outboxId}: ${errText}`,
      );
      throw new PassengerPushProviderError(
        `Push provider returned HTTP ${res.status}: ${errText}`,
        res.status,
      );
    }

    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const providerMessageRef =
      (typeof data.providerMessageRef === "string" &&
        data.providerMessageRef) ||
      (typeof data.messageId === "string" && data.messageId) ||
      (typeof data.id === "string" && data.id) ||
      res.headers.get("x-provider-message-ref") ||
      `receipt-${message.outboxId}`;

    return {
      providerName: this.providerName()!,
      providerMessageRef,
    };
  }
}
