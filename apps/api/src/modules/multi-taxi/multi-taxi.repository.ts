import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type {
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
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
