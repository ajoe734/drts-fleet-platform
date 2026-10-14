import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  PassengerTripRatingRecord,
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

export interface PassengerIntakeResult {
  complaintCase: ComplaintCaseRecord;
  timeline: ComplaintTimelineEntry;
  replayed: boolean;
}

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

  async persistChanges(
    changes: PersistComplaintChanges,
    transaction?: PoolClient,
  ) {
    if (!this.isEnabled() && !transaction) {
      return;
    }

    if (
      !transaction &&
      changes.complaintCases?.some(
        (item) => item.category === "settlement_dispute",
      )
    ) {
      const client = await this.databaseService!.connect();
      try {
        await client.query("BEGIN");
        await this.persistChanges(changes, client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    const queryable: {
      query(text: string, values: unknown[]): Promise<unknown>;
    } = transaction ?? this.databaseService!;
    const writes: Promise<unknown>[] = [];

    for (const complaintCase of changes.complaintCases ?? []) {
      writes.push(
        queryable.query(
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
        queryable.query(
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
    const client = await this.databaseService!.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      const result = await this.persistPassengerIntakeWithClient(
        client,
        input,
        complaintCase,
        timeline,
      );
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

  /** Uses the rating owner's PoolClient; never commits or publishes memory here. */
  async persistPassengerIntakeWithClient(
    client: PoolClient,
    input: PassengerComplaintIntake,
    complaintCase: ComplaintCaseRecord,
    timeline: ComplaintTimelineEntry,
  ): Promise<PassengerIntakeResult> {
    const keyHash = createHash("sha256")
      .update(input.origin === "low_rating" ? "low-rating:" : "")
      .update(input.idempotencyKey)
      .digest("hex");
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.command))
      .digest("hex");
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
    return result;
  }

  async persistPassengerRatingConsent(
    client: PoolClient,
    rating: PassengerTripRatingRecord,
    contactRequested: boolean,
    requestHash: string,
    isNew: boolean,
    intake?: {
      input: PassengerComplaintIntake;
      complaintCase: ComplaintCaseRecord;
      timeline: ComplaintTimelineEntry;
    },
  ): Promise<PassengerIntakeResult | null> {
    const existing = await client.query<{
      request_hash: string;
      rating_id: string;
      complaint_case_no: string | null;
    }>(
      `SELECT request_hash, rating_id, complaint_case_no FROM passenger.rating_consents
       WHERE order_id = $1 AND drts_passenger_id = $2 FOR UPDATE`,
      [rating.orderId, rating.passengerSubjectRef],
    );
    const row = existing.rows[0];
    if (!row && !isNew)
      throw new ApiRequestError(
        409,
        "PASSENGER_RATING_CONSENT_UNAVAILABLE",
        "The original rating has no captured contact choice.",
      );
    if (
      row &&
      (row.request_hash !== requestHash || row.rating_id !== rating.ratingId)
    ) {
      throw new ApiRequestError(
        409,
        "PASSENGER_RATING_ALREADY_SUBMITTED",
        "The original rating and contact choice cannot be changed.",
      );
    }
    const stored = intake
      ? await this.persistPassengerIntakeWithClient(
          client,
          intake.input,
          intake.complaintCase,
          intake.timeline,
        )
      : null;
    if (row) {
      if (row.complaint_case_no !== (stored?.complaintCase.caseNo ?? null)) {
        throw new ApiRequestError(
          409,
          "PASSENGER_RATING_CONSENT_INCONSISTENT",
          "The persisted rating contact source is inconsistent.",
        );
      }
      return stored;
    }
    await client.query(
      `INSERT INTO passenger.rating_consents
       (order_id, drts_passenger_id, rating_id, contact_requested, request_hash, complaint_case_no, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        rating.orderId,
        rating.passengerSubjectRef,
        rating.ratingId,
        contactRequested,
        requestHash,
        stored?.complaintCase.caseNo ?? null,
        rating.submittedAt,
      ],
    );
    return stored;
  }

  /** Keyset pages of this source only; no global CRM snapshot refresh. */
  async listPassengerCases(
    afterCaseNo: string,
  ): Promise<ComplaintCaseRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT c.record FROM passenger.complaints p
       JOIN crm.phase1_complaint_cases c ON c.case_no = p.case_no
       WHERE p.case_no > $1 ORDER BY p.case_no ASC LIMIT $2`,
      [afterCaseNo, 500],
    );
    return result.rows.map((row) =>
      this.parseRecord<ComplaintCaseRecord>(
        row.record,
        "crm.phase1_complaint_cases",
      ),
    );
  }

  async getPassengerCase(caseNo: string): Promise<ComplaintCaseRecord | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT c.record FROM passenger.complaints p
       JOIN crm.phase1_complaint_cases c ON c.case_no = p.case_no WHERE p.case_no = $1`,
      [caseNo],
    );
    return result.rows[0]
      ? this.parseRecord<ComplaintCaseRecord>(
          result.rows[0].record,
          "crm.phase1_complaint_cases",
        )
      : null;
  }

  async getPassengerTimeline(
    caseNo: string,
  ): Promise<ComplaintTimelineEntry[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT t.record FROM passenger.complaints p
       JOIN crm.phase1_complaint_timelines t ON t.case_no = p.case_no
       WHERE p.case_no = $1 ORDER BY t.created_at ASC, t.entry_id ASC`,
      [caseNo],
    );
    return result.rows.map((row) =>
      this.parseRecord<ComplaintTimelineEntry>(
        row.record,
        "crm.phase1_complaint_timelines",
      ),
    );
  }

  async loadSettlementState(): Promise<ComplaintState> {
    if (!this.isEnabled())
      return { complaintCases: [], complaintTimelines: [] };
    // One PostgreSQL statement gives the cases and their timelines the same
    // snapshot even when another API replica commits during this read.
    const snapshot = await this.databaseService!.query<
      JsonRecordRow & { kind: "case" | "timeline" }
    >(
      `WITH settlement_cases AS (
         SELECT case_no, record, created_at
         FROM crm.phase1_complaint_cases
         WHERE record->>'category' = 'settlement_dispute'
       )
       SELECT kind, record FROM (
         SELECT 'case' AS kind, record, created_at FROM settlement_cases
         UNION ALL
         SELECT 'timeline' AS kind, timeline.record, timeline.created_at
         FROM crm.phase1_complaint_timelines timeline
         JOIN settlement_cases c ON c.case_no = timeline.case_no
       ) snapshot
       ORDER BY kind, created_at`,
    );
    return {
      complaintCases: snapshot.rows
        .filter((row) => row.kind === "case")
        .map((row) =>
          this.parseRecord<ComplaintCaseRecord>(
            row.record,
            "settlement complaint",
          ),
        ),
      complaintTimelines: snapshot.rows
        .filter((row) => row.kind === "timeline")
        .map((row) =>
          this.parseRecord<ComplaintTimelineEntry>(
            row.record,
            "settlement timeline",
          ),
        ),
    };
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
