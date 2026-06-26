import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import type {
  TeslaPublicTelemetrySample,
  TeslaVehicleStateSnapshot,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

export type TeslaTelemetryFeedKind = "vehicle_state" | "public_telemetry";

export type TeslaProviderHealthState =
  | "healthy"
  | "delayed"
  | "gap_detected"
  | "backfill"
  | "complete"
  | "incomplete_hold"
  | "regulator_data_incident";

export interface TeslaTelemetryBackfillQuery {
  backfillId: string;
  providerCode: string;
  feedKind: TeslaTelemetryFeedKind;
  vin: string;
  from: string;
  to: string;
  sessionId: string | null;
  eventId: string | null;
  sequenceAfter: number | null;
  pageToken: string | null;
  status: "pending" | "requested" | "complete" | "incomplete";
  detectedAt: string;
  updatedAt: string;
}

export interface TeslaTelemetryHealthRecord {
  providerCode: string;
  feedKind: TeslaTelemetryFeedKind;
  externalVehicleRef: string;
  sessionId: string | null;
  healthState: TeslaProviderHealthState;
  qualityScore: number;
  dispatchHold: boolean;
  latestEventId: string | null;
  latestSequenceNo: number | null;
  latestContiguousSequenceNo: number | null;
  missingSequences: number[];
  lastCapturedAt: string | null;
  lastReceivedAt: string | null;
  staleHeartbeatAt: string | null;
  gapDetectedAt: string | null;
  backfillRequestedAt: string | null;
  completedAt: string | null;
  issueCodes: string[];
  evaluatedAt: string;
}

export type TeslaTelemetryEventStatus =
  | "accepted"
  | "duplicate"
  | "quarantined";

export interface TeslaTelemetryEventRecord {
  telemetryEventId: string;
  providerCode: string;
  feedKind: TeslaTelemetryFeedKind;
  vehicleId: string | null;
  externalVehicleRef: string;
  sessionId: string | null;
  providerEventId: string;
  sequenceNo: number;
  capturedAt: string;
  sourceSchemaVersion: string;
  payloadSha256: string;
  payloadBody: Record<string, unknown>;
  receivedAt: string;
  ingestStatus: TeslaTelemetryEventStatus;
  quarantineReason: string | null;
}

type EventRow = {
  telemetry_event_id: string;
  provider_code: string;
  feed_kind: TeslaTelemetryFeedKind;
  vehicle_id: string | null;
  external_vehicle_ref: string;
  session_id: string | null;
  provider_event_id: string;
  sequence_no: number | string;
  captured_at: Date | string;
  source_schema_version: string;
  payload_sha256: string;
  payload_body: Record<string, unknown>;
  received_at: Date | string;
  ingest_status: TeslaTelemetryEventStatus;
  quarantine_reason: string | null;
};

type QueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

type PgErrorWithCode = Error & {
  code?: string;
};

@Injectable()
export class TeslaTelemetryRepository {
  private readonly events = new Map<string, TeslaTelemetryEventRecord>();
  private readonly healthRecords = new Map<string, TeslaTelemetryHealthRecord>();
  private readonly backfillQueries = new Map<
    string,
    TeslaTelemetryBackfillQuery
  >();
  private readonly vehicleStateSnapshots = new Map<
    string,
    TeslaVehicleStateSnapshot
  >();
  private readonly publicTelemetrySamples = new Map<
    string,
    TeslaPublicTelemetrySample
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async withTransaction<T>(
    work: (executor?: QueryExecutor) => Promise<T>,
  ): Promise<T> {
    if (!this.isEnabled()) {
      return work(undefined);
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

  async findEventByProviderRef(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    providerEventId: string,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryEventRecord | null> {
    if (!this.isEnabled()) {
      return (
        [...this.events.values()].find(
          (event) =>
            event.providerCode === providerCode &&
            event.feedKind === feedKind &&
            event.providerEventId === providerEventId,
        ) ?? null
      );
    }

    const result = await (executor ?? this.databaseService!).query<EventRow>(
      `
        SELECT
          telemetry_event_id,
          provider_code,
          feed_kind,
          vehicle_id,
          external_vehicle_ref,
          session_id,
          provider_event_id,
          sequence_no,
          captured_at,
          source_schema_version,
          payload_sha256,
          payload_body,
          received_at,
          ingest_status,
          quarantine_reason
        FROM av_sandbox.tesla_provider_telemetry_events
        WHERE provider_code = $1
          AND feed_kind = $2
          AND provider_event_id = $3
        LIMIT 1
      `,
      [providerCode, feedKind, providerEventId],
    );

    return result.rows[0] ? this.mapEventRow(result.rows[0]) : null;
  }

  async findEventBySequence(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    externalVehicleRef: string,
    sessionId: string | null,
    sequenceNo: number,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryEventRecord | null> {
    if (!this.isEnabled()) {
      return (
        [...this.events.values()].find(
          (event) =>
            event.providerCode === providerCode &&
            event.feedKind === feedKind &&
            event.externalVehicleRef === externalVehicleRef &&
            (event.sessionId ?? null) === (sessionId ?? null) &&
            event.sequenceNo === sequenceNo,
        ) ?? null
      );
    }

    const result = await (executor ?? this.databaseService!).query<EventRow>(
      `
        SELECT
          telemetry_event_id,
          provider_code,
          feed_kind,
          vehicle_id,
          external_vehicle_ref,
          session_id,
          provider_event_id,
          sequence_no,
          captured_at,
          source_schema_version,
          payload_sha256,
          payload_body,
          received_at,
          ingest_status,
          quarantine_reason
        FROM av_sandbox.tesla_provider_telemetry_events
        WHERE provider_code = $1
          AND feed_kind = $2
          AND external_vehicle_ref = $3
          AND COALESCE(session_id, '') = COALESCE($4, '')
          AND sequence_no = $5
        LIMIT 1
      `,
      [providerCode, feedKind, externalVehicleRef, sessionId, sequenceNo],
    );

    return result.rows[0] ? this.mapEventRow(result.rows[0]) : null;
  }

  async createEvent(
    input: Omit<TeslaTelemetryEventRecord, "telemetryEventId">,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryEventRecord> {
    const record: TeslaTelemetryEventRecord = {
      telemetryEventId: randomUUID(),
      ...input,
      payloadBody: structuredClone(input.payloadBody),
    };

    if (!this.isEnabled()) {
      this.events.set(record.telemetryEventId, record);
      return this.cloneEvent(record);
    }

    const result = await (executor ?? this.databaseService!).query<EventRow>(
      `
        INSERT INTO av_sandbox.tesla_provider_telemetry_events (
          telemetry_event_id,
          provider_code,
          feed_kind,
          vehicle_id,
          external_vehicle_ref,
          session_id,
          provider_event_id,
          sequence_no,
          captured_at,
          source_schema_version,
          payload_sha256,
          payload_body,
          received_at,
          ingest_status,
          quarantine_reason
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12::jsonb, $13, $14, $15
        )
        RETURNING
          telemetry_event_id,
          provider_code,
          feed_kind,
          vehicle_id,
          external_vehicle_ref,
          session_id,
          provider_event_id,
          sequence_no,
          captured_at,
          source_schema_version,
          payload_sha256,
          payload_body,
          received_at,
          ingest_status,
          quarantine_reason
      `,
      [
        record.telemetryEventId,
        record.providerCode,
        record.feedKind,
        record.vehicleId,
        record.externalVehicleRef,
        this.toDatabaseSessionId(record.sessionId),
        record.providerEventId,
        record.sequenceNo,
        record.capturedAt,
        record.sourceSchemaVersion,
        record.payloadSha256,
        JSON.stringify(record.payloadBody),
        record.receivedAt,
        record.ingestStatus,
        record.quarantineReason,
      ],
    );

    return this.mapEventRow(result.rows[0]!);
  }

  async createEventIfAbsent(
    input: Omit<TeslaTelemetryEventRecord, "telemetryEventId">,
    executor?: QueryExecutor,
  ): Promise<{
    eventRecord: TeslaTelemetryEventRecord;
    inserted: boolean;
  }> {
    if (!this.isEnabled()) {
      const existingByProviderRef = await this.findEventByProviderRef(
        input.providerCode,
        input.feedKind,
        input.providerEventId,
        executor,
      );
      if (existingByProviderRef) {
        return { eventRecord: existingByProviderRef, inserted: false };
      }

      const existingBySequence = await this.findEventBySequence(
        input.providerCode,
        input.feedKind,
        input.externalVehicleRef,
        input.sessionId,
        input.sequenceNo,
        executor,
      );
      if (existingBySequence) {
        return { eventRecord: existingBySequence, inserted: false };
      }

      return {
        eventRecord: await this.createEvent(input, executor),
        inserted: true,
      };
    }

    try {
      return {
        eventRecord: await this.createEvent(input, executor),
        inserted: true,
      };
    } catch (error) {
      if ((error as PgErrorWithCode).code !== "23505") {
        throw error;
      }

      const existingByProviderRef = await this.findEventByProviderRef(
        input.providerCode,
        input.feedKind,
        input.providerEventId,
        executor,
      );
      if (existingByProviderRef) {
        return { eventRecord: existingByProviderRef, inserted: false };
      }

      const existingBySequence = await this.findEventBySequence(
        input.providerCode,
        input.feedKind,
        input.externalVehicleRef,
        input.sessionId,
        input.sequenceNo,
        executor,
      );
      if (!existingBySequence) {
        throw error;
      }

      return { eventRecord: existingBySequence, inserted: false };
    }
  }

  async saveVehicleStateSnapshot(
    snapshot: TeslaVehicleStateSnapshot,
    executor?: QueryExecutor,
  ) {
    this.vehicleStateSnapshots.set(snapshot.snapshotId, {
      ...snapshot,
      location: snapshot.location ? { ...snapshot.location } : null,
      source: { ...snapshot.source },
    });

    if (!this.isEnabled()) {
      return;
    }

    await (executor ?? this.databaseService!).query(
      `
        INSERT INTO av_sandbox.tesla_vehicle_state_snapshots (
          snapshot_id,
          vehicle_id,
          external_vehicle_ref,
          captured_at,
          location_lat,
          location_lng,
          speed_mps,
          heading_deg,
          shift_state,
          autonomy_state,
          battery_level_pct,
          battery_range_km,
          charging,
          online,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (snapshot_id) DO NOTHING
      `,
      [
        snapshot.snapshotId,
        snapshot.vehicleId,
        snapshot.externalVehicleRef,
        snapshot.capturedAt,
        snapshot.location?.lat ?? null,
        snapshot.location?.lng ?? null,
        snapshot.speedMps,
        snapshot.headingDeg,
        snapshot.shiftState,
        snapshot.autonomyState,
        snapshot.batteryLevelPct,
        snapshot.batteryRangeKm,
        snapshot.charging,
        snapshot.online,
        snapshot.source.sourceSystem,
        snapshot.source.sourceRef,
        snapshot.source.ingestedAt,
        snapshot.source.recordedAt,
        snapshot.source.signatureRef,
        snapshot.source.schemaVersion,
      ],
    );
  }

  async hasVehicleStateSnapshotForSourceRef(
    sourceRef: string,
    executor?: QueryExecutor,
  ) {
    if (!this.isEnabled()) {
      return [...this.vehicleStateSnapshots.values()].some(
        (snapshot) => snapshot.source.sourceRef === sourceRef,
      );
    }

    const result = await (executor ?? this.databaseService!).query(
      `
        SELECT 1
        FROM av_sandbox.tesla_vehicle_state_snapshots
        WHERE source_ref = $1
        LIMIT 1
      `,
      [sourceRef],
    );

    return result.rows.length > 0;
  }

  async savePublicTelemetrySample(
    sample: TeslaPublicTelemetrySample,
    executor?: QueryExecutor,
  ) {
    this.publicTelemetrySamples.set(sample.sampleId, {
      ...sample,
      location: sample.location ? { ...sample.location } : null,
      source: { ...sample.source },
    });

    if (!this.isEnabled()) {
      return;
    }

    await (executor ?? this.databaseService!).query(
      `
        INSERT INTO av_sandbox.tesla_public_telemetry_samples (
          sample_id,
          external_vehicle_ref,
          captured_at,
          location_lat,
          location_lng,
          battery_level_pct,
          online,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (sample_id) DO NOTHING
      `,
      [
        sample.sampleId,
        sample.externalVehicleRef,
        sample.capturedAt,
        sample.location?.lat ?? null,
        sample.location?.lng ?? null,
        sample.batteryLevelPct,
        sample.online,
        sample.source.sourceSystem,
        sample.source.sourceRef,
        sample.source.ingestedAt,
        sample.source.recordedAt,
        sample.source.signatureRef,
        sample.source.schemaVersion,
      ],
    );
  }

  async hasPublicTelemetrySampleForSourceRef(
    sourceRef: string,
    executor?: QueryExecutor,
  ) {
    if (!this.isEnabled()) {
      return [...this.publicTelemetrySamples.values()].some(
        (sample) => sample.source.sourceRef === sourceRef,
      );
    }

    const result = await (executor ?? this.databaseService!).query(
      `
        SELECT 1
        FROM av_sandbox.tesla_public_telemetry_samples
        WHERE source_ref = $1
        LIMIT 1
      `,
      [sourceRef],
    );

    return result.rows.length > 0;
  }

  async upsertHealthRecord(
    record: TeslaTelemetryHealthRecord,
    executor?: QueryExecutor,
  ) {
    this.healthRecords.set(this.healthKey(record), this.cloneHealth(record));

    if (!this.isEnabled()) {
      return;
    }

    await (executor ?? this.databaseService!).query(
      `
        INSERT INTO av_sandbox.tesla_provider_health (
          provider_code,
          feed_kind,
          external_vehicle_ref,
          session_id,
          health_state,
          quality_score,
          dispatch_hold,
          latest_event_id,
          latest_sequence_no,
          latest_contiguous_sequence_no,
          missing_sequences,
          last_captured_at,
          last_received_at,
          stale_heartbeat_at,
          gap_detected_at,
          backfill_requested_at,
          completed_at,
          issue_codes,
          evaluated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11::jsonb, $12, $13, $14, $15, $16, $17, $18::text[], $19
        )
        ON CONFLICT (provider_code, feed_kind, external_vehicle_ref, session_id)
        DO UPDATE SET
          health_state = EXCLUDED.health_state,
          quality_score = EXCLUDED.quality_score,
          dispatch_hold = EXCLUDED.dispatch_hold,
          latest_event_id = EXCLUDED.latest_event_id,
          latest_sequence_no = EXCLUDED.latest_sequence_no,
          latest_contiguous_sequence_no = EXCLUDED.latest_contiguous_sequence_no,
          missing_sequences = EXCLUDED.missing_sequences,
          last_captured_at = EXCLUDED.last_captured_at,
          last_received_at = EXCLUDED.last_received_at,
          stale_heartbeat_at = EXCLUDED.stale_heartbeat_at,
          gap_detected_at = EXCLUDED.gap_detected_at,
          backfill_requested_at = EXCLUDED.backfill_requested_at,
          completed_at = EXCLUDED.completed_at,
          issue_codes = EXCLUDED.issue_codes,
          evaluated_at = EXCLUDED.evaluated_at
      `,
      [
        record.providerCode,
        record.feedKind,
        record.externalVehicleRef,
        record.sessionId ?? "",
        record.healthState,
        record.qualityScore,
        record.dispatchHold,
        record.latestEventId,
        record.latestSequenceNo,
        record.latestContiguousSequenceNo,
        JSON.stringify(record.missingSequences),
        record.lastCapturedAt,
        record.lastReceivedAt,
        record.staleHeartbeatAt,
        record.gapDetectedAt,
        record.backfillRequestedAt,
        record.completedAt,
        record.issueCodes,
        record.evaluatedAt,
      ],
    );
  }

  async upsertBackfillQuery(
    record: TeslaTelemetryBackfillQuery,
    executor?: QueryExecutor,
  ) {
    this.backfillQueries.set(record.backfillId, { ...record });

    if (!this.isEnabled()) {
      return;
    }

    await (executor ?? this.databaseService!).query(
      `
        INSERT INTO av_sandbox.tesla_provider_backfill_requests (
          backfill_id,
          provider_code,
          feed_kind,
          vin,
          from_at,
          to_at,
          session_id,
          event_id,
          sequence_after,
          page_token,
          status,
          detected_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (backfill_id)
        DO UPDATE SET
          to_at = EXCLUDED.to_at,
          event_id = EXCLUDED.event_id,
          sequence_after = EXCLUDED.sequence_after,
          page_token = EXCLUDED.page_token,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
      `,
      [
        record.backfillId,
        record.providerCode,
        record.feedKind,
        record.vin,
        record.from,
        record.to,
        record.sessionId,
        record.eventId,
        record.sequenceAfter,
        record.pageToken,
        record.status,
        record.detectedAt,
        record.updatedAt,
      ],
    );
  }

  async findHealthRecord(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    externalVehicleRef: string,
    sessionId: string | null,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryHealthRecord | null> {
    if (!this.isEnabled()) {
      return (
        this.healthRecords.get(
          this.healthKey({
            providerCode,
            feedKind,
            externalVehicleRef,
            sessionId,
          }),
        ) ?? null
      );
    }

    const result = await (executor ?? this.databaseService!).query<{
      provider_code: string;
      feed_kind: TeslaTelemetryFeedKind;
      external_vehicle_ref: string;
      session_id: string | null;
      health_state: TeslaProviderHealthState;
      quality_score: number | string;
      dispatch_hold: boolean;
      latest_event_id: string | null;
      latest_sequence_no: number | string | null;
      latest_contiguous_sequence_no: number | string | null;
      missing_sequences: number[] | string;
      last_captured_at: Date | string | null;
      last_received_at: Date | string | null;
      stale_heartbeat_at: Date | string | null;
      gap_detected_at: Date | string | null;
      backfill_requested_at: Date | string | null;
      completed_at: Date | string | null;
      issue_codes: string[] | null;
      evaluated_at: Date | string;
    }>(
      `
        SELECT
          provider_code,
          feed_kind,
          external_vehicle_ref,
          session_id,
          health_state,
          quality_score,
          dispatch_hold,
          latest_event_id,
          latest_sequence_no,
          latest_contiguous_sequence_no,
          missing_sequences,
          last_captured_at,
          last_received_at,
          stale_heartbeat_at,
          gap_detected_at,
          backfill_requested_at,
          completed_at,
          issue_codes,
          evaluated_at
        FROM av_sandbox.tesla_provider_health
        WHERE provider_code = $1
          AND feed_kind = $2
          AND external_vehicle_ref = $3
          AND session_id = $4
        LIMIT 1
      `,
      [providerCode, feedKind, externalVehicleRef, this.toDatabaseSessionId(sessionId)],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      providerCode: row.provider_code,
      feedKind: row.feed_kind,
      externalVehicleRef: row.external_vehicle_ref,
      sessionId: this.fromDatabaseSessionId(row.session_id),
      healthState: row.health_state,
      qualityScore: Number(row.quality_score),
      dispatchHold: row.dispatch_hold,
      latestEventId: row.latest_event_id,
      latestSequenceNo:
        row.latest_sequence_no === null ? null : Number(row.latest_sequence_no),
      latestContiguousSequenceNo:
        row.latest_contiguous_sequence_no === null
          ? null
          : Number(row.latest_contiguous_sequence_no),
      missingSequences: Array.isArray(row.missing_sequences)
        ? row.missing_sequences.map((value) => Number(value))
        : JSON.parse(row.missing_sequences).map((value: number) => Number(value)),
      lastCapturedAt: row.last_captured_at
        ? new Date(row.last_captured_at).toISOString()
        : null,
      lastReceivedAt: row.last_received_at
        ? new Date(row.last_received_at).toISOString()
        : null,
      staleHeartbeatAt: row.stale_heartbeat_at
        ? new Date(row.stale_heartbeat_at).toISOString()
        : null,
      gapDetectedAt: row.gap_detected_at
        ? new Date(row.gap_detected_at).toISOString()
        : null,
      backfillRequestedAt: row.backfill_requested_at
        ? new Date(row.backfill_requested_at).toISOString()
        : null,
      completedAt: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
      issueCodes: [...(row.issue_codes ?? [])],
      evaluatedAt: new Date(row.evaluated_at).toISOString(),
    };
  }

  async listEventsForTracker(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    externalVehicleRef: string,
    sessionId: string | null,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryEventRecord[]> {
    if (!this.isEnabled()) {
      return this.listEvents({
        feedKind,
        externalVehicleRef,
        sessionId,
      }).filter((event) => event.providerCode === providerCode);
    }

    const result = await (executor ?? this.databaseService!).query<EventRow>(
      `
        SELECT
          telemetry_event_id,
          provider_code,
          feed_kind,
          vehicle_id,
          external_vehicle_ref,
          session_id,
          provider_event_id,
          sequence_no,
          captured_at,
          source_schema_version,
          payload_sha256,
          payload_body,
          received_at,
          ingest_status,
          quarantine_reason
        FROM av_sandbox.tesla_provider_telemetry_events
        WHERE provider_code = $1
          AND feed_kind = $2
          AND external_vehicle_ref = $3
          AND COALESCE(session_id, '') = COALESCE($4, '')
        ORDER BY sequence_no ASC, received_at ASC
      `,
      [providerCode, feedKind, externalVehicleRef, sessionId],
    );

    return result.rows.map((row) => this.mapEventRow(row));
  }

  async findLatestBackfillQuery(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    vin: string,
    sessionId: string | null,
    executor?: QueryExecutor,
  ): Promise<TeslaTelemetryBackfillQuery | null> {
    if (!this.isEnabled()) {
      const records = this.listBackfillQueries()
        .filter(
          (record) =>
            record.providerCode === providerCode &&
            record.feedKind === feedKind &&
            record.vin === vin &&
            (record.sessionId ?? null) === (sessionId ?? null),
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        );
      return records[0] ?? null;
    }

    const result = await (executor ?? this.databaseService!).query<{
      backfill_id: string;
      provider_code: string;
      feed_kind: TeslaTelemetryFeedKind;
      vin: string;
      from_at: Date | string;
      to_at: Date | string;
      session_id: string | null;
      event_id: string | null;
      sequence_after: number | string | null;
      page_token: string | null;
      status: TeslaTelemetryBackfillQuery["status"];
      detected_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        SELECT
          backfill_id,
          provider_code,
          feed_kind,
          vin,
          from_at,
          to_at,
          session_id,
          event_id,
          sequence_after,
          page_token,
          status,
          detected_at,
          updated_at
        FROM av_sandbox.tesla_provider_backfill_requests
        WHERE provider_code = $1
          AND feed_kind = $2
          AND vin = $3
          AND COALESCE(session_id, '') = COALESCE($4, '')
        ORDER BY updated_at DESC, detected_at DESC
        LIMIT 1
      `,
      [providerCode, feedKind, vin, sessionId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      backfillId: row.backfill_id,
      providerCode: row.provider_code,
      feedKind: row.feed_kind,
      vin: row.vin,
      from: new Date(row.from_at).toISOString(),
      to: new Date(row.to_at).toISOString(),
      sessionId: this.fromDatabaseSessionId(row.session_id),
      eventId: row.event_id,
      sequenceAfter:
        row.sequence_after === null ? null : Number(row.sequence_after),
      pageToken: row.page_token,
      status: row.status,
      detectedAt: new Date(row.detected_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  listEvents(filter?: {
    feedKind?: TeslaTelemetryFeedKind;
    externalVehicleRef?: string;
    sessionId?: string | null;
  }) {
    return [...this.events.values()]
      .filter((event) =>
        filter?.feedKind ? event.feedKind === filter.feedKind : true,
      )
      .filter((event) =>
        filter?.externalVehicleRef
          ? event.externalVehicleRef === filter.externalVehicleRef
          : true,
      )
      .filter((event) =>
        filter && "sessionId" in filter
          ? (event.sessionId ?? null) === (filter.sessionId ?? null)
          : true,
      )
      .map((event) => this.cloneEvent(event))
      .sort((left, right) => left.sequenceNo - right.sequenceNo);
  }

  listHealthRecords() {
    return [...this.healthRecords.values()].map((record) =>
      this.cloneHealth(record),
    );
  }

  listBackfillQueries() {
    return [...this.backfillQueries.values()].map((record) => ({ ...record }));
  }

  private healthKey(record: {
    providerCode: string;
    feedKind: TeslaTelemetryFeedKind;
    externalVehicleRef: string;
    sessionId: string | null;
  }) {
    return [
      record.providerCode,
      record.feedKind,
      record.externalVehicleRef,
      record.sessionId ?? "",
    ].join(":");
  }

  private cloneEvent(
    record: TeslaTelemetryEventRecord,
  ): TeslaTelemetryEventRecord {
    return {
      ...record,
      payloadBody: structuredClone(record.payloadBody),
    };
  }

  private cloneHealth(
    record: TeslaTelemetryHealthRecord,
  ): TeslaTelemetryHealthRecord {
    return {
      ...record,
      missingSequences: [...record.missingSequences],
      issueCodes: [...record.issueCodes],
    };
  }

  private mapEventRow(row: EventRow): TeslaTelemetryEventRecord {
    return {
      telemetryEventId: row.telemetry_event_id,
      providerCode: row.provider_code,
      feedKind: row.feed_kind,
      vehicleId: row.vehicle_id,
      externalVehicleRef: row.external_vehicle_ref,
      sessionId: this.fromDatabaseSessionId(row.session_id),
      providerEventId: row.provider_event_id,
      sequenceNo: Number(row.sequence_no),
      capturedAt: new Date(row.captured_at).toISOString(),
      sourceSchemaVersion: row.source_schema_version,
      payloadSha256: row.payload_sha256,
      payloadBody: structuredClone(row.payload_body),
      receivedAt: new Date(row.received_at).toISOString(),
      ingestStatus: row.ingest_status,
      quarantineReason: row.quarantine_reason,
    };
  }

  private toDatabaseSessionId(sessionId: string | null) {
    return sessionId ?? "";
  }

  private fromDatabaseSessionId(sessionId: string | null) {
    return sessionId && sessionId.length > 0 ? sessionId : null;
  }
}
