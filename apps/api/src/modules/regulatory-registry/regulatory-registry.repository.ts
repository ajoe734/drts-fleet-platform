import { randomUUID } from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  DispatchExclusivityRecord,
  DriverLocationHeartbeatEnvelope,
  DriverLocationHeartbeatCommand,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  InsurancePolicyRecord,
  VehicleLicenseType,
  VehicleContractRecord,
  VehicleRegistryRecord,
  VehiclePassengerDisclosureProfile,
  DriverPublicRegistrationCredential,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type RegulatoryRegistryQueryExecutor = {
  query<T extends { [key: string]: unknown }>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
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
  disclosureProfiles: VehiclePassengerDisclosureProfile[];
  driverCredentials: DriverPublicRegistrationCredential[];
};

export type PersistRegulatoryRegistryChanges = {
  vehicles?: readonly VehicleRegistryRecord[];
  drivers?: readonly DriverRegistryRecord[];
  supplyPairs?: readonly RegulatorySupplyPair[];
  contracts?: readonly VehicleContractRecord[];
  policies?: readonly InsurancePolicyRecord[];
  exclusivities?: readonly DispatchExclusivityRecord[];
  disclosureProfiles?: readonly VehiclePassengerDisclosureProfile[];
  driverCredentials?: readonly DriverPublicRegistrationCredential[];
};

type DriverLocationRow = {
  driver_id: string;
  lat: number | string;
  lng: number | string;
  accuracy_m: number | string | null;
  recorded_at: Date | string;
  updated_at: Date | string;
};

type VehicleLicenseClassRow = {
  vehicle_id: string;
  license_class: string;
};

type DriverLocationEventRow = {
  event_id: string;
  device_id: string;
  driver_id: string;
  vehicle_id: string | null;
  task_id: string | null;
  sequence_no: number | string;
  recorded_at: Date | string;
  received_at: Date | string;
  lat: number | string;
  lng: number | string;
  accuracy_m: number | string | null;
  work_state: DriverLocationHeartbeatEnvelope["workState"];
  app_state: DriverLocationHeartbeatEnvelope["appState"];
  transport_mode: DriverLocationHeartbeatEnvelope["transportMode"];
  network_type: DriverLocationHeartbeatEnvelope["networkType"];
};

export type RecordDriverLocationEventResult = {
  duplicate: boolean;
  currentLocationUpdated: boolean;
  serverReceivedAt: string;
};

export type DriverHeartbeatEventSnapshot = {
  eventId: string;
  deviceId: string;
  driverId: string;
  vehicleId: string | null;
  taskId: string | null;
  sequenceNo: number;
  recordedAt: string;
  receivedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  workState: DriverLocationHeartbeatEnvelope["workState"];
  appState: DriverLocationHeartbeatEnvelope["appState"];
  transportMode: DriverLocationHeartbeatEnvelope["transportMode"];
  networkType: DriverLocationHeartbeatEnvelope["networkType"];
};

type VehiclePassengerDisclosureProfileRow = {
  vehicle_id: string;
  make: string;
  model: string;
  model_year: number | string;
  door_count: number | string;
  color: string | null;
  status: string;
  missing_field_codes: unknown;
  verified_by_actor_id: string | null;
  verified_at: string | Date | null;
  source_submission_id: string | null;
  version: number | string;
  updated_at: string | Date;
};

type DriverPublicRegistrationCredentialRow = {
  driver_id: string;
  registration_no: string | null;
  registration_area: string | null;
  effective_from: string | Date | null;
  effective_until: string | Date | null;
  status: string;
  masked_display: string;
  verified_by_actor_id: string | null;
  verified_at: string | Date | null;
  source_submission_id: string | null;
  version: number | string;
  updated_at: string | Date;
};

export type ExpiryEntityType = "driver" | "policy";
export type ExpiryEventStatus =
  | "pending"
  | "leased"
  | "completed"
  | "superseded"
  | "failed";
export type DeliveryIntentStatus =
  | "pending"
  | "enqueued"
  | "sent"
  | "failed"
  | "superseded";

export type RegistryExpiryEventRow = {
  event_id: string;
  scope: string;
  entity_type: ExpiryEntityType;
  entity_id: string;
  credential_type: string;
  source_fingerprint: string;
  source_expiry_at: Date | string | null;
  status: ExpiryEventStatus;
  attempt: number;
  run_after: Date | string;
  lease_token: number;
  leased_until: Date | string | null;
  worker_id: string | null;
  last_error: string | null;
  superseded_by_event_id: string | null;
  superseded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type RegistryExpiryDeliveryIntentRow = {
  intent_id: string;
  event_id: string;
  scope: string;
  idempotency_key: string;
  tenant_id: string;
  recipient_email: string;
  from_email: string;
  subject: string;
  body: string;
  delivery_status: DeliveryIntentStatus;
  outbox_delivery_id: string | null;
  last_error: string | null;
  enqueued_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type RegistryExpiryEventWithIntent = RegistryExpiryEventRow & {
  intent: RegistryExpiryDeliveryIntentRow | null;
};

export type InsertExpiryEventParams = {
  eventId?: string | undefined;
  scope: string;
  entityType: ExpiryEntityType;
  entityId: string;
  credentialType: string;
  sourceFingerprint: string;
  sourceExpiryAt: string | null;
  status?: ExpiryEventStatus | undefined;
};

export type InsertDeliveryIntentParams = {
  intentId?: string | undefined;
  eventId: string;
  scope: string;
  idempotencyKey: string;
  tenantId: string;
  recipientEmail: string;
  fromEmail: string;
  subject: string;
  body: string;
};

export type UpdateDeliveryIntentParams = {
  intentId: string;
  deliveryStatus: DeliveryIntentStatus;
  outboxDeliveryId?: string | null | undefined;
  lastError?: string | null | undefined;
};

@Injectable()
export class RegulatoryRegistryRepository {
  private readonly logger = new Logger(RegulatoryRegistryRepository.name);
  private readonly inMemoryExpiryEvents = new Map<string, RegistryExpiryEventRow>();
  private readonly inMemoryDeliveryIntents = new Map<string, RegistryExpiryDeliveryIntentRow>();

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
        disclosureProfiles: [],
        driverCredentials: [],
      };
    }

    const [
      vehiclesResult,
      driversResult,
      supplyPairsResult,
      contractsResult,
      policiesResult,
      exclusivitiesResult,
      vehicleLicenseClassResult,
      disclosureProfilesResult,
      driverCredentialsResult,
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
      this.databaseService!.query<VehicleLicenseClassRow>(
        `
          SELECT vehicle_id, license_class
          FROM reg.vehicles
        `,
      ),
      this.databaseService!.query<VehiclePassengerDisclosureProfileRow>(
        `
          SELECT *
          FROM reg.vehicle_passenger_disclosure_profiles
          ORDER BY updated_at DESC, vehicle_id
        `,
      ),
      this.databaseService!.query<DriverPublicRegistrationCredentialRow>(
        `
          SELECT *
          FROM reg.driver_public_registration_credentials
          ORDER BY updated_at DESC, driver_id
        `,
      ),
    ]);

    const vehicleLicenseTypes = new Map(
      vehicleLicenseClassResult.rows
        .map(
          (row) =>
            [
              row.vehicle_id,
              this.mapVehicleLicenseClass(row.license_class),
            ] as const,
        )
        .filter(
          (entry): entry is readonly [string, VehicleLicenseType] =>
            entry[1] !== null,
        ),
    );

    return {
      vehicles: vehiclesResult.rows.map((row) => {
        const record = this.parseRecord<VehicleRegistryRecord>(
          row.record,
          "reg.phase1_registry_vehicles",
        );
        const licenseType =
          record.licenseType ??
          vehicleLicenseTypes.get(record.vehicleId) ??
          null;
        return licenseType ? { ...record, licenseType } : record;
      }),
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
      disclosureProfiles: disclosureProfilesResult.rows.map((row) =>
        this.mapDisclosureProfileRow(row),
      ),
      driverCredentials: driverCredentialsResult.rows.map((row) =>
        this.mapDriverCredentialRow(row),
      ),
    };
  }

  async persistChanges(changes: PersistRegulatoryRegistryChanges) {
    if (!this.isEnabled()) {
      return;
    }

    await this.persistChangesWithExecutor(this.databaseService!, changes);
  }

  async persistChangesWithExecutor(
    executor: RegulatoryRegistryQueryExecutor,
    changes: PersistRegulatoryRegistryChanges,
  ) {
    await this.persistChangesInternal(executor, changes);
  }

  private async persistChangesInternal(
    executor: RegulatoryRegistryQueryExecutor,
    changes: PersistRegulatoryRegistryChanges,
  ) {
    const writes: Promise<unknown>[] = [];

    for (const vehicle of changes.vehicles ?? []) {
      writes.push(
        executor.query(
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
            vehicle.updatedAt,
            JSON.stringify(vehicle),
          ],
        ),
      );
    }

    for (const driver of changes.drivers ?? []) {
      writes.push(
        executor.query(
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
        executor.query(
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
        executor.query(
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
        executor.query(
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
        executor.query(
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

    for (const profile of changes.disclosureProfiles ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO reg.vehicle_passenger_disclosure_profiles (
              vehicle_id,
              make,
              model,
              model_year,
              door_count,
              color,
              status,
              missing_field_codes,
              verified_by_actor_id,
              verified_at,
              source_submission_id,
              version,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, now()
            )
            ON CONFLICT (vehicle_id) DO UPDATE SET
              make = EXCLUDED.make,
              model = EXCLUDED.model,
              model_year = EXCLUDED.model_year,
              door_count = EXCLUDED.door_count,
              color = EXCLUDED.color,
              status = EXCLUDED.status,
              missing_field_codes = EXCLUDED.missing_field_codes,
              verified_by_actor_id = EXCLUDED.verified_by_actor_id,
              verified_at = EXCLUDED.verified_at,
              source_submission_id = EXCLUDED.source_submission_id,
              version = EXCLUDED.version,
              updated_at = now()
          `,
          [
            profile.vehicleId,
            profile.make,
            profile.model,
            profile.modelYear,
            profile.doorCount,
            profile.color,
            profile.status,
            JSON.stringify(profile.missingFieldCodes),
            profile.verifiedByActorId,
            profile.verifiedAt,
            profile.sourceSubmissionId,
            profile.version,
          ],
        ),
      );
    }

    for (const cred of changes.driverCredentials ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO reg.driver_public_registration_credentials (
              driver_id,
              registration_no,
              registration_area,
              effective_from,
              effective_until,
              status,
              masked_display,
              verified_by_actor_id,
              verified_at,
              source_submission_id,
              version,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()
            )
            ON CONFLICT (driver_id) DO UPDATE SET
              registration_no = EXCLUDED.registration_no,
              registration_area = EXCLUDED.registration_area,
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              status = EXCLUDED.status,
              masked_display = EXCLUDED.masked_display,
              verified_by_actor_id = EXCLUDED.verified_by_actor_id,
              verified_at = EXCLUDED.verified_at,
              source_submission_id = EXCLUDED.source_submission_id,
              version = EXCLUDED.version,
              updated_at = now()
          `,
          [
            cred.driverId,
            cred.registrationNo,
            cred.registrationArea,
            cred.effectiveFrom,
            cred.effectiveUntil,
            cred.status,
            cred.maskedDisplay,
            cred.verifiedByActorId,
            cred.verifiedAt,
            cred.sourceSubmissionId,
            cred.version,
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  async upsertDriverLocation(
    command: DriverLocationHeartbeatCommand,
  ): Promise<boolean> {
    this.assertDatabaseEnabled("upsert driver location");

    const result = await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_locations (
          driver_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, now()
        )
        ON CONFLICT (driver_id) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          recorded_at = EXCLUDED.recorded_at,
          updated_at = now()
        WHERE ops.phase1_driver_locations.recorded_at < EXCLUDED.recorded_at
      `,
      [
        command.driverId,
        command.lat,
        command.lng,
        command.accuracyM ?? null,
        command.recordedAt ?? new Date().toISOString(),
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async recordDriverLocationEvent(
    event: DriverLocationHeartbeatEnvelope,
  ): Promise<RecordDriverLocationEventResult> {
    this.assertDatabaseEnabled("record driver location event");

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query<
        Pick<DriverLocationEventRow, "received_at">
      >(
        `
          INSERT INTO telemetry.driver_location_events (
            event_id,
            device_id,
            driver_id,
            vehicle_id,
            task_id,
            sequence_no,
            recorded_at,
            lat,
            lng,
            accuracy_m,
            work_state,
            app_state,
            transport_mode,
            network_type,
            out_of_order
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            EXISTS (
              SELECT 1
              FROM ops.phase1_driver_locations
              WHERE driver_id = $3
                AND recorded_at >= $7::timestamptz
            )
          )
          ON CONFLICT DO NOTHING
          RETURNING received_at
        `,
        [
          event.eventId,
          event.deviceId,
          event.driverId,
          event.vehicleId,
          event.taskId,
          event.sequenceNo,
          event.recordedAt,
          event.lat,
          event.lng,
          event.accuracyM,
          event.workState,
          event.appState,
          event.transportMode,
          event.networkType,
        ],
      );

      const inserted = (insertResult.rowCount ?? 0) > 0;
      let serverReceivedAt: string;
      let currentLocationUpdated = false;

      if (inserted) {
        const insertedRow = insertResult.rows[0];
        if (!insertedRow) {
          throw new Error(
            "Driver location event insert did not return received_at.",
          );
        }
        serverReceivedAt = this.toIsoString(insertedRow.received_at);
        currentLocationUpdated = await this.updateCurrentDriverLocation(
          client,
          {
            driverId: event.driverId,
            lat: event.lat,
            lng: event.lng,
            recordedAt: event.recordedAt,
            ...(event.accuracyM === null ? {} : { accuracyM: event.accuracyM }),
          },
        );
      } else {
        const existingResult = await client.query<DriverLocationEventRow>(
          `
            SELECT received_at
            FROM telemetry.driver_location_events
            WHERE event_id = $1
               OR (device_id = $2 AND sequence_no = $3)
            ORDER BY received_at ASC
            LIMIT 1
          `,
          [event.eventId, event.deviceId, event.sequenceNo],
        );
        serverReceivedAt = this.toIsoString(
          existingResult.rows[0]?.received_at ?? new Date(),
        );
      }

      await client.query("COMMIT");
      return {
        duplicate: !inserted,
        currentLocationUpdated,
        serverReceivedAt,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

  async listLatestDriverLocations(): Promise<DriverLocationSnapshot[]> {
    if (!this.isEnabled()) {
      return [];
    }

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
        ORDER BY updated_at DESC, driver_id ASC
      `,
    );

    return result.rows.map((row) => ({
      driverId: row.driver_id,
      lat: this.parseNumericValue(row.lat, "lat"),
      lng: this.parseNumericValue(row.lng, "lng"),
      accuracyM:
        row.accuracy_m === null
          ? null
          : this.parseNumericValue(row.accuracy_m, "accuracy_m"),
      recordedAt: this.toIsoString(row.recorded_at),
      updatedAt: this.toIsoString(row.updated_at),
    }));
  }

  async findLatestDriverHeartbeatEvent(
    driverId: string,
  ): Promise<DriverHeartbeatEventSnapshot | null> {
    this.assertDatabaseEnabled("find latest driver heartbeat event");

    const result = await this.databaseService!.query<DriverLocationEventRow>(
      `
        SELECT
          event_id,
          device_id,
          driver_id,
          vehicle_id,
          task_id,
          sequence_no,
          recorded_at,
          received_at,
          lat,
          lng,
          accuracy_m,
          work_state,
          app_state,
          transport_mode,
          network_type
        FROM telemetry.driver_location_events
        WHERE driver_id = $1
        ORDER BY received_at DESC, recorded_at DESC, sequence_no DESC
        LIMIT 1
      `,
      [driverId],
    );

    return this.toHeartbeatEventSnapshot(result.rows[0] ?? null);
  }

  async findDriverHeartbeatEventByRecordedAt(
    driverId: string,
    recordedAt: string,
    receivedAt?: string,
  ): Promise<DriverHeartbeatEventSnapshot | null> {
    this.assertDatabaseEnabled("find driver heartbeat event by recordedAt");

    const result = await this.databaseService!.query<DriverLocationEventRow>(
      `
        SELECT
          event_id,
          device_id,
          driver_id,
          vehicle_id,
          task_id,
          sequence_no,
          recorded_at,
          received_at,
          lat,
          lng,
          accuracy_m,
          work_state,
          app_state,
          transport_mode,
          network_type
        FROM telemetry.driver_location_events
        WHERE driver_id = $1
          AND recorded_at = $2::timestamptz
          AND ($3::timestamptz IS NULL OR received_at = $3::timestamptz)
        ORDER BY
          CASE
            WHEN $3::timestamptz IS NOT NULL AND received_at = $3::timestamptz
              THEN 0
            ELSE 1
          END,
          received_at ASC,
          sequence_no ASC
        LIMIT 1
      `,
      [driverId, recordedAt, receivedAt ?? null],
    );

    return this.toHeartbeatEventSnapshot(result.rows[0] ?? null);
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

  private mapVehicleLicenseClass(
    licenseClass: string | null | undefined,
  ): VehicleLicenseType | null {
    switch (licenseClass) {
      case "taxi":
        return "taxi";
      case "multi_taxi":
        return "multi_purpose_taxi";
      case "rental":
        return "rental_car";
      case "other":
        // The regulatory registry enum is coarser than the runtime eligibility
        // matrix; the "other" bucket maps to business-dispatch-capable vehicles.
        return "business_vehicle";
      default:
        return null;
    }
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

  private toHeartbeatEventSnapshot(
    row: DriverLocationEventRow | null,
  ): DriverHeartbeatEventSnapshot | null {
    if (!row) {
      return null;
    }

    return {
      eventId: row.event_id,
      deviceId: row.device_id,
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      taskId: row.task_id,
      sequenceNo: Number(row.sequence_no),
      recordedAt: this.toIsoString(row.recorded_at),
      receivedAt: this.toIsoString(row.received_at),
      lat: this.parseNumericValue(row.lat, "lat"),
      lng: this.parseNumericValue(row.lng, "lng"),
      accuracyM:
        row.accuracy_m === null
          ? null
          : this.parseNumericValue(row.accuracy_m, "accuracy_m"),
      workState: row.work_state,
      appState: row.app_state,
      transportMode: row.transport_mode,
      networkType: row.network_type,
    };
  }

  private async updateCurrentDriverLocation(
    client: {
      query<T extends { [key: string]: unknown }>(
        text: string,
        values?: readonly unknown[],
      ): Promise<{ rowCount: number | null; rows: T[] }>;
    },
    command: DriverLocationHeartbeatCommand,
  ): Promise<boolean> {
    const result = await client.query(
      `
        INSERT INTO ops.phase1_driver_locations (
          driver_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, now()
        )
        ON CONFLICT (driver_id) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          recorded_at = EXCLUDED.recorded_at,
          updated_at = now()
        WHERE ops.phase1_driver_locations.recorded_at < EXCLUDED.recorded_at
      `,
      [
        command.driverId,
        command.lat,
        command.lng,
        command.accuracyM ?? null,
        command.recordedAt ?? new Date().toISOString(),
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async runIdempotentBackfill(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(`
      INSERT INTO reg.driver_public_registration_credentials (
        driver_id,
        registration_no,
        registration_area,
        effective_from,
        effective_until,
        status,
        masked_display,
        version,
        updated_at
      )
      SELECT 
        d.driver_id::text,
        dp.taxi_registration_no,
        NULL,
        NULL,
        dp.taxi_registration_expiry,
        CASE WHEN dp.taxi_registration_no IS NOT NULL THEN 'unverified' ELSE 'missing' END,
        CASE 
          WHEN dp.taxi_registration_no IS NULL THEN '***'
          WHEN length(dp.taxi_registration_no) <= 4 THEN '***'
          ELSE concat(left(dp.taxi_registration_no, 2), '***', right(dp.taxi_registration_no, 2))
        END,
        1,
        now()
      FROM reg.drivers d
      LEFT JOIN reg.driver_reg_profiles dp ON d.driver_id::text = dp.driver_id
      LEFT JOIN reg.driver_public_registration_credentials dc ON d.driver_id::text = dc.driver_id
      WHERE dc.driver_id IS NULL
      ON CONFLICT (driver_id) DO NOTHING;
    `);

    await this.databaseService!.query(`
      UPDATE fleet.supply_submissions s
      SET status = 'needs_revision',
          updated_at = now()
      FROM fleet.vehicle_supply_drafts d
      WHERE s.submission_id = d.submission_id
        AND s.status IN ('submitted', 'in_review', 'approved')
        AND (d.door_count IS NULL OR d.color IS NULL);
    `);
  }

  private mapDisclosureProfileRow(
    row: VehiclePassengerDisclosureProfileRow,
  ): VehiclePassengerDisclosureProfile {
    return {
      vehicleId: row.vehicle_id,
      make: row.make,
      model: row.model,
      modelYear: Number(row.model_year),
      doorCount: Number(row.door_count),
      color: row.color,
      status: row.status as VehiclePassengerDisclosureProfile["status"],
      missingFieldCodes: this.toStringArray(row.missing_field_codes),
      verifiedByActorId: row.verified_by_actor_id,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      sourceSubmissionId: row.source_submission_id,
      version: Number(row.version),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapDriverCredentialRow(
    row: DriverPublicRegistrationCredentialRow,
  ): DriverPublicRegistrationCredential {
    return {
      driverId: row.driver_id,
      registrationNo: row.registration_no,
      registrationArea: row.registration_area,
      effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString().slice(0, 10) : null,
      effectiveUntil: row.effective_until ? new Date(row.effective_until).toISOString().slice(0, 10) : null,
      status: row.status as DriverPublicRegistrationCredential["status"],
      maskedDisplay: row.masked_display,
      verifiedByActorId: row.verified_by_actor_id,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      sourceSubmissionId: row.source_submission_id,
      version: Number(row.version),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
      } catch {
        // Ignore JSON parsing errors
      }
    }
    return [];
  }

  private getExpiryExecutor(client?: PoolClient): RegulatoryRegistryQueryExecutor {
    if (client) {
      return {
        query: async <T extends { [key: string]: unknown }>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: T[] }> => {
          const res = await client.query(text, (values ?? []) as any[]);
          return { rows: res.rows as T[] };
        },
      };
    }
    return this.databaseService!;
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.isEnabled()) {
      const fakeClient = {
        query: async () => ({ rows: [] }),
        release: () => {},
      } as unknown as PoolClient;
      return work(fakeClient);
    }
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async lockDriver(
    driverId: string,
    client?: PoolClient,
  ): Promise<DriverRegistryRecord | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: DriverRegistryRecord }>(
        `SELECT record FROM reg.phase1_registry_drivers WHERE driver_id = $1 ${client ? "FOR UPDATE" : ""}`,
        [driverId],
      );
      return result.rows[0]?.record ?? null;
    }
    return null;
  }

  async lockPolicy(
    policyId: string,
    client?: PoolClient,
  ): Promise<InsurancePolicyRecord | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: InsurancePolicyRecord }>(
        `SELECT record FROM reg.phase1_registry_policies WHERE policy_id = $1 ${client ? "FOR UPDATE" : ""}`,
        [policyId],
      );
      return result.rows[0]?.record ?? null;
    }
    return null;
  }

  async scanExpiredDrivers(
    asOf: Date | string,
    limit: number = 100,
    client?: PoolClient,
  ): Promise<DriverRegistryRecord[]> {
    const asOfIso = asOf instanceof Date ? asOf.toISOString() : new Date(asOf).toISOString();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: DriverRegistryRecord }>(
        `
          SELECT d.record
          FROM reg.phase1_registry_drivers d
          LEFT JOIN reg.driver_reg_profiles dp ON d.driver_id = dp.driver_id
          WHERE (d.record->>'licenseExpiry' IS NOT NULL AND (d.record->>'licenseExpiry')::timestamptz <= $1)
             OR (d.record->>'professionalDriverLicenseExpiry' IS NOT NULL AND (d.record->>'professionalDriverLicenseExpiry')::timestamptz <= $1)
             OR (d.record->>'taxiDriverRegistrationExpiry' IS NOT NULL AND (d.record->>'taxiDriverRegistrationExpiry')::timestamptz <= $1)
             OR (dp.training_status = 'expired')
          ORDER BY d.driver_id ASC
          LIMIT $2
        `,
        [asOfIso, limit],
      );
      return result.rows.map((r) => r.record);
    }
    return [];
  }

  async scanExpiredPolicies(
    asOf: Date | string,
    limit: number = 100,
    client?: PoolClient,
  ): Promise<InsurancePolicyRecord[]> {
    const asOfIso = asOf instanceof Date ? asOf.toISOString() : new Date(asOf).toISOString();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: InsurancePolicyRecord }>(
        `
          SELECT record
          FROM reg.phase1_registry_policies
          WHERE status != 'cancelled'
            AND (record->>'startAt' IS NULL OR (record->>'startAt')::timestamptz <= $1)
            AND (record->>'endAt' IS NOT NULL AND (record->>'endAt')::timestamptz < $1)
          ORDER BY policy_id ASC
          LIMIT $2
        `,
        [asOfIso, limit],
      );
      return result.rows.map((r) => r.record);
    }
    return [];
  }

  async findExpiryEventByFingerprint(
    fingerprint: string,
    client?: PoolClient,
  ): Promise<RegistryExpiryEventRow | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<RegistryExpiryEventRow>(
        `SELECT * FROM reg.phase1_registry_expiry_events WHERE source_fingerprint = $1`,
        [fingerprint],
      );
      return result.rows[0] ?? null;
    }
    return (
      Array.from(this.inMemoryExpiryEvents.values()).find(
        (e) => e.source_fingerprint === fingerprint,
      ) ?? null
    );
  }

  async findActiveExpiryEventsForEntity(
    entityType: ExpiryEntityType,
    entityId: string,
    credentialType?: string,
    client?: PoolClient,
  ): Promise<RegistryExpiryEventRow[]> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const params: unknown[] = [entityType, entityId];
      let sql = `SELECT * FROM reg.phase1_registry_expiry_events WHERE entity_type = $1 AND entity_id = $2 AND status IN ('pending', 'leased', 'completed')`;
      if (credentialType) {
        params.push(credentialType);
        sql += ` AND credential_type = $${params.length}`;
      }
      sql += ` ORDER BY event_id ASC ${client ? "FOR UPDATE" : ""}`;
      const result = await executor.query<RegistryExpiryEventRow>(sql, params);
      return result.rows;
    }
    return Array.from(this.inMemoryExpiryEvents.values()).filter(
      (e) =>
        e.entity_type === entityType &&
        e.entity_id === entityId &&
        ["pending", "leased", "completed"].includes(e.status) &&
        (!credentialType || e.credential_type === credentialType),
    );
  }

  async insertExpiryEvent(
    params: InsertExpiryEventParams,
    client?: PoolClient,
  ): Promise<RegistryExpiryEventRow> {
    const eventId = params.eventId ?? randomUUID();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<RegistryExpiryEventRow>(
        `
          INSERT INTO reg.phase1_registry_expiry_events (
            event_id, scope, entity_type, entity_id, credential_type,
            source_fingerprint, source_expiry_at, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
          ON CONFLICT (source_fingerprint) DO UPDATE SET updated_at = now()
          RETURNING *
        `,
        [
          eventId,
          params.scope,
          params.entityType,
          params.entityId,
          params.credentialType,
          params.sourceFingerprint,
          params.sourceExpiryAt,
          params.status ?? "pending",
        ],
      );
      return result.rows[0]!;
    }

    const row: RegistryExpiryEventRow = {
      event_id: eventId,
      scope: params.scope,
      entity_type: params.entityType,
      entity_id: params.entityId,
      credential_type: params.credentialType,
      source_fingerprint: params.sourceFingerprint,
      source_expiry_at: params.sourceExpiryAt,
      status: params.status ?? "pending",
      attempt: 0,
      run_after: new Date().toISOString(),
      lease_token: 0,
      leased_until: null,
      worker_id: null,
      last_error: null,
      superseded_by_event_id: null,
      superseded_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.inMemoryExpiryEvents.set(eventId, row);
    return row;
  }

  async supersedeExpiryEvents(
    eventIds: string[],
    supersededByEventId?: string,
    client?: PoolClient,
  ): Promise<void> {
    if (eventIds.length === 0) return;
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      await executor.query(
        `
          UPDATE reg.phase1_registry_expiry_events
          SET status = 'superseded',
              superseded_at = now(),
              superseded_by_event_id = $1,
              updated_at = now()
          WHERE event_id = ANY($2::uuid[])
        `,
        [supersededByEventId ?? null, eventIds],
      );
      await executor.query(
        `
          UPDATE reg.phase1_registry_expiry_delivery_intents
          SET delivery_status = 'superseded',
              updated_at = now()
          WHERE event_id = ANY($1::uuid[]) AND delivery_status = 'pending'
        `,
        [eventIds],
      );
      return;
    }

    const nowIso = new Date().toISOString();
    for (const id of eventIds) {
      const evt = this.inMemoryExpiryEvents.get(id);
      if (evt) {
        evt.status = "superseded";
        evt.superseded_at = nowIso;
        evt.superseded_by_event_id = supersededByEventId ?? null;
        evt.updated_at = nowIso;
      }
      for (const intent of this.inMemoryDeliveryIntents.values()) {
        if (intent.event_id === id && intent.delivery_status === "pending") {
          intent.delivery_status = "superseded";
          intent.updated_at = nowIso;
        }
      }
    }
  }

  async supersedeActiveExpiryEventsForEntity(
    entityType: ExpiryEntityType,
    entityId: string,
    credentialType: string,
    supersededByEventId?: string,
    client?: PoolClient,
  ): Promise<number> {
    if (!this.isEnabled()) {
      const active = Array.from(this.inMemoryExpiryEvents.values()).filter(
        (e) =>
          e.entity_type === entityType &&
          e.entity_id === entityId &&
          ["pending", "leased", "completed"].includes(e.status) &&
          (!credentialType || e.credential_type === credentialType) &&
          (!supersededByEventId || e.event_id !== supersededByEventId),
      );
      const nowIso = new Date().toISOString();
      for (const evt of active) {
        evt.status = "superseded";
        evt.superseded_at = nowIso;
        evt.superseded_by_event_id = supersededByEventId ?? null;
        evt.updated_at = nowIso;
        for (const intent of this.inMemoryDeliveryIntents.values()) {
          if (intent.event_id === evt.event_id && intent.delivery_status === "pending") {
            intent.delivery_status = "superseded";
            intent.updated_at = nowIso;
          }
        }
      }
      return active.length;
    }
    const active = await this.findActiveExpiryEventsForEntity(
      entityType,
      entityId,
      credentialType,
      client,
    );
    const toSupersede = active
      .filter((e) => !supersededByEventId || e.event_id !== supersededByEventId)
      .map((e) => e.event_id);
    if (toSupersede.length > 0) {
      await this.supersedeExpiryEvents(toSupersede, supersededByEventId, client);
    }
    return toSupersede.length;
  }

  async updateExpiryEventStatus(
    eventId: string,
    status: ExpiryEventStatus,
    client?: PoolClient,
  ): Promise<void> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      await executor.query(
        `
          UPDATE reg.phase1_registry_expiry_events
          SET status = $1,
              updated_at = now()
          WHERE event_id = $2
        `,
        [status, eventId],
      );
      return;
    }
    const evt = this.inMemoryExpiryEvents.get(eventId);
    if (evt) {
      evt.status = status;
      evt.updated_at = new Date().toISOString();
    }
  }

  async insertDeliveryIntent(
    params: InsertDeliveryIntentParams,
    client?: PoolClient,
  ): Promise<RegistryExpiryDeliveryIntentRow> {
    const intentId = params.intentId ?? randomUUID();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<RegistryExpiryDeliveryIntentRow>(
        `
          INSERT INTO reg.phase1_registry_expiry_delivery_intents (
            intent_id, event_id, scope, idempotency_key, tenant_id,
            recipient_email, from_email, subject, body, delivery_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())
          ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
          RETURNING *
        `,
        [
          intentId,
          params.eventId,
          params.scope,
          params.idempotencyKey,
          params.tenantId,
          params.recipientEmail,
          params.fromEmail,
          params.subject,
          params.body,
        ],
      );
      return result.rows[0]!;
    }

    const row: RegistryExpiryDeliveryIntentRow = {
      intent_id: intentId,
      event_id: params.eventId,
      scope: params.scope,
      idempotency_key: params.idempotencyKey,
      tenant_id: params.tenantId,
      recipient_email: params.recipientEmail,
      from_email: params.fromEmail,
      subject: params.subject,
      body: params.body,
      delivery_status: "pending",
      outbox_delivery_id: null,
      last_error: null,
      enqueued_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.inMemoryDeliveryIntents.set(intentId, row);
    return row;
  }

  async findPendingDeliveryIntents(
    limit: number = 50,
    client?: PoolClient,
  ): Promise<RegistryExpiryDeliveryIntentRow[]> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<RegistryExpiryDeliveryIntentRow>(
        `
          SELECT *
          FROM reg.phase1_registry_expiry_delivery_intents
          WHERE delivery_status = 'pending'
          ORDER BY created_at ASC
          LIMIT $1
        `,
        [limit],
      );
      return result.rows;
    }
    return Array.from(this.inMemoryDeliveryIntents.values())
      .filter((i) => i.delivery_status === "pending")
      .slice(0, limit);
  }

  async updateDeliveryIntent(
    params: UpdateDeliveryIntentParams,
    client?: PoolClient,
  ): Promise<RegistryExpiryDeliveryIntentRow | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<RegistryExpiryDeliveryIntentRow>(
        `
          UPDATE reg.phase1_registry_expiry_delivery_intents
          SET delivery_status = $1,
              outbox_delivery_id = COALESCE($2, outbox_delivery_id),
              last_error = $3,
              enqueued_at = CASE WHEN $1 = 'enqueued' THEN now() ELSE enqueued_at END,
              updated_at = now()
          WHERE intent_id = $4
          RETURNING *
        `,
        [
          params.deliveryStatus,
          params.outboxDeliveryId ?? null,
          params.lastError ?? null,
          params.intentId,
        ],
      );
      return result.rows[0] ?? null;
    }

    const intent = this.inMemoryDeliveryIntents.get(params.intentId);
    if (!intent) return null;
    intent.delivery_status = params.deliveryStatus;
    if (params.outboxDeliveryId !== undefined) {
      intent.outbox_delivery_id = params.outboxDeliveryId;
    }
    if (params.lastError !== undefined) {
      intent.last_error = params.lastError;
    }
    if (params.deliveryStatus === "enqueued") {
      intent.enqueued_at = new Date().toISOString();
    }
    intent.updated_at = new Date().toISOString();
    return intent;
  }

  async listExpiryEvents(
    filter?: {
      scope?: string | undefined;
      entityType?: ExpiryEntityType | undefined;
      status?: ExpiryEventStatus | undefined;
      limit?: number | undefined;
    } | undefined,
    client?: PoolClient,
  ): Promise<RegistryExpiryEventWithIntent[]> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filter?.scope) {
        params.push(filter.scope);
        conditions.push(`e.scope = $${params.length}`);
      }
      if (filter?.entityType) {
        params.push(filter.entityType);
        conditions.push(`e.entity_type = $${params.length}`);
      }
      if (filter?.status) {
        params.push(filter.status);
        conditions.push(`e.status = $${params.length}`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = filter?.limit ? `LIMIT ${filter.limit}` : "LIMIT 100";

      const result = await executor.query<
        RegistryExpiryEventRow & {
          intent_id: string | null;
          intent_scope: string | null;
          idempotency_key: string | null;
          tenant_id: string | null;
          recipient_email: string | null;
          from_email: string | null;
          subject: string | null;
          body: string | null;
          delivery_status: DeliveryIntentStatus | null;
          outbox_delivery_id: string | null;
          intent_last_error: string | null;
          enqueued_at: Date | string | null;
          intent_created_at: Date | string | null;
          intent_updated_at: Date | string | null;
        }
      >(
        `
          SELECT
            e.*,
            i.intent_id,
            i.scope AS intent_scope,
            i.idempotency_key,
            i.tenant_id,
            i.recipient_email,
            i.from_email,
            i.subject,
            i.body,
            i.delivery_status,
            i.outbox_delivery_id,
            i.last_error AS intent_last_error,
            i.enqueued_at,
            i.created_at AS intent_created_at,
            i.updated_at AS intent_updated_at
          FROM reg.phase1_registry_expiry_events e
          LEFT JOIN reg.phase1_registry_expiry_delivery_intents i ON e.event_id = i.event_id
          ${whereClause}
          ORDER BY e.created_at DESC
          ${limitClause}
        `,
        params,
      );

      return result.rows.map((row: any) => {
        const {
          intent_id,
          intent_scope,
          idempotency_key,
          tenant_id,
          recipient_email,
          from_email,
          subject,
          body,
          delivery_status,
          outbox_delivery_id,
          intent_last_error,
          enqueued_at,
          intent_created_at,
          intent_updated_at,
          ...eventFields
        } = row;

        const intent: RegistryExpiryDeliveryIntentRow | null = intent_id
          ? {
              intent_id,
              event_id: eventFields.event_id,
              scope: intent_scope ?? eventFields.scope,
              idempotency_key: idempotency_key ?? "",
              tenant_id: tenant_id ?? "",
              recipient_email: recipient_email ?? "",
              from_email: from_email ?? "",
              subject: subject ?? "",
              body: body ?? "",
              delivery_status: delivery_status ?? "pending",
              outbox_delivery_id,
              last_error: intent_last_error,
              enqueued_at,
              created_at: intent_created_at ?? eventFields.created_at,
              updated_at: intent_updated_at ?? eventFields.updated_at,
            }
          : null;

        return { ...eventFields, intent };
      });
    }

    const events = Array.from(this.inMemoryExpiryEvents.values()).filter((e) => {
      if (filter?.scope && e.scope !== filter.scope) return false;
      if (filter?.entityType && e.entity_type !== filter.entityType) return false;
      if (filter?.status && e.status !== filter.status) return false;
      return true;
    });

    return events.slice(0, filter?.limit ?? 100).map((e) => {
      const intent =
        Array.from(this.inMemoryDeliveryIntents.values()).find(
          (i) => i.event_id === e.event_id,
        ) ?? null;
      return { ...e, intent };
    });
  }

  async listDeliveryIntents(
    filter?: {
      tenantId?: string | undefined;
      deliveryStatus?: DeliveryIntentStatus | undefined;
      limit?: number | undefined;
    } | undefined,
    client?: PoolClient,
  ): Promise<RegistryExpiryDeliveryIntentRow[]> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filter?.tenantId) {
        params.push(filter.tenantId);
        conditions.push(`tenant_id = $${params.length}`);
      }
      if (filter?.deliveryStatus) {
        params.push(filter.deliveryStatus);
        conditions.push(`delivery_status = $${params.length}`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = filter?.limit ? `LIMIT ${filter.limit}` : "LIMIT 100";

      const result = await executor.query<RegistryExpiryDeliveryIntentRow>(
        `
          SELECT *
          FROM reg.phase1_registry_expiry_delivery_intents
          ${whereClause}
          ORDER BY created_at DESC
          ${limitClause}
        `,
        params,
      );
      return result.rows;
    }

    return Array.from(this.inMemoryDeliveryIntents.values())
      .filter((i) => {
        if (filter?.tenantId && i.tenant_id !== filter.tenantId) return false;
        if (filter?.deliveryStatus && i.delivery_status !== filter.deliveryStatus) return false;
        return true;
      })
      .slice(0, filter?.limit ?? 100);
  }

  async getExpiryEventById(
    eventId: string,
    client?: PoolClient,
  ): Promise<RegistryExpiryEventWithIntent | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<any>(
        `
          SELECT
            e.*,
            i.intent_id,
            i.scope AS intent_scope,
            i.idempotency_key,
            i.tenant_id,
            i.recipient_email,
            i.from_email,
            i.subject,
            i.body,
            i.delivery_status,
            i.outbox_delivery_id,
            i.last_error AS intent_last_error,
            i.enqueued_at,
            i.created_at AS intent_created_at,
            i.updated_at AS intent_updated_at
          FROM reg.phase1_registry_expiry_events e
          LEFT JOIN reg.phase1_registry_expiry_delivery_intents i ON e.event_id = i.event_id
          WHERE e.event_id = $1
          LIMIT 1
        `,
        [eventId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      const {
        intent_id,
        intent_scope,
        idempotency_key,
        tenant_id,
        recipient_email,
        from_email,
        subject,
        body,
        delivery_status,
        outbox_delivery_id,
        intent_last_error,
        enqueued_at,
        intent_created_at,
        intent_updated_at,
        ...eventFields
      } = row;

      const intent: RegistryExpiryDeliveryIntentRow | null = intent_id
        ? {
            intent_id,
            event_id: eventFields.event_id,
            scope: intent_scope ?? eventFields.scope,
            idempotency_key: idempotency_key ?? "",
            tenant_id: tenant_id ?? "",
            recipient_email: recipient_email ?? "",
            from_email: from_email ?? "",
            subject: subject ?? "",
            body: body ?? "",
            delivery_status: delivery_status ?? "pending",
            outbox_delivery_id,
            last_error: intent_last_error,
            enqueued_at,
            created_at: intent_created_at ?? eventFields.created_at,
            updated_at: intent_updated_at ?? eventFields.updated_at,
          }
        : null;

      return { ...eventFields, intent };
    }

    const e = this.inMemoryExpiryEvents.get(eventId);
    if (!e) return null;
    const intent =
      Array.from(this.inMemoryDeliveryIntents.values()).find(
        (i) => i.event_id === e.event_id,
      ) ?? null;
    return { ...e, intent };
  }
}
