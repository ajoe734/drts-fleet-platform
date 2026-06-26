import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type {
  Phase2SourceMetadata,
  TeslaDisengagementCause,
  TeslaRegulatoryEvent,
  TeslaRegulatoryEventType,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

export type TeslaRegulatoryRawNormalizationStatus =
  | "pending"
  | "accepted"
  | "quarantined";

type TeslaRegulatoryEventsQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export interface TeslaRegulatoryRawEventRecord {
  rawEventId: string;
  providerCode: string;
  providerIdentity: string;
  providerEventId: string;
  schemaVersion: string;
  payloadSha256: string;
  payloadBody: string;
  payloadBytes: number;
  rawHeaders: string[];
  jwsProtectedHeader: Record<string, unknown>;
  jwsSignature: string;
  jwsKid: string;
  jwsAlg: string;
  jwsIssuedAt: string;
  mtlsClientCert: string;
  mtlsFingerprint: string | null;
  receivedAt: string;
  occurredAt: string;
  normalizationStatus: TeslaRegulatoryRawNormalizationStatus;
  canonicalEventId: string | null;
}

export interface TeslaRegulatoryCanonicalEventRecord extends TeslaRegulatoryEvent {
  providerCode: string;
  providerEventId: string;
  payloadSha256: string;
  rawEventId: string | null;
  ingestStatus: "accepted";
}

export interface CreateTeslaRegulatoryRawEventInput extends Omit<
  TeslaRegulatoryRawEventRecord,
  "rawEventId"
> {}

export interface CreateTeslaRegulatoryCanonicalEventInput {
  providerCode: string;
  providerEventId: string;
  payloadSha256: string;
  rawEventId: string | null;
  vehicleId: string;
  externalVehicleRef: string | null;
  eventType: TeslaRegulatoryEventType;
  occurredAt: string;
  location: TeslaRegulatoryEvent["location"];
  speedMps: number | null;
  headingDeg: number | null;
  disengagementCause: TeslaDisengagementCause | null;
  providerReasonCode: string | null;
  safetyOperatorId: string | null;
  rocOperatorId: string | null;
  oddZoneId: string | null;
  source: Phase2SourceMetadata;
}

type RawEventRow = {
  raw_event_id: string;
  provider_code: string;
  provider_identity: string;
  provider_event_id: string;
  schema_version: string;
  payload_sha256: string;
  payload_body: string;
  payload_bytes: number | string;
  raw_headers: string[];
  jws_protected_header: Record<string, unknown>;
  jws_signature: string;
  jws_kid: string;
  jws_alg: string;
  jws_issued_at: Date | string;
  mtls_client_cert: string;
  mtls_fingerprint: string | null;
  received_at: Date | string;
  occurred_at: Date | string;
  normalization_status: TeslaRegulatoryRawNormalizationStatus;
  canonical_event_id: string | null;
};

type CanonicalEventRow = {
  event_id: string;
  vehicle_id: string;
  external_vehicle_ref: string | null;
  event_type: TeslaRegulatoryEventType;
  occurred_at: Date | string;
  location_lat: number | string | null;
  location_lng: number | string | null;
  speed_mps: number | string | null;
  heading_deg: number | string | null;
  disengagement_cause: TeslaDisengagementCause | null;
  provider_reason_code: string | null;
  safety_operator_id: string | null;
  roc_operator_id: string | null;
  odd_zone_id: string | null;
  source_system: Phase2SourceMetadata["sourceSystem"];
  source_ref: string | null;
  source_ingested_at: Date | string;
  source_recorded_at: Date | string | null;
  source_signature_ref: string | null;
  source_schema_version: string;
  provider_code: string | null;
  provider_event_id: string | null;
  payload_sha256: string | null;
  raw_event_id: string | null;
  ingest_status: "accepted" | null;
};

@Injectable()
export class TeslaRegulatoryEventsRepository {
  private readonly rawEvents = new Map<string, TeslaRegulatoryRawEventRecord>();

  private readonly canonicalEvents = new Map<
    string,
    TeslaRegulatoryCanonicalEventRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async withTransaction<T>(
    work: (executor: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
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

  async findRawEventByProviderRef(
    providerCode: string,
    providerEventId: string,
    executor?: TeslaRegulatoryEventsQueryExecutor,
    options?: { forUpdate?: boolean },
  ): Promise<TeslaRegulatoryRawEventRecord | null> {
    if (!this.isEnabled()) {
      return (
        this.rawEvents.get(this.rawEventKey(providerCode, providerEventId)) ??
        null
      );
    }

    const result = await (executor ?? this.databaseService!).query<RawEventRow>(
      `
        SELECT
          raw_event_id,
          provider_code,
          provider_identity,
          provider_event_id,
          schema_version,
          payload_sha256,
          payload_body,
          payload_bytes,
          raw_headers,
          jws_protected_header,
          jws_signature,
          jws_kid,
          jws_alg,
          jws_issued_at,
          mtls_client_cert,
          mtls_fingerprint,
          received_at,
          occurred_at,
          normalization_status,
          canonical_event_id
        FROM av_sandbox.tesla_regulatory_raw_events
        WHERE provider_code = $1
          AND provider_event_id = $2
        LIMIT 1
        ${options?.forUpdate ? "FOR UPDATE" : ""}
      `,
      [providerCode, providerEventId],
    );

    return result.rows[0] ? this.mapRawEventRow(result.rows[0]) : null;
  }

  async createRawEvent(
    input: CreateTeslaRegulatoryRawEventInput,
    executor?: TeslaRegulatoryEventsQueryExecutor,
  ): Promise<TeslaRegulatoryRawEventRecord> {
    const rawEvent: TeslaRegulatoryRawEventRecord = {
      rawEventId: randomUUID(),
      ...input,
    };

    if (!this.isEnabled()) {
      this.rawEvents.set(
        this.rawEventKey(rawEvent.providerCode, rawEvent.providerEventId),
        rawEvent,
      );
      return { ...rawEvent };
    }

    const result = await (executor ?? this.databaseService!).query<RawEventRow>(
      `
        INSERT INTO av_sandbox.tesla_regulatory_raw_events (
          raw_event_id,
          provider_code,
          provider_identity,
          provider_event_id,
          schema_version,
          payload_sha256,
          payload_body,
          payload_bytes,
          raw_headers,
          jws_protected_header,
          jws_signature,
          jws_kid,
          jws_alg,
          jws_issued_at,
          mtls_client_cert,
          mtls_fingerprint,
          received_at,
          occurred_at,
          normalization_status,
          canonical_event_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::jsonb, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20
        )
        RETURNING
          raw_event_id,
          provider_code,
          provider_identity,
          provider_event_id,
          schema_version,
          payload_sha256,
          payload_body,
          payload_bytes,
          raw_headers,
          jws_protected_header,
          jws_signature,
          jws_kid,
          jws_alg,
          jws_issued_at,
          mtls_client_cert,
          mtls_fingerprint,
          received_at,
          occurred_at,
          normalization_status,
          canonical_event_id
      `,
      [
        rawEvent.rawEventId,
        rawEvent.providerCode,
        rawEvent.providerIdentity,
        rawEvent.providerEventId,
        rawEvent.schemaVersion,
        rawEvent.payloadSha256,
        rawEvent.payloadBody,
        rawEvent.payloadBytes,
        rawEvent.rawHeaders,
        JSON.stringify(rawEvent.jwsProtectedHeader),
        rawEvent.jwsSignature,
        rawEvent.jwsKid,
        rawEvent.jwsAlg,
        rawEvent.jwsIssuedAt,
        rawEvent.mtlsClientCert,
        rawEvent.mtlsFingerprint,
        rawEvent.receivedAt,
        rawEvent.occurredAt,
        rawEvent.normalizationStatus,
        rawEvent.canonicalEventId,
      ],
    );

    return this.mapRawEventRow(result.rows[0]!);
  }

  async attachCanonicalEvent(
    rawEventId: string,
    canonicalEventId: string,
    executor?: TeslaRegulatoryEventsQueryExecutor,
  ): Promise<TeslaRegulatoryRawEventRecord | null> {
    if (!this.isEnabled()) {
      const entry = [...this.rawEvents.values()].find(
        (item) => item.rawEventId === rawEventId,
      );
      if (!entry) {
        return null;
      }
      entry.canonicalEventId = canonicalEventId;
      entry.normalizationStatus = "accepted";
      return { ...entry };
    }

    const result = await (executor ?? this.databaseService!).query<RawEventRow>(
      `
        UPDATE av_sandbox.tesla_regulatory_raw_events
        SET canonical_event_id = $2,
            normalization_status = 'accepted'
        WHERE raw_event_id = $1
        RETURNING
          raw_event_id,
          provider_code,
          provider_identity,
          provider_event_id,
          schema_version,
          payload_sha256,
          payload_body,
          payload_bytes,
          raw_headers,
          jws_protected_header,
          jws_signature,
          jws_kid,
          jws_alg,
          jws_issued_at,
          mtls_client_cert,
          mtls_fingerprint,
          received_at,
          occurred_at,
          normalization_status,
          canonical_event_id
      `,
      [rawEventId, canonicalEventId],
    );

    return result.rows[0] ? this.mapRawEventRow(result.rows[0]) : null;
  }

  async createCanonicalEvent(
    input: CreateTeslaRegulatoryCanonicalEventInput,
    executor?: TeslaRegulatoryEventsQueryExecutor,
  ): Promise<TeslaRegulatoryCanonicalEventRecord> {
    const canonicalEvent: TeslaRegulatoryCanonicalEventRecord = {
      eventId: randomUUID(),
      vehicleId: input.vehicleId,
      externalVehicleRef: input.externalVehicleRef,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      location: input.location ? { ...input.location } : null,
      speedMps: input.speedMps,
      headingDeg: input.headingDeg,
      disengagementCause: input.disengagementCause,
      providerReasonCode: input.providerReasonCode,
      safetyOperatorId: input.safetyOperatorId,
      rocOperatorId: input.rocOperatorId,
      oddZoneId: input.oddZoneId,
      source: {
        ...input.source,
      },
      providerCode: input.providerCode,
      providerEventId: input.providerEventId,
      payloadSha256: input.payloadSha256,
      rawEventId: input.rawEventId,
      ingestStatus: "accepted",
    };

    if (!this.isEnabled()) {
      this.canonicalEvents.set(canonicalEvent.eventId, canonicalEvent);
      return {
        ...canonicalEvent,
        location: canonicalEvent.location
          ? { ...canonicalEvent.location }
          : null,
        source: { ...canonicalEvent.source },
      };
    }

    const result = await (executor ?? this.databaseService!).query<CanonicalEventRow>(
      `
        INSERT INTO av_sandbox.tesla_regulatory_events (
          event_id,
          vehicle_id,
          external_vehicle_ref,
          event_type,
          occurred_at,
          location_lat,
          location_lng,
          speed_mps,
          heading_deg,
          disengagement_cause,
          provider_reason_code,
          safety_operator_id,
          roc_operator_id,
          odd_zone_id,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version,
          provider_code,
          provider_event_id,
          payload_sha256,
          raw_event_id,
          ingest_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
        RETURNING
          event_id,
          vehicle_id,
          external_vehicle_ref,
          event_type,
          occurred_at,
          location_lat,
          location_lng,
          speed_mps,
          heading_deg,
          disengagement_cause,
          provider_reason_code,
          safety_operator_id,
          roc_operator_id,
          odd_zone_id,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version,
          provider_code,
          provider_event_id,
          payload_sha256,
          raw_event_id,
          ingest_status
      `,
      [
        canonicalEvent.eventId,
        canonicalEvent.vehicleId,
        canonicalEvent.externalVehicleRef,
        canonicalEvent.eventType,
        canonicalEvent.occurredAt,
        canonicalEvent.location?.lat ?? null,
        canonicalEvent.location?.lng ?? null,
        canonicalEvent.speedMps,
        canonicalEvent.headingDeg,
        canonicalEvent.disengagementCause,
        canonicalEvent.providerReasonCode,
        canonicalEvent.safetyOperatorId,
        canonicalEvent.rocOperatorId,
        canonicalEvent.oddZoneId,
        canonicalEvent.source.sourceSystem,
        canonicalEvent.source.sourceRef,
        canonicalEvent.source.ingestedAt,
        canonicalEvent.source.recordedAt,
        canonicalEvent.source.signatureRef,
        canonicalEvent.source.schemaVersion,
        canonicalEvent.providerCode,
        canonicalEvent.providerEventId,
        canonicalEvent.payloadSha256,
        canonicalEvent.rawEventId,
        canonicalEvent.ingestStatus,
      ],
    );

    return this.mapCanonicalEventRow(result.rows[0]!);
  }

  async findCanonicalEventByProviderRef(
    providerCode: string,
    providerEventId: string,
    executor?: TeslaRegulatoryEventsQueryExecutor,
  ): Promise<TeslaRegulatoryCanonicalEventRecord | null> {
    if (!this.isEnabled()) {
      return (
        [...this.canonicalEvents.values()].find(
          (item) =>
            item.providerCode === providerCode &&
            item.providerEventId === providerEventId,
        ) ?? null
      );
    }

    const result = await (executor ?? this.databaseService!).query<CanonicalEventRow>(
      `
        SELECT
          event_id,
          vehicle_id,
          external_vehicle_ref,
          event_type,
          occurred_at,
          location_lat,
          location_lng,
          speed_mps,
          heading_deg,
          disengagement_cause,
          provider_reason_code,
          safety_operator_id,
          roc_operator_id,
          odd_zone_id,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version,
          provider_code,
          provider_event_id,
          payload_sha256,
          raw_event_id,
          ingest_status
        FROM av_sandbox.tesla_regulatory_events
        WHERE provider_code = $1
          AND provider_event_id = $2
        LIMIT 1
      `,
      [providerCode, providerEventId],
    );

    return result.rows[0] ? this.mapCanonicalEventRow(result.rows[0]) : null;
  }

  listRawEvents() {
    return [...this.rawEvents.values()].map((item) => ({ ...item }));
  }

  listCanonicalEvents() {
    return [...this.canonicalEvents.values()].map((item) => ({
      ...item,
      location: item.location ? { ...item.location } : null,
      source: { ...item.source },
    }));
  }

  private rawEventKey(providerCode: string, providerEventId: string) {
    return `${providerCode}:${providerEventId}`;
  }

  private mapRawEventRow(row: RawEventRow): TeslaRegulatoryRawEventRecord {
    return {
      rawEventId: row.raw_event_id,
      providerCode: row.provider_code,
      providerIdentity: row.provider_identity,
      providerEventId: row.provider_event_id,
      schemaVersion: row.schema_version,
      payloadSha256: row.payload_sha256,
      payloadBody: row.payload_body,
      payloadBytes: Number(row.payload_bytes),
      rawHeaders: [...row.raw_headers],
      jwsProtectedHeader: structuredClone(row.jws_protected_header),
      jwsSignature: row.jws_signature,
      jwsKid: row.jws_kid,
      jwsAlg: row.jws_alg,
      jwsIssuedAt: new Date(row.jws_issued_at).toISOString(),
      mtlsClientCert: row.mtls_client_cert,
      mtlsFingerprint: row.mtls_fingerprint,
      receivedAt: new Date(row.received_at).toISOString(),
      occurredAt: new Date(row.occurred_at).toISOString(),
      normalizationStatus: row.normalization_status,
      canonicalEventId: row.canonical_event_id,
    };
  }

  private mapCanonicalEventRow(
    row: CanonicalEventRow,
  ): TeslaRegulatoryCanonicalEventRecord {
    return {
      eventId: row.event_id,
      vehicleId: row.vehicle_id,
      externalVehicleRef: row.external_vehicle_ref,
      eventType: row.event_type,
      occurredAt: new Date(row.occurred_at).toISOString(),
      location:
        row.location_lat === null || row.location_lng === null
          ? null
          : {
              lat: Number(row.location_lat),
              lng: Number(row.location_lng),
            },
      speedMps:
        row.speed_mps === null
          ? null
          : Number.parseFloat(String(row.speed_mps)),
      headingDeg:
        row.heading_deg === null
          ? null
          : Number.parseFloat(String(row.heading_deg)),
      disengagementCause: row.disengagement_cause,
      providerReasonCode: row.provider_reason_code,
      safetyOperatorId: row.safety_operator_id,
      rocOperatorId: row.roc_operator_id,
      oddZoneId: row.odd_zone_id,
      source: {
        sourceSystem: row.source_system,
        sourceRef: row.source_ref,
        ingestedAt: new Date(row.source_ingested_at).toISOString(),
        recordedAt: row.source_recorded_at
          ? new Date(row.source_recorded_at).toISOString()
          : null,
        signatureRef: row.source_signature_ref,
        schemaVersion: row.source_schema_version,
      },
      providerCode: row.provider_code ?? "tesla",
      providerEventId: row.provider_event_id ?? row.event_id,
      payloadSha256: row.payload_sha256 ?? "",
      rawEventId: row.raw_event_id,
      ingestStatus: row.ingest_status ?? "accepted",
    };
  }
}
