import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME, PartnerPassengerEventType } from "@drts/contracts";
import { PLATFORM_CURRENCY } from "@drts/contracts";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type {
  ConsumerNotificationOutboxRecord,
  DriverRatingSummary,
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiElectronicReceipt,
  MultiTaxiOperatingAuthorizationRecord,
  OrderPartnerNotificationRoute,
  PassengerPaymentStatus,
  PassengerRatingModerationAuditRecord,
  PassengerRatingReviewListItem,
  PassengerPushDeliveryOutcome,
  PassengerRideAccessToken,
  PassengerTripRatingRecord,
  PushProviderAckState,
} from "@drts/contracts";

import type {
  PartnerDeliveryMetadata,
  StoredPartnerNotificationContext,
} from "./partner-notification.types";

import { DatabaseService } from "../../common/db/database.service";
import { PartnerNotificationDispatchFacade } from "../tenant-partner/partner-notification-dispatch.facade";

type AuthorizationRow = QueryResultRow & {
  authorization_id: string;
  operator_id: string;
  authority_code: string;
  business_plan_version: string;
  status: MultiTaxiOperatingAuthorizationRecord["status"];
  service_area_codes: unknown;
  active_fare_version_id: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AuthorizedVehicleRow = QueryResultRow & {
  authorization_vehicle_id: string;
  authorization_id: string;
  vehicle_id: string;
  status: MultiTaxiAuthorizedVehicleRecord["status"];
  effective_from: Date | string;
  effective_until: Date | string | null;
};

type PassengerRideAccessTokenRow = QueryResultRow & {
  token_id: string;
  order_id: string;
  passenger_subject_ref: string;
  scopes: unknown;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

type PassengerTripRatingRow = QueryResultRow & {
  rating_id: string;
  order_id: string;
  trip_id: string;
  driver_id: string;
  passenger_subject_ref: string;
  score: 1 | 2 | 3 | 4 | 5;
  tags: unknown;
  comment: string | null;
  status: PassengerTripRatingRecord["status"];
  submitted_at: Date | string;
  updated_at: Date | string;
};

type DriverRatingSummaryRow = QueryResultRow & {
  driver_id: string;
  display_state: DriverRatingSummary["displayState"];
  average_rating: string | number | null;
  rating_count: number;
  last_rated_at: Date | string | null;
  aggregate_version: number;
  calculated_at: Date | string;
};

type PassengerRatingModerationAuditRow = QueryResultRow & {
  audit_id: string;
  rating_id: string;
  action: PassengerRatingModerationAuditRecord["action"];
  reason: string;
  actor_id: string;
  idempotency_key: string;
  previous_status: PassengerRatingModerationAuditRecord["previousStatus"];
  resulting_status: PassengerRatingModerationAuditRecord["resultingStatus"];
  aggregate_version: number;
  request_id: string | null;
  created_at: Date | string;
};

type PassengerRatingReviewListRow = QueryResultRow & {
  rating_id: string;
  order_id: string;
  trip_id: string;
  driver_id: string;
  driver_display_name: string | null;
  score: PassengerTripRatingRecord["score"];
  tags: unknown;
  comment_excerpt: string | null;
  status: PassengerTripRatingRecord["status"];
  submitted_at: Date | string;
  updated_at: Date | string;
};

type PassengerRatingReviewDetailRow = PassengerTripRatingRow & {
  order_no: string | null;
  driver_display_name: string | null;
};

type RatingReviewCountRow = QueryResultRow & {
  total_items: number | string;
};

export interface PassengerRatingReviewRepositoryQuery {
  status: PassengerTripRatingRecord["status"] | null;
  score: PassengerTripRatingRecord["score"] | null;
  tag: string | null;
  driverId: string | null;
  tripOrOrder: string | null;
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
}

type PushDeliveryClaimRow = QueryResultRow & {
  fence_token: number;
};

export interface PushDeliveryClaimGranted {
  claimed: true;
  fenceToken: number;
}

export interface PushDeliveryClaimDenied {
  claimed: false;
}

export type PushDeliveryClaimOutcome =
  | PushDeliveryClaimGranted
  | PushDeliveryClaimDenied;

export interface RecordPushDeliveryOutcomeInput {
  outboxId: string;
  passengerSubjectRef: string;
  fenceToken: number;
  providerName: string | null;
  providerAckState: PushProviderAckState;
  providerMessageRef: string | null;
  deliveryOutcome: PassengerPushDeliveryOutcome;
  partnerMetadata?: PartnerDeliveryMetadata;
}

export type RecordPushDeliveryOutcomeResult =
  | { recorded: true; replayed: boolean }
  | { recorded: false; reason: "fence_lost" };

export interface PassengerRatingReviewRepositoryDetail {
  rating: PassengerTripRatingRecord;
  orderNo: string | null;
  driverDisplayName: string | null;
  summary: DriverRatingSummary | null;
  moderationHistory: PassengerRatingModerationAuditRecord[];
}

export interface PersistPassengerRatingInvalidationInput {
  auditId: string;
  ratingId: string;
  reason: string;
  actorId: string;
  idempotencyKey: string;
  requestId: string | null;
  invalidatedAt: string;
}

export type PersistPassengerRatingInvalidationResult =
  | {
      outcome: "not_found";
    }
  | {
      outcome: "already_invalidated";
      rating: PassengerTripRatingRecord;
    }
  | {
      outcome: "invalidated" | "replayed";
      rating: PassengerTripRatingRecord;
      summary: DriverRatingSummary;
      audit: PassengerRatingModerationAuditRecord;
    };

type PassengerPaymentRow = QueryResultRow & {
  status: PassengerPaymentStatus;
  amount_minor: string | number | null;
  currency: string;
};

type ElectronicReceiptRow = QueryResultRow & {
  receipt_id: string;
  order_id: string;
  receipt_no: string;
  amount_minor: string | number;
  currency: string;
  issued_at: Date | string;
  record: unknown;
};

type OrderPartnerNotificationRouteRow = QueryResultRow & {
  order_id: string;
  tenant_id: string;
  partner_id: string;
  entry_slug: string;
  partner_user_ref: string;
  drts_passenger_id: string;
  passenger_subject_ref: string;
  identity_linked_at: Date | string;
  consent_bundle_version: string;
  notification_policy_version: string;
  ride_ref: string;
  created_at: Date | string;
};

@Injectable()
export class MultiTaxiRepository {
  private readonly logger = new Logger(MultiTaxiRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService, @Optional() private readonly facade?: PartnerNotificationDispatchFacade) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState() {
    if (!this.isEnabled()) {
      return { authorizations: [], vehicles: [] };
    }

    const [authorizationResult, vehicleResult] = await Promise.all([
      this.databaseService!.query<AuthorizationRow>(`
        SELECT *
        FROM reg.multi_taxi_operating_authorizations
        ORDER BY updated_at DESC
      `),
      this.databaseService!.query<AuthorizedVehicleRow>(`
        SELECT *
        FROM reg.multi_taxi_authorized_vehicles
        ORDER BY authorization_id, vehicle_id
      `),
    ]);

    return {
      authorizations: authorizationResult.rows.map((row: any) =>
        this.mapAuthorization(row),
      ),
      vehicles: vehicleResult.rows.map((row: any) => this.mapVehicle(row)),
    };
  }

  async persistAuthorization(
    authorization: MultiTaxiOperatingAuthorizationRecord,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO reg.multi_taxi_operating_authorizations (
          authorization_id,
          operator_id,
          authority_code,
          business_plan_version,
          status,
          service_area_codes,
          active_fare_version_id,
          effective_from,
          effective_until,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11
        )
        ON CONFLICT (authorization_id) DO UPDATE SET
          authority_code = EXCLUDED.authority_code,
          business_plan_version = EXCLUDED.business_plan_version,
          status = EXCLUDED.status,
          service_area_codes = EXCLUDED.service_area_codes,
          active_fare_version_id = EXCLUDED.active_fare_version_id,
          effective_from = EXCLUDED.effective_from,
          effective_until = EXCLUDED.effective_until,
          updated_at = EXCLUDED.updated_at
      `,
      [
        authorization.authorizationId,
        authorization.operatorId,
        authorization.authorityCode,
        authorization.businessPlanVersion,
        authorization.status,
        JSON.stringify(authorization.serviceAreaCodes),
        authorization.activeFareVersionId,
        authorization.effectiveFrom,
        authorization.effectiveUntil,
        authorization.createdAt,
        authorization.updatedAt,
      ],
    );
  }

  async persistVehicle(vehicle: MultiTaxiAuthorizedVehicleRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO reg.multi_taxi_authorized_vehicles (
          authorization_vehicle_id,
          authorization_id,
          vehicle_id,
          status,
          effective_from,
          effective_until
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (authorization_id, vehicle_id) DO UPDATE SET
          status = EXCLUDED.status,
          effective_from = EXCLUDED.effective_from,
          effective_until = EXCLUDED.effective_until
      `,
      [
        vehicle.authorizationVehicleId,
        vehicle.authorizationId,
        vehicle.vehicleId,
        vehicle.status,
        vehicle.effectiveFrom,
        vehicle.effectiveUntil,
      ],
    );
  }

  async persistRideAccessToken(
    token: PassengerRideAccessToken,
    tokenDigest: string,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.passenger_ride_access_tokens (
          token_id,
          token_digest,
          order_id,
          passenger_subject_ref,
          scopes,
          expires_at,
          revoked_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        ON CONFLICT (token_id) DO NOTHING
      `,
      [
        token.tokenId,
        tokenDigest,
        token.orderId,
        token.passengerSubjectRef,
        JSON.stringify(token.scopes),
        token.expiresAt,
        token.revokedAt,
      ],
    );
  }

  async findRideAccessTokenByDigest(tokenDigest: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result =
      await this.databaseService!.query<PassengerRideAccessTokenRow>(
        `
        SELECT
          token_id,
          order_id,
          passenger_subject_ref,
          scopes,
          expires_at,
          revoked_at
        FROM ops.passenger_ride_access_tokens
        WHERE token_digest = $1
        LIMIT 1
      `,
        [tokenDigest],
      );
    const row = result.rows[0];
    return row ? this.mapRideAccessToken(row) : null;
  }

  /**
   * SR-PARTNER-NOTIFY-ROUTE-20260917 design §4/§11: writes the frozen
   * order->partner-entry notification route and initializes its durable
   * event-sequence counter (mobility.phase1_partner_notification_sequences)
   * in the same DB transaction. `order_id` is the primary key on both
   * tables, so this is idempotent — a route is immutable once created, and a
   * repeated call for the same order is a no-op that returns the
   * already-stored route rather than overwriting it.
   */
  async writeOrderPartnerNotificationRoute(
    route: OrderPartnerNotificationRoute,
  ): Promise<OrderPartnerNotificationRoute | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const insertResult = await client.query<OrderPartnerNotificationRouteRow>(
        `
          INSERT INTO mobility.phase1_order_partner_notification_routes (
            order_id, tenant_id, partner_id, entry_slug, partner_user_ref,
            drts_passenger_id, passenger_subject_ref, identity_linked_at,
            consent_bundle_version, notification_policy_version, ride_ref,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (order_id) DO NOTHING
          RETURNING order_id, tenant_id, partner_id, entry_slug,
            partner_user_ref, drts_passenger_id, passenger_subject_ref,
            identity_linked_at, consent_bundle_version,
            notification_policy_version, ride_ref, created_at
        `,
        [
          route.orderId,
          route.tenantId,
          route.partnerId,
          route.entrySlug,
          route.partnerUserRef,
          route.drtsPassengerId,
          route.passengerSubjectRef,
          route.identityLinkedAt,
          route.consentBundleVersion,
          route.notificationPolicyVersion,
          route.rideRef,
          route.createdAt,
        ],
      );

      let insertedRow = insertResult.rows[0];
      if (!insertedRow) {
        const existing = await client.query<OrderPartnerNotificationRouteRow>(
          `
            SELECT order_id, tenant_id, partner_id, entry_slug,
              partner_user_ref, drts_passenger_id, passenger_subject_ref,
              identity_linked_at, consent_bundle_version,
              notification_policy_version, ride_ref, created_at
            FROM mobility.phase1_order_partner_notification_routes
            WHERE order_id = $1
          `,
          [route.orderId],
        );
        insertedRow = existing.rows[0];
      } else {
        await client.query(
          `
            INSERT INTO mobility.phase1_partner_notification_sequences (
              order_id, next_sequence
            ) VALUES ($1, 1)
            ON CONFLICT (order_id) DO NOTHING
          `,
          [route.orderId],
        );
      }

      await client.query("COMMIT");
      return insertedRow
        ? this.mapOrderPartnerNotificationRoute(insertedRow)
        : null;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.logger.warn(
        `Failed to persist partner notification route for order ${route.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      client.release();
    }
  }

  async findOrderPartnerNotificationRoute(
    orderId: string,
  ): Promise<OrderPartnerNotificationRoute | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result =
      await this.databaseService!.query<OrderPartnerNotificationRouteRow>(
        `
        SELECT order_id, tenant_id, partner_id, entry_slug, partner_user_ref,
          drts_passenger_id, passenger_subject_ref, identity_linked_at,
          consent_bundle_version, notification_policy_version, ride_ref,
          created_at
        FROM mobility.phase1_order_partner_notification_routes
        WHERE order_id = $1
      `,
        [orderId],
      );
    const row = result.rows[0];
    return row ? this.mapOrderPartnerNotificationRoute(row) : null;
  }

  /**
   * design §5/§11: the sole durable ordering authority for partner
   * notifications — never the in-memory `passengerEventSequenceByOrder`
   * counter on MultiTaxiService, which resets across process restarts. The
   * `UPDATE ... RETURNING` is a single atomic statement, so concurrent
   * callers for the same order always receive distinct sequence numbers;
   * pass a transaction-scoped executor from the outbox-producing
   * transaction so the allocation commits or rolls
   * back with that outbox row rather than independently.
   */
  async allocateNotificationEventSequence(
    orderId: string,
    executor: Pick<DatabaseService, "query">,
  ): Promise<number | null> {
    const result = await executor.query<{
      event_sequence: string | number;
    }>(
      `
        UPDATE mobility.phase1_partner_notification_sequences
        SET next_sequence = next_sequence + 1
        WHERE order_id = $1
        RETURNING next_sequence - 1 AS event_sequence
      `,
      [orderId],
    );
    const row = result.rows[0];
    return row ? Number(row.event_sequence) : null;
  }

  private mapOrderPartnerNotificationRoute(
    row: OrderPartnerNotificationRouteRow,
  ): OrderPartnerNotificationRoute {
    return {
      orderId: row.order_id,
      tenantId: row.tenant_id,
      partnerId: row.partner_id,
      entrySlug: row.entry_slug,
      partnerUserRef: row.partner_user_ref,
      drtsPassengerId: row.drts_passenger_id,
      passengerSubjectRef: row.passenger_subject_ref,
      identityLinkedAt: new Date(row.identity_linked_at).toISOString(),
      consentBundleVersion: row.consent_bundle_version,
      notificationPolicyVersion:
        row.notification_policy_version as OrderPartnerNotificationRoute["notificationPolicyVersion"],
      rideRef: row.ride_ref,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  /**
   * Records the result of one push-delivery attempt. `delivered_at` is only set
   * for a `delivered` outcome, so a row whose provider was never provisioned
   * stays queryable as undelivered instead of looking like a sent notification.
   */
  /** Durable selection; blocked/manual/terminal rows never become automatic retries. */
  async listDuePartnerNotifications(
    limit = 100,
  ): Promise<ConsumerNotificationOutboxRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<{
      record: Record<string, unknown>;
    }>(
      `
      SELECT to_jsonb(o) AS record FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts c USING (outbox_id)
      WHERE o.status IN ('pending','sending','failed') AND o.next_attempt_at <= now()
        AND COALESCE(c.retry_disposition, o.payload->'partnerNotification'->>'retryDisposition', 'automatic') = 'automatic'
        AND NOT EXISTS (SELECT 1 FROM ops.phase1_push_delivery_claims l
          WHERE l.outbox_id=o.outbox_id AND l.claim_state='claimed' AND l.lease_expires_at > now())
      ORDER BY CASE WHEN c.expires_at <= now() THEN 0 ELSE 1 END, o.next_attempt_at LIMIT $1
    `,
      [Math.max(1, Math.min(limit, 1000))],
    );
    // Expired rows are selected once to persist a terminal outcome, never sent.
    return result.rows.map((row: any) => this.mapNotificationOutbox(row.record));
  }

  /** Re-read authoritative state under lock: callers may hold a stale outbox copy. */
  async claimPartnerNotification(
    outboxId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<{
    record: ConsumerNotificationOutboxRecord;
    fenceToken: number;
    attemptLimitReached: boolean;
  } | null> {
    if (!this.isEnabled())
      throw new Error("Partner notification persistence unavailable");
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query(
        `SELECT * FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE`,
        [outboxId],
      );
      const row = rows.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const record = this.mapNotificationOutbox(row);
      const context = await client.query(
        `SELECT retry_disposition, retry_policy_snapshot FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id=$1`,
        [outboxId],
      );
      const metadata = record.payload.partnerNotification as
        | PartnerDeliveryMetadata
        | undefined;
      const disposition =
        context.rows[0]?.retry_disposition ?? metadata?.retryDisposition;
      if (
        record.status === "delivered" ||
        Date.parse(record.nextAttemptAt) > Date.now() ||
        (disposition && disposition !== "automatic")
      ) {
        await client.query("ROLLBACK");
        return null;
      }
      const claim = await client.query<PushDeliveryClaimRow>(
        `
        INSERT INTO ops.phase1_push_delivery_claims (outbox_id, passenger_subject_ref, worker_id, claim_state, fence_token, lease_expires_at, claimed_at)
        VALUES ($1,$2,$3,'claimed',1,now()+($4 * interval '1 second'),now())
        ON CONFLICT (outbox_id) DO UPDATE SET worker_id=EXCLUDED.worker_id, claim_state='claimed',
          fence_token=ops.phase1_push_delivery_claims.fence_token+1, lease_expires_at=EXCLUDED.lease_expires_at, claimed_at=now()
        WHERE ops.phase1_push_delivery_claims.claim_state != 'claimed' OR ops.phase1_push_delivery_claims.lease_expires_at <= now()
        RETURNING fence_token
      `,
        [outboxId, record.passengerSubjectRef, workerId, leaseSeconds],
      );
      if (!claim.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const maxAttempts = context.rows[0]?.retry_policy_snapshot
        ?.maxAttempts as number | undefined;
      const attemptLimitReached =
        maxAttempts !== undefined && record.attemptCount >= maxAttempts;
      const attemptCount = record.attemptCount + (attemptLimitReached ? 0 : 1);
      // Reserve before IO. Recovery of an unknown final attempt only terminalizes it.
      await client.query(
        `UPDATE ops.consumer_notification_outbox SET status='sending', attempt_count=$3, next_attempt_at=now()+($2 * interval '1 second') WHERE outbox_id=$1`,
        [outboxId, leaseSeconds, attemptCount],
      );
      await client.query("COMMIT");
      return {
        record: { ...record, attemptCount },
        fenceToken: claim.rows[0].fence_token,
        attemptLimitReached,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private mapNotificationOutbox(
    row: Record<string, unknown>,
  ): ConsumerNotificationOutboxRecord {
    return {
      outboxId: String(row.outbox_id),
      orderId: String(row.order_id),
      passengerSubjectRef: String(row.passenger_subject_ref),
      eventType:
        row.event_type as ConsumerNotificationOutboxRecord["eventType"],
      assignmentVersion: row.assignment_version as number | null,
      payload: row.payload as Record<string, unknown>,
      status: row.status as ConsumerNotificationOutboxRecord["status"],
      attemptCount: Number(row.attempt_count),
      nextAttemptAt: new Date(row.next_attempt_at as string).toISOString(),
      createdAt: new Date(row.created_at as string).toISOString(),
      deliveredAt: row.delivered_at
        ? new Date(row.delivered_at as string).toISOString()
        : null,
    };
  }

  async findPartnerNotificationContext(
    outboxId: string,
  ): Promise<StoredPartnerNotificationContext | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query(
      `SELECT * FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id=$1`,
      [outboxId],
    );
    return result.rows[0]
      ? this.mapPartnerNotificationContext(result.rows[0])
      : null;
  }

  private mapPartnerNotificationContext(
    row: Record<string, unknown>,
  ): StoredPartnerNotificationContext {
    return {
      outboxId: String(row.outbox_id),
      deliveryId: String(row.delivery_id),
      orderId: String(row.order_id),
      entrySlug: String(row.entry_slug),
      tenantId: String(row.tenant_id),
      partnerId: String(row.partner_id),
      bindingId: String(row.binding_id),
      bindingVersion: Number(row.binding_version),
      webhookId: String(row.webhook_id),
      endpointFingerprint: String(row.endpoint_fingerprint),
      wirePayload:
        row.wire_payload as StoredPartnerNotificationContext["wirePayload"],
      wirePayloadHash: String(row.wire_payload_hash),
      eventSequence: Number(row.event_sequence),
      expiresAt: new Date(row.expires_at as string).toISOString(),
      retryPolicySnapshot:
        row.retry_policy_snapshot as StoredPartnerNotificationContext["retryPolicySnapshot"],
      deliveryTarget: "partner_endpoint",
      deliveryStage:
        row.delivery_stage as StoredPartnerNotificationContext["deliveryStage"],
      retryDisposition:
        row.retry_disposition as StoredPartnerNotificationContext["retryDisposition"],
      failureReason:
        row.failure_reason as StoredPartnerNotificationContext["failureReason"],
      receiptId: row.receipt_id as string | null,
      downstreamStatus: "unknown",
      createdAt: new Date(row.created_at as string).toISOString(),
      deliveredAt: row.delivered_at
        ? new Date(row.delivered_at as string).toISOString()
        : null,
    };
  }

  async preparePartnerNotificationContext(
    context: StoredPartnerNotificationContext,
    fenceToken: number,
  ): Promise<StoredPartnerNotificationContext> {
    if (!this.isEnabled())
      throw new Error("Partner notification persistence unavailable");
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const claim = await client.query(
        `SELECT fence_token FROM ops.phase1_push_delivery_claims WHERE outbox_id=$1 AND fence_token=$2 AND claim_state='claimed' AND lease_expires_at > clock_timestamp() FOR UPDATE`,
        [context.outboxId, fenceToken],
      );
      if (!claim.rows.length)
        throw new Error("Partner notification fence lost before preparation");
      await client.query(
        `
        INSERT INTO mobility.phase1_partner_notification_delivery_contexts (
          outbox_id, delivery_id, order_id, entry_slug, tenant_id, partner_id, binding_id, binding_version, webhook_id,
          endpoint_fingerprint, wire_payload, wire_payload_hash, event_sequence, expires_at, retry_policy_snapshot, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb,$16)
        ON CONFLICT (outbox_id) DO NOTHING
      `,
        [
          context.outboxId,
          context.deliveryId,
          context.orderId,
          context.entrySlug,
          context.tenantId,
          context.partnerId,
          context.bindingId,
          context.bindingVersion,
          context.webhookId,
          context.endpointFingerprint,
          JSON.stringify(context.wirePayload),
          context.wirePayloadHash,
          context.eventSequence,
          context.expiresAt,
          JSON.stringify(context.retryPolicySnapshot),
          context.createdAt,
        ],
      );
      const result = await client.query(
        `SELECT * FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id=$1`,
        [context.outboxId],
      );
      await client.query("COMMIT");
      return this.mapPartnerNotificationContext(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findPartnerNotificationRelevance(
    orderId: string,
  ): Promise<{ status: string; assignmentVersion: number } | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<{
      status: string;
      assignment_version: number;
    }>(
      `
      SELECT o.status, COALESCE((SELECT MAX(assignment_version) FROM ops.passenger_dispatch_disclosure_snapshots s WHERE s.order_id=o.order_id), 0) AS assignment_version
      FROM ops.phase1_owned_orders o WHERE o.order_id=$1
    `,
      [orderId],
    );
    const row = result.rows[0];
    return row
      ? {
          status: row.status,
          assignmentVersion: Number(row.assignment_version),
        }
      : null;
  }

  async updateConsumerNotificationOutboxDelivery(
    outcome: PassengerPushDeliveryOutcome,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        UPDATE ops.consumer_notification_outbox
        SET
          status = $2,
          attempt_count = $3,
          next_attempt_at = $4,
          delivered_at = $5
        WHERE outbox_id = $1
      `,
      [
        outcome.outboxId,
        outcome.status,
        outcome.attemptCount,
        outcome.nextAttemptAt,
        outcome.status === "delivered" ? outcome.deliveredAt : null,
      ],
    );
  }

  /**
   * Acquires an exclusive, leased claim on one outbox row before a real push
   * attempt so a concurrent or restarted worker cannot send the same
   * notification twice. An already-live, unexpired lease is never silently
   * reassigned: the caller observes `claimed: false` and must back off
   * instead of sending (V0099 table invariant).
   */
  async claimPushDeliveryRow(
    outboxId: string,
    passengerSubjectRef: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<PushDeliveryClaimOutcome> {
    if (!this.isEnabled()) {
      return { claimed: true, fenceToken: 1 };
    }

    const result = await this.databaseService!.query<PushDeliveryClaimRow>(
      `
        INSERT INTO ops.phase1_push_delivery_claims (
          outbox_id, passenger_subject_ref, worker_id, claim_state,
          fence_token, lease_expires_at, claimed_at
        ) VALUES (
          $1, $2, $3, 'claimed', 1, now() + ($4 || ' seconds')::interval, now()
        )
        ON CONFLICT (outbox_id) DO UPDATE SET
          passenger_subject_ref = EXCLUDED.passenger_subject_ref,
          worker_id = EXCLUDED.worker_id,
          claim_state = 'claimed',
          fence_token = ops.phase1_push_delivery_claims.fence_token + 1,
          lease_expires_at = EXCLUDED.lease_expires_at,
          claimed_at = now()
        WHERE
          ops.phase1_push_delivery_claims.claim_state != 'claimed'
          OR ops.phase1_push_delivery_claims.lease_expires_at < now()
        RETURNING fence_token
      `,
      [outboxId, passengerSubjectRef, workerId, leaseSeconds],
    );
    const row = result.rows[0];
    return row
      ? { claimed: true, fenceToken: row.fence_token }
      : { claimed: false };
  }

  /**
   * Best-effort release after a failed provider attempt, so the next
   * scheduled retry is not blocked until the lease naturally expires. A
   * stale fence_token (lease already reclaimed by someone else) affects
   * zero rows, which is the correct outcome: whoever reclaimed it owns the
   * row now.
   */
  async releasePushDeliveryClaim(outboxId: string, fenceToken: number) {
    if (!this.isEnabled()) {
      return;
    }
    await this.databaseService!.query(
      `
        UPDATE ops.phase1_push_delivery_claims
        SET claim_state = 'released'
        WHERE outbox_id = $1 AND fence_token = $2
      `,
      [outboxId, fenceToken],
    );
  }

  /**
   * Durably records one provider acknowledgement: the receipt (keyed by a
   * server-derived `outboxId:fenceToken` dedupe key so a retried write for
   * the same attempt cannot double-insert), the outbox row's final status,
   * and the claim release — all in one transaction. If the fence_token has
   * moved on (another worker reclaimed this row while this write was in
   * flight), the whole write is rejected rather than silently overwriting
   * that worker's attempt; the caller must treat `recorded: false` as an
   * unresolved delivery state, never as success.
   */
  async recordPushDeliveryOutcome(
    input: RecordPushDeliveryOutcomeInput,
  ): Promise<RecordPushDeliveryOutcomeResult> {
    if (!this.isEnabled()) {
      return { recorded: true, replayed: false };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      if (input.partnerMetadata) {
        // Same lock order as claimPartnerNotification avoids a claim/outbox deadlock.
        await client.query(
          "SELECT outbox_id FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE",
          [input.outboxId],
        );
      }
      const claimResult = await client.query<PushDeliveryClaimRow>(
        `
          SELECT fence_token
          FROM ops.phase1_push_delivery_claims
          WHERE outbox_id = $1
            AND ($2::boolean = false OR (claim_state = 'claimed' AND lease_expires_at > clock_timestamp()))
          FOR UPDATE
        `,
        [input.outboxId, Boolean(input.partnerMetadata)],
      );
      const claimRow = claimResult.rows[0];
      if (!claimRow || claimRow.fence_token !== input.fenceToken) {
        await client.query("ROLLBACK");
        return { recorded: false, reason: "fence_lost" };
      }

      const dedupeKey = `${input.outboxId}:${input.fenceToken}`;
      const receiptResult = await client.query<{ receipt_id: string }>(
        `
          INSERT INTO ops.phase1_push_delivery_receipts (
            outbox_id, passenger_subject_ref, dedupe_key, fence_token,
            provider_name, provider_ack_state, provider_message_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (dedupe_key) DO NOTHING
          RETURNING receipt_id
        `,
        [
          input.outboxId,
          input.passengerSubjectRef,
          dedupeKey,
          input.fenceToken,
          input.providerName,
          input.providerAckState,
          input.providerMessageRef,
        ],
      );

      if (input.partnerMetadata) {
        const m = input.partnerMetadata;
        await client.query(
          `
          UPDATE mobility.phase1_partner_notification_delivery_contexts
          SET delivery_stage=$2, retry_disposition=$3, failure_reason=$4, receipt_id=$5, delivered_at=$6
          WHERE outbox_id=$1
        `,
          [
            input.outboxId,
            m.deliveryStage,
            m.retryDisposition,
            m.failureReason,
            m.receiptId,
            input.deliveryOutcome.deliveredAt,
          ],
        );
        // A missing route/binding cannot populate a non-null immutable context.
        // Keep its typed outcome on the existing outbox row under the same fence.
        await client.query(
          `UPDATE ops.consumer_notification_outbox SET payload=jsonb_set(payload, '{partnerNotification}', $2::jsonb) WHERE outbox_id=$1`,
          [input.outboxId, JSON.stringify(m)],
        );
      }

      await client.query(
        `
          UPDATE ops.consumer_notification_outbox
          SET
            status = $2,
            attempt_count = $3,
            next_attempt_at = $4,
            delivered_at = $5
          WHERE outbox_id = $1
        `,
        [
          input.deliveryOutcome.outboxId,
          input.deliveryOutcome.status,
          input.deliveryOutcome.attemptCount,
          input.deliveryOutcome.nextAttemptAt,
          input.deliveryOutcome.status === "delivered"
            ? input.deliveryOutcome.deliveredAt
            : null,
        ],
      );

      await client.query(
        `
          UPDATE ops.phase1_push_delivery_claims
          SET claim_state = 'released'
          WHERE outbox_id = $1 AND fence_token = $2
        `,
        [input.outboxId, input.fenceToken],
      );

      await client.query("COMMIT");
      return { recorded: true, replayed: receiptResult.rows.length === 0 };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findPassengerRating(orderId: string, passengerSubjectRef: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<PassengerTripRatingRow>(
      `
        SELECT *
        FROM ops.passenger_trip_ratings
        WHERE order_id = $1
          AND passenger_subject_ref = $2
        LIMIT 1
      `,
      [orderId, passengerSubjectRef],
    );
    return result.rows[0] ? this.mapPassengerRating(result.rows[0]) : null;
  }

  async listPassengerRatingReviews(
    query: PassengerRatingReviewRepositoryQuery,
  ): Promise<{
    items: PassengerRatingReviewListItem[];
    totalItems: number;
  }> {
    if (!this.isEnabled()) {
      return { items: [], totalItems: 0 };
    }

    const parameters: unknown[] = [];
    const clauses: string[] = [];
    const bind = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (query.status) {
      clauses.push(`r.status = ${bind(query.status)}`);
    }
    if (query.score) {
      clauses.push(`r.score = ${bind(query.score)}`);
    }
    if (query.tag) {
      clauses.push(`r.tags @> ${bind(JSON.stringify([query.tag]))}::jsonb`);
    }
    if (query.driverId) {
      clauses.push(`r.driver_id = ${bind(query.driverId)}`);
    }
    if (query.tripOrOrder) {
      const search = bind(`%${this.escapeLike(query.tripOrOrder)}%`);
      clauses.push(`(
        r.trip_id ILIKE ${search} ESCAPE '\\'
        OR r.order_id ILIKE ${search} ESCAPE '\\'
        OR COALESCE(o.order_no, '') ILIKE ${search} ESCAPE '\\'
      )`);
    }
    if (query.from) {
      clauses.push(
        `(r.submitted_at AT TIME ZONE 'Asia/Taipei')::date >= ${bind(query.from)}::date`,
      );
    }
    if (query.to) {
      clauses.push(
        `(r.submitted_at AT TIME ZONE 'Asia/Taipei')::date <= ${bind(query.to)}::date`,
      );
    }

    const joins = `
      FROM ops.passenger_trip_ratings r
      LEFT JOIN ops.phase1_owned_orders o ON o.order_id = r.order_id
      LEFT JOIN reg.phase1_registry_drivers d ON d.driver_id = r.driver_id
    `;
    const where = clauses.length > 0 ? `WHERE ${clauses.join("\nAND ")}` : "";
    const countResult = await this.databaseService!.query<RatingReviewCountRow>(
      `SELECT count(*)::integer AS total_items ${joins} ${where}`,
      parameters,
    );
    const totalItems = Number(countResult.rows[0]?.total_items ?? 0);
    const pageParameters = [...parameters];
    pageParameters.push(query.pageSize, (query.page - 1) * query.pageSize);
    const limit = `$${pageParameters.length - 1}`;
    const offset = `$${pageParameters.length}`;
    const result =
      await this.databaseService!.query<PassengerRatingReviewListRow>(
        `
          SELECT
            r.rating_id,
            r.order_id,
            r.trip_id,
            r.driver_id,
            d.full_name AS driver_display_name,
            r.score,
            r.tags,
            CASE
              WHEN r.comment IS NULL THEN NULL
              WHEN char_length(r.comment) <= 160 THEN r.comment
              ELSE left(r.comment, 157) || '...'
            END AS comment_excerpt,
            r.status,
            r.submitted_at,
            r.updated_at
          ${joins}
          ${where}
          ORDER BY r.updated_at DESC, r.rating_id ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
        pageParameters,
      );

    return {
      items: result.rows.map((row: any) => this.mapPassengerRatingReviewRow(row)),
      totalItems,
    };
  }

  async findPassengerRatingReview(
    ratingId: string,
  ): Promise<PassengerRatingReviewRepositoryDetail | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const ratingResult =
      await this.databaseService!.query<PassengerRatingReviewDetailRow>(
        `
          SELECT
            r.*,
            o.order_no,
            d.full_name AS driver_display_name
          FROM ops.passenger_trip_ratings r
          LEFT JOIN ops.phase1_owned_orders o ON o.order_id = r.order_id
          LEFT JOIN reg.phase1_registry_drivers d ON d.driver_id = r.driver_id
          WHERE r.rating_id = $1
          LIMIT 1
        `,
        [ratingId],
      );
    const row = ratingResult.rows[0];
    if (!row) {
      return null;
    }

    const [summaryResult, auditResult] = await Promise.all([
      this.databaseService!.query<DriverRatingSummaryRow>(
        `
          SELECT *
          FROM ops.driver_rating_summaries
          WHERE driver_id = $1
          LIMIT 1
        `,
        [row.driver_id],
      ),
      this.databaseService!.query<PassengerRatingModerationAuditRow>(
        `
          SELECT *
          FROM ops.passenger_rating_moderation_audits
          WHERE rating_id = $1
          ORDER BY created_at DESC, audit_id ASC
        `,
        [ratingId],
      ),
    ]);

    return {
      rating: this.mapPassengerRating(row),
      orderNo: row.order_no,
      driverDisplayName: row.driver_display_name,
      summary: summaryResult.rows[0]
        ? this.mapDriverRatingSummary(summaryResult.rows[0])
        : null,
      moderationHistory: auditResult.rows.map((audit: any) =>
        this.mapPassengerRatingModerationAudit(audit),
      ),
    };
  }

  async findDriverRatingSummary(
    driverId: string,
  ): Promise<DriverRatingSummary | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<DriverRatingSummaryRow>(
      `
        SELECT *
        FROM ops.driver_rating_summaries
        WHERE driver_id = $1
        LIMIT 1
      `,
      [driverId],
    );
    return result.rows[0] ? this.mapDriverRatingSummary(result.rows[0]) : null;
  }

  async persistPassengerRating(rating: PassengerTripRatingRecord) {
    if (!this.isEnabled()) {
      return {
        rating,
        summary: this.createSingleRatingSummary(rating),
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const ratingResult = await client.query<PassengerTripRatingRow>(
        `
          INSERT INTO ops.passenger_trip_ratings (
            rating_id,
            order_id,
            trip_id,
            driver_id,
            passenger_subject_ref,
            score,
            tags,
            comment,
            status,
            submitted_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
          ON CONFLICT (order_id, passenger_subject_ref) DO UPDATE SET
            updated_at = ops.passenger_trip_ratings.updated_at
          RETURNING *
        `,
        [
          rating.ratingId,
          rating.orderId,
          rating.tripId,
          rating.driverId,
          rating.passengerSubjectRef,
          rating.score,
          JSON.stringify(rating.tags),
          rating.comment,
          rating.status,
          rating.submittedAt,
          rating.updatedAt,
        ],
      );
      const storedRating = this.mapPassengerRating(ratingResult.rows[0]!);
      const calculatedAt = new Date().toISOString();
      const summaryResult = await client.query<DriverRatingSummaryRow>(
        `
          INSERT INTO ops.driver_rating_summaries (
            driver_id,
            display_state,
            average_rating,
            rating_count,
            last_rated_at,
            aggregate_version,
            calculated_at
          )
          SELECT
            $1,
            CASE WHEN count(*) = 0 THEN 'new_driver' ELSE 'rated' END,
            CASE
              WHEN count(*) = 0 THEN NULL
              ELSE round(avg(score)::numeric, 2)
            END,
            count(*)::integer,
            max(submitted_at),
            1,
            $2
          FROM ops.passenger_trip_ratings
          WHERE driver_id = $1
            AND status = 'active'
          ON CONFLICT (driver_id) DO UPDATE SET
            display_state = EXCLUDED.display_state,
            average_rating = EXCLUDED.average_rating,
            rating_count = EXCLUDED.rating_count,
            last_rated_at = EXCLUDED.last_rated_at,
            aggregate_version =
              ops.driver_rating_summaries.aggregate_version + 1,
            calculated_at = EXCLUDED.calculated_at
          RETURNING *
        `,
        [rating.driverId, calculatedAt],
      );
      await client.query("COMMIT");
      return {
        rating: storedRating,
        summary: this.mapDriverRatingSummary(summaryResult.rows[0]!),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async invalidatePassengerRating(
    input: PersistPassengerRatingInvalidationInput,
  ): Promise<PersistPassengerRatingInvalidationResult> {
    if (!this.isEnabled()) {
      return { outcome: "not_found" };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const ratingResult = await client.query<PassengerTripRatingRow>(
        `
          SELECT *
          FROM ops.passenger_trip_ratings
          WHERE rating_id = $1
          FOR UPDATE
        `,
        [input.ratingId],
      );
      const ratingRow = ratingResult.rows[0];
      if (!ratingRow) {
        await client.query("COMMIT");
        return { outcome: "not_found" };
      }

      const existingAuditResult =
        await client.query<PassengerRatingModerationAuditRow>(
          `
            SELECT *
            FROM ops.passenger_rating_moderation_audits
            WHERE rating_id = $1
              AND idempotency_key = $2
            LIMIT 1
          `,
          [input.ratingId, input.idempotencyKey],
        );
      const existingAuditRow = existingAuditResult.rows[0];
      if (existingAuditRow) {
        const summaryResult = await client.query<DriverRatingSummaryRow>(
          `
            SELECT *
            FROM ops.driver_rating_summaries
            WHERE driver_id = $1
            LIMIT 1
          `,
          [ratingRow.driver_id],
        );
        await client.query("COMMIT");
        return {
          outcome: "replayed",
          rating: this.mapPassengerRating(ratingRow),
          summary: this.mapDriverRatingSummary(summaryResult.rows[0]!),
          audit: this.mapPassengerRatingModerationAudit(existingAuditRow),
        };
      }

      if (ratingRow.status === "invalidated") {
        await client.query("COMMIT");
        return {
          outcome: "already_invalidated",
          rating: this.mapPassengerRating(ratingRow),
        };
      }

      const updatedRatingResult = await client.query<PassengerTripRatingRow>(
        `
          UPDATE ops.passenger_trip_ratings
          SET status = 'invalidated',
              updated_at = $2
          WHERE rating_id = $1
          RETURNING *
        `,
        [input.ratingId, input.invalidatedAt],
      );
      const updatedRating = this.mapPassengerRating(
        updatedRatingResult.rows[0]!,
      );
      const summaryResult = await client.query<DriverRatingSummaryRow>(
        `
          INSERT INTO ops.driver_rating_summaries (
            driver_id,
            display_state,
            average_rating,
            rating_count,
            last_rated_at,
            aggregate_version,
            calculated_at
          )
          SELECT
            $1,
            CASE WHEN count(*) = 0 THEN 'new_driver' ELSE 'rated' END,
            CASE
              WHEN count(*) = 0 THEN NULL
              ELSE round(avg(score)::numeric, 2)
            END,
            count(*)::integer,
            max(submitted_at),
            1,
            $2
          FROM ops.passenger_trip_ratings
          WHERE driver_id = $1
            AND status = 'active'
          ON CONFLICT (driver_id) DO UPDATE SET
            display_state = EXCLUDED.display_state,
            average_rating = EXCLUDED.average_rating,
            rating_count = EXCLUDED.rating_count,
            last_rated_at = EXCLUDED.last_rated_at,
            aggregate_version =
              ops.driver_rating_summaries.aggregate_version + 1,
            calculated_at = EXCLUDED.calculated_at
          RETURNING *
        `,
        [ratingRow.driver_id, input.invalidatedAt],
      );
      const summary = this.mapDriverRatingSummary(summaryResult.rows[0]!);
      const auditResult = await client.query<PassengerRatingModerationAuditRow>(
        `
            INSERT INTO ops.passenger_rating_moderation_audits (
              audit_id,
              rating_id,
              action,
              reason,
              actor_id,
              idempotency_key,
              previous_status,
              resulting_status,
              aggregate_version,
              request_id,
              created_at
            ) VALUES (
              $1, $2, 'invalidate', $3, $4, $5, $6, 'invalidated',
              $7, $8, $9
            )
            RETURNING *
          `,
        [
          input.auditId,
          input.ratingId,
          input.reason,
          input.actorId,
          input.idempotencyKey,
          ratingRow.status,
          summary.aggregateVersion,
          input.requestId,
          input.invalidatedAt,
        ],
      );
      await client.query("COMMIT");
      return {
        outcome: "invalidated",
        rating: updatedRating,
        summary,
        audit: this.mapPassengerRatingModerationAudit(auditResult.rows[0]!),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findPassengerPayment(orderId: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<PassengerPaymentRow>(
      `
        SELECT status, amount_minor, currency
        FROM billing.multi_taxi_passenger_payments
        WHERE order_id = $1
        LIMIT 1
      `,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      status: row.status,
      amount:
        row.amount_minor === null
          ? null
          : {
              amountMinor: Number(row.amount_minor),
              currency: row.currency,
            },
    };
  }

  async findElectronicReceipt(orderId: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<ElectronicReceiptRow>(
      `
        SELECT *
        FROM reporting.multi_taxi_electronic_receipts
        WHERE order_id = $1
        LIMIT 1
      `,
      [orderId],
    );
    return result.rows[0] ? this.mapElectronicReceipt(result.rows[0]) : null;
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Multi-taxi persistence failed during ${context}: ${detail}`,
    );
  }

  private mapAuthorization(
    row: AuthorizationRow,
  ): MultiTaxiOperatingAuthorizationRecord {
    return {
      authorizationId: row.authorization_id,
      operatorId: row.operator_id,
      authorityCode: row.authority_code,
      businessPlanVersion: row.business_plan_version,
      status: row.status,
      serviceAreaCodes: this.toStringArray(row.service_area_codes),
      activeFareVersionId: row.active_fare_version_id,
      effectiveFrom: this.toIso(row.effective_from),
      effectiveUntil: row.effective_until
        ? this.toIso(row.effective_until)
        : null,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapVehicle(
    row: AuthorizedVehicleRow,
  ): MultiTaxiAuthorizedVehicleRecord {
    return {
      authorizationVehicleId: row.authorization_vehicle_id,
      authorizationId: row.authorization_id,
      vehicleId: row.vehicle_id,
      status: row.status,
      effectiveFrom: this.toIso(row.effective_from),
      effectiveUntil: row.effective_until
        ? this.toIso(row.effective_until)
        : null,
    };
  }

  private mapRideAccessToken(
    row: PassengerRideAccessTokenRow,
  ): PassengerRideAccessToken {
    return {
      tokenId: row.token_id,
      orderId: row.order_id,
      passengerSubjectRef: row.passenger_subject_ref,
      scopes: this.toStringArray(
        row.scopes,
      ) as PassengerRideAccessToken["scopes"],
      expiresAt: this.toIso(row.expires_at),
      revokedAt: row.revoked_at ? this.toIso(row.revoked_at) : null,
    };
  }

  private mapPassengerRating(
    row: PassengerTripRatingRow,
  ): PassengerTripRatingRecord {
    return {
      ratingId: row.rating_id,
      orderId: row.order_id,
      tripId: row.trip_id,
      driverId: row.driver_id,
      passengerSubjectRef: row.passenger_subject_ref,
      score: row.score,
      tags: this.toStringArray(row.tags),
      comment: row.comment,
      status: row.status,
      submittedAt: this.toIso(row.submitted_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapPassengerRatingReviewRow(
    row: PassengerRatingReviewListRow,
  ): PassengerRatingReviewListItem {
    return {
      ratingId: row.rating_id,
      orderId: row.order_id,
      tripId: row.trip_id,
      driverId: row.driver_id,
      driverDisplayName: row.driver_display_name,
      score: row.score,
      tags: this.toStringArray(row.tags),
      commentExcerpt: row.comment_excerpt,
      status: row.status,
      submittedAt: this.toIso(row.submitted_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapDriverRatingSummary(
    row: DriverRatingSummaryRow,
  ): DriverRatingSummary {
    return {
      driverId: row.driver_id,
      displayState: row.display_state,
      averageRating:
        row.average_rating === null ? null : Number(row.average_rating),
      ratingCount: row.rating_count,
      lastRatedAt: row.last_rated_at ? this.toIso(row.last_rated_at) : null,
      aggregateVersion: row.aggregate_version,
      calculatedAt: this.toIso(row.calculated_at),
    };
  }

  private mapPassengerRatingModerationAudit(
    row: PassengerRatingModerationAuditRow,
  ): PassengerRatingModerationAuditRecord {
    return {
      auditId: row.audit_id,
      ratingId: row.rating_id,
      action: row.action,
      reason: row.reason,
      actorId: row.actor_id,
      idempotencyKey: row.idempotency_key,
      previousStatus: row.previous_status,
      resultingStatus: row.resulting_status,
      aggregateVersion: row.aggregate_version,
      requestId: row.request_id,
      createdAt: this.toIso(row.created_at),
    };
  }

  private createSingleRatingSummary(
    rating: PassengerTripRatingRecord,
  ): DriverRatingSummary {
    return {
      driverId: rating.driverId,
      displayState: "rated",
      averageRating: rating.score,
      ratingCount: 1,
      lastRatedAt: rating.submittedAt,
      aggregateVersion: 1,
      calculatedAt: rating.updatedAt,
    };
  }

  private mapElectronicReceipt(
    row: ElectronicReceiptRow,
  ): MultiTaxiElectronicReceipt {
    return {
      receiptId: row.receipt_id,
      orderId: row.order_id,
      receiptNo: row.receipt_no,
      amountMinor: Number(row.amount_minor),
      currency: PLATFORM_CURRENCY,
      issuedAt: this.toIso(row.issued_at),
      record:
        row.record !== null &&
        typeof row.record === "object" &&
        !Array.isArray(row.record)
          ? (row.record as Record<string, unknown>)
          : {},
    };
  }

  private toStringArray(value: unknown): string[] {
    const parsed =
      typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  }

  private toIso(value: Date | string) {
    return new Date(value).toISOString();
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }

  async listPartnerNotificationDeliveries(
    entry: { entrySlug: string; tenantId: string; partnerId: string },
    query: any,
  ) {
    const entrySlug = entry.entrySlug;
    const countResult = await this.databaseService!.query(
      `
      SELECT COUNT(*) as cnt
      FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts ctx ON ctx.outbox_id = o.outbox_id
      LEFT JOIN mobility.phase1_order_partner_notification_routes r ON r.order_id = o.order_id
      WHERE (ctx.entry_slug = $1 OR r.entry_slug = $1)
      AND COALESCE(ctx.tenant_id, r.tenant_id) = $2
      AND COALESCE(ctx.partner_id, r.partner_id) = $3
    `,
      [entrySlug, entry.tenantId, entry.partnerId],
    );

    const result = await this.databaseService!.query(
      `
      SELECT
        o.outbox_id as "outboxId",
        COALESCE(ctx.order_id, o.order_id) as "orderId",
        $1 as "entrySlug",
        COALESCE(ctx.tenant_id, r.tenant_id) as "tenantId",
        COALESCE(ctx.partner_id, r.partner_id) as "partnerId",
        ctx.binding_id as "bindingId",
        ctx.binding_version as "bindingVersion",
        ctx.webhook_id as "webhookId",
        ctx.endpoint_fingerprint as "endpointFingerprint",
        ctx.wire_payload as "wirePayload",
        ctx.wire_payload_hash as "wirePayloadHash",
        ctx.event_sequence as "eventSequence",
        COALESCE(ctx.expires_at, (o.payload->'partnerNotification'->>'expiresAt')::timestamptz) as "expiresAt",
        COALESCE(ctx.delivery_target, o.payload->'partnerNotification'->>'deliveryTarget') as "deliveryTarget",
        COALESCE(ctx.delivery_stage, o.payload->'partnerNotification'->>'deliveryStage') as "deliveryStage",
        COALESCE(ctx.retry_disposition, o.payload->'partnerNotification'->>'retryDisposition') as "retryDisposition",
        COALESCE(ctx.failure_reason, o.payload->'partnerNotification'->>'failureReason') as "failureReason",
        COALESCE(ctx.receipt_id, o.payload->'partnerNotification'->>'receiptId') as "receiptId",
        COALESCE(ctx.downstream_status, o.payload->'partnerNotification'->>'downstreamStatus') as "downstreamStatus",
        o.created_at as "createdAt",
        ctx.delivered_at as "deliveredAt",
        o.status,
        ctx.delivery_id as "deliveryId",
        o.event_type as "eventType",
        NULL as result,
        o.attempt_count as attempts,
        COALESCE((ctx.retry_policy_snapshot->>'maxAttempts')::int, (o.payload->'partnerNotification'->>'maxAttempts')::int) as "maxAttempts",
        o.next_attempt_at as "nextAttemptAt"
      FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts ctx ON ctx.outbox_id = o.outbox_id
      LEFT JOIN mobility.phase1_order_partner_notification_routes r ON r.order_id = o.order_id
      WHERE (ctx.entry_slug = $1 OR r.entry_slug = $1)
      AND COALESCE(ctx.tenant_id, r.tenant_id) = $4
      AND COALESCE(ctx.partner_id, r.partner_id) = $5
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [
        entrySlug,
        query.pageSize || 50,
        ((query.page || 1) - 1) * (query.pageSize || 50),
        entry.tenantId,
        entry.partnerId,
      ],
    );

    return {
      rows: result.rows,
      total: parseInt(countResult.rows[0]?.cnt || "0", 10),
    };
  }

    async retryPartnerNotificationDelivery(
    entry: { entrySlug: string; tenantId: string; partnerId: string },
    outboxId: string,
    identity?: any,
    requestId?: string,
  ) {
    const entrySlug = entry.entrySlug;
    if (!this.isEnabled())
      return {
        kind: "failed",
        failure: {
          failureReason: "endpoint_unavailable",
          retryDisposition: "terminal",
        },
      };
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const outboxRows = await client.query(
        "SELECT o.status, o.event_type, o.next_attempt_at, o.payload, o.attempt_count, o.order_id, o.assignment_version, o.created_at, r.entry_slug as route_entry_slug, r.tenant_id as route_tenant_id, r.partner_id as route_partner_id FROM ops.consumer_notification_outbox o LEFT JOIN mobility.phase1_order_partner_notification_routes r ON r.order_id = o.order_id WHERE o.outbox_id = $1 FOR UPDATE OF o",
        [outboxId],
      );
      if (outboxRows.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: { failureReason: "route_missing", retryDisposition: "none", suggestedNextAttemptAt: null },
        };
      }
      const outbox = outboxRows.rows[0];

      const ctxRows = await client.query(
        "SELECT entry_slug, tenant_id, partner_id, expires_at, failure_reason, binding_id, binding_version, webhook_id, endpoint_fingerprint, retry_disposition, order_id, event_sequence, wire_payload, retry_policy_snapshot FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id = $1 FOR UPDATE",
        [outboxId],
      );
      const ctx = ctxRows.rows[0] || null;

      const actualEntrySlug = ctx ? ctx.entry_slug : outbox.route_entry_slug;
      const actualTenantId = ctx ? ctx.tenant_id : outbox.route_tenant_id;
      const actualPartnerId = ctx ? ctx.partner_id : outbox.route_partner_id;
      if (
        actualEntrySlug !== entrySlug ||
        actualTenantId !== entry.tenantId ||
        actualPartnerId !== entry.partnerId
      ) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: { failureReason: "route_missing", retryDisposition: "none", suggestedNextAttemptAt: null },
        };
      }


      
      
      const expiresAtStr = ctx ? ctx.expires_at : (outbox.payload?.notificationExpiresAt || outbox.payload?.expiresAt || new Date(new Date(outbox.created_at || new Date()).getTime() + 15 * 60000).toISOString());
      if (expiresAtStr && new Date() >= new Date(expiresAtStr)) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "notification_expired", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
      }


      const retryDisp = ctx
        ? ctx.retry_disposition
        : outbox.payload?.partnerNotification?.retryDisposition;
      if (
        !retryDisp ||
        !["manual_only", "automatic", "configuration_blocked"].includes(
          retryDisp,
        )
      ) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: {
            failureReason: "notification_obsolete",
            retryDisposition: "terminal",
          },
        };
      }

      if (outbox.status === "delivered") {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: {
            failureReason: "notification_superseded",
            retryDisposition: "terminal",
          },
        };
      }

      const expiresAt = ctx
        ? new Date(ctx.expires_at)
        : outbox.payload?.partnerNotification?.expiresAt
          ? new Date(outbox.payload.partnerNotification.expiresAt)
          : null;
      if (expiresAt && expiresAt < new Date()) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: {
            failureReason: "notification_expired",
            retryDisposition: "terminal",
          },
        };
      }

      const failureReason = ctx
        ? ctx.failure_reason
        : outbox.payload?.partnerNotification?.failureReason;
      if (
        failureReason &&
        [
          "notification_superseded",
          "notification_expired",
          "notification_obsolete",
          "recipient_revoked",
        ].includes(failureReason)
      ) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: {
            failureReason: failureReason,
            retryDisposition: "terminal",
          },
        };
      }

      const claimRows = await client.query(
        "SELECT 1 FROM ops.phase1_push_delivery_claims WHERE outbox_id = $1 AND claim_state = 'claimed' AND lease_expires_at > now()",
        [outboxId],
      );
      if (claimRows.rows.length > 0) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: {
            failureReason: "provider_transient_error",
            retryDisposition: "automatic",
            suggestedNextAttemptAt: new Date(Date.now() + 60000).toISOString()
          },
        };
      }
      
      const route = await this.findOrderPartnerNotificationRoute(outbox.order_id);
      if (!route) {
        await client.query("ROLLBACK");
        return {
          kind: "failed",
          failure: { failureReason: "route_missing", retryDisposition: "none", suggestedNextAttemptAt: null },
        };
      }
      
      if (ctx && (ctx.order_id !== route.orderId || ctx.tenant_id !== route.tenantId || ctx.partner_id !== route.partnerId || ctx.entry_slug !== route.entrySlug || ctx.wire_payload?.data?.recipient?.partnerUserRef !== route.partnerUserRef)) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "owner_changed", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
      }
      
      const eventType = ctx ? ctx.wire_payload?.event : outbox.event_type;
      if (!eventType) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "route_missing", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
      }
      
      // Convert to internal event type if needed, or if facade expects internal event type
      const internalEvent = Object.keys(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME).find(k => PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[k as PartnerPassengerEventType] === eventType) as PartnerPassengerEventType || eventType;

      if (this.facade) {
        const readiness = await this.facade.resolveNotificationRoute(route, internalEvent);
        if (!readiness.ready) {
          await client.query("ROLLBACK");
          return { kind: "failed", failure: readiness.failure };
        }
        if (ctx && (ctx.binding_id !== readiness.binding.bindingId || ctx.webhook_id !== readiness.binding.webhookId)) {
          // owner_changed
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "owner_changed", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
        }
        if (ctx && (ctx.binding_version !== readiness.binding.version || ctx.endpoint_fingerprint !== readiness.endpointFingerprint)) {
          // configuration_blocked
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "endpoint_disabled", retryDisposition: "configuration_blocked", suggestedNextAttemptAt: null } };
        }
        
        const maxAttempts = ctx && ctx.retry_policy_snapshot && ctx.retry_policy_snapshot.maxAttempts ? parseInt(ctx.retry_policy_snapshot.maxAttempts, 10) : (readiness.retryPolicy?.maxAttempts ?? 3);
        if (maxAttempts !== undefined && outbox.attempt_count >= maxAttempts) {
          await client.query("ROLLBACK");
          return {
            kind: "failed",
            failure: {
              failureReason: ctx?.failure_reason as any || "endpoint_unavailable",
              retryDisposition: "terminal",
            }
          };
        }
      }

      const relevance = await this.findPartnerNotificationRelevance(outbox.order_id);
      if (!relevance) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "route_missing", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
      }
      
      if (internalEvent !== "receipt_ready") {
        if (["cancelled", "completed", "closed", "rejected"].includes(relevance.status)) {
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "notification_obsolete", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
        }
        const assignmentVersion = ctx ? ctx.wire_payload?.data?.assignmentVersion : outbox.assignment_version;
        if (assignmentVersion !== undefined && assignmentVersion !== null && assignmentVersion < relevance.assignmentVersion) {
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "notification_superseded", retryDisposition: "terminal", suggestedNextAttemptAt: null } };
        }
      }

            if (outbox.status === "pending" || outbox.status === "sending") {
        await client.query("ROLLBACK");
        return { kind: "requeued" };
      }

      const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      const validActorId = identity?.actorId && isUuid(identity.actorId) ? identity.actorId : null;
      await client.query(
        "INSERT INTO admin.audit_logs (actor_id, actor_type, module_name, action_name, resource_type, resource_id, new_value, request_id) VALUES ($1, $2, 'partner_notification', 'retry_delivery', 'consumer_notification_outbox', $3, $4::jsonb, $5)",
        [
          validActorId,
          identity?.actorType || 'system',
          outboxId,
          JSON.stringify({ retriedAt: new Date().toISOString() }),
          requestId || null
        ]
      );

      const newPayload = outbox.payload || {};

      await client.query(
        "UPDATE ops.consumer_notification_outbox SET status = 'pending', next_attempt_at = NOW(), payload = $2::jsonb WHERE outbox_id = $1",
        [outboxId, JSON.stringify(newPayload)],
      );

      if (ctx) {
        await client.query(
          "UPDATE mobility.phase1_partner_notification_delivery_contexts SET retry_disposition = 'automatic' WHERE outbox_id = $1",
          [outboxId],
        );
      } else {
        newPayload.partnerNotification = newPayload.partnerNotification || {};
        newPayload.partnerNotification.retryDisposition = "automatic";
        await client.query(
          "UPDATE ops.consumer_notification_outbox SET payload = $2::jsonb WHERE outbox_id = $1",
          [outboxId, JSON.stringify(newPayload)],
        );
      }

      await client.query("COMMIT");
      return { kind: "requeued" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
