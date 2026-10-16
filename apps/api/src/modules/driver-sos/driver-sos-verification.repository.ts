import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type {
  DriverSosAlertLatencySummary,
  DriverSosAlertRenderObservation,
  DriverSosAttachmentRecord,
  DriverSosAttachmentType,
  DriverSosEventRecord,
  DriverSosTimelineEntry,
  DriverSosUrgentAlertOutboxRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

export interface DriverSosUploadIntentRecord {
  objectKey: string;
  sosEventId: string;
  driverId: string;
  attachmentType: DriverSosAttachmentType;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  providerName: string;
  state: "active" | "confirmed" | "expired";
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}

export class DriverSosAttachmentLimitError extends Error {
  constructor(readonly sosEventId: string) {
    super(`Driver SOS event ${sosEventId} attachment limit reached.`);
    this.name = "DriverSosAttachmentLimitError";
  }
}

type UploadIntentRow = QueryResultRow & {
  object_key: string;
  sos_event_id: string;
  driver_id: string;
  attachment_type: DriverSosAttachmentType;
  original_file_name: string;
  content_type: string;
  file_size: number | string;
  provider_name: string;
  state: DriverSosUploadIntentRecord["state"];
  created_at: Date | string;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
};

type AttachmentRow = QueryResultRow & {
  attachment_id: string;
  sos_event_id: string;
  attachment_type: DriverSosAttachmentRecord["attachmentType"];
  object_key: string;
  original_file_name: string;
  content_type: string;
  file_size: number | string;
  checksum_sha256: string;
  scan_status: DriverSosAttachmentRecord["scanStatus"];
  scanner_provider: string | null;
  scan_reason: string | null;
  scan_attempt_count: number | string;
  last_scan_attempt_at: Date | string | null;
  uploaded_at: Date | string;
  scanned_at: Date | string | null;
  updated_at: Date | string;
};

type AlertObservationRow = QueryResultRow & {
  fleet_report_confirmed_at: Date | string;
  ops_alert_rendered_at: Date | string;
  ops_alert_receipt_recorded_at: Date | string;
  alert_to_ops_latency_ms: number | string;
};

type DutyAckRow = QueryResultRow & {
  duty_ack_snapshot: { acknowledgedByActorId: string; acknowledgedAt: string };
  status: DriverSosEventRecord["status"];
};

/**
 * Rank of the forward (non-false-alarm) S-3 progression, inlined as SQL so
 * the database itself -- not just the in-process cache -- can refuse to
 * move a `driver_sos_events.status` column backward across competing
 * writers/instances. Must stay in sync with
 * `DriverSosService.SOS_PROGRESS_RANK`.
 */
function sosStatusRankSql(expression: string): string {
  return `
    CASE ${expression}
      WHEN 'submitted' THEN 0
      WHEN 'duty_alerted' THEN 1
      WHEN 'acknowledged' THEN 2
      WHEN 'investigating' THEN 3
      WHEN 'resolved' THEN 4
      WHEN 'closed' THEN 5
      ELSE -1
    END
  `;
}

export interface DriverSosDutyAcknowledgementPersistResult {
  /** False when a different writer already won at the database layer. */
  accepted: boolean;
  acknowledgedByActorId: string;
  acknowledgedAt: string;
  /** The event's actual durable status after this write (never regressed). */
  status: DriverSosEventRecord["status"];
}

export interface DriverSosDutyAlertDispatchPlan {
  event: DriverSosEventRecord;
  timeline: DriverSosTimelineEntry;
}

type AlertLatencySummaryRow = QueryResultRow & {
  sample_count: number | string;
  within_target_count: number | string;
  p50_latency_ms: number | string | null;
  p95_latency_ms: number | string | null;
  max_latency_ms: number | string | null;
};

@Injectable()
export class DriverSosVerificationRepository {
  private readonly logger = new Logger(DriverSosVerificationRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async persistUploadIntent(intent: DriverSosUploadIntentRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO safety.driver_sos_attachment_upload_intents (
          object_key,
          sos_event_id,
          driver_id,
          attachment_type,
          original_file_name,
          content_type,
          file_size,
          provider_name,
          state,
          created_at,
          expires_at,
          confirmed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (object_key) DO UPDATE SET
          state = EXCLUDED.state,
          expires_at = EXCLUDED.expires_at,
          confirmed_at = EXCLUDED.confirmed_at
      `,
      [
        intent.objectKey,
        intent.sosEventId,
        intent.driverId,
        intent.attachmentType,
        intent.originalFileName,
        intent.contentType,
        intent.fileSize,
        intent.providerName,
        intent.state,
        intent.createdAt,
        intent.expiresAt,
        intent.confirmedAt,
      ],
    );
  }

  async findUploadIntent(
    objectKey: string,
  ): Promise<DriverSosUploadIntentRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<UploadIntentRow>(
      `
        SELECT
          object_key,
          sos_event_id,
          driver_id,
          attachment_type,
          original_file_name,
          content_type,
          file_size,
          provider_name,
          state,
          created_at,
          expires_at,
          confirmed_at
        FROM safety.driver_sos_attachment_upload_intents
        WHERE object_key = $1
        LIMIT 1
      `,
      [objectKey],
    );

    const row = result.rows[0];
    return row ? this.mapUploadIntent(row) : null;
  }

  async persistAttachmentConfirmation(
    intent: DriverSosUploadIntentRecord,
    attachment: DriverSosAttachmentRecord,
    timeline: DriverSosTimelineEntry,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        attachment.sosEventId,
      ]);
      const countResult = await client.query<
        QueryResultRow & { count: string }
      >(
        `
          SELECT count(*)::text AS count
          FROM safety.driver_sos_attachments
          WHERE sos_event_id = $1
            AND object_key <> $2
        `,
        [attachment.sosEventId, attachment.objectKey],
      );
      if (Number(countResult.rows[0]?.count ?? 0) >= 4) {
        throw new DriverSosAttachmentLimitError(attachment.sosEventId);
      }
      await this.upsertAttachmentWith(client, attachment);
      await this.appendTimelineWith(client, timeline);
      await client.query(
        `
          UPDATE safety.driver_sos_attachment_upload_intents
          SET state = 'confirmed',
              confirmed_at = $2
          WHERE object_key = $1
        `,
        [intent.objectKey, attachment.uploadedAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async persistAttachmentScanUpdate(
    attachment: DriverSosAttachmentRecord,
    timeline: DriverSosTimelineEntry,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await this.upsertAttachmentWith(client, attachment);
      await this.appendTimelineWith(client, timeline);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAttachments(
    sosEventId: string,
  ): Promise<DriverSosAttachmentRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<AttachmentRow>(
      `
        SELECT
          attachment_id,
          sos_event_id,
          attachment_type,
          object_key,
          original_file_name,
          content_type,
          file_size,
          checksum_sha256,
          scan_status,
          scanner_provider,
          scan_reason,
          scan_attempt_count,
          last_scan_attempt_at,
          uploaded_at,
          scanned_at,
          updated_at
        FROM safety.driver_sos_attachments
        WHERE sos_event_id = $1
        ORDER BY uploaded_at ASC, attachment_id ASC
      `,
      [sosEventId],
    );

    return result.rows.map((row) => this.mapAttachment(row));
  }

  async persistAlertObservation(
    outbox: DriverSosUrgentAlertOutboxRecord,
    timeline: DriverSosTimelineEntry,
    observation: DriverSosAlertRenderObservation,
    dutyAlert: DriverSosDutyAlertDispatchPlan | null = null,
  ): Promise<DriverSosAlertRenderObservation & { dutyAlertApplied: boolean }> {
    if (!this.isEnabled()) {
      return { ...observation, dutyAlertApplied: Boolean(dutyAlert) };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<AlertObservationRow>(
        `
          UPDATE safety.driver_sos_urgent_alert_outbox
          SET ops_alert_rendered_at = $2::timestamptz,
              ops_alert_receipt_recorded_at = $3::timestamptz,
              alert_to_ops_latency_ms = $4::bigint,
              payload = payload || $5::jsonb,
              status = CASE WHEN status = 'failed' THEN status ELSE 'delivered' END,
              delivered_at = COALESCE(delivered_at, $3::timestamptz)
          WHERE outbox_id = $1
            AND ops_alert_rendered_at IS NULL
          RETURNING
            fleet_report_confirmed_at,
            ops_alert_rendered_at,
            ops_alert_receipt_recorded_at,
            alert_to_ops_latency_ms
        `,
        [
          outbox.outboxId,
          observation.opsAlertRenderedAt,
          observation.opsAlertReceiptRecordedAt,
          observation.alertToOpsLatencyMs,
          JSON.stringify({
            fleetReportConfirmedAt: observation.fleetReportConfirmedAt,
            opsAlertRenderedAt: observation.opsAlertRenderedAt,
            opsAlertReceiptRecordedAt: observation.opsAlertReceiptRecordedAt,
            alertToOpsLatencyMs: observation.alertToOpsLatencyMs,
          }),
        ],
      );
      let row = updated.rows[0];
      let duplicate = false;
      let dutyAlertApplied = false;
      if (row) {
        await this.appendTimelineWith(client, timeline);
        if (dutyAlert) {
          const dutyAlertUpdate = await client.query(
            `
              UPDATE safety.driver_sos_events
              SET status = $2,
                  updated_at = $3
              WHERE sos_event_id = $1
                AND status = 'submitted'
            `,
            [
              dutyAlert.event.sosEventId,
              dutyAlert.event.status,
              dutyAlert.event.updatedAt,
            ],
          );
          if ((dutyAlertUpdate.rowCount ?? 0) > 0) {
            dutyAlertApplied = true;
            await this.appendTimelineWith(client, dutyAlert.timeline);
          }
        }
      } else {
        duplicate = true;
        const existing = await client.query<AlertObservationRow>(
          `
            SELECT
              fleet_report_confirmed_at,
              ops_alert_rendered_at,
              ops_alert_receipt_recorded_at,
              alert_to_ops_latency_ms
            FROM safety.driver_sos_urgent_alert_outbox
            WHERE outbox_id = $1
              AND ops_alert_rendered_at IS NOT NULL
            LIMIT 1
          `,
          [outbox.outboxId],
        );
        row = existing.rows[0];
      }
      if (!row) {
        throw new Error(
          `Driver SOS outbox ${outbox.outboxId} was not available for render receipt.`,
        );
      }
      await client.query("COMMIT");
      return {
        ...observation,
        fleetReportConfirmedAt: this.toIso(row.fleet_report_confirmed_at),
        opsAlertRenderedAt: this.toIso(row.ops_alert_rendered_at),
        opsAlertReceiptRecordedAt: this.toIso(
          row.ops_alert_receipt_recorded_at,
        ),
        alertToOpsLatencyMs: Number(row.alert_to_ops_latency_ms),
        duplicate,
        dutyAlertApplied,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Conditional first-writer-wins: the UPDATE only takes effect while no
   * acknowledgment has been recorded yet, so two overlapping writers (across
   * processes, not just in-process) cannot both commit a duty_acknowledged
   * timeline entry for the same event.
   *
   * The `status` column is only ever advanced, never regressed: a stale
   * caller computing `acknowledged` from an in-memory snapshot that
   * predates a concurrent writer's own authoritative progression (e.g. the
   * Incident module already durably advancing this event to
   * `investigating`) must not claw the durable status back down just
   * because it still legitimately wins the owner-null race (F2).
   */
  async persistDutyAcknowledgement(
    event: DriverSosEventRecord,
    timeline: DriverSosTimelineEntry,
  ): Promise<DriverSosDutyAcknowledgementPersistResult> {
    if (!this.isEnabled()) {
      return {
        accepted: true,
        acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
        acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
        status: event.status,
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<DutyAckRow>(
        `
          UPDATE safety.driver_sos_events
          SET status = CASE
                WHEN (${sosStatusRankSql("status")}) < (${sosStatusRankSql("$2::text")})
                THEN $2
                ELSE status
              END,
              duty_ack_snapshot = $3::jsonb,
              updated_at = $4
          WHERE sos_event_id = $1
            AND duty_ack_snapshot->>'acknowledgedByActorId' IS NULL
          RETURNING duty_ack_snapshot, status
        `,
        [
          event.sosEventId,
          event.status,
          JSON.stringify(event.dutyAcknowledgement),
          event.updatedAt,
        ],
      );
      let row = claimed.rows[0];
      const accepted = Boolean(row);
      if (accepted) {
        await this.appendTimelineWith(client, timeline);
        await client.query(
          `
            UPDATE safety.driver_sos_urgent_alert_outbox
            SET status = 'delivered',
                delivered_at = COALESCE(delivered_at, $2)
            WHERE sos_event_id = $1
              AND status <> 'failed'
          `,
          [event.sosEventId, event.updatedAt],
        );
      } else {
        const existing = await client.query<DutyAckRow>(
          `
            SELECT duty_ack_snapshot, status
            FROM safety.driver_sos_events
            WHERE sos_event_id = $1
          `,
          [event.sosEventId],
        );
        row = existing.rows[0];
      }
      if (!row) {
        throw new Error(
          `Driver SOS event ${event.sosEventId} was not available for duty acknowledgment.`,
        );
      }
      await client.query("COMMIT");
      return {
        accepted,
        acknowledgedByActorId: row.duty_ack_snapshot.acknowledgedByActorId,
        acknowledgedAt: row.duty_ack_snapshot.acknowledgedAt,
        status: row.status,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reconciles the Incident module's own status progression (investigating /
   * resolved / closed) onto the correlated DriverSosEvent + timeline. The
   * caller (service layer) only determines a transition is new from its own
   * in-memory/just-reloaded snapshot, which a second, independent instance
   * can also be computing concurrently from an equally stale snapshot --
   * the UPDATE itself is the real arbiter: it only takes effect while the
   * durable row is still behind the target rank, so two instances can never
   * both append the same forward transition's timeline entries, and a
   * delayed lower-rank write can never overwrite an already-further-along
   * row (F2 progression). Returns whether this call's transition actually
   * won; the caller must not apply the transition to its own in-memory
   * state (or append its timeline entries a second time) when it did not.
   */
  async persistStatusTransition(
    event: DriverSosEventRecord,
    timelineEntries: DriverSosTimelineEntry[],
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `
          UPDATE safety.driver_sos_events
          SET status = $2,
              updated_at = $3
          WHERE sos_event_id = $1
            AND (${sosStatusRankSql("status")}) < (${sosStatusRankSql("$2::text")})
          RETURNING sos_event_id
        `,
        [event.sosEventId, event.status, event.updatedAt],
      );
      const applied = (updated.rowCount ?? 0) > 0;
      if (applied) {
        for (const entry of timelineEntries) {
          await this.appendTimelineWith(client, entry);
        }
      }
      await client.query("COMMIT");
      return applied;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async summarizeAlertLatency(
    from: string | null,
    to: string | null,
    targetLatencyMs: number,
  ): Promise<DriverSosAlertLatencySummary> {
    if (!this.isEnabled()) {
      return {
        from,
        to,
        targetLatencyMs,
        sampleCount: 0,
        withinTargetCount: 0,
        withinTargetRate: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
        maxLatencyMs: null,
      };
    }

    const result = await this.databaseService!.query<AlertLatencySummaryRow>(
      `
          SELECT
            count(*)::integer AS sample_count,
            count(*) FILTER (
              WHERE alert_to_ops_latency_ms <= $3
            )::integer AS within_target_count,
            percentile_cont(0.50) WITHIN GROUP (
              ORDER BY alert_to_ops_latency_ms
            ) AS p50_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (
              ORDER BY alert_to_ops_latency_ms
            ) AS p95_latency_ms,
            max(alert_to_ops_latency_ms) AS max_latency_ms
          FROM safety.driver_sos_urgent_alert_outbox
          WHERE alert_to_ops_latency_ms IS NOT NULL
            AND ($1::timestamptz IS NULL OR fleet_report_confirmed_at >= $1)
            AND ($2::timestamptz IS NULL OR fleet_report_confirmed_at <= $2)
        `,
      [from, to, targetLatencyMs],
    );
    const row = result.rows[0];
    const sampleCount = Number(row?.sample_count ?? 0);
    const withinTargetCount = Number(row?.within_target_count ?? 0);

    return {
      from,
      to,
      targetLatencyMs,
      sampleCount,
      withinTargetCount,
      withinTargetRate:
        sampleCount === 0 ? null : withinTargetCount / sampleCount,
      p50LatencyMs: this.toNullableNumber(row?.p50_latency_ms),
      p95LatencyMs: this.toNullableNumber(row?.p95_latency_ms),
      maxLatencyMs: this.toNullableNumber(row?.max_latency_ms),
    };
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `S-3 verification persistence failed during ${context}: ${detail}`,
    );
  }

  private async upsertAttachmentWith(
    executor: {
      query(text: string, values?: unknown[]): Promise<unknown>;
    },
    attachment: DriverSosAttachmentRecord,
  ) {
    await executor.query(
      `
        INSERT INTO safety.driver_sos_attachments (
          attachment_id,
          sos_event_id,
          attachment_type,
          object_key,
          original_file_name,
          content_type,
          file_size,
          checksum_sha256,
          scan_status,
          scanner_provider,
          scan_reason,
          scan_attempt_count,
          last_scan_attempt_at,
          uploaded_at,
          scanned_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (attachment_id) DO UPDATE SET
          scan_status = EXCLUDED.scan_status,
          scanner_provider = EXCLUDED.scanner_provider,
          scan_reason = EXCLUDED.scan_reason,
          scan_attempt_count = EXCLUDED.scan_attempt_count,
          last_scan_attempt_at = EXCLUDED.last_scan_attempt_at,
          scanned_at = EXCLUDED.scanned_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        attachment.attachmentId,
        attachment.sosEventId,
        attachment.attachmentType,
        attachment.objectKey,
        attachment.originalFileName,
        attachment.contentType,
        attachment.fileSize,
        attachment.checksumSha256,
        attachment.scanStatus,
        attachment.scannerProvider,
        attachment.scanReason,
        attachment.scanAttemptCount,
        attachment.lastScanAttemptAt,
        attachment.uploadedAt,
        attachment.scannedAt,
        attachment.updatedAt,
      ],
    );
  }

  private async appendTimelineWith(
    executor: {
      query(text: string, values?: unknown[]): Promise<unknown>;
    },
    timeline: DriverSosTimelineEntry,
  ) {
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
        ON CONFLICT (timeline_id) DO NOTHING
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

  private mapUploadIntent(row: UploadIntentRow): DriverSosUploadIntentRecord {
    return {
      objectKey: row.object_key,
      sosEventId: row.sos_event_id,
      driverId: row.driver_id,
      attachmentType: row.attachment_type,
      originalFileName: row.original_file_name,
      contentType: row.content_type,
      fileSize: Number(row.file_size),
      providerName: row.provider_name,
      state: row.state,
      createdAt: this.toIso(row.created_at),
      expiresAt: this.toIso(row.expires_at),
      confirmedAt: row.confirmed_at ? this.toIso(row.confirmed_at) : null,
    };
  }

  private mapAttachment(row: AttachmentRow): DriverSosAttachmentRecord {
    return {
      attachmentId: row.attachment_id,
      sosEventId: row.sos_event_id,
      attachmentType: row.attachment_type,
      objectKey: row.object_key,
      originalFileName: row.original_file_name,
      contentType: row.content_type,
      fileSize: Number(row.file_size),
      checksumSha256: row.checksum_sha256,
      scanStatus: row.scan_status,
      scannerProvider: row.scanner_provider,
      scanReason: row.scan_reason,
      scanAttemptCount: Number(row.scan_attempt_count),
      lastScanAttemptAt: row.last_scan_attempt_at
        ? this.toIso(row.last_scan_attempt_at)
        : null,
      uploadedAt: this.toIso(row.uploaded_at),
      scannedAt: row.scanned_at ? this.toIso(row.scanned_at) : null,
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private toIso(value: Date | string) {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private toNullableNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
