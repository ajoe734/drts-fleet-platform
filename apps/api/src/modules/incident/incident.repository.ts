import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverMatchingSuppression,
  IncidentRecord,
  IncidentTimelineEntry,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type IncidentState = {
  incidents: IncidentRecord[];
  timelines: IncidentTimelineEntry[];
  suppressions: DriverMatchingSuppression[];
};

type PersistIncidentSuppressionRecord = {
  incidentId: string;
  driverId: string;
  updatedAt: string;
  suppression: DriverMatchingSuppression;
};

type PersistIncidentChanges = {
  incidents?: readonly IncidentRecord[];
  timelines?: readonly IncidentTimelineEntry[];
  suppressions?: readonly PersistIncidentSuppressionRecord[];
};

@Injectable()
export class IncidentRepository {
  private readonly logger = new Logger(IncidentRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<IncidentState> {
    if (!this.isEnabled()) {
      return { incidents: [], timelines: [], suppressions: [] };
    }

    const [incidentsResult, timelinesResult, suppressionsResult] =
      await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_incidents
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_incident_timelines
          ORDER BY created_at ASC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_driver_matching_suppressions
          ORDER BY updated_at DESC
        `,
      ),
    ]);

    return {
      incidents: incidentsResult.rows.map((row) =>
        this.parseRecord<IncidentRecord>(row.record, "ops.phase1_incidents"),
      ),
      timelines: timelinesResult.rows.map((row) =>
        this.parseRecord<IncidentTimelineEntry>(
          row.record,
          "ops.phase1_incident_timelines",
        ),
      ),
      suppressions: suppressionsResult.rows.map((row) =>
        this.parseRecord<DriverMatchingSuppression>(
          row.record,
          "ops.phase1_driver_matching_suppressions",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistIncidentChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    // `assigned_to`/`record.assignedTo` are guarded by the row's own
    // `updated_at` instead of always taking EXCLUDED's value: an incident
    // snapshot captured *before* `revertAssignedToIfStillOwner`'s
    // column-scoped compensation ran (e.g. a concurrent generic
    // status/suppression update that read the rejected owner while it was
    // still exposed in memory) can still land here *after* that
    // compensation, via this same unconditional full-record UPSERT. Without
    // the guard, that stale snapshot's `assigned_to` would resurrect the
    // already-rejected/compensated owner even though it is durably
    // newer (F5 retained deferred carrying writer). The guard only
    // protects ownership; every other column/JSON key still always takes
    // the incoming write so legitimate status/suppression changes are
    // never dropped. `updated_at` itself is kept monotonic via GREATEST so
    // a stale write can never make a later write look stale by comparison.
    for (const incident of changes.incidents ?? []) {
      const closedAt =
        incident.status === "resolved" || incident.status === "closed"
          ? incident.updatedAt
          : null;
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_incidents (
              incident_id, incident_no, status, severity, category,
              reported_by, related_order_id, related_vehicle_id,
              related_complaint_no, assigned_to, description,
              created_at, updated_at, closed_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
            ON CONFLICT (incident_id) DO UPDATE SET
              status = EXCLUDED.status,
              severity = EXCLUDED.severity,
              category = EXCLUDED.category,
              reported_by = EXCLUDED.reported_by,
              related_order_id = EXCLUDED.related_order_id,
              related_vehicle_id = EXCLUDED.related_vehicle_id,
              related_complaint_no = EXCLUDED.related_complaint_no,
              assigned_to = CASE
                WHEN ops.phase1_incidents.updated_at > EXCLUDED.updated_at
                  THEN ops.phase1_incidents.assigned_to
                ELSE EXCLUDED.assigned_to
              END,
              description = EXCLUDED.description,
              updated_at = GREATEST(ops.phase1_incidents.updated_at, EXCLUDED.updated_at),
              closed_at = EXCLUDED.closed_at,
              record = CASE
                WHEN ops.phase1_incidents.updated_at > EXCLUDED.updated_at
                  THEN jsonb_set(
                    EXCLUDED.record,
                    '{assignedTo}',
                    COALESCE(to_jsonb(ops.phase1_incidents.assigned_to), 'null'::jsonb),
                    true
                  )
                ELSE EXCLUDED.record
              END
          `,
          [
            incident.incidentId,
            incident.incidentId, // incident_no — use incidentId as the unique human-readable key
            incident.status,
            incident.severity,
            incident.category,
            incident.reportedBy ?? null,
            incident.relatedOrderId ?? null,
            incident.relatedVehicleId ?? null,
            incident.relatedComplaintCaseNo ?? null,
            incident.assignedTo ?? null,
            incident.description,
            incident.createdAt,
            incident.updatedAt,
            closedAt,
            JSON.stringify(incident),
          ],
        ),
      );
    }

    for (const timeline of changes.timelines ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_incident_timelines (
              entry_id, incident_id, action, actor_id, created_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (entry_id) DO UPDATE SET
              incident_id = EXCLUDED.incident_id,
              action = EXCLUDED.action,
              actor_id = EXCLUDED.actor_id,
              record = EXCLUDED.record
          `,
          [
            timeline.entryId,
            timeline.incidentId,
            timeline.action,
            timeline.actor ?? null,
            timeline.createdAt,
            JSON.stringify(timeline),
          ],
        ),
      );
    }

    for (const entry of changes.suppressions ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_driver_matching_suppressions (
              source_incident_id, driver_id, active, reason_code,
              expires_at, lifted_at, updated_at, record
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
            entry.incidentId,
            entry.driverId,
            entry.suppression.active,
            entry.suppression.reasonCode,
            entry.suppression.expiresAt,
            entry.suppression.liftedAt,
            entry.updatedAt,
            JSON.stringify(entry.suppression),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  /**
   * Conditionally reverts only the `assignedTo` ownership field (column +
   * its mirror inside the JSON `record`) back to `nextOwner`, but only
   * while the durable row's `assigned_to` column is still exactly
   * `expectedCurrentOwner`. Unlike `persistChanges`'s full-record UPSERT --
   * built from a single caller's possibly-stale in-memory snapshot of
   * every other field -- this never touches `status`, `severity` or any
   * other column/JSON key, so a concurrently-accepted status/suppression
   * write (landed before or after this call) is never clobbered by a
   * stale compensating snapshot (F5 compensation order). Returns whether
   * the condition held and the revert was actually applied; a `false`
   * result means some other writer already changed `assigned_to` away
   * from `expectedCurrentOwner`, so there is nothing for this call to
   * undo.
   *
   * `nextOwner` is routinely `null` (clearing ownership). `to_jsonb(NULL)`
   * is a strict SQL function: it returns SQL NULL, not the JSON `null`
   * literal, so a bare `to_jsonb($3::text)` would make the nested
   * `jsonb_set(...)` evaluate to SQL NULL and violate `record`'s NOT NULL
   * constraint, silently failing the whole revert. `COALESCE(..., 'null'::
   * jsonb)` converts that SQL NULL into the JSON `null` literal before it
   * reaches `jsonb_set` (F5 SQL-NULL compensation).
   *
   * `updated_at` is bumped via `GREATEST(...)` on *every* call, even one
   * whose condition does not hold (nothing to revert yet). This is
   * deliberate: `persistChanges`'s full-record UPSERT fences a stale
   * snapshot by comparing the row's durable `updated_at` against its own
   * `EXCLUDED.updated_at`, but that fence only works if a compensation
   * attempt is itself durably visible as "having happened" even when the
   * rejected owner has not landed in the database yet. Without always
   * advancing `updated_at` here, a generic status/suppression update that
   * captured the rejected owner in its own full-record write *before*
   * this call ran, but whose own write only *lands* (commits) *after*
   * this call returns, would carry that rejected owner durably back in:
   * this call's own `WHERE assigned_to = expectedCurrentOwner` would not
   * yet match anything (the rejected owner was never actually durable),
   * so a no-op compensation would leave `updated_at` unchanged and give
   * the later, stale carrying write nothing to be fenced against (F5
   * retained deferred carrying writer). A single `WITH current_row AS
   * (...)` CTE snapshots the pre-update `assigned_to`/`updated_at` once so
   * every reference below -- the CAS condition, the JSON mirror, and the
   * `updated_at` bump -- agrees on the same pre-update row, atomically.
   */
  async revertAssignedToIfStillOwner(
    incidentId: string,
    expectedCurrentOwner: string,
    nextOwner: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    const result = await this.databaseService!.query<{
      was_still_owner: boolean | null;
    }>(
      `
        WITH current_row AS (
          SELECT assigned_to, updated_at
          FROM ops.phase1_incidents
          WHERE incident_id = $1
        )
        UPDATE ops.phase1_incidents
        SET assigned_to = CASE
              WHEN (SELECT assigned_to FROM current_row) = $2 THEN $3
              ELSE (SELECT assigned_to FROM current_row)
            END,
            updated_at = GREATEST((SELECT updated_at FROM current_row), $4),
            record = jsonb_set(
              jsonb_set(
                record,
                '{assignedTo}',
                CASE
                  WHEN (SELECT assigned_to FROM current_row) = $2
                    THEN COALESCE(to_jsonb($3::text), 'null'::jsonb)
                  ELSE record -> 'assignedTo'
                END,
                true
              ),
              '{updatedAt}',
              to_jsonb(GREATEST((SELECT updated_at FROM current_row), $4)::text),
              true
            )
        WHERE incident_id = $1
        RETURNING ((SELECT assigned_to FROM current_row) = $2) AS was_still_owner
      `,
      [incidentId, expectedCurrentOwner, nextOwner, updatedAt],
    );
    return result.rows[0]?.was_still_owner === true;
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Incident persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
