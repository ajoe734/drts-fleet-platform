import { Injectable } from "@nestjs/common";


export interface WebPushSubscriptionKeysInput {
  p256dh: string;
  auth: string;
}

/** The client-supplied body for the passenger push-subscription endpoint. */
export interface RegisterPassengerPushSubscriptionCommand {
  endpoint: string;
  keys: WebPushSubscriptionKeysInput;
}

export interface UpsertPassengerPushSubscriptionCommand {
  orderId: string;
  passengerSubjectRef: string;
  tenantId?: string | null;
  endpoint: string;
  keys: WebPushSubscriptionKeysInput;
  /**
   * The ride access token's `expiresAt`, snapshotted at subscribe time. The
   * subscription's lifecycle follows the ride access token: there is
   * currently no active-revocation path for that token in this codebase
   * (only natural TTL expiry), so re-checking this snapshot at delivery
   * time is equivalent to re-checking the token itself. If an active
   * revoke path is ever added for `PassengerRideAccessToken`, that call
   * site must also call `revokeByOrderId` here.
   */
  accessTokenExpiresAt: string;
}

export interface PassengerPushSubscriptionRecord {
  orderId: string;
  passengerSubjectRef: string;
  tenantId: string | null;
  endpoint: string;
  keys: WebPushSubscriptionKeysInput;
  accessTokenExpiresAt: string;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

/**
 * Passenger Web Push subscription store. One active subscription per order:
 * a passenger re-subscribing (e.g. a fresh browser session on the same
 * ride link) simply replaces the previous row rather than accumulating
 * stale endpoints that would otherwise all be attempted on every send.
 *
 * In-memory only for now — no migration/table is in this task's scope.
 * Durability across process restarts is a known follow-up; the repository
 * shape here is deliberately narrow so a later Postgres-backed
 * implementation can drop in behind the same interface.
 */
@Injectable()
export class PassengerPushRepository {
  private readonly subscriptionsByOrderId = new Map<
    string,
    PassengerPushSubscriptionRecord
  >();

  upsertSubscription(
    command: UpsertPassengerPushSubscriptionCommand,
  ): PassengerPushSubscriptionRecord {
    const now = new Date().toISOString();
    const existing = this.subscriptionsByOrderId.get(command.orderId);
    const record: PassengerPushSubscriptionRecord = {
      orderId: command.orderId,
      passengerSubjectRef: command.passengerSubjectRef,
      tenantId: command.tenantId ?? null,
      endpoint: command.endpoint,
      keys: { ...command.keys },
      accessTokenExpiresAt: command.accessTokenExpiresAt,
      status: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revokedAt: null,
    };
    this.subscriptionsByOrderId.set(command.orderId, record);
    return { ...record, keys: { ...record.keys } };
  }

  findActiveByOrderId(orderId: string): PassengerPushSubscriptionRecord | null {
    const record = this.subscriptionsByOrderId.get(orderId);
    if (!record || record.status !== "active") {
      return null;
    }
    return { ...record, keys: { ...record.keys } };
  }

  /** Returns true only if an active subscription existed and was revoked. */
  revokeByOrderId(orderId: string): boolean {
    const record = this.subscriptionsByOrderId.get(orderId);
    if (!record || record.status !== "active") {
      return false;
    }
    const revokedAt = new Date().toISOString();
    this.subscriptionsByOrderId.set(orderId, {
      ...record,
      status: "revoked",
      revokedAt,
      updatedAt: revokedAt,
    });
    return true;
  }
}
