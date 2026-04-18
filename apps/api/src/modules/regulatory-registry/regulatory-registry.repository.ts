import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DispatchExclusivityRecord,
  DriverLocationHeartbeatCommand,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  InsurancePolicyRecord,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type RegulatorySupplyPair = {
  vehicleId: string;
  driverId: string;
  etaMinutes: number;
};

export type RegulatoryRegistryState = {
  vehicles: VehicleRegistryRecord[];
  drivers: DriverRegistryRecord[];
  supplyPairs: RegulatorySupplyPair[];
  contracts: VehicleContractRecord[];
  policies: InsurancePolicyRecord[];
  exclusivities: DispatchExclusivityRecord[];
};

export type PersistRegulatoryRegistryChanges = {
  vehicles?: readonly VehicleRegistryRecord[];
  drivers?: readonly DriverRegistryRecord[];
  supplyPairs?: readonly RegulatorySupplyPair[];
  contracts?: readonly VehicleContractRecord[];
  policies?: readonly InsurancePolicyRecord[];
  exclusivities?: readonly DispatchExclusivityRecord[];
};

type DriverLocationRow = {
  driver_id: string;
  lat: number | string;
  lng: number | string;
  accuracy_m: number | string | null;
  recorded_at: Date | string;
  updated_at: Date | string;
};

@Injectable()
export class RegulatoryRegistryRepository {
  private readonly logger = new Logger(RegulatoryRegistryRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<RegulatoryRegistryState> {
    if (!this.isEnabled()) {
      return {
        vehicles: [],
        drivers: [],
        supplyPairs: [],
        contracts: [],
        policies: [],
        exclusivities: [],
      };
    }

    const [
      vehiclesResult,
      driversResult,
      supplyPairsResult,
      contractsResult,
      policiesResult,
      exclusivitiesResult,
    ] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_vehicles
          ORDER BY updated_at DESC, plate_no ASC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_drivers
          ORDER BY updated_at DESC, full_name ASC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_supply_pairs
          ORDER BY vehicle_id ASC, driver_id ASC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_contracts
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_policies
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_exclusivities
          ORDER BY updated_at DESC
        `,
      ),
    ]);

    return {
      vehicles: vehiclesResult.rows.map((row) =>
        this.parseRecord<VehicleRegistryRecord>(
          row.record,
          "reg.phase1_registry_vehicles",
        ),
      ),
      drivers: driversResult.rows.map((row) =>
        this.parseRecord<DriverRegistryRecord>(
          row.record,
          "reg.phase1_registry_drivers",
        ),
      ),
      supplyPairs: supplyPairsResult.rows.map((row) =>
        this.parseRecord<RegulatorySupplyPair>(
          row.record,
          "reg.phase1_registry_supply_pairs",
        ),
      ),
      contracts: contractsResult.rows.map((row) =>
        this.parseRecord<VehicleContractRecord>(
          row.record,
          "reg.phase1_registry_contracts",
        ),
      ),
      policies: policiesResult.rows.map((row) =>
        this.parseRecord<InsurancePolicyRecord>(
          row.record,
          "reg.phase1_registry_policies",
        ),
      ),
      exclusivities: exclusivitiesResult.rows.map((row) =>
        this.parseRecord<DispatchExclusivityRecord>(
          row.record,
          "reg.phase1_registry_exclusivities",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistRegulatoryRegistryChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const vehicle of changes.vehicles ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_vehicles (
              vehicle_id,
              plate_no,
              operating_area,
              dispatchable_flag,
              insurance_status,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (vehicle_id) DO UPDATE SET
              plate_no = EXCLUDED.plate_no,
              operating_area = EXCLUDED.operating_area,
              dispatchable_flag = EXCLUDED.dispatchable_flag,
              insurance_status = EXCLUDED.insurance_status,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            vehicle.vehicleId,
            vehicle.plateNo,
            vehicle.operatingArea,
            vehicle.dispatchableFlag,
            vehicle.insuranceStatus,
            new Date().toISOString(),
            JSON.stringify(vehicle),
          ],
        ),
      );
    }

    for (const driver of changes.drivers ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_drivers (
              driver_id,
              full_name,
              work_state,
              licenses_valid,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (driver_id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              work_state = EXCLUDED.work_state,
              licenses_valid = EXCLUDED.licenses_valid,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            driver.driverId,
            driver.name,
            driver.workState,
            driver.licensesValid,
            new Date().toISOString(),
            JSON.stringify(driver),
          ],
        ),
      );
    }

    for (const pair of changes.supplyPairs ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_supply_pairs (
              pair_id,
              vehicle_id,
              driver_id,
              eta_minutes,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (pair_id) DO UPDATE SET
              vehicle_id = EXCLUDED.vehicle_id,
              driver_id = EXCLUDED.driver_id,
              eta_minutes = EXCLUDED.eta_minutes,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            this.toPairId(pair),
            pair.vehicleId,
            pair.driverId,
            pair.etaMinutes,
            new Date().toISOString(),
            JSON.stringify(pair),
          ],
        ),
      );
    }

    for (const contract of changes.contracts ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_contracts (
              contract_id,
              vehicle_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (contract_id) DO UPDATE SET
              vehicle_id = EXCLUDED.vehicle_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            contract.contractId,
            contract.vehicleId,
            contract.status,
            contract.createdAt,
            contract.updatedAt,
            JSON.stringify(contract),
          ],
        ),
      );
    }

    for (const policy of changes.policies ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_policies (
              policy_id,
              vehicle_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (policy_id) DO UPDATE SET
              vehicle_id = EXCLUDED.vehicle_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            policy.policyId,
            policy.vehicleId,
            policy.status,
            policy.createdAt,
            policy.updatedAt,
            JSON.stringify(policy),
          ],
        ),
      );
    }

    for (const exclusivity of changes.exclusivities ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO reg.phase1_registry_exclusivities (
              vehicle_id,
              review_status,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4::jsonb
            )
            ON CONFLICT (vehicle_id) DO UPDATE SET
              review_status = EXCLUDED.review_status,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            exclusivity.vehicleId,
            exclusivity.reviewStatus,
            exclusivity.updatedAt,
            JSON.stringify(exclusivity),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  async upsertDriverLocation(
    command: DriverLocationHeartbeatCommand,
  ): Promise<void> {
    this.assertDatabaseEnabled("upsert driver location");

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_locations (
          driver_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, now(), now()
        )
        ON CONFLICT (driver_id) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          recorded_at = now(),
          updated_at = now()
      `,
      [command.driverId, command.lat, command.lng, command.accuracyM ?? null],
    );
  }

  async findLatestDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshot | null> {
    this.assertDatabaseEnabled("find latest driver location");

    const result = await this.databaseService!.query<DriverLocationRow>(
      `
        SELECT
          driver_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          updated_at
        FROM ops.phase1_driver_locations
        WHERE driver_id = $1
        LIMIT 1
      `,
      [driverId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      driverId: row.driver_id,
      lat: this.parseNumericValue(row.lat, "lat"),
      lng: this.parseNumericValue(row.lng, "lng"),
      accuracyM:
        row.accuracy_m === null
          ? null
          : this.parseNumericValue(row.accuracy_m, "accuracy_m"),
      recordedAt: this.toIsoString(row.recorded_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Regulatory registry persistence skipped during ${context}: ${detail}`,
    );
  }

  private toPairId(pair: RegulatorySupplyPair) {
    return `${pair.vehicleId}::${pair.driverId}`;
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }

  private assertDatabaseEnabled(context: string): void {
    if (!this.isEnabled()) {
      throw new Error(`Database service is required to ${context}.`);
    }
  }

  private parseNumericValue(value: number | string, fieldName: string): number {
    const numericValue =
      typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Invalid numeric value for ${fieldName}.`);
    }
    return numericValue;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }
}
