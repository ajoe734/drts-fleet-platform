import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";

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
