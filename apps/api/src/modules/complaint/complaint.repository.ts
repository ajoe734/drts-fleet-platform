import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  PassengerTripRatingRecord,
  PassengerRideAccessToken,
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
  /** Prepared ordinary command identities confirmed by this same transaction. */
  commandKeys?: readonly string[];
};

export interface PassengerIntakeResult {
  complaintCase: ComplaintCaseRecord;
  timeline: ComplaintTimelineEntry;
  replayed: boolean;
}

export type ComplaintPendingCommitStatus = "pending" | "confirmed" | "failed";

/** Durable mirror of a ComplaintService in-memory PendingUncertainComplaintCommit,
 * so a same-logical-command retry can recover the originally allocated
 * caseNo/entryIds across an API process restart or on a different replica,
 * not only within the originating process's Map. */
export type ComplaintPendingCommitRecord = {
  commandKey: string;
  caseNo: string;
  action: string;
  commandPayload: unknown;
  caseSnapshot: ComplaintCaseRecord;
  timelineSnapshot: ComplaintTimelineEntry[];
  previousCaseSnapshot: ComplaintCaseRecord | null;
  status: ComplaintPendingCommitStatus;
};

type PendingCommitRow = {
  command_key: string;
  case_no: string;
  action: string;
  command_payload: unknown;
  case_snapshot: unknown;
  timeline_snapshot: unknown;
  previous_case_snapshot: unknown;
  status: ComplaintPendingCommitStatus;
};

/** Thrown when the client failed after issuing COMMIT: the transaction may
 * have actually been applied server-side. Callers must not assume rollback
 * (and must not treat the write as a fresh, safely-retryable attempt). */
export class ComplaintCommitOutcomeUnknownError extends Error {
  constructor(public readonly cause: unknown) {
    super(
      cause instanceof Error
        ? `Complaint persistence commit outcome is unknown: ${cause.message}`
        : "Complaint persistence commit outcome is unknown.",
    );
    this.name = "ComplaintCommitOutcomeUnknownError";
  }
}

/** Only raised by the prepared predecessor check, before any business write. */
export class ComplaintPreparedCaseChangedError extends ApiRequestError {
  constructor(caseNo: string) {
    super(
      409,
      "IDEMPOTENCY_IN_PROGRESS",
      "The complaint changed after this command was prepared; canonical confirmation is required.",
      { caseNo },
      true,
    );
  }
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

    // Every top-level call commits its case + timeline rows atomically, not
    // only settlement_dispute ones, so an ordinary case can never commit
    // without its timeline (or vice versa).
    if (!transaction) {
      const client = await this.databaseService!.connect();
      let committed = false;
      let commitAttempted = false;
      try {
        await client.query("BEGIN");
        await this.persistChanges(changes, client);
        commitAttempted = true;
        await client.query("COMMIT");
        committed = true;
      } catch (error) {
        throw commitAttempted
          ? new ComplaintCommitOutcomeUnknownError(error)
          : error;
      } finally {
        if (!committed) {
          try {
            await client.query("ROLLBACK");
          } catch {
            this.logger.warn(
              "Complaint persistence rollback failed; discarding the transaction connection.",
            );
          } finally {
            client.release(true);
          }
        } else {
          client.release();
        }
      }
      return;
    }

    if (changes.commandKeys?.length) {
      // Serialise retries of the same prepared command before touching its
      // case row. A retry queued behind a successful COMMIT must replay the
      // result, not upsert an old snapshot over a later legitimate mutation.
      let confirmed = 0;
      for (const commandKey of changes.commandKeys) {
        const reserved = await transaction!.query<{
          status: ComplaintPendingCommitStatus;
          case_no: string;
          previous_case_snapshot: unknown;
          timeline_snapshot: ComplaintTimelineEntry[];
        }>(
          `SELECT status, case_no, previous_case_snapshot, timeline_snapshot FROM crm.phase1_complaint_pending_commits WHERE command_key = $1 FOR UPDATE`,
          [commandKey],
        );
        if (!reserved.rows[0])
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "Complaint command reservation is unavailable; retry the same key.",
            undefined,
            true,
          );
        const originalTimeline = reserved.rows[0].timeline_snapshot;
        const expectedTimeline = (changes.complaintTimelines ?? []).filter(
          (entry) => entry.caseNo === reserved.rows[0]!.case_no,
        );
        if (
          !Array.isArray(originalTimeline) ||
          originalTimeline.length !== expectedTimeline.length ||
          expectedTimeline.some(
            (entry) =>
              !originalTimeline.some(
                (original) => original.entryId === entry.entryId,
              ),
          )
        )
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "The complaint reservation changed; retry the original command.",
            undefined,
            true,
          );
        if (reserved.rows[0].status === "confirmed") {
          confirmed++;
          continue;
        }
        if (reserved.rows[0].status !== "pending")
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "The complaint preparation was rejected; retry after canonical refresh.",
            undefined,
            true,
          );
        // A pending command may have been prepared before a later command
        // was acknowledged by another replica. Lock the actual case and
        // compare its original prepared predecessor before any upsert. This
        // also serialises distinct command keys that read the same old case.
        const original = reserved.rows[0];
        const current = await transaction!.query<{
          matches_prepared: boolean | null;
        }>(
          `SELECT record = $2::jsonb AS matches_prepared
           FROM crm.phase1_complaint_cases WHERE case_no = $1 FOR UPDATE`,
          [
            original.case_no,
            original.previous_case_snapshot
              ? JSON.stringify(original.previous_case_snapshot)
              : null,
          ],
        );
        const matches = original.previous_case_snapshot
          ? current.rows[0]?.matches_prepared === true
          : current.rows.length === 0;
        if (!matches)
          throw new ComplaintPreparedCaseChangedError(original.case_no);
      }
      if (confirmed === changes.commandKeys.length) return;
      if (confirmed)
        throw new ApiRequestError(
          409,
          "IDEMPOTENCY_IN_PROGRESS",
          "Complaint command outcomes require individual replay.",
          undefined,
          true,
        );
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
    // The prepared identity already exists outside this transaction. Its
    // confirmed result changes atomically with the canonical case/timeline.
    for (const commandKey of changes.commandKeys ?? []) {
      await transaction!.query(
        `UPDATE crm.phase1_complaint_pending_commits
         SET status = 'confirmed', updated_at = now() WHERE command_key = $1`,
        [commandKey],
      );
    }
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
      contact_requested: boolean;
      case_required: boolean;
      complaint_case_no: string | null;
      record: unknown;
      timeline: unknown;
    }>(
      `SELECT request_hash, rating_id, complaint_case_no, contact_requested, case_required,
              c.record, t.record AS timeline
       FROM passenger.rating_consents r
       LEFT JOIN crm.phase1_complaint_cases c ON c.case_no = r.complaint_case_no
       LEFT JOIN crm.phase1_complaint_timelines t
         ON t.case_no = r.complaint_case_no AND t.action = 'case_created'
       WHERE order_id = $1 AND drts_passenger_id = $2 FOR UPDATE OF r`,
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
    const requiresCase = rating.score <= 2;
    if (row) {
      if (
        row.contact_requested !== contactRequested ||
        typeof row.case_required !== "boolean" ||
        row.case_required !== Boolean(row.complaint_case_no) ||
        (row.case_required &&
          (!requiresCase || !row.record || !row.timeline)) ||
        (!row.case_required && requiresCase && contactRequested)
      )
        throw new ApiRequestError(
          409,
          "PASSENGER_RATING_CONSENT_INCONSISTENT",
          "The persisted rating contact source is inconsistent.",
        );
      // V0126 captured the pre-existing rule explicitly. An exact legacy opt-out
      // replay must not backfill a case; missing provenance never means legacy.
      if (!row.case_required) return null;
    }
    if (Boolean(intake) !== requiresCase)
      throw new ApiRequestError(
        409,
        "PASSENGER_RATING_CONSENT_INCONSISTENT",
        "The required low-rating case is unavailable.",
      );
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
       (order_id, drts_passenger_id, rating_id, contact_requested, request_hash, complaint_case_no, created_at, case_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        rating.orderId,
        rating.passengerSubjectRef,
        rating.ratingId,
        contactRequested,
        requestHash,
        stored?.complaintCase.caseNo ?? null,
        rating.submittedAt,
        requiresCase,
      ],
    );
    return stored;
  }

  /** Runs on the rating owner's client; the token consent row is the durable intake. */
  async persistRideTokenRatingConsent(
    client: PoolClient,
    rating: PassengerTripRatingRecord,
    token: PassengerRideAccessToken,
    contactRequested: boolean,
    choiceProvided: boolean,
    requestHash: string,
    isNew: boolean,
    draft?: {
      complaintCase: ComplaintCaseRecord;
      timeline: ComplaintTimelineEntry;
    },
  ): Promise<PassengerIntakeResult | null> {
    const existing = await client.query<{
      request_hash: string;
      rating_id: string;
      contact_requested: boolean;
      case_required: boolean;
      complaint_case_no: string | null;
      record: unknown;
      timeline: unknown;
    }>(
      `SELECT p.request_hash, p.rating_id, p.contact_requested, p.complaint_case_no, p.case_required,
              c.record, t.record AS timeline
       FROM ops.passenger_ride_rating_consents p
       LEFT JOIN crm.phase1_complaint_cases c ON c.case_no = p.complaint_case_no
       LEFT JOIN crm.phase1_complaint_timelines t
         ON t.case_no = p.complaint_case_no AND t.action = 'case_created'
       WHERE p.order_id = $1 AND p.passenger_subject_ref = $2 FOR UPDATE OF p`,
      [rating.orderId, rating.passengerSubjectRef],
    );
    const row = existing.rows[0];
    if (row) {
      if (
        row.request_hash !== requestHash ||
        row.rating_id !== rating.ratingId ||
        row.contact_requested !== contactRequested
      )
        throw new ApiRequestError(
          409,
          "PASSENGER_RATING_ALREADY_SUBMITTED",
          "The original rating and contact choice cannot be changed.",
        );
      if (
        typeof row.case_required !== "boolean" ||
        row.case_required !== Boolean(row.complaint_case_no) ||
        (row.case_required &&
          (rating.score > 2 || !row.record || !row.timeline)) ||
        (!row.case_required && rating.score <= 2 && contactRequested)
      )
        throw new ApiRequestError(
          409,
          "PASSENGER_RATING_CONSENT_INCONSISTENT",
          "The persisted rating contact source is inconsistent.",
        );
      return row.complaint_case_no
        ? {
            complaintCase: this.parseRecord<ComplaintCaseRecord>(
              row.record,
              "crm.phase1_complaint_cases",
            ),
            timeline: this.parseRecord<ComplaintTimelineEntry>(
              row.timeline,
              "crm.phase1_complaint_timelines",
            ),
            replayed: true,
          }
        : null;
    }
    if (!isNew) {
      // Only a rating explicitly captured before V0126 can have no consent.
      // A new/unknown row is never reclassified as legacy after an unknown COMMIT.
      const provenance = await client.query<{
        low_rating_case_policy_v2: boolean;
      }>(
        `SELECT low_rating_case_policy_v2 FROM ops.passenger_trip_ratings
         WHERE rating_id = $1 AND order_id = $2 AND passenger_subject_ref = $3 FOR UPDATE`,
        [rating.ratingId, rating.orderId, rating.passengerSubjectRef],
      );
      if (
        !choiceProvided &&
        provenance.rows[0]?.low_rating_case_policy_v2 === false
      )
        return null;
      throw new ApiRequestError(
        409,
        "PASSENGER_RATING_CONSENT_UNAVAILABLE",
        "The original rating has no captured contact choice.",
      );
    }
    const requiresCase = rating.score <= 2;
    if (Boolean(draft) !== requiresCase)
      throw new ApiRequestError(
        409,
        "PASSENGER_RATING_CONSENT_INCONSISTENT",
        "The required low-rating case is unavailable.",
      );
    if (draft)
      await this.persistChanges(
        {
          complaintCases: [draft.complaintCase],
          complaintTimelines: [draft.timeline],
        },
        client,
      );
    await client.query(
      `INSERT INTO ops.passenger_ride_rating_consents
       (order_id, passenger_subject_ref, rating_id, original_token_id, rating_score,
        contact_requested, request_hash, complaint_case_no, created_at, case_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        rating.orderId,
        rating.passengerSubjectRef,
        rating.ratingId,
        token.tokenId,
        rating.score,
        contactRequested,
        requestHash,
        draft?.complaintCase.caseNo ?? null,
        rating.submittedAt,
        requiresCase,
      ],
    );
    return draft ? { ...draft, replayed: false } : null;
  }

  /** Internal Ops reads use CRM as the authority, regardless of intake source.
   * Referral cases have no passenger-account/ride-token membership. These
   * queries are not passenger self-service ownership checks. */
  async listCasesForOps(afterCaseNo: string): Promise<ComplaintCaseRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT c.record FROM crm.phase1_complaint_cases c
       WHERE c.case_no > $1 ORDER BY c.case_no ASC LIMIT $2`,
      [afterCaseNo, 500],
    );
    return result.rows.map((row) =>
      this.parseRecord<ComplaintCaseRecord>(
        row.record,
        "crm.phase1_complaint_cases",
      ),
    );
  }

  async getCaseForOps(caseNo: string): Promise<ComplaintCaseRecord | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT c.record FROM crm.phase1_complaint_cases c WHERE c.case_no = $1`,
      [caseNo],
    );
    return result.rows[0]
      ? this.parseRecord<ComplaintCaseRecord>(
          result.rows[0].record,
          "crm.phase1_complaint_cases",
        )
      : null;
  }

  async getTimelineForOps(caseNo: string): Promise<ComplaintTimelineEntry[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT t.record FROM crm.phase1_complaint_timelines t WHERE t.case_no = $1
       ORDER BY t.created_at ASC, t.entry_id ASC`,
      [caseNo],
    );
    return result.rows.map((row) =>
      this.parseRecord<ComplaintTimelineEntry>(
        row.record,
        "crm.phase1_complaint_timelines",
      ),
    );
  }

  /** Reads the current durable record for one case, independent of category
   * and of the in-memory optimistic cache. Used to reconcile a case whose
   * COMMIT outcome was unknown. For a create, `null` definitively proves the
   * write never landed (safe to roll back). For an update the row already
   * existed before the uncertain attempt, so `null` is a repository/
   * connectivity anomaly rather than proof either way (left pending); only a
   * record that does not match the attempted snapshot proves that update
   * did not land, and an exact match proves it did. */
  async loadCaseByCaseNo(caseNo: string): Promise<ComplaintCaseRecord | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM crm.phase1_complaint_cases WHERE case_no = $1`,
      [caseNo],
    );
    return result.rows[0]
      ? this.parseRecord<ComplaintCaseRecord>(
          result.rows[0].record,
          "crm.phase1_complaint_cases",
        )
      : null;
  }

  /** Reserve PREPARED identity before the business transaction. A concurrent
   * retry can observe the original IDs; it must never replace them. */
  async recordPendingCommit(
    record: ComplaintPendingCommitRecord,
  ): Promise<ComplaintPendingCommitRecord | undefined> {
    if (!this.isEnabled()) return;
    const result = await this.databaseService!.query<PendingCommitRow>(
      `INSERT INTO crm.phase1_complaint_pending_commits (
         command_key, case_no, action, command_payload, case_snapshot,
         timeline_snapshot, previous_case_snapshot, status, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, now())
       ON CONFLICT (command_key) DO UPDATE SET
         command_key = EXCLUDED.command_key
       RETURNING command_key, case_no, action, command_payload, case_snapshot,
                 timeline_snapshot, previous_case_snapshot, status`,
      [
        record.commandKey,
        record.caseNo,
        record.action,
        JSON.stringify(record.commandPayload ?? null),
        JSON.stringify(record.caseSnapshot),
        JSON.stringify(record.timelineSnapshot),
        record.previousCaseSnapshot
          ? JSON.stringify(record.previousCaseSnapshot)
          : null,
        record.status,
      ],
    ).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ApiRequestError(
          409,
          "IDEMPOTENCY_IN_PROGRESS",
          "Another complaint creation has reserved this case number; retry the same key.",
          undefined,
          true,
        );
      }
      throw error;
    });
    const reserved = result.rows[0]
      ? this.parsePendingCommit(result.rows[0])
      : undefined;
    if (reserved?.status === "failed") {
      // Only a durable, definite rejection permits a new reservation. An
      // unknown pending or confirmed result is never removed here.
      await this.databaseService!.query(
        `DELETE FROM crm.phase1_complaint_pending_commits
         WHERE command_key = $1 AND status = 'failed' AND timeline_snapshot = $2::jsonb`,
        [record.commandKey, JSON.stringify(reserved.timelineSnapshot)],
      );
      return this.recordPendingCommit(record);
    }
    return reserved;
  }

  /** Prepared commands and confirmed replay results survive process restarts. */
  async loadPendingCommits(): Promise<ComplaintPendingCommitRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<PendingCommitRow>(
      `
        SELECT command_key, case_no, action, command_payload, case_snapshot,
               timeline_snapshot, previous_case_snapshot, status
        FROM crm.phase1_complaint_pending_commits
        WHERE status = 'pending' OR status = 'confirmed'
      `,
    );
    return result.rows.map((row) => this.parsePendingCommit(row));
  }

  private parsePendingCommit(
    row: PendingCommitRow,
  ): ComplaintPendingCommitRecord {
    return {
      commandKey: row.command_key,
      caseNo: row.case_no,
      action: row.action,
      commandPayload: row.command_payload,
      caseSnapshot: this.parseRecord<ComplaintCaseRecord>(
        row.case_snapshot,
        "crm.phase1_complaint_pending_commits.case_snapshot",
      ),
      timelineSnapshot: Array.isArray(row.timeline_snapshot)
        ? (row.timeline_snapshot as ComplaintTimelineEntry[])
        : [],
      previousCaseSnapshot: row.previous_case_snapshot
        ? this.parseRecord<ComplaintCaseRecord>(
            row.previous_case_snapshot,
            "crm.phase1_complaint_pending_commits.previous_case_snapshot",
          )
        : null,
      status: row.status,
    };
  }

  /** One statement gives the ordinary case and its full timeline one
   * canonical snapshot, including changes made by another API replica. */
  async loadCaseState(caseNo: string): Promise<ComplaintState> {
    if (!this.isEnabled())
      return { complaintCases: [], complaintTimelines: [] };
    const result = await this.databaseService!.query<
      JsonRecordRow & { kind: "case" | "timeline" }
    >(
      `SELECT kind, record FROM (
         SELECT 'case' AS kind, record, created_at FROM crm.phase1_complaint_cases WHERE case_no = $1
         UNION ALL
         SELECT 'timeline' AS kind, record, created_at FROM crm.phase1_complaint_timelines WHERE case_no = $1
       ) complaint_case_snapshot ORDER BY kind, created_at`,
      [caseNo],
    );
    return {
      complaintCases: result.rows
        .filter((row) => row.kind === "case")
        .map((row) =>
          this.parseRecord<ComplaintCaseRecord>(
            row.record,
            "crm.phase1_complaint_cases",
          ),
        ),
      complaintTimelines: result.rows
        .filter((row) => row.kind === "timeline")
        .map((row) =>
          this.parseRecord<ComplaintTimelineEntry>(
            row.record,
            "crm.phase1_complaint_timelines",
          ),
        ),
    };
  }

  /** Only the caller's matched, new, pre-business predicate rejection.
   * Retained failed rows let another process recover if DELETE fails. */
  async markPendingCommitFailed(
    commandKey: string,
    rejectedTimeline: readonly ComplaintTimelineEntry[],
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.databaseService!.query(
      `UPDATE crm.phase1_complaint_pending_commits SET status = 'failed', updated_at = now()
       WHERE command_key = $1 AND status = 'pending' AND timeline_snapshot = $2::jsonb`,
      [commandKey, JSON.stringify(rejectedTimeline)],
    );
  }

  /** Clears the durable pending-commit marker once reconcilePendingCase has
   * definitively resolved it (confirmed landed, or proven not to have). */
  async clearPendingCommit(
    commandKey: string,
    expectedTimeline?: readonly ComplaintTimelineEntry[],
    expectedStatus: ComplaintPendingCommitStatus = "confirmed",
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.databaseService!.query(
      `DELETE FROM crm.phase1_complaint_pending_commits WHERE command_key = $1${
        expectedTimeline
          ? " AND timeline_snapshot = $2::jsonb AND status = $3"
          : ""
      }`,
      expectedTimeline
        ? [commandKey, JSON.stringify(expectedTimeline), expectedStatus]
        : [commandKey],
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
