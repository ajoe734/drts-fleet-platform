import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type {
  DriverRatingSummary,
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiElectronicReceipt,
  MultiTaxiOperatingAuthorizationRecord,
  PassengerPaymentStatus,
  PassengerRatingModerationAuditRecord,
  PassengerRatingReviewListItem,
  PassengerRideAccessToken,
  PassengerTripRatingRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

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

@Injectable()
export class MultiTaxiRepository {
  private readonly logger = new Logger(MultiTaxiRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

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
      authorizations: authorizationResult.rows.map((row) =>
        this.mapAuthorization(row),
      ),
      vehicles: vehicleResult.rows.map((row) => this.mapVehicle(row)),
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
      items: result.rows.map((row) => this.mapPassengerRatingReviewRow(row)),
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
      moderationHistory: auditResult.rows.map((audit) =>
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
      currency: "NTD",
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
}
