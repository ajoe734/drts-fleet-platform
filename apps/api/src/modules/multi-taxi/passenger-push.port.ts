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
