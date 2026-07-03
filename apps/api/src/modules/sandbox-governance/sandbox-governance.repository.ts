import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  GeoJsonMultiLineString,
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";

import type { PoolClient } from "pg";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type AreaMatchRow = {
  area_id: string;
  area_kind: "operating_area" | "pickup_dropoff_zone";
  area_name: string;
};

type RouteMatchRow = {
  route_id: string;
};

@Injectable()
export class SandboxGovernanceRepository {
  private readonly logger = new Logger(SandboxGovernanceRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadOperatingAreas(): Promise<ApprovedOperatingAreaRecord[]> {
    return this.loadRecords<ApprovedOperatingAreaRecord>(
      "av_sandbox.approved_operating_areas",
    );
  }

  async loadRoutes(): Promise<ApprovedRouteRecord[]> {
    return this.loadRecords<ApprovedRouteRecord>("av_sandbox.approved_routes");
  }

  async loadVehicleEnrollments(): Promise<VehicleEnrollmentRecord[]> {
    return this.loadRecords<VehicleEnrollmentRecord>(
      "av_sandbox.vehicle_enrollments",
    );
  }

  async loadSafetyOperatorQualifications(): Promise<
    SafetyOperatorQualificationRecord[]
  > {
    return this.loadRecords<SafetyOperatorQualificationRecord>(
      "av_sandbox.safety_operator_qualifications",
    );
  }

  async replaceOperatingAreas(items: readonly ApprovedOperatingAreaRecord[]) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      for (const item of items) {
        await client.query(
          `
            INSERT INTO av_sandbox.approved_operating_areas (
              area_id,
              sandbox_program_id,
              area_kind,
              area_name,
              version,
              active,
              effective_from,
              effective_until,
              operating_area,
              pickup_dropoff_zone,
              schedules,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              ST_SetSRID(ST_GeomFromGeoJSON($9), 4326),
              CASE WHEN $3 = 'pickup_dropoff_zone'
                THEN ST_SetSRID(ST_GeomFromGeoJSON($9), 4326)
                ELSE NULL
              END,
              $10::jsonb,
              $11,
              $12,
              $13::jsonb
            )
            ON CONFLICT (area_id, version) DO UPDATE SET
              sandbox_program_id = EXCLUDED.sandbox_program_id,
              area_kind = EXCLUDED.area_kind,
              area_name = EXCLUDED.area_name,
              active = EXCLUDED.active,
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              operating_area = EXCLUDED.operating_area,
              pickup_dropoff_zone = EXCLUDED.pickup_dropoff_zone,
              schedules = EXCLUDED.schedules,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            item.areaId,
            item.sandboxProgramId,
            item.areaKind,
            item.name,
            item.version,
            item.active,
            item.effectiveFrom,
            item.effectiveUntil,
            JSON.stringify(item.geometry),
            JSON.stringify(item.schedules),
            item.createdAt,
            item.updatedAt,
            JSON.stringify(item),
          ],
        );
      }

      await this.deleteMissingVersionedRows(
        client,
        "av_sandbox.approved_operating_areas",
        "area_id",
        items.map((item) => [item.areaId, item.version]),
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceRoutes(items: readonly ApprovedRouteRecord[]) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      for (const item of items) {
        await client.query(
          `
            INSERT INTO av_sandbox.approved_routes (
              route_id,
              sandbox_program_id,
              route_name,
              area_id,
              version,
              active,
              effective_from,
              effective_until,
              route_geometry,
              schedules,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              ST_SetSRID(ST_GeomFromGeoJSON($9), 4326),
              $10::jsonb,
              $11,
              $12,
              $13::jsonb
            )
            ON CONFLICT (route_id, version) DO UPDATE SET
              sandbox_program_id = EXCLUDED.sandbox_program_id,
              route_name = EXCLUDED.route_name,
              area_id = EXCLUDED.area_id,
              active = EXCLUDED.active,
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              route_geometry = EXCLUDED.route_geometry,
              schedules = EXCLUDED.schedules,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            item.routeId,
            item.sandboxProgramId,
            item.name,
            item.areaId,
            item.version,
            item.active,
            item.effectiveFrom,
            item.effectiveUntil,
            JSON.stringify(item.geometry),
            JSON.stringify(item.schedules),
            item.createdAt,
            item.updatedAt,
            JSON.stringify(item),
          ],
        );
      }

      await this.deleteMissingVersionedRows(
        client,
        "av_sandbox.approved_routes",
        "route_id",
        items.map((item) => [item.routeId, item.version]),
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceVehicleEnrollments(items: readonly VehicleEnrollmentRecord[]) {
    return this.replaceJsonRecords(
      "av_sandbox.vehicle_enrollments",
      "enrollment_id",
      items.map((item) => ({
        values: [
          item.enrollmentId,
          item.sandboxProgramId,
          item.vehicleId,
          item.providerCode,
          item.version,
          item.status,
          JSON.stringify(item.approvedAreaIds),
          JSON.stringify(item.approvedRouteIds),
          item.maxConcurrentTrips,
          item.effectiveFrom,
          item.effectiveUntil,
          item.createdAt,
          item.updatedAt,
          JSON.stringify(item),
        ],
      })),
      `
        INSERT INTO av_sandbox.vehicle_enrollments (
          enrollment_id,
          sandbox_program_id,
          vehicle_id,
          provider_code,
          version,
          status,
          approved_area_ids,
          approved_route_ids,
          max_concurrent_trips,
          effective_from,
          effective_until,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13,
          $14::jsonb
        )
      `,
    );
  }

  async replaceSafetyOperatorQualifications(
    items: readonly SafetyOperatorQualificationRecord[],
  ) {
    return this.replaceJsonRecords(
      "av_sandbox.safety_operator_qualifications",
      "qualification_id",
      items.map((item) => ({
        values: [
          item.qualificationId,
          item.sandboxProgramId,
          item.safetyOperatorId,
          item.providerCode,
          item.version,
          item.status,
          JSON.stringify(item.approvedAreaIds),
          JSON.stringify(item.approvedRouteIds),
          JSON.stringify(item.certificationRefs),
          item.effectiveFrom,
          item.effectiveUntil,
          item.createdAt,
          item.updatedAt,
          JSON.stringify(item),
        ],
      })),
      `
        INSERT INTO av_sandbox.safety_operator_qualifications (
          qualification_id,
          sandbox_program_id,
          safety_operator_id,
          provider_code,
          version,
          status,
          approved_area_ids,
          approved_route_ids,
          certification_refs,
          effective_from,
          effective_until,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12,
          $13, $14::jsonb
        )
      `,
    );
  }

  async findPointMatches(
    sandboxProgramId: string,
    lat: number,
    lng: number,
    asOf: string,
  ) {
    if (!this.isEnabled()) {
      return [] as AreaMatchRow[];
    }

    const result = await this.databaseService!.query<AreaMatchRow>(
      `
        SELECT DISTINCT ON (area_id) area_id, area_kind, area_name
        FROM av_sandbox.approved_operating_areas
        WHERE sandbox_program_id = $1
          AND active = true
          AND COALESCE(record->>'lifecycleStatus', 'active') = 'active'
          AND effective_from <= $2::timestamptz
          AND (effective_until IS NULL OR effective_until > $2::timestamptz)
          AND ST_Covers(
            CASE
              WHEN area_kind = 'pickup_dropoff_zone' AND pickup_dropoff_zone IS NOT NULL
                THEN pickup_dropoff_zone
              ELSE operating_area
            END,
            ST_SetSRID(ST_MakePoint($3, $4), 4326)
          )
        ORDER BY area_id, version DESC, effective_from DESC, updated_at DESC
      `,
      [sandboxProgramId, asOf, lng, lat],
    );

    return result.rows;
  }

  async findContainingRoutes(
    sandboxProgramId: string,
    candidatePath: GeoJsonMultiLineString,
    asOf: string,
    toleranceMeters: number,
  ) {
    if (!this.isEnabled()) {
      return [] as RouteMatchRow[];
    }

    const result = await this.databaseService!.query<RouteMatchRow>(
      `
        SELECT DISTINCT ON (route_id) route_id
        FROM av_sandbox.approved_routes
        WHERE sandbox_program_id = $1
          AND active = true
          AND COALESCE(record->>'lifecycleStatus', 'active') = 'active'
          AND effective_from <= $2::timestamptz
          AND (effective_until IS NULL OR effective_until > $2::timestamptz)
          AND ST_CoveredBy(
            ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
            ST_Buffer(route_geometry::geography, $4)::geometry
          )
        ORDER BY route_id, version DESC, effective_from DESC, updated_at DESC
      `,
      [sandboxProgramId, asOf, JSON.stringify(candidatePath), toleranceMeters],
    );

    return result.rows;
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Sandbox governance persistence skipped during ${context}: ${detail}`,
    );
  }

  private async loadRecords<T>(tableName: string): Promise<T[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ${tableName} ORDER BY updated_at DESC`,
    );

    return result.rows.map((row: JsonRecordRow) =>
      this.parseRecord<T>(row.record, tableName),
    );
  }

  private async replaceJsonRecords(
    tableName: string,
    keyColumn: string,
    rows: Array<{ values: unknown[] }>,
    insertSql: string,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      for (const row of rows) {
        await client.query(
          `${insertSql}
            ON CONFLICT (${keyColumn}, version) DO UPDATE SET
              sandbox_program_id = EXCLUDED.sandbox_program_id,
              ${keyColumn === "enrollment_id" ? "vehicle_id" : "safety_operator_id"} = EXCLUDED.${keyColumn === "enrollment_id" ? "vehicle_id" : "safety_operator_id"},
              provider_code = EXCLUDED.provider_code,
              status = EXCLUDED.status,
              approved_area_ids = EXCLUDED.approved_area_ids,
              approved_route_ids = EXCLUDED.approved_route_ids,
              ${
                keyColumn === "enrollment_id"
                  ? "max_concurrent_trips = EXCLUDED.max_concurrent_trips,"
                  : "certification_refs = EXCLUDED.certification_refs,"
              }
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record`,
          row.values,
        );
      }

      await this.deleteMissingVersionedRows(
        client,
        tableName,
        keyColumn,
        rows.map((row) => [row.values[0] as string, row.values[4] as number]),
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }

  private async deleteMissingVersionedRows(
    client: PoolClient,
    tableName: string,
    keyColumn: string,
    keys: ReadonlyArray<readonly [string, number]>,
  ) {
    if (keys.length === 0) {
      await client.query(`DELETE FROM ${tableName}`);
      return;
    }

    const conditions = keys.map(
      (_key, index) =>
        `(${keyColumn} = $${index * 2 + 1} AND version = $${index * 2 + 2})`,
    );
    const values = keys.flatMap(([key, version]) => [key, version]);

    await client.query(
      `DELETE FROM ${tableName} WHERE NOT (${conditions.join(" OR ")})`,
      values,
    );
  }
}
