import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db/database.service";
import { validateFareTariff } from "./fare.engine";
import type { FareQuoteSnapshot, FareTariff } from "./fare.types";

export interface PassengerFareStore {
  publishedTariff(at: string): Promise<FareTariff | null>;
  insertSnapshot(snapshot: FareQuoteSnapshot): Promise<void>;
  findOwnedSnapshot(
    id: string,
    passengerId: string,
  ): Promise<FareQuoteSnapshot | null>;
}

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
function tariff(row: QueryResultRow): FareTariff {
  const result: FareTariff = {
    version: row.version,
    effectiveAt: iso(row.effective_at),
    effectiveUntil:
      row.effective_until === null ? null : iso(row.effective_until),
    baseFare: row.base_fare,
    baseDistanceMeters: row.base_distance_meters,
    distanceRate: row.distance_rate,
    distanceIncrementMeters: row.distance_increment_meters,
    delayRate: row.delay_rate,
    delayIncrementSeconds: row.delay_increment_seconds,
    nightSurchargeBps: row.night_surcharge_bps,
    nightSurchargeWindowStart: row.night_window_start,
    nightSurchargeWindowEnd: row.night_window_end,
    additionalFees: row.additional_fees,
    distanceRounding: row.distance_rounding,
    delayRounding: row.delay_rounding,
    totalRounding: row.total_rounding,
    totalIncrement: row.total_increment,
    nightApplication: row.night_application,
    sourceReference: row.source_reference,
  };
  validateFareTariff(result);
  return result;
}

@Injectable()
export class PassengerFareRepository implements PassengerFareStore {
  constructor(private readonly database: DatabaseService) {}

  private async available<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      // Never turn missing storage/migrations or corrupt tariffs into a fabricated quote.
      throw new ApiRequestError(
        503,
        "unavailable",
        "Passenger fare storage is unavailable.",
        undefined,
        true,
      );
    }
  }

  async publishedTariff(at: string): Promise<FareTariff | null> {
    return this.available(async () => {
      const result = await this.database.query(
        `SELECT version, effective_at, effective_until, base_fare, base_distance_meters,
                distance_rate, distance_increment_meters, delay_rate, delay_increment_seconds,
                night_surcharge_bps, night_window_start, night_window_end, additional_fees,
                distance_rounding, delay_rounding, total_rounding, total_increment,
                night_application, source_reference
         FROM passenger.fare_versions
         WHERE status = 'published' AND effective_at <= $1::timestamptz
           AND (effective_until IS NULL OR effective_until > $1::timestamptz)
         ORDER BY effective_at DESC, version LIMIT 2`,
        [at],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1)
        throw new Error("Ambiguous effective tariff.");
      return tariff(result.rows[0]!);
    });
  }

  async insertSnapshot(s: FareQuoteSnapshot): Promise<void> {
    return this.available(async () => {
      await this.database.query(
        `INSERT INTO passenger.fare_quote_snapshots
          (fare_snapshot_id, drts_passenger_id, fare_version, origin_lat, origin_lng,
           destination_lat, destination_lng, scheduled_at, route, tariff_snapshot,
           breakdown, service_area_evaluation, estimated_min, estimated_max, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)`,
        [
          s.fareSnapshotId,
          s.drtsPassengerId,
          s.fareVersion,
          s.origin.lat,
          s.origin.lng,
          s.destination.lat,
          s.destination.lng,
          s.scheduledAt,
          JSON.stringify(s.route),
          JSON.stringify(s.tariffSnapshot),
          JSON.stringify(s.breakdown),
          JSON.stringify(s.serviceAreaEvaluation),
          s.estimatedMin,
          s.estimatedMax,
          s.createdAt,
          s.expiresAt,
        ],
      );
    });
  }

  /** Booking must additionally check expiry and exact route/scheduledAt match before consuming. */
  async findOwnedSnapshot(
    id: string,
    passengerId: string,
  ): Promise<FareQuoteSnapshot | null> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return null;
    return this.available(async () => {
      const result = await this.database.query(
        `SELECT fare_snapshot_id, drts_passenger_id, fare_version, origin_lat, origin_lng,
                destination_lat, destination_lng, scheduled_at, route, tariff_snapshot,
                breakdown, service_area_evaluation, estimated_min, estimated_max, created_at, expires_at
         FROM passenger.fare_quote_snapshots WHERE fare_snapshot_id = $1 AND drts_passenger_id = $2`,
        [id, passengerId],
      );
      const r = result.rows[0];
      return r
        ? {
            fareSnapshotId: r.fare_snapshot_id,
            drtsPassengerId: r.drts_passenger_id,
            fareVersion: r.fare_version,
            origin: { lat: r.origin_lat, lng: r.origin_lng },
            destination: { lat: r.destination_lat, lng: r.destination_lng },
            scheduledAt: iso(r.scheduled_at),
            route: r.route,
            tariffSnapshot: r.tariff_snapshot,
            breakdown: r.breakdown,
            serviceAreaEvaluation: r.service_area_evaluation,
            estimatedMin: Number(r.estimated_min),
            estimatedMax: Number(r.estimated_max),
            createdAt: iso(r.created_at),
            expiresAt: iso(r.expires_at),
          }
        : null;
    });
  }
}
