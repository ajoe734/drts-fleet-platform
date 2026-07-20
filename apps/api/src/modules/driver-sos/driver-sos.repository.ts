import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import type {
  DriverSosEventRecord,
  DriverSosTimelineEntry,
  DriverSosUrgentAlertOutboxRecord,
  IncidentRecord,
  IncidentTimelineEntry,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type DriverSosQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

type DriverSosEventRow = {
  sos_event_id: string;
  client_event_id: string;
  event_no: string;
  incident_id: string | null;
  driver_id: string;
  vehicle_id: string | null;
  plate_no: string | null;
  order_id: string | null;
  task_id: string | null;
  status: DriverSosEventRecord["status"];
  event_type: DriverSosEventRecord["eventType"];
  severity: DriverSosEventRecord["severity"];
  description: string | null;
  location_snapshot: unknown;
  original_triggered_at: Date | string;
  server_received_at: Date | string | null;
  offline_at_trigger: boolean;
  false_alarm_snapshot: unknown;
  duty_ack_snapshot: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type DriverSosTimelineRow = {
  timeline_id: string;
  sos_event_id: string;
  event_type: DriverSosTimelineEntry["eventType"];
  actor_type: DriverSosTimelineEntry["actorType"];
  actor_id: string | null;
  occurred_at: Date | string;
  recorded_at: Date | string;
  payload: unknown;
};

type DriverSosUrgentAlertOutboxRow = {
  outbox_id: string;
  sos_event_id: string;
  incident_id: string;
  driver_id: string;
  event_no: string;
  status: DriverSosUrgentAlertOutboxRecord["status"];
  attempt_count: number;
  next_attempt_at: Date | string;
  payload: unknown;
  created_at: Date | string;
  delivered_at: Date | string | null;
};

type JsonRecordRow = {
  record: unknown;
};

export interface DriverSosRepositoryState {
  events: DriverSosEventRecord[];
  timelines: DriverSosTimelineEntry[];
  urgentAlertOutbox: DriverSosUrgentAlertOutboxRecord[];
}

export interface PersistDriverSosSubmission {
  event: DriverSosEventRecord;
  sosTimelines: readonly DriverSosTimelineEntry[];
  urgentAlertOutbox: DriverSosUrgentAlertOutboxRecord;
  incident: IncidentRecord;
  incidentTimelines: readonly IncidentTimelineEntry[];
}

export interface PersistDriverSosSubmissionResult
  extends PersistDriverSosSubmission {
  duplicate: boolean;
}

@Injectable()
export class DriverSosRepository {
  private readonly logger = new Logger(DriverSosRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<DriverSosRepositoryState> {
    if (!this.isEnabled()) {
      return {
        events: [],
        timelines: [],
        urgentAlertOutbox: [],
      };
    }

    const [eventsResult, timelinesResult, outboxResult] = await Promise.all([
      this.databaseService!.query<DriverSosEventRow>(
        `
          SELECT
            sos_event_id,
            client_event_id,
            event_no,
            incident_id,
            driver_id,
            vehicle_id,
            plate_no,
            order_id,
            task_id,
            status,
            event_type,
            severity,
            description,
            location_snapshot,
            original_triggered_at,
            server_received_at,
            offline_at_trigger,
            false_alarm_snapshot,
            duty_ack_snapshot,
            created_at,
            updated_at
          FROM safety.driver_sos_events
          ORDER BY created_at DESC
        `,
      ),
      this.databaseService!.query<DriverSosTimelineRow>(
        `
          SELECT
            timeline_id,
            sos_event_id,
            event_type,
            actor_type,
            actor_id,
            occurred_at,
            recorded_at,
            payload
          FROM safety.driver_sos_timeline
          ORDER BY occurred_at ASC, recorded_at ASC
        `,
      ),
      this.databaseService!.query<DriverSosUrgentAlertOutboxRow>(
        `
          SELECT
            outbox_id,
            sos_event_id,
            incident_id,
            driver_id,
            event_no,
            status,
            attempt_count,
            next_attempt_at,
            payload,
            created_at,
            delivered_at
          FROM safety.driver_sos_urgent_alert_outbox
          ORDER BY created_at DESC
        `,
      ),
    ]);

    return {
      events: eventsResult.rows.map((row) => this.mapEventRow(row)),
      timelines: timelinesResult.rows.map((row) => this.mapTimelineRow(row)),
      urgentAlertOutbox: outboxResult.rows.map((row) => this.mapOutboxRow(row)),
    };
  }

  async persistSubmission(
    submission: PersistDriverSosSubmission,
  ): Promise<PersistDriverSosSubmissionResult> {
    if (!this.isEnabled()) {
      return {
        ...submission,
        duplicate: false,
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const existing = await this.loadExistingSubmission(
        client as unknown as DriverSosQueryExecutor,
        submission.event.driverId,
        submission.event.clientEventId,
      );
      if (existing) {
        await client.query("COMMIT");
        return existing;
      }

      await this.persistIncidentBundle(
        client as unknown as DriverSosQueryExecutor,
        submission,
      );
      await this.persistDriverSosBundle(
        client as unknown as DriverSosQueryExecutor,
        submission,
      );

      await client.query("COMMIT");
      return {
        ...submission,
        duplicate: false,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Driver SOS rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }

      if (this.isUniqueViolation(error)) {
        const existing = await this.loadExistingSubmission(
          this.databaseService! as unknown as DriverSosQueryExecutor,
          submission.event.driverId,
          submission.event.clientEventId,
        );
        if (existing) {
          return existing;
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Driver SOS persistence skipped during ${context}: ${detail}`);
  }

  private async persistIncidentBundle(
    executor: DriverSosQueryExecutor,
    submission: PersistDriverSosSubmission,
  ) {
    const { incident } = submission;
    const closedAt =
      incident.status === "resolved" || incident.status === "closed"
        ? incident.updatedAt
        : null;

    await executor.query(
      `
        INSERT INTO ops.phase1_incidents (
          incident_id,
          incident_no,
          status,
          severity,
          category,
          reported_by,
          related_order_id,
          related_vehicle_id,
          related_complaint_no,
          assigned_to,
          description,
          created_at,
          updated_at,
          closed_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
        )
        ON CONFLICT (incident_id) DO UPDATE SET
          incident_no = EXCLUDED.incident_no,
          status = EXCLUDED.status,
          severity = EXCLUDED.severity,
          category = EXCLUDED.category,
          reported_by = EXCLUDED.reported_by,
          related_order_id = EXCLUDED.related_order_id,
          related_vehicle_id = EXCLUDED.related_vehicle_id,
          related_complaint_no = EXCLUDED.related_complaint_no,
          assigned_to = EXCLUDED.assigned_to,
          description = EXCLUDED.description,
          updated_at = EXCLUDED.updated_at,
          closed_at = EXCLUDED.closed_at,
          record = EXCLUDED.record
      `,
      [
        incident.incidentId,
        incident.incidentId,
        incident.status,
        incident.severity,
        incident.category,
        incident.reportedBy,
        incident.relatedOrderId,
        incident.relatedVehicleId,
        incident.relatedComplaintCaseNo,
        incident.assignedTo,
        incident.description,
        incident.createdAt,
        incident.updatedAt,
        closedAt,
        JSON.stringify(incident),
      ],
    );

    for (const timeline of submission.incidentTimelines) {
      await executor.query(
        `
          INSERT INTO ops.phase1_incident_timelines (
            entry_id,
            incident_id,
            action,
            note,
            actor_id,
            created_at,
            record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          ON CONFLICT (entry_id) DO UPDATE SET
            incident_id = EXCLUDED.incident_id,
            action = EXCLUDED.action,
            note = EXCLUDED.note,
            actor_id = EXCLUDED.actor_id,
            record = EXCLUDED.record
        `,
        [
          timeline.entryId,
          timeline.incidentId,
          timeline.action,
          timeline.note,
          timeline.actor,
          timeline.createdAt,
          JSON.stringify(timeline),
        ],
      );
    }

    const suppression = incident.matchingSuppression;
    if (suppression && incident.relatedDriverId) {
      await executor.query(
        `
          INSERT INTO ops.phase1_driver_matching_suppressions (
            source_incident_id,
            driver_id,
            active,
            reason_code,
            expires_at,
            lifted_at,
            updated_at,
            record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          ON CONFLICT (source_incident_id) DO UPDATE SET
            driver_id = EXCLUDED.driver_id,
            active = EXCLUDED.active,
            reason_code = EXCLUDED.reason_code,
            expires_at = EXCLUDED.expires_at,
            lifted_at = EXCLUDED.lifted_at,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
        `,
        [
          incident.incidentId,
          incident.relatedDriverId,
          suppression.active,
          suppression.reasonCode,
          suppression.expiresAt,
          suppression.liftedAt,
          incident.updatedAt,
          JSON.stringify(suppression),
        ],
      );
    }
  }

  private async persistDriverSosBundle(
    executor: DriverSosQueryExecutor,
    submission: PersistDriverSosSubmission,
  ) {
    const { event, urgentAlertOutbox } = submission;

    await executor.query(
      `
        INSERT INTO safety.driver_sos_events (
          sos_event_id,
          client_event_id,
          event_no,
          incident_id,
          driver_id,
          vehicle_id,
          plate_no,
          order_id,
          task_id,
          status,
          event_type,
          severity,
          description,
          location_snapshot,
          original_triggered_at,
          server_received_at,
          offline_at_trigger,
          false_alarm_snapshot,
          duty_ack_snapshot,
          created_at,
          updated_at
        ) VALUES (
          $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14::jsonb, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21
        )
      `,
      [
        event.sosEventId,
        event.clientEventId,
        event.eventNo,
        event.incidentId,
        event.driverId,
        event.vehicleId,
        event.plateNo,
        event.orderId,
        event.taskId,
        event.status,
        event.eventType,
        event.severity,
        event.description,
        JSON.stringify(event.location),
        event.originalTriggeredAt,
        event.serverReceivedAt,
        event.offlineAtTrigger,
        JSON.stringify(event.falseAlarm),
        JSON.stringify(event.dutyAcknowledgement),
        event.createdAt,
        event.updatedAt,
      ],
    );

    for (const timeline of submission.sosTimelines) {
      await executor.query(
        `
          INSERT INTO safety.driver_sos_timeline (
            timeline_id,
            sos_event_id,
            event_type,
            actor_type,
            actor_id,
            occurred_at,
            recorded_at,
            payload
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          timeline.timelineId,
          timeline.sosEventId,
          timeline.eventType,
          timeline.actorType,
          timeline.actorId,
          timeline.occurredAt,
          timeline.recordedAt,
          JSON.stringify(timeline.payload),
        ],
      );
    }

    await executor.query(
      `
        INSERT INTO safety.driver_sos_urgent_alert_outbox (
          outbox_id,
          sos_event_id,
          incident_id,
          driver_id,
          event_no,
          status,
          attempt_count,
          next_attempt_at,
          payload,
          created_at,
          delivered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
      `,
      [
        urgentAlertOutbox.outboxId,
        urgentAlertOutbox.sosEventId,
        urgentAlertOutbox.incidentId,
        urgentAlertOutbox.driverId,
        urgentAlertOutbox.eventNo,
        urgentAlertOutbox.status,
        urgentAlertOutbox.attemptCount,
        urgentAlertOutbox.nextAttemptAt,
        JSON.stringify(urgentAlertOutbox.payload),
        urgentAlertOutbox.createdAt,
        urgentAlertOutbox.deliveredAt,
      ],
    );
  }

  private async loadExistingSubmission(
    executor: DriverSosQueryExecutor,
    driverId: string,
    clientEventId: string,
  ): Promise<PersistDriverSosSubmissionResult | null> {
    const eventResult = await executor.query<DriverSosEventRow>(
      `
        SELECT
          sos_event_id,
          client_event_id,
          event_no,
          incident_id,
          driver_id,
          vehicle_id,
          plate_no,
          order_id,
          task_id,
          status,
          event_type,
          severity,
          description,
          location_snapshot,
          original_triggered_at,
          server_received_at,
          offline_at_trigger,
          false_alarm_snapshot,
          duty_ack_snapshot,
          created_at,
          updated_at
        FROM safety.driver_sos_events
        WHERE driver_id = $1
          AND client_event_id = $2::uuid
        LIMIT 1
      `,
      [driverId, clientEventId],
    );

    const eventRow = eventResult.rows[0];
    if (!eventRow) {
      return null;
    }

    const event = this.mapEventRow(eventRow);
    if (!event.incidentId) {
      throw new Error(
        `Persisted SOS event ${event.sosEventId} is missing incident correlation.`,
      );
    }

    const [timelinesResult, outboxResult, incidentResult, incidentTimelines] =
      await Promise.all([
        executor.query<DriverSosTimelineRow>(
          `
            SELECT
              timeline_id,
              sos_event_id,
              event_type,
              actor_type,
              actor_id,
              occurred_at,
              recorded_at,
              payload
            FROM safety.driver_sos_timeline
            WHERE sos_event_id = $1
            ORDER BY occurred_at ASC, recorded_at ASC
          `,
          [event.sosEventId],
        ),
        executor.query<DriverSosUrgentAlertOutboxRow>(
          `
            SELECT
              outbox_id,
              sos_event_id,
              incident_id,
              driver_id,
              event_no,
              status,
              attempt_count,
              next_attempt_at,
              payload,
              created_at,
              delivered_at
            FROM safety.driver_sos_urgent_alert_outbox
            WHERE sos_event_id = $1
            LIMIT 1
          `,
          [event.sosEventId],
        ),
        executor.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_incidents
            WHERE incident_id = $1
            LIMIT 1
          `,
          [event.incidentId],
        ),
        executor.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_incident_timelines
            WHERE incident_id = $1
            ORDER BY created_at ASC
          `,
          [event.incidentId],
        ),
      ]);

    const outboxRow = outboxResult.rows[0];
    const incidentRow = incidentResult.rows[0];
    if (!outboxRow || !incidentRow) {
      throw new Error(
        `Persisted SOS event ${event.sosEventId} is missing correlated records.`,
      );
    }

    return {
      duplicate: true,
      event,
      sosTimelines: timelinesResult.rows.map((row) => this.mapTimelineRow(row)),
      urgentAlertOutbox: this.mapOutboxRow(outboxRow),
      incident: this.parseRecord<IncidentRecord>(
        incidentRow.record,
        "ops.phase1_incidents.record",
      ),
      incidentTimelines: incidentTimelines.rows.map((row) =>
        this.parseRecord<IncidentTimelineEntry>(
          row.record,
          "ops.phase1_incident_timelines.record",
        ),
      ),
    };
  }

  private mapEventRow(row: DriverSosEventRow): DriverSosEventRecord {
    return {
      sosEventId: row.sos_event_id,
      clientEventId: row.client_event_id,
      eventNo: row.event_no,
      incidentId: row.incident_id,
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      plateNo: row.plate_no,
      orderId: row.order_id,
      taskId: row.task_id,
      status: row.status,
      eventType: row.event_type,
      severity: row.severity,
      description: row.description,
      location: this.parseNullableRecord<DriverSosEventRecord["location"]>(
        row.location_snapshot,
        "safety.driver_sos_events.location_snapshot",
      ),
      originalTriggeredAt: this.toIsoString(row.original_triggered_at),
      serverReceivedAt: row.server_received_at
        ? this.toIsoString(row.server_received_at)
        : null,
      offlineAtTrigger: row.offline_at_trigger,
      falseAlarm: this.parseRecord<DriverSosEventRecord["falseAlarm"]>(
        row.false_alarm_snapshot,
        "safety.driver_sos_events.false_alarm_snapshot",
      ),
      dutyAcknowledgement: this.parseRecord<
        DriverSosEventRecord["dutyAcknowledgement"]
      >(
        row.duty_ack_snapshot,
        "safety.driver_sos_events.duty_ack_snapshot",
      ),
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
  }

  private mapTimelineRow(row: DriverSosTimelineRow): DriverSosTimelineEntry {
    return {
      timelineId: row.timeline_id,
      sosEventId: row.sos_event_id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      occurredAt: this.toIsoString(row.occurred_at),
      recordedAt: this.toIsoString(row.recorded_at),
      payload: this.parseRecord<Record<string, unknown>>(
        row.payload,
        "safety.driver_sos_timeline.payload",
      ),
    };
  }

  private mapOutboxRow(
    row: DriverSosUrgentAlertOutboxRow,
  ): DriverSosUrgentAlertOutboxRecord {
    return {
      outboxId: row.outbox_id,
      sosEventId: row.sos_event_id,
      incidentId: row.incident_id,
      driverId: row.driver_id,
      eventNo: row.event_no,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: this.toIsoString(row.next_attempt_at),
      payload: this.parseRecord<Record<string, unknown>>(
        row.payload,
        "safety.driver_sos_urgent_alert_outbox.payload",
      ),
      createdAt: this.toIsoString(row.created_at),
      deliveredAt: row.delivered_at ? this.toIsoString(row.delivered_at) : null,
    };
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }

  private parseNullableRecord<T>(record: unknown, source: string): T | null {
    if (record === null) {
      return null;
    }
    return this.parseRecord<T>(record, source);
  }

  private toIsoString(value: Date | string) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as QueryResultRow & { code?: unknown }).code === "23505"
    );
  }
}
