import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type {
  DriverRatingSummary,
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiElectronicReceipt,
  MultiTaxiOperatingAuthorizationRecord,
  PassengerPaymentStatus,
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
}
