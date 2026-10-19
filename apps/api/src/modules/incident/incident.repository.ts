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

export type PersistIncidentOptions = {
  /**
   * incidentIds in this batch whose `assigned_to` / `record.assignedTo`
   * this specific write is intentionally deciding (a fresh claim commit, an
   * explicit ops reassignment, or a forced convergence) -- every other
   * incidentId in `changes.incidents` always preserves whatever is durably
   * current for ownership instead, no matter what that incident's own
   * in-memory `assignedTo`/`updatedAt` say. Ownership intent, not wall-clock
   * comparison, is what makes a same-millisecond compensation vs. deferred
   * generic-writer race unambiguous: two independently generated
   * `updatedAt` values can tie, but "did this call mean to change
   * ownership" never does (F5 retained deferred carrying writer).
   */
  assignIntentIncidentIds?: ReadonlySet<string> | readonly string[];
  /** Only convergence onto an already committed SOS duty owner bypasses first-owner arbitration. */
  forceAssignmentIncidentIds?: ReadonlySet<string> | readonly string[];
  /** Awaited SOS handover changes ownership only, preserving independently accepted fields. */
  assignmentOnlyIncidentIds?: ReadonlySet<string> | readonly string[];
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

  async persistChanges(
    changes: PersistIncidentChanges,
    options?: PersistIncidentOptions,
  ): Promise<{ incidents: IncidentRecord[]; newClaims: string[] } | undefined> {
    if (!this.isEnabled()) {
      return {
        incidents: [...(changes.incidents ?? [])],
        newClaims: [...(options?.assignmentOnlyIncidentIds ?? [])],
      };
    }

    const persistedIncidents: IncidentRecord[] = [];
    const newClaims: string[] = [];
    const assignmentOnly = new Set(options?.assignmentOnlyIncidentIds ?? []);
    const writes: Promise<unknown>[] = [];
    const assignIntent = new Set(options?.assignIntentIncidentIds ?? []);
    const forceAssignment = new Set(options?.forceAssignmentIncidentIds ?? []);

    // `assigned_to`/`record.assignedTo` are guarded by explicit caller
    // *intent* ($16, `preserveAssignment`), not by comparing `updated_at`
    // timestamps: two independently generated `updatedAt` values (e.g. this
    // incident's own compensation write and an unrelated, already-in-flight
    // generic status/suppression write that captured the rejected owner
    // while it was still exposed in memory) can tie at millisecond
    // resolution, and a wall-clock fence cannot tell "stale carrying write"
    // apart from "legitimate same-millisecond new claim" when they tie
    // (F5 retained deferred carrying writer). Whether a write actually
    // *means* to change ownership never ties: only `incidentId`s in
    // `options.assignIntentIncidentIds` (a fresh claim commit, an explicit
    // ops reassignment, or a forced convergence) ever take EXCLUDED's
    // `assigned_to`; every other write preserves whatever is durably
    // current, unconditionally, regardless of its own `updatedAt` -- so a
    // late-landing stale snapshot can never resurrect a since-rejected or
    // since-compensated owner, in either settle order. This guard only
    // protects ownership; every other column/JSON key still always takes
    // the incoming write so legitimate status/suppression changes are never
    // dropped. `updated_at` itself is kept monotonic via GREATEST so a
    // stale write can never regress the row's own last-modified marker.
    for (const incident of changes.incidents ?? []) {
      if (assignmentOnly.has(incident.incidentId)) {
        let decision;
        try {
          decision = await this.persistOwnerDecision(
            incident,
            (changes.timelines ?? []).filter(
              (entry) => entry.incidentId === incident.incidentId,
            ),
            forceAssignment.has(incident.incidentId),
          );
        } catch (error) {
          // Unlike generic legacy persistence this ownership-only transaction
          // cannot carry another call's tentative owner into a status write.
          throw Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            { incidentOwnerTransaction: true },
          );
        }
        persistedIncidents.push(decision.incident);
        if (decision.wasNewClaim) newClaims.push(incident.incidentId);
        continue;
      }
      const closedAt =
        incident.status === "resolved" || incident.status === "closed"
          ? incident.updatedAt
          : null;
      const preserveAssignment = !assignIntent.has(incident.incidentId);
      const result = await this.databaseService!.query<JsonRecordRow>(
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
                WHEN $16::boolean OR (
                  NOT $17::boolean AND ops.phase1_incidents.assigned_to IS NOT NULL
                  AND ops.phase1_incidents.assigned_to IS DISTINCT FROM EXCLUDED.assigned_to
                ) THEN ops.phase1_incidents.assigned_to
                ELSE EXCLUDED.assigned_to
              END,
              description = EXCLUDED.description,
              updated_at = GREATEST(ops.phase1_incidents.updated_at, EXCLUDED.updated_at),
              closed_at = EXCLUDED.closed_at,
              record = CASE
                WHEN $16::boolean OR (
                  NOT $17::boolean AND ops.phase1_incidents.assigned_to IS NOT NULL
                  AND ops.phase1_incidents.assigned_to IS DISTINCT FROM EXCLUDED.assigned_to
                ) THEN jsonb_set(
                    EXCLUDED.record,
                    '{assignedTo}',
                    COALESCE(to_jsonb(ops.phase1_incidents.assigned_to), 'null'::jsonb),
                    true
                  )
                ELSE EXCLUDED.record
              END
            RETURNING record
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
          preserveAssignment,
          forceAssignment.has(incident.incidentId),
        ],
      );
      const row = result.rows[0];
      if (!row)
        throw new Error(
          `Incident ${incident.incidentId} write returned no authoritative record.`,
        );
      persistedIncidents.push(
        this.parseRecord<IncidentRecord>(row.record, "ops.phase1_incidents"),
      );
    }

    for (const timeline of changes.timelines ?? []) {
      if (assignmentOnly.has(timeline.incidentId)) continue;
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
    return { incidents: persistedIncidents, newClaims };
  }

  /** A row lock arbitrates actual durable ownership. No full-record snapshot
   * is written here, so a deferred claim cannot undo accepted investigation,
   * resolution or suppression changes. Timeline and decision commit together. */
  private async persistOwnerDecision(
    incident: IncidentRecord,
    timelines: readonly IncidentTimelineEntry[],
    force: boolean,
  ): Promise<{ incident: IncidentRecord; wasNewClaim: boolean }> {
    const client = await this.databaseService!.connect();
    let commitAttempted = false;
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        record: IncidentRecord;
        previous_owner: string | null;
      }>(
        `
          WITH current_owner AS MATERIALIZED (
            SELECT incident_id, assigned_to
            FROM ops.phase1_incidents
            WHERE incident_id = $1
            FOR UPDATE
          )
          UPDATE ops.phase1_incidents AS target
          SET assigned_to = CASE
                WHEN current_owner.assigned_to IS NULL OR current_owner.assigned_to = $2 OR $4::boolean
                  THEN $2 ELSE current_owner.assigned_to
              END,
              updated_at = GREATEST(target.updated_at, $3::timestamptz),
              record = jsonb_set(
                jsonb_set(target.record, '{assignedTo}',
                  COALESCE(to_jsonb(CASE
                    WHEN current_owner.assigned_to IS NULL OR current_owner.assigned_to = $2 OR $4::boolean
                      THEN $2::text ELSE current_owner.assigned_to
                  END), 'null'::jsonb), true),
                '{updatedAt}', to_jsonb(GREATEST(target.updated_at, $3::timestamptz)::text), true
              )
          FROM current_owner
          WHERE target.incident_id = current_owner.incident_id
          RETURNING target.record, current_owner.assigned_to AS previous_owner
        `,
        [incident.incidentId, incident.assignedTo, incident.updatedAt, force],
      );
      const row = result.rows[0];
      if (!row)
        throw new Error(`Incident ${incident.incidentId} is not durable.`);
      const actual = this.parseRecord<IncidentRecord>(
        row.record,
        "ops.phase1_incidents",
      );
      const changedOwner = row.previous_owner !== actual.assignedTo;
      if (changedOwner) {
        for (const entry of timelines) {
          await client.query(
            `INSERT INTO ops.phase1_incident_timelines
              (entry_id, incident_id, action, actor_id, created_at, record)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (entry_id) DO NOTHING`,
            [
              entry.entryId,
              entry.incidentId,
              entry.action,
              entry.actor ?? null,
              entry.createdAt,
              JSON.stringify(entry),
            ],
          );
        }
      }
      commitAttempted = true;
      await client.query("COMMIT");
      return {
        incident: actual,
        wasNewClaim: changedOwner && row.previous_owner === null,
      };
    } catch (error) {
      let outcome = commitAttempted ? "unknown" : "rolled_back";
      try {
        await client.query("ROLLBACK");
      } catch {
        outcome = "unknown";
      }
      throw Object.assign(
        error instanceof Error ? error : new Error(String(error)),
        { incidentOwnerCommitOutcome: outcome },
      );
    } finally {
      client.release();
    }
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
   * `updated_at` is bumped via `GREATEST(...)` on every call, including one
   * whose condition does not hold, so the row's own last-modified marker
   * never regresses when a later, unrelated write reuses this helper.
   * Ownership resurrection itself is no longer fenced by comparing
   * `updated_at` values at all -- see `persistChanges`'s `preserveAssignment`
   * intent guard, which is what actually prevents a deferred carrying
   * writer from reviving a rejected/compensated owner regardless of
   * timestamp ties (F5 retained deferred carrying writer).
   *
   * The `WITH current_row AS MATERIALIZED (SELECT ... FOR UPDATE)` CTE
   * takes an explicit row lock before any value is read. Without
   * `FOR UPDATE`, this SELECT would only see a plain Read-Committed
   * statement-start snapshot: if a *different*, legitimate writer (e.g. a
   * fresh claim for a new owner) is concurrently holding this row's lock
   * and commits a newer owner/timestamp while this statement is blocked
   * waiting for that lock, the CTE would still report the snapshot taken
   * *before* that commit once the lock clears, not the row the UPDATE
   * below actually targets. Every reference in this query -- the CAS
   * condition, the JSON mirror, the `updated_at` bump, and `RETURNING` --
   * would then agree with each other but disagree with the row's real
   * current state: the CAS could wrongly report "still the expected
   * owner" and clobber the newer owner it never actually observed (F5
   * unlocked CTE compensation clobbers current owner). `FOR UPDATE`
   * forces this SELECT to wait for any in-flight writer's lock and then
   * re-fetch the row it actually committed, so `current_row` always
   * reflects the exact row version this statement's own `UPDATE` (which
   * targets the same row, in the same transaction, and therefore never
   * itself waits on this lock) is about to modify.
   */
  async revertAssignedToIfStillOwner(
    incidentId: string,
    expectedCurrentOwner: string,
    nextOwner: string | null,
    updatedAt: string,
    sosEventId?: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    if (sosEventId) {
      const client = await this.databaseService!.connect();
      try {
        await client.query("BEGIN");
        const event = await client.query<{ owner: string | null }>(
          `SELECT duty_ack_snapshot->>'acknowledgedByActorId' AS owner
           FROM safety.driver_sos_events WHERE sos_event_id = $1 FOR UPDATE`,
          [sosEventId],
        );
        if (!event.rows[0])
          throw new Error(`Driver SOS event ${sosEventId} is not durable.`);
        const applied = event.rows[0].owner
          ? false
          : await this.revertAssignedToWith(
              client,
              incidentId,
              expectedCurrentOwner,
              nextOwner,
              updatedAt,
            );
        await client.query("COMMIT");
        return applied;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return this.revertAssignedToWith(
      this.databaseService!,
      incidentId,
      expectedCurrentOwner,
      nextOwner,
      updatedAt,
    );
  }

  private async revertAssignedToWith(
    executor: Pick<DatabaseService, "query">,
    incidentId: string,
    expectedCurrentOwner: string,
    nextOwner: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await executor.query<{
      was_still_owner: boolean | null;
    }>(
      `
        WITH current_row AS MATERIALIZED (
          SELECT assigned_to, updated_at
          FROM ops.phase1_incidents
          WHERE incident_id = $1
          FOR UPDATE
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

  /** Read consumers discover rows committed after this replica initialized. */
  async loadIncidents(): Promise<IncidentRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      "SELECT record FROM ops.phase1_incidents ORDER BY updated_at DESC, created_at DESC",
    );
    return result.rows.map((row) =>
      this.parseRecord<IncidentRecord>(row.record, "ops.phase1_incidents"),
    );
  }

  async loadTimeline(incidentId: string): Promise<IncidentTimelineEntry[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      "SELECT record FROM ops.phase1_incident_timelines WHERE incident_id = $1 ORDER BY created_at ASC",
      [incidentId],
    );
    return result.rows.map((row) =>
      this.parseRecord<IncidentTimelineEntry>(
        row.record,
        "ops.phase1_incident_timelines",
      ),
    );
  }

  async loadIncident(incidentId: string): Promise<IncidentRecord | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<JsonRecordRow>(
      "SELECT record FROM ops.phase1_incidents WHERE incident_id = $1",
      [incidentId],
    );
    return result.rows[0]
      ? this.parseRecord<IncidentRecord>(
          result.rows[0].record,
          "ops.phase1_incidents",
        )
      : null;
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
