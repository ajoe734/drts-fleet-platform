import { randomUUID } from "node:crypto";
import { AuditLogRepository } from "../audit-notification/audit-log.repository";
import type {
  DisclosureSubjectType,
  DisclosureRecord,
  DisclosureReviewDecision,
} from "./disclosure-review.types";
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
import { ensureLiveMapFixture, resetLiveMapFixture } from "./live-map-fixture";

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
  etaMinutes: number | null;
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

/** Only an actual COMMIT rejection after successful work may be reconciled
 * as an uncertain command ACK. BEGIN/work/rollback/release failures stay errors. */
export class RegulatoryCommandCommitUncertainError extends Error {
  constructor(readonly cause: unknown) {
    super("Registry command COMMIT acknowledgement is uncertain.");
  }
}

export type RegulatoryVehicleCommandState = {
  vehicle: VehicleRegistryRecord;
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

/** Original credential fields; reminder family stays within V0102's driver CHECK. */
export const PREEXPIRY_CREDENTIAL_FIELDS = {
  driver_license: "licenseExpiry",
  professional_driver_license: "professionalDriverLicenseExpiry",
  taxi_driver_registration: "taxiDriverRegistrationExpiry",
} as const;
export function parsePreexpiryCredentialFamily(family: string) {
  const match =
    /^preexpiry:(driver_license|professional_driver_license|taxi_driver_registration):(30|7)$/.exec(
      family,
    );
  if (!match) return null;
  const credential = match[1] as keyof typeof PREEXPIRY_CREDENTIAL_FIELDS;
  return {
    credential,
    field: PREEXPIRY_CREDENTIAL_FIELDS[credential],
    days: Number(match[2]),
  };
}
export function parsePreexpiryRecordFamily(family: string) {
  const match =
    /^preexpiry:(driver_license|professional_driver_license|taxi_driver_registration|insurance_policy|vehicle_contract):(30|7)$/.exec(
      family,
    );
  if (!match) return null;
  const credential = match[1]!;
  const days = Number(match[2]) as 30 | 7;
  if (credential === "insurance_policy") {
    return {
      kind: "policy" as const,
      credential,
      field: "endAt" as const,
      days,
    };
  }
  if (credential === "vehicle_contract") {
    return {
      kind: "contract" as const,
      credential,
      field: "endAt" as const,
      days,
    };
  }
  return {
    kind: "driver" as const,
    credential,
    field:
      PREEXPIRY_CREDENTIAL_FIELDS[
        credential as keyof typeof PREEXPIRY_CREDENTIAL_FIELDS
      ],
    days,
  };
}

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
  intents?: RegistryExpiryDeliveryIntentRow[];
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
  private readonly inMemoryExpiryEvents = new Map<
    string,
    RegistryExpiryEventRow
  >();
  private readonly inMemoryDeliveryIntents = new Map<
    string,
    RegistryExpiryDeliveryIntentRow
  >();
  private readonly inMemoryPartnerContacts = new Map<string, string[]>();
  private extendedExpirySqlSupported = true;

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  supportsExtendedExpirySql() {
    return this.extendedExpirySqlSupported;
  }

  private withLazyPromise<T extends object>(
    snapshot: T,
    loader: () => Promise<T>,
  ): Promise<T> & T {
    let promise: Promise<T> | undefined;
    const getPromise = () => {
      if (!promise) {
        promise = loader();
      }
      return promise;
    };
    return Object.defineProperties(snapshot, {
      then: {
        value: <TResult1 = T, TResult2 = never>(
          onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) => getPromise().then(onfulfilled, onrejected),
      },
      catch: {
        value: <TResult = never>(
          onrejected?:
            | ((reason: unknown) => TResult | PromiseLike<TResult>)
            | null,
        ) => getPromise().catch(onrejected),
      },
      finally: {
        value: (onfinally?: (() => void) | null) =>
          getPromise().finally(onfinally),
      },
    }) as Promise<T> & T;
  }

  private async persistFleetPartnerContactsInDb(
    partnerId: string,
    emails: readonly string[],
  ): Promise<boolean> {
    if (!this.isEnabled() || !this.extendedExpirySqlSupported) return false;
    if (emails.length === 0) {
      const cleared = await this.databaseService!.query<{
        partner_id: string;
      }>(
        `/* partner-contact-upsert */
         WITH cleared_fleet_partner AS (
           UPDATE admin.phase1_fleet_partners
           SET record = (record - 'contactEmails') - 'contactEmail',
               updated_at = now()
           WHERE fleet_partner_id = $1
           RETURNING fleet_partner_id
         ),
         cleared_contract_partner AS (
           UPDATE reg.phase1_registry_contracts
           SET record = (record - 'partnerContactEmails') - 'partnerContactEmail',
               updated_at = now()
           WHERE record->>'partnerId' = $1
           RETURNING contract_id
         ),
         cleared_core_partner AS (
           UPDATE core.partners
           SET contact_email = NULL,
               metadata = COALESCE(metadata, '{}'::jsonb) - 'contactEmails',
               updated_at = now()
           WHERE partner_id::text = $1 OR partner_code = $1
           RETURNING partner_id::text AS partner_id
         )
         SELECT partner_id FROM cleared_core_partner
         UNION ALL
         SELECT fleet_partner_id AS partner_id FROM cleared_fleet_partner
         UNION ALL
         SELECT contract_id AS partner_id FROM cleared_contract_partner`,
        [partnerId],
      );
      return (cleared.rowCount ?? cleared.rows.length) > 0;
    }
    const primaryEmail = emails[0]!;
    const emailsJson = JSON.stringify(emails);
    const updated = await this.databaseService!.query<{
      partner_id: string;
    }>(
      `/* partner-contact-upsert */
       WITH updated_fleet_partner AS (
         UPDATE admin.phase1_fleet_partners
         SET record = jsonb_set(
               jsonb_set(record, '{contactEmails}', $3::jsonb, true),
               '{contactEmail}',
               to_jsonb($2::text),
               true
             ),
             updated_at = now()
         WHERE fleet_partner_id = $1
         RETURNING fleet_partner_id
       ),
       updated_contract_partner AS (
         UPDATE reg.phase1_registry_contracts
         SET record = jsonb_set(
               jsonb_set(record, '{partnerContactEmails}', $3::jsonb, true),
               '{partnerContactEmail}',
               to_jsonb($2::text),
               true
             ),
             updated_at = now()
         WHERE record->>'partnerId' = $1
         RETURNING contract_id
       ),
       updated_core_partner AS (
         UPDATE core.partners
         SET contact_email = $2,
             metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{contactEmails}',
               $3::jsonb,
               true
             ),
             updated_at = now()
         WHERE partner_id::text = $1 OR partner_code = $1
         RETURNING partner_id::text AS partner_id
       )
       SELECT partner_id FROM updated_core_partner
       UNION ALL
       SELECT fleet_partner_id AS partner_id FROM updated_fleet_partner
       UNION ALL
       SELECT contract_id AS partner_id FROM updated_contract_partner`,
      [partnerId, primaryEmail, emailsJson],
    );
    return (updated.rowCount ?? updated.rows.length) > 0;
  }

  setFleetPartnerContacts(
    partnerId: string,
    emails: readonly string[] | string,
  ): Promise<string[]> & string[] {
    const normalized = partnerId.trim();
    if (!normalized) {
      return this.withLazyPromise([], async () => []);
    }
    const list =
      typeof emails === "string" ? emails.split(/[,;\s]+/) : emails;
    const cleaned = [
      ...new Set(list.map((e) => e.trim()).filter(Boolean)),
    ];
    if (cleaned.length === 0) {
      this.inMemoryPartnerContacts.delete(normalized);
    } else {
      this.inMemoryPartnerContacts.set(normalized, cleaned);
    }
    const snapshot = [...cleaned];
    if (this.isEnabled() && this.extendedExpirySqlSupported) {
      return this.withLazyPromise(snapshot, async () => {
        const persisted = await this.persistFleetPartnerContactsInDb(
          normalized,
          cleaned,
        );
        if (!persisted && cleaned.length > 0) {
          this.inMemoryPartnerContacts.delete(normalized);
          return [];
        }
        return [...cleaned];
      });
    }
    return this.withLazyPromise(snapshot, async () => [...cleaned]);
  }

  getFleetPartnerContacts(partnerId: string): Promise<string[]> & string[] {
    const normalized = partnerId.trim();
    const inMemory = [...(this.inMemoryPartnerContacts.get(normalized) ?? [])];
    if (this.isEnabled() && this.extendedExpirySqlSupported) {
      return this.withLazyPromise(inMemory, () =>
        this.findFleetPartnerContactEmails([normalized]),
      );
    }
    return this.withLazyPromise(inMemory, async () => [...inMemory]);
  }

  async findFleetPartnerContactEmails(
    partnerIds: readonly string[],
    client?: PoolClient,
  ): Promise<string[]> {
    const normalizedIds = [
      ...new Set(partnerIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (normalizedIds.length === 0) return [];
    const results: string[] = [];
    for (const id of normalizedIds) {
      results.push(...(this.inMemoryPartnerContacts.get(id) ?? []));
    }
    if (this.isEnabled() && this.extendedExpirySqlSupported) {
      const executor = this.getExpiryExecutor(client);
      const dbResult = await executor.query<{
        email: string | null;
      }>(
        `/* partner-contact-lookup */
         SELECT jsonb_array_elements_text(
           CASE
             WHEN jsonb_typeof(metadata->'contactEmails') = 'array' THEN metadata->'contactEmails'
             ELSE '[]'::jsonb
           END
         ) AS email
         FROM core.partners
         WHERE (partner_id::text = ANY($1::text[]) OR partner_code = ANY($1::text[]))
           AND status <> 'terminated'
         UNION ALL
         SELECT contact_email AS email
         FROM core.partners
         WHERE (partner_id::text = ANY($1::text[]) OR partner_code = ANY($1::text[]))
           AND status <> 'terminated'
           AND contact_email IS NOT NULL
         UNION ALL
         SELECT jsonb_array_elements_text(
           CASE
             WHEN jsonb_typeof(record->'contactEmails') = 'array' THEN record->'contactEmails'
             ELSE '[]'::jsonb
           END
         ) AS email
         FROM admin.phase1_fleet_partners
         WHERE fleet_partner_id = ANY($1::text[])
           AND COALESCE(record->>'status', '') <> 'terminated'
         UNION ALL
         SELECT record->>'contactEmail' AS email
         FROM admin.phase1_fleet_partners
         WHERE fleet_partner_id = ANY($1::text[])
           AND COALESCE(record->>'status', '') <> 'terminated'
           AND record->>'contactEmail' IS NOT NULL
         UNION ALL
         SELECT jsonb_array_elements_text(
           CASE
             WHEN jsonb_typeof(record->'partnerContactEmails') = 'array' THEN record->'partnerContactEmails'
             ELSE '[]'::jsonb
           END
         ) AS email
         FROM reg.phase1_registry_contracts
         WHERE record->>'partnerId' = ANY($1::text[])
           AND COALESCE(record->>'status', status) <> 'terminated'
         UNION ALL
         SELECT record->>'partnerContactEmail' AS email
         FROM reg.phase1_registry_contracts
         WHERE record->>'partnerId' = ANY($1::text[])
           AND COALESCE(record->>'status', status) <> 'terminated'
           AND record->>'partnerContactEmail' IS NOT NULL
         UNION ALL
         SELECT COALESCE(p.email_normalized, p.record->>'email') AS email
         FROM iam.identity_memberships m
         JOIN iam.identity_principals p ON p.principal_id = m.principal_id
         WHERE m.partner_id = ANY($1::text[])
           AND m.membership_status = 'active'
           AND p.account_status = 'active'
           AND COALESCE(p.email_normalized, p.record->>'email') IS NOT NULL`,
        [normalizedIds],
      );
      for (const row of dbResult.rows) {
        if (typeof row.email === "string" && row.email.trim()) {
          results.push(row.email.trim());
        }
      }
    }
    return [...new Set(results)];
  }

  async findVehiclePartnerIds(
    vehicleIds: readonly string[],
    client?: PoolClient,
  ): Promise<Map<string, string[]>> {
    const normalized = [
      ...new Set(vehicleIds.map((v) => v.trim()).filter(Boolean)),
    ];
    const map = new Map<string, string[]>();
    if (
      normalized.length === 0 ||
      !this.isEnabled() ||
      !this.extendedExpirySqlSupported
    ) {
      return map;
    }
    const executor = this.getExpiryExecutor(client);
    const result = await executor.query<{
      vehicle_id: string | null;
      partner_id: string | null;
    }>(
      `/* vehicle-partner-lookup */
       SELECT c.vehicle_id AS vehicle_id, c.record->>'partnerId' AS partner_id
       FROM reg.phase1_registry_contracts c
       WHERE c.vehicle_id = ANY($1::text[])
         AND COALESCE(c.record->>'status', c.status) <> 'terminated'
         AND c.record->>'partnerId' IS NOT NULL
       UNION ALL
       SELECT vc.vehicle_id::text AS vehicle_id, vc.partner_id::text AS partner_id
       FROM reg.vehicle_contracts vc
       WHERE vc.vehicle_id::text = ANY($1::text[])
         AND vc.status <> 'terminated'
       UNION ALL
       SELECT v.vehicle_id::text AS vehicle_id, v.owner_partner_id::text AS partner_id
       FROM reg.vehicles v
       WHERE v.vehicle_id::text = ANY($1::text[])
         AND v.owner_partner_id IS NOT NULL
       UNION ALL
       SELECT v.vehicle_id::text AS vehicle_id, v.dispatch_partner_id::text AS partner_id
       FROM reg.vehicles v
       WHERE v.vehicle_id::text = ANY($1::text[])
         AND v.dispatch_partner_id IS NOT NULL`,
      [normalized],
    );
    for (const row of result.rows) {
      const vId = row.vehicle_id?.trim();
      const pId = row.partner_id?.trim();
      if (!vId || !pId) continue;
      const list = map.get(vId) ?? [];
      if (!list.includes(pId)) {
        list.push(pId);
      }
      map.set(vId, list);
    }
    return map;
  }

  async loadDriverMatchingSuppressions(
    driverId?: string,
    executor: Pick<DatabaseService, "query"> = this.databaseService!,
  ) {
    const result = await executor.query<{
      driver_id: string;
      record: import("@drts/contracts").DriverMatchingSuppression;
    }>(
      `SELECT driver_id, record FROM ops.phase1_driver_matching_suppressions${driverId ? " WHERE driver_id = $1" : ""}`,
      driverId ? [driverId] : [],
    );
    return result.rows;
  }

  async lockDriverMatchingAuthority(
    driverId: string,
    executor: Pick<DatabaseService, "query">,
  ) {
    await executor.query(
      "SELECT driver_id FROM reg.phase1_registry_drivers WHERE driver_id = $1 FOR UPDATE",
      [driverId],
    );
    return this.loadDriverMatchingSuppressions(driverId, executor);
  }

  /** Narrow P5 reads never hydrate or replace another Registry writer's cache. */
  async listDisclosureReviewRecords(): Promise<{
    profiles: VehiclePassengerDisclosureProfile[];
    credentials: DriverPublicRegistrationCredential[];
  }> {
    const [profiles, credentials] = await Promise.all([
      this.databaseService!.query<VehiclePassengerDisclosureProfileRow>(
        "SELECT * FROM reg.vehicle_passenger_disclosure_profiles ORDER BY vehicle_id",
      ),
      this.databaseService!.query<DriverPublicRegistrationCredentialRow>(
        "SELECT * FROM reg.driver_public_registration_credentials ORDER BY driver_id",
      ),
    ]);
    return {
      profiles: profiles.rows.map((row) => this.mapDisclosureProfileRow(row)),
      credentials: credentials.rows.map((row) =>
        this.mapDriverCredentialRow(row),
      ),
    };
  }

  async loadDisclosureReviewSubject(
    type: DisclosureSubjectType,
    id: string,
    executor: RegulatoryRegistryQueryExecutor = this.databaseService!,
    lock = false,
  ): Promise<{
    record: DisclosureRecord;
    parent: VehicleRegistryRecord | DriverRegistryRecord;
  } | null> {
    const vehicle = type === "vehicle";
    // Fixed table choices only; lock the canonical parent before its review row.
    const table = vehicle
      ? "reg.phase1_registry_vehicles"
      : "reg.phase1_registry_drivers";
    const key = vehicle ? "vehicle_id" : "driver_id";
    const parent = await executor.query<{
      record: VehicleRegistryRecord | DriverRegistryRecord;
    }>(
      `SELECT record FROM ${table} WHERE ${key}=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    if (!parent.rows[0]) return null;
    if (vehicle) {
      const result = await executor.query<VehiclePassengerDisclosureProfileRow>(
        `SELECT * FROM reg.vehicle_passenger_disclosure_profiles WHERE vehicle_id=$1${lock ? " FOR UPDATE" : ""}`,
        [id],
      );
      return result.rows[0]
        ? {
            record: this.mapDisclosureProfileRow(result.rows[0]),
            parent: parent.rows[0].record,
          }
        : null;
    }
    const result = await executor.query<DriverPublicRegistrationCredentialRow>(
      `SELECT * FROM reg.driver_public_registration_credentials WHERE driver_id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return result.rows[0]
      ? {
          record: this.mapDriverCredentialRow(result.rows[0]),
          parent: parent.rows[0].record,
        }
      : null;
  }

  async loadDisclosureReviewHistory(
    type: DisclosureSubjectType,
    id: string,
    executor: RegulatoryRegistryQueryExecutor = this.databaseService!,
  ): Promise<DisclosureReviewDecision[]> {
    const result = await executor.query<{
      new_value: { p5Review: DisclosureReviewDecision };
    }>(
      "SELECT new_value FROM admin.audit_logs WHERE module_name='regulatory-registry' AND action_name='p5_disclosure_review' AND resource_type=$1 AND resource_id=$2 ORDER BY created_at, audit_id",
      [`p5_disclosure_${type}`, id],
    );
    return result.rows.map((row) => row.new_value.p5Review);
  }

  async appendDisclosureReview(
    executor: RegulatoryRegistryQueryExecutor,
    decision: DisclosureReviewDecision,
  ): Promise<void> {
    // Reuse the original audit serializer and schema inside this exact transaction.
    const repository = new AuditLogRepository({
      isEnabled: () => true,
      query: executor.query.bind(executor),
    } as DatabaseService);
    await repository.append({
      auditId: decision.decisionId,
      actorId: decision.actorId,
      actorType: decision.actorType,
      tenantId: null,
      moduleName: "regulatory-registry",
      actionName: "p5_disclosure_review",
      resourceType: `p5_disclosure_${decision.subjectType}`,
      resourceId: decision.subjectId,
      oldValuesSummary: { record: decision.previousRecord },
      newValuesSummary: { p5Review: decision },
      requestId: decision.operationKey,
      createdAt: decision.decidedAt,
    });
  }

  async findDriverPublicRegistrationCredential(
    driverId: string,
  ): Promise<DriverPublicRegistrationCredential | null> {
    if (!this.isEnabled()) return null;
    const result =
      await this.databaseService!.query<DriverPublicRegistrationCredentialRow>(
        `SELECT * FROM reg.driver_public_registration_credentials WHERE driver_id=$1`,
        [driverId],
      );
    return result.rows[0] ? this.mapDriverCredentialRow(result.rows[0]) : null;
  }

  async findCompletionOperatorId(
    authorizationId: string,
  ): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<{ operator_id: string }>(
      `SELECT operator_id FROM reg.multi_taxi_operating_authorizations WHERE authorization_id=$1`,
      [authorizationId],
    );
    return result.rows[0]?.operator_id ?? null;
  }

  async ensureLiveMapTestDriver() {
    return ensureLiveMapFixture(this.databaseService);
  }

  async resetLiveMapTestDriver() {
    return resetLiveMapFixture(this.databaseService);
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

  /** One MVCC snapshot, restricted to supply for the requested service bucket.
   * Include unavailable drivers as well, so stale availability cannot survive.
   */
  async findDispatchSupplyContext(serviceBucket: string) {
    this.assertDatabaseEnabled("read dispatch supply authority");
    const result = await this.databaseService!.query<{
      vehicles: (JsonRecordRow & { license_class: string | null })[];
      drivers: JsonRecordRow[];
      pairs: JsonRecordRow[];
      contracts: JsonRecordRow[];
      policies: JsonRecordRow[];
      exclusivities: JsonRecordRow[];
      disclosures: VehiclePassengerDisclosureProfileRow[];
      credentials: DriverPublicRegistrationCredentialRow[];
      locations: DriverLocationRow[];
    }>(
      `WITH vehicles AS MATERIALIZED (
         SELECT v.vehicle_id, v.record, c.license_class
         FROM reg.phase1_registry_vehicles v
         LEFT JOIN reg.vehicles c ON c.vehicle_id::text = v.vehicle_id
         WHERE v.record->'supportedServiceBuckets' ? $1
       ), pairs AS MATERIALIZED (
         SELECT p.* FROM reg.phase1_registry_supply_pairs p
         JOIN vehicles v USING (vehicle_id)
       ), drivers AS MATERIALIZED (
         SELECT d.* FROM reg.phase1_registry_drivers d
         WHERE d.driver_id IN (SELECT driver_id FROM pairs)
       )
       SELECT
         COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM vehicles v), '[]') AS vehicles,
         COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM drivers d), '[]') AS drivers,
         COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM pairs p), '[]') AS pairs,
         COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM reg.phase1_registry_contracts c
           WHERE c.vehicle_id IN (SELECT vehicle_id FROM vehicles)), '[]') AS contracts,
         COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM reg.phase1_registry_policies p
           WHERE p.vehicle_id IN (SELECT vehicle_id FROM vehicles)), '[]') AS policies,
         COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM reg.phase1_registry_exclusivities e
           WHERE e.vehicle_id IN (SELECT vehicle_id FROM vehicles)), '[]') AS exclusivities,
         COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM reg.vehicle_passenger_disclosure_profiles p
           WHERE p.vehicle_id IN (SELECT vehicle_id FROM vehicles)), '[]') AS disclosures,
         COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM reg.driver_public_registration_credentials c
           WHERE c.driver_id IN (SELECT driver_id FROM drivers)), '[]') AS credentials,
         COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM ops.phase1_driver_locations l
           WHERE l.driver_id IN (SELECT driver_id FROM drivers)), '[]') AS locations`,
      [serviceBucket],
    );
    const row = result.rows[0]!;
    const records = <T>(rows: JsonRecordRow[], table: string) =>
      rows.map((r) => this.parseRecord<T>(r.record, table));
    const state: RegulatoryRegistryState = {
      vehicles: row.vehicles.map((r) => {
        const record = this.parseRecord<VehicleRegistryRecord>(
          r.record,
          "reg.phase1_registry_vehicles",
        );
        const licenseType =
          record.licenseType ??
          (r.license_class
            ? this.mapVehicleLicenseClass(r.license_class)
            : null);
        return licenseType ? { ...record, licenseType } : record;
      }),
      drivers: records(row.drivers, "reg.phase1_registry_drivers"),
      supplyPairs: records(row.pairs, "reg.phase1_registry_supply_pairs"),
      contracts: records(row.contracts, "reg.phase1_registry_contracts"),
      policies: records(row.policies, "reg.phase1_registry_policies"),
      exclusivities: records(
        row.exclusivities,
        "reg.phase1_registry_exclusivities",
      ),
      disclosureProfiles: row.disclosures.map((r) =>
        this.mapDisclosureProfileRow(r),
      ),
      driverCredentials: row.credentials.map((r) =>
        this.mapDriverCredentialRow(r),
      ),
    };
    return {
      state,
      locations: row.locations.map((r) => ({
        driverId: r.driver_id,
        lat: this.parseNumericValue(r.lat, "lat"),
        lng: this.parseNumericValue(r.lng, "lng"),
        accuracyM:
          r.accuracy_m === null
            ? null
            : this.parseNumericValue(r.accuracy_m, "accuracy_m"),
        recordedAt: this.toIsoString(r.recorded_at),
        updatedAt: this.toIsoString(r.updated_at),
      })),
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

  async findSupplyPairWithExecutor(
    executor: RegulatoryRegistryQueryExecutor,
    vehicleId: string,
    driverId: string,
  ): Promise<RegulatorySupplyPair | null> {
    const result = await executor.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_supply_pairs WHERE pair_id = $1 FOR UPDATE",
      [`${vehicleId}::${driverId}`],
    );
    return result.rows[0]
      ? this.parseRecord<RegulatorySupplyPair>(
          result.rows[0].record,
          "reg.phase1_registry_supply_pairs",
        )
      : null;
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
      verifiedAt: row.verified_at
        ? new Date(row.verified_at).toISOString()
        : null,
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
      effectiveFrom: row.effective_from
        ? new Date(row.effective_from).toISOString().slice(0, 10)
        : null,
      effectiveUntil: row.effective_until
        ? new Date(row.effective_until).toISOString().slice(0, 10)
        : null,
      status: row.status as DriverPublicRegistrationCredential["status"],
      maskedDisplay: row.masked_display,
      verifiedByActorId: row.verified_by_actor_id,
      verifiedAt: row.verified_at
        ? new Date(row.verified_at).toISOString()
        : null,
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

  private getExpiryExecutor(
    client?: PoolClient,
  ): RegulatoryRegistryQueryExecutor {
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

  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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

  /** Dedicated transaction boundary for the seven C072 commands only. The
   * generic detached writer and other Registry transactions are unchanged. */
  async withVehicleCommandTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.databaseService!.connect();
    let rollbackStarted = false;
    let discard: Error | undefined;
    const rollback = async () => {
      rollbackStarted = true;
      try {
        await client.query("ROLLBACK");
      } catch (error) {
        discard = error instanceof Error ? error : new Error(String(error));
        throw error;
      }
    };
    try {
      await client.query("BEGIN");
      const result = await work(client);
      try {
        await client.query("COMMIT");
      } catch (error) {
        await rollback();
        // PostgreSQL explicitly rejected these transactions; equal prior
        // values do not acknowledge the failed retry. Connection/uncoded
        // COMMIT failures still require exact canonical reconciliation.
        const code = String((error as { code?: unknown })?.code ?? "");
        if (
          /^[0-9A-Z]{5}$/.test(code) &&
          !code.startsWith("08") &&
          code !== "40003" &&
          !code.startsWith("57P")
        )
          throw error;
        throw new RegulatoryCommandCommitUncertainError(error);
      }
      return result;
    } catch (error) {
      if (!rollbackStarted) await rollback();
      throw error;
    } finally {
      client.release(discard);
    }
  }

  /** Seven ordinary C072 commands serialize on the existing vehicle row and
   * read only its source records through that same dedicated executor. */
  async readVehicleCommandState(
    vehicleId: string,
    client: PoolClient,
  ): Promise<RegulatoryVehicleCommandState | null> {
    const executor = this.getExpiryExecutor(client);
    const vehicles = await executor.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_vehicles WHERE vehicle_id = $1 FOR UPDATE",
      [vehicleId],
    );
    if (!vehicles.rows[0]) return null;
    const contracts = await executor.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_contracts WHERE vehicle_id = $1 ORDER BY contract_id",
      [vehicleId],
    );
    const policies = await executor.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_policies WHERE vehicle_id = $1 ORDER BY policy_id",
      [vehicleId],
    );
    const exclusivities = await executor.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_exclusivities WHERE vehicle_id = $1",
      [vehicleId],
    );
    return {
      vehicle: this.parseRecord<VehicleRegistryRecord>(
        vehicles.rows[0].record,
        "reg.phase1_registry_vehicles",
      ),
      contracts: contracts.rows.map((r) =>
        this.parseRecord<VehicleContractRecord>(
          r.record,
          "reg.phase1_registry_contracts",
        ),
      ),
      policies: policies.rows.map((r) =>
        this.parseRecord<InsurancePolicyRecord>(
          r.record,
          "reg.phase1_registry_policies",
        ),
      ),
      exclusivities: exclusivities.rows.map((r) =>
        this.parseRecord<DispatchExclusivityRecord>(
          r.record,
          "reg.phase1_registry_exclusivities",
        ),
      ),
    };
  }

  async findCommandContract(
    contractId: string,
  ): Promise<VehicleContractRecord | null> {
    const result = await this.databaseService!.query<JsonRecordRow>(
      "SELECT record FROM reg.phase1_registry_contracts WHERE contract_id = $1",
      [contractId],
    );
    return result.rows[0]
      ? this.parseRecord<VehicleContractRecord>(
          result.rows[0].record,
          "reg.phase1_registry_contracts",
        )
      : null;
  }

  async lockDriver(
    driverId: string,
    client?: PoolClient,
  ): Promise<DriverRegistryRecord | null> {
    return this.readDriverWithExecutor(
      driverId,
      this.getExpiryExecutor(client),
      Boolean(client),
    );
  }

  async lockDriverForApproval(
    driverId: string,
    executor: RegulatoryRegistryQueryExecutor,
  ): Promise<DriverRegistryRecord | null> {
    return this.readDriverWithExecutor(driverId, executor, true);
  }

  private async readDriverWithExecutor(
    driverId: string,
    executor: RegulatoryRegistryQueryExecutor,
    lock: boolean,
  ): Promise<DriverRegistryRecord | null> {
    if (!this.isEnabled()) return null;
    const result = await executor.query<{ record: DriverRegistryRecord }>(
      `SELECT record FROM reg.phase1_registry_drivers WHERE driver_id = $1 ${lock ? "FOR UPDATE" : ""}`,
      [driverId],
    );
    return result.rows[0]?.record ?? null;
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

  async lockContract(
    contractId: string,
    client?: PoolClient,
  ): Promise<VehicleContractRecord | null> {
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: VehicleContractRecord }>(
        `SELECT record FROM reg.phase1_registry_contracts WHERE contract_id = $1 ${client ? "FOR UPDATE" : ""}`,
        [contractId],
      );
      return result.rows[0]?.record ?? null;
    }
    return null;
  }

  /** One finite keyset interval; no scheduler/checkpoint or source mutation. */
  async getExpiryScanUpperBounds(): Promise<{
    driverId: string | null;
    policyId: string | null;
    preexpiryPolicyId: string | null;
    preexpiryContractId: string | null;
  }> {
    const result = await this.databaseService!.query<{
      driver_id: string | null;
      policy_id: string | null;
      preexpiry_policy_id?: string | null;
      preexpiry_contract_id?: string | null;
    }>(
      `SELECT (SELECT MAX(driver_id) FROM reg.phase1_registry_drivers) AS driver_id,
              (SELECT MAX(policy_id) FROM reg.phase1_registry_policies) AS policy_id,
              (SELECT MAX(policy_id) FROM reg.phase1_registry_policies) AS preexpiry_policy_id,
              (SELECT MAX(contract_id) FROM reg.phase1_registry_contracts) AS preexpiry_contract_id`,
    );
    const row = result.rows[0];
    this.extendedExpirySqlSupported = Boolean(
      row &&
        ("preexpiry_policy_id" in row || "preexpiry_contract_id" in row),
    );
    return {
      driverId: row?.driver_id ?? null,
      policyId: row?.policy_id ?? null,
      preexpiryPolicyId: row?.preexpiry_policy_id ?? null,
      preexpiryContractId: row?.preexpiry_contract_id ?? null,
    };
  }

  /** Future sources and already-recorded reminder sources, in the same bounded
   * keyset interval. The locked source is re-evaluated by the real producer. */
  async scanPreexpiryDrivers(
    asOf: string,
    limit: number,
    range: { afterId?: string; throughId?: string },
  ): Promise<DriverRegistryRecord[]> {
    const cutoff = new Date(Date.parse(asOf) + 30 * 86400000).toISOString();
    const result = await this.databaseService!.query<{
      record: DriverRegistryRecord;
    }>(
      `/* preexpiry-source */ SELECT d.record FROM reg.phase1_registry_drivers d
       WHERE (
         ((d.record->>'licenseExpiry')::timestamptz > $1 AND (d.record->>'licenseExpiry')::timestamptz <= $5)
         OR ((d.record->>'professionalDriverLicenseExpiry')::timestamptz > $1 AND (d.record->>'professionalDriverLicenseExpiry')::timestamptz <= $5)
         OR ((d.record->>'taxiDriverRegistrationExpiry')::timestamptz > $1 AND (d.record->>'taxiDriverRegistrationExpiry')::timestamptz <= $5)
         OR EXISTS (SELECT 1 FROM reg.phase1_registry_expiry_events e WHERE e.entity_type='driver'
           AND e.entity_id=d.driver_id AND e.credential_type LIKE 'preexpiry:%'
           AND e.status IN ('pending','leased','completed'))
       ) AND ($3::varchar IS NULL OR d.driver_id > $3::varchar)
         AND ($4::varchar IS NULL OR d.driver_id <= $4::varchar)
       ORDER BY d.driver_id ASC LIMIT $2`,
      [asOf, limit, range.afterId ?? null, range.throughId ?? null, cutoff],
    );
    return result.rows.map((r) => r.record);
  }

  async scanPreexpiryPolicies(
    asOf: string,
    limit: number,
    range: { afterId?: string; throughId?: string },
  ): Promise<InsurancePolicyRecord[]> {
    const cutoff = new Date(Date.parse(asOf) + 30 * 86400000).toISOString();
    const result = await this.databaseService!.query<{
      record: InsurancePolicyRecord;
    }>(
      `/* preexpiry-policy-source */ SELECT p.record FROM reg.phase1_registry_policies p
       WHERE (
         (COALESCE(p.record->>'status', p.status) <> 'cancelled'
          AND (p.record->>'endAt')::timestamptz > $1
          AND (p.record->>'endAt')::timestamptz <= $5)
         OR EXISTS (SELECT 1 FROM reg.phase1_registry_expiry_events e WHERE e.entity_type='policy'
           AND e.entity_id=p.policy_id AND e.credential_type LIKE 'preexpiry:insurance_policy:%'
           AND e.status IN ('pending','leased','completed'))
       ) AND ($3::varchar IS NULL OR p.policy_id > $3::varchar)
         AND ($4::varchar IS NULL OR p.policy_id <= $4::varchar)
       ORDER BY p.policy_id ASC LIMIT $2`,
      [asOf, limit, range.afterId ?? null, range.throughId ?? null, cutoff],
    );
    return result.rows.map((r) => r.record);
  }

  async scanPreexpiryContracts(
    asOf: string,
    limit: number,
    range: { afterId?: string; throughId?: string },
  ): Promise<VehicleContractRecord[]> {
    const cutoff = new Date(Date.parse(asOf) + 30 * 86400000).toISOString();
    const result = await this.databaseService!.query<{
      record: VehicleContractRecord;
    }>(
      `/* preexpiry-contract-source */ SELECT c.record FROM reg.phase1_registry_contracts c
       WHERE (
         (COALESCE(c.record->>'status', c.status) <> 'terminated'
          AND (c.record->>'endAt')::timestamptz > $1
          AND (c.record->>'endAt')::timestamptz <= $5)
         OR EXISTS (SELECT 1 FROM reg.phase1_registry_expiry_events e WHERE e.entity_type='policy'
           AND e.entity_id=c.contract_id AND e.credential_type LIKE 'preexpiry:vehicle_contract:%'
           AND e.status IN ('pending','leased','completed'))
       ) AND ($3::varchar IS NULL OR c.contract_id > $3::varchar)
         AND ($4::varchar IS NULL OR c.contract_id <= $4::varchar)
       ORDER BY c.contract_id ASC LIMIT $2`,
      [asOf, limit, range.afterId ?? null, range.throughId ?? null, cutoff],
    );
    return result.rows.map((r) => r.record);
  }

  async scanExpiredDrivers(
    asOf: Date | string,
    limit: number = 100,
    client?: PoolClient,
    range?: { afterId?: string | undefined; throughId?: string | undefined },
  ): Promise<DriverRegistryRecord[]> {
    const asOfIso =
      asOf instanceof Date ? asOf.toISOString() : new Date(asOf).toISOString();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: DriverRegistryRecord }>(
        `
          SELECT d.record
          FROM reg.phase1_registry_drivers d
          LEFT JOIN reg.driver_reg_profiles dp ON d.driver_id = dp.driver_id
          WHERE ((d.record->>'licenseExpiry' IS NOT NULL AND (d.record->>'licenseExpiry')::timestamptz <= $1)
             OR (d.record->>'professionalDriverLicenseExpiry' IS NOT NULL AND (d.record->>'professionalDriverLicenseExpiry')::timestamptz <= $1)
             OR (d.record->>'taxiDriverRegistrationExpiry' IS NOT NULL AND (d.record->>'taxiDriverRegistrationExpiry')::timestamptz <= $1)
             OR (dp.training_status = 'expired'))
            AND ($3::varchar IS NULL OR d.driver_id > $3::varchar)
            AND ($4::varchar IS NULL OR d.driver_id <= $4::varchar)
          ORDER BY d.driver_id ASC
          LIMIT $2
        `,
        [asOfIso, limit, range?.afterId ?? null, range?.throughId ?? null],
      );
      return result.rows.map((r) => r.record);
    }
    return [];
  }

  async scanExpiredPolicies(
    asOf: Date | string,
    limit: number = 100,
    client?: PoolClient,
    range?: { afterId?: string | undefined; throughId?: string | undefined },
  ): Promise<InsurancePolicyRecord[]> {
    const asOfIso =
      asOf instanceof Date ? asOf.toISOString() : new Date(asOf).toISOString();
    if (this.isEnabled()) {
      const executor = this.getExpiryExecutor(client);
      const result = await executor.query<{ record: InsurancePolicyRecord }>(
        `
          SELECT record
          FROM reg.phase1_registry_policies
          WHERE status != 'cancelled'
            AND (record->>'startAt' IS NULL OR (record->>'startAt')::timestamptz <= $1)
            AND (record->>'endAt' IS NOT NULL AND (record->>'endAt')::timestamptz < $1)
            AND ($3::varchar IS NULL OR policy_id > $3::varchar)
            AND ($4::varchar IS NULL OR policy_id <= $4::varchar)
          ORDER BY policy_id ASC
          LIMIT $2
        `,
        [asOfIso, limit, range?.afterId ?? null, range?.throughId ?? null],
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

    const existing = Array.from(this.inMemoryExpiryEvents.values()).find(
      (event) => event.source_fingerprint === params.sourceFingerprint,
    );
    if (existing) return existing;

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
          WHERE event_id = ANY($1::uuid[]) AND delivery_status <> 'superseded'
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
        if (intent.event_id === id && intent.delivery_status !== "superseded") {
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
          if (
            intent.event_id === evt.event_id &&
            intent.delivery_status !== "superseded"
          ) {
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
      await this.supersedeExpiryEvents(
        toSupersede,
        supersededByEventId,
        client,
      );
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
          SET status = $1::varchar,
              updated_at = now()
          WHERE event_id = $2::uuid
            AND (status <> 'superseded' OR $1::varchar = 'superseded')
        `,
        [status, eventId],
      );
      return;
    }
    const evt = this.inMemoryExpiryEvents.get(eventId);
    if (evt && (evt.status !== "superseded" || status === "superseded")) {
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

    const existing = Array.from(this.inMemoryDeliveryIntents.values()).find(
      (intent) => intent.idempotency_key === params.idempotencyKey,
    );
    if (existing) return existing;

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
      const result = await this.getExpiryExecutor(
        client,
      ).query<RegistryExpiryDeliveryIntentRow>(
        `UPDATE reg.phase1_registry_expiry_delivery_intents AS intent
         SET delivery_status = CASE WHEN intent.delivery_status = 'superseded' OR EXISTS (
               SELECT 1 FROM reg.phase1_registry_expiry_events event
               WHERE event.event_id = intent.event_id AND event.status = 'superseded'
             ) THEN 'superseded' ELSE $1::varchar END,
             outbox_delivery_id = COALESCE(intent.outbox_delivery_id, $2::text),
             last_error = CASE WHEN $5::boolean THEN $3::text ELSE intent.last_error END,
             enqueued_at = CASE WHEN $1::varchar = 'enqueued' THEN COALESCE(intent.enqueued_at, now()) ELSE intent.enqueued_at END,
             updated_at = now()
         WHERE intent.intent_id = $4::uuid
           AND ($2::text IS NULL OR intent.outbox_delivery_id IS NULL OR intent.outbox_delivery_id = $2::text)
         RETURNING *`,
        [
          params.deliveryStatus,
          params.outboxDeliveryId ?? null,
          params.lastError ?? null,
          params.intentId,
          params.lastError !== undefined,
        ],
      );
      if (!result.rows[0] && params.outboxDeliveryId)
        throw new Error("registry_expiry_receipt_link_conflict");
      return result.rows[0] ?? null;
    }
    const intent = this.inMemoryDeliveryIntents.get(params.intentId);
    if (!intent) return null;
    if (
      params.outboxDeliveryId &&
      intent.outbox_delivery_id &&
      params.outboxDeliveryId !== intent.outbox_delivery_id
    )
      throw new Error("registry_expiry_receipt_link_conflict");
    const event = this.inMemoryExpiryEvents.get(intent.event_id);
    intent.delivery_status =
      intent.delivery_status === "superseded" || event?.status === "superseded"
        ? "superseded"
        : params.deliveryStatus;
    intent.outbox_delivery_id ??= params.outboxDeliveryId ?? null;
    if (params.lastError !== undefined) intent.last_error = params.lastError;
    if (params.deliveryStatus === "enqueued")
      intent.enqueued_at ??= new Date().toISOString();
    intent.updated_at = new Date().toISOString();
    return intent;
  }

  /** Link actual acceptance/error facts with the same source-before-event lock
   * order as renewal. Supersession is terminal; receipts are retained either way. */
  async recordExpiryDeliveryOutcome(
    intent: RegistryExpiryDeliveryIntentRow,
    update: Omit<UpdateDeliveryIntentParams, "intentId">,
    asOfMs: number = Date.now(),
  ): Promise<RegistryExpiryDeliveryIntentRow | null> {
    return this.withTransaction(async (client) => {
      const snapshot = await this.getExpiryEventById(intent.event_id, client);
      if (!snapshot) return null;
      const sourceExpiryMs =
        snapshot.source_expiry_at instanceof Date
          ? snapshot.source_expiry_at.getTime()
          : Date.parse(snapshot.source_expiry_at ?? "");
      let current: RegistryExpiryEventWithIntent | null = snapshot;
      if (this.isEnabled()) {
        let changed = false;
        const preexpiry = parsePreexpiryRecordFamily(snapshot.credential_type);
        if (snapshot.entity_type === "driver") {
          const source = await this.lockDriver(snapshot.entity_id, client);
          const reminder = parsePreexpiryCredentialFamily(
            snapshot.credential_type,
          );
          const field =
            reminder?.field ??
            (
              {
                driver_license: "licenseExpiry",
                professional_driver_license: "professionalDriverLicenseExpiry",
                taxi_driver_registration: "taxiDriverRegistrationExpiry",
              } as const
            )[
              snapshot.credential_type as
                | "driver_license"
                | "professional_driver_license"
                | "taxi_driver_registration"
            ];
          if (field)
            changed =
              !source ||
              Date.parse(source[field] ?? "") !== sourceExpiryMs ||
              (reminder !== null &&
                (source.lifecycleStatus !== "active" ||
                  sourceExpiryMs <= asOfMs));
        } else if (
          snapshot.credential_type === "vehicle_contract" ||
          preexpiry?.credential === "vehicle_contract"
        ) {
          const source = await this.lockContract(snapshot.entity_id, client);
          changed =
            !source ||
            source.status === "terminated" ||
            Date.parse(source.endAt) !== sourceExpiryMs ||
            (preexpiry !== null &&
              (source.status !== "active" || sourceExpiryMs <= asOfMs));
        } else {
          const source = await this.lockPolicy(snapshot.entity_id, client);
          changed =
            !source ||
            source.status === "cancelled" ||
            Date.parse(source.endAt) !== sourceExpiryMs ||
            (preexpiry !== null &&
              (source.status !== "active" || sourceExpiryMs <= asOfMs));
        }
        await client.query(
          "SELECT event_id FROM reg.phase1_registry_expiry_events WHERE event_id = $1::uuid FOR UPDATE",
          [intent.event_id],
        );
        current = await this.getExpiryEventById(intent.event_id, client);
        if (changed && current?.status !== "superseded")
          await this.supersedeExpiryEvents(
            [intent.event_id],
            undefined,
            client,
          );
      }
      const result = await this.updateDeliveryIntent(
        { ...update, intentId: intent.intent_id },
        client,
      );
      if (update.deliveryStatus === "enqueued") {
        const siblingIntents = current?.intents ?? [];
        const allSiblingsDone = siblingIntents.every(
          (i) =>
            i.intent_id === intent.intent_id ||
            i.delivery_status === "enqueued" ||
            i.delivery_status === "sent" ||
            i.delivery_status === "superseded",
        );
        if (allSiblingsDone) {
          await this.updateExpiryEventStatus(
            intent.event_id,
            "completed",
            client,
          );
        }
      }
      return result;
    });
  }

  async listExpiryEvents(
    filter?:
      | {
          scope?: string | undefined;
          entityType?: ExpiryEntityType | undefined;
          status?: ExpiryEventStatus | undefined;
          limit?: number | undefined;
        }
      | undefined,
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
      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
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

      const grouped = new Map<string, RegistryExpiryEventWithIntent>();
      for (const row of result.rows as any[]) {
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

        const existing = grouped.get(eventFields.event_id);
        if (!existing) {
          grouped.set(eventFields.event_id, {
            ...eventFields,
            intent,
            intents: intent ? [intent] : [],
          });
        } else if (intent) {
          existing.intents ??= [];
          if (!existing.intents.some((i) => i.intent_id === intent.intent_id)) {
            existing.intents.push(intent);
          }
          existing.intent ??= intent;
        }
      }

      return Array.from(grouped.values());
    }

    const events = Array.from(this.inMemoryExpiryEvents.values()).filter(
      (e) => {
        if (filter?.scope && e.scope !== filter.scope) return false;
        if (filter?.entityType && e.entity_type !== filter.entityType)
          return false;
        if (filter?.status && e.status !== filter.status) return false;
        return true;
      },
    );

    return events.slice(0, filter?.limit ?? 100).map((e) => {
      const intents = Array.from(this.inMemoryDeliveryIntents.values()).filter(
        (i) => i.event_id === e.event_id,
      );
      return { ...e, intent: intents[0] ?? null, intents };
    });
  }

  async listDeliveryIntents(
    filter?:
      | {
          tenantId?: string | undefined;
          deliveryStatus?: DeliveryIntentStatus | undefined;
          limit?: number | undefined;
        }
      | undefined,
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
      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
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
        if (
          filter?.deliveryStatus &&
          i.delivery_status !== filter.deliveryStatus
        )
          return false;
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
        `,
        [eventId],
      );
      if (result.rows.length === 0) return null;
      let eventBase: Omit<RegistryExpiryEventWithIntent, "intent" | "intents"> | null = null;
      const intents: RegistryExpiryDeliveryIntentRow[] = [];
      for (const row of result.rows) {
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
        eventBase ??= eventFields;
        if (intent_id && !intents.some((i) => i.intent_id === intent_id)) {
          intents.push({
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
          });
        }
      }

      if (!eventBase) return null;
      return {
        ...eventBase,
        intent: intents[0] ?? null,
        intents,
      };
    }

    const e = this.inMemoryExpiryEvents.get(eventId);
    if (!e) return null;
    const intents = Array.from(this.inMemoryDeliveryIntents.values()).filter(
      (i) => i.event_id === e.event_id,
    );
    return { ...e, intent: intents[0] ?? null, intents };
  }
}
