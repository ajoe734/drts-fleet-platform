import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";

import type { PoolClient } from "pg";

import { DatabaseService } from "../../common/db";

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

  async persistChanges(
    changes: PersistComplaintChanges,
    transaction?: PoolClient,
  ) {
    if (!this.isEnabled() && !transaction) {
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

  async loadSettlementState(): Promise<ComplaintState> {
    if (!this.isEnabled())
      return { complaintCases: [], complaintTimelines: [] };
    const cases = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM crm.phase1_complaint_cases WHERE record->>'category' = 'settlement_dispute'`,
    );
    const timelines = await this.databaseService!.query<JsonRecordRow>(
      `SELECT timeline.record FROM crm.phase1_complaint_timelines timeline
       JOIN crm.phase1_complaint_cases c ON c.case_no = timeline.case_no
       WHERE c.record->>'category' = 'settlement_dispute' ORDER BY timeline.created_at`,
    );
    return {
      complaintCases: cases.rows.map((row) =>
        this.parseRecord<ComplaintCaseRecord>(
          row.record,
          "settlement complaint",
        ),
      ),
      complaintTimelines: timelines.rows.map((row) =>
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
