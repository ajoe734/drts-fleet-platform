import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import { ApiRequestError } from "../../common/api-envelope";
import type { PassengerComplaintIntake } from "./passenger-complaint-intake";

type JsonRecordRow = {
  record: unknown;
};

type ComplaintState = {
  complaintCases: ComplaintCaseRecord[];
  complaintTimelines: ComplaintTimelineEntry[];
};

type PersistComplaintChanges = {
  complaintCases?: readonly ComplaintCaseRecord[];
  complaintTimelines?: readonly ComplaintTimelineEntry[];
};

@Injectable()
export class ComplaintRepository {
  private readonly logger = new Logger(ComplaintRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<ComplaintState> {
    if (!this.isEnabled()) {
      return {
        complaintCases: [],
        complaintTimelines: [],
      };
    }

    const [complaintCasesResult, complaintTimelinesResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM crm.phase1_complaint_cases
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM crm.phase1_complaint_timelines
          ORDER BY created_at ASC
        `,
      ),
    ]);

    return {
      complaintCases: complaintCasesResult.rows.map((row) =>
        this.parseRecord<ComplaintCaseRecord>(
          row.record,
          "crm.phase1_complaint_cases",
        ),
      ),
      complaintTimelines: complaintTimelinesResult.rows.map((row) =>
        this.parseRecord<ComplaintTimelineEntry>(
          row.record,
          "crm.phase1_complaint_timelines",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistComplaintChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const complaintCase of changes.complaintCases ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO crm.phase1_complaint_cases (
              case_no,
              status,
              sla_due_at,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (case_no) DO UPDATE SET
              status = EXCLUDED.status,
              sla_due_at = EXCLUDED.sla_due_at,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            complaintCase.caseNo,
            complaintCase.status,
            complaintCase.slaDueAt,
            complaintCase.createdAt,
            complaintCase.updatedAt,
            JSON.stringify(complaintCase),
          ],
        ),
      );
    }

    for (const timelineEntry of changes.complaintTimelines ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO crm.phase1_complaint_timelines (
              entry_id,
              case_no,
              action,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (entry_id) DO UPDATE SET
              case_no = EXCLUDED.case_no,
              action = EXCLUDED.action,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            timelineEntry.entryId,
            timelineEntry.caseNo,
            timelineEntry.action,
            timelineEntry.createdAt,
            JSON.stringify(timelineEntry),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  /** Commit intake, canonical CRM case and timeline together; fail closed. */
  async persistPassengerIntake(
    input: PassengerComplaintIntake,
    complaintCase: ComplaintCaseRecord,
    timeline: ComplaintTimelineEntry,
  ): Promise<{
    complaintCase: ComplaintCaseRecord;
    timeline: ComplaintTimelineEntry;
    replayed: boolean;
  }> {
    if (!this.isEnabled()) {
      throw new ApiRequestError(
        503,
        "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
        "Complaint storage is unavailable.",
      );
    }
    const keyHash = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex");
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.command))
      .digest("hex");
    const client = await this.databaseService!.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      // Keep ownership and active-account status valid until the CRM commit.
      const ownership = await client.query(
        `SELECT b.order_id FROM passenger.booking_histories b
         JOIN passenger.accounts a ON a.drts_passenger_id = b.drts_passenger_id
         WHERE b.order_id = $1 AND b.drts_passenger_id = $2
           AND a.status = 'active' AND a.deleted_at IS NULL
         FOR SHARE OF b, a`,
        [input.orderId, input.passengerId],
      );
      if (!ownership.rows.length) {
        throw new ApiRequestError(
          404,
          "PASSENGER_RIDE_NOT_FOUND",
          "Ride not found.",
        );
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`passenger-complaint:${input.passengerId}:${keyHash}`],
      );
      const existing = await client.query<{
        request_hash: string;
        record: unknown;
        timeline: unknown;
      }>(
        `SELECT p.request_hash, c.record, t.record AS timeline
         FROM passenger.complaints p
         JOIN crm.phase1_complaint_cases c ON c.case_no = p.case_no
         JOIN crm.phase1_complaint_timelines t ON t.case_no = p.case_no AND t.action = 'case_created'
         WHERE p.drts_passenger_id = $1 AND p.idempotency_key_hash = $2`,
        [input.passengerId, keyHash],
      );
      let result;
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.request_hash !== requestHash) {
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "Idempotency-Key was already used for a different complaint.",
          );
        }
        result = {
          complaintCase: this.parseRecord<ComplaintCaseRecord>(
            row.record,
            "crm.phase1_complaint_cases",
          ),
          timeline: this.parseRecord<ComplaintTimelineEntry>(
            row.timeline,
            "crm.phase1_complaint_timelines",
          ),
          replayed: true,
        };
      } else {
        await client.query(
          `INSERT INTO crm.phase1_complaint_cases (case_no, status, sla_due_at, created_at, updated_at, record)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            complaintCase.caseNo,
            complaintCase.status,
            complaintCase.slaDueAt,
            complaintCase.createdAt,
            complaintCase.updatedAt,
            JSON.stringify(complaintCase),
          ],
        );
        await client.query(
          `INSERT INTO crm.phase1_complaint_timelines (entry_id, case_no, action, created_at, record)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            timeline.entryId,
            timeline.caseNo,
            timeline.action,
            timeline.createdAt,
            JSON.stringify(timeline),
          ],
        );
        await client.query(
          `INSERT INTO passenger.complaints
           (case_no, drts_passenger_id, order_id, category, contact_consent, idempotency_key_hash, request_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            complaintCase.caseNo,
            input.passengerId,
            input.orderId,
            input.command.category,
            input.command.contactConsent,
            keyHash,
            requestHash,
            complaintCase.createdAt,
          ],
        );
        result = { complaintCase, timeline, replayed: false };
      }
      await client.query("COMMIT");
      committed = true;
      return result;
    } finally {
      if (!committed) {
        try {
          await client.query("ROLLBACK");
        } catch {
          this.logger.warn(
            "Passenger complaint rollback failed; discarding the transaction connection.",
          );
        } finally {
          client.release(true);
        }
      } else {
        client.release();
      }
    }
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Complaint persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
