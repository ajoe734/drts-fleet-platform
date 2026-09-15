import { Inject, Injectable } from "@nestjs/common";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

export type PassengerPushMessage = {
  outboxId: string;
  orderId: string;
  /** Pseudonymous subject reference; never a raw phone number. */
  passengerSubjectRef: string;
  eventType: ConsumerNotificationOutboxRecord["eventType"];
  assignmentVersion: number | null;
  payload: Record<string, unknown>;
};

export type PassengerPushReceipt = {
  providerName: string;
  providerMessageRef: string;
};

export interface PassengerPushPort {
  /** False whenever provider credentials are absent. */
  isAvailable(): boolean;
  providerName(): string | null;
  send(
    message: PassengerPushMessage,
    context: { requestId?: string | undefined },
  ): Promise<PassengerPushReceipt>;
}

export const PASSENGER_PUSH_PORT = Symbol("PASSENGER_PUSH_PORT");

/**
 * Default binding. P5-PUSH-001 stays `blocked_ext` until provider credentials
 * and contract tests are supplied, so an unconfigured runtime reports the
 * absence and leaves the outbox row undelivered instead of stamping
 * `delivered` for a notification nobody ever sent.
 */
@Injectable()
export class UnavailablePassengerPushPort implements PassengerPushPort {
  isAvailable() {
    return false;
  }

  providerName() {
    return null;
  }

  async send(): Promise<PassengerPushReceipt> {
    throw new Error(
      "Passenger push provider is not provisioned; no notification can be delivered.",
    );
  }
}

export const InjectPassengerPushPort = () => Inject(PASSENGER_PUSH_PORT);

export class PassengerPushDeviceExpiredError extends Error {
  constructor(message = "Passenger push device registration has expired") {
    super(message);
    this.name = "PassengerPushDeviceExpiredError";
  }
}

export class PassengerPushDeviceRevokedError extends Error {
  constructor(message = "Passenger push device registration has been revoked") {
    super(message);
    this.name = "PassengerPushDeviceRevokedError";
  }
}

export class PassengerPushTenantMismatchError extends Error {
  constructor(message = "Passenger push device belongs to a different tenant") {
    super(message);
    this.name = "PassengerPushTenantMismatchError";
  }
}

export class PassengerPushProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PassengerPushProviderError";
  }
}

/**
 * No active Web Push subscription is on file for this passenger (never
 * subscribed, or the only subscription on file was revoked). Kept distinct
 * from `PassengerPushDeviceRevokedError` — which the device-lifecycle checks
 * inside `PassengerPushAdapter` throw for a subscription that *was* resolved
 * but is expired/revoked — because a transport can also reach this state
 * from `resolveDevice` returning `null`, before any device-lifecycle check
 * runs at all.
 */
export class PassengerPushNoSubscriptionError extends Error {
  constructor(message = "No active push subscription for this passenger") {
    super(message);
    this.name = "PassengerPushNoSubscriptionError";
  }
}
