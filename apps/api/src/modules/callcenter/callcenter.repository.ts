import { Injectable, Logger, Optional } from "@nestjs/common";

import type { CallSessionRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class CallcenterRepository {
  private readonly logger = new Logger(CallcenterRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadSessions() {
    if (!this.isEnabled()) {
      return [] as CallSessionRecord[];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM crm.phase1_call_sessions
        ORDER BY updated_at DESC, started_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<CallSessionRecord>(
        row.record,
        "crm.phase1_call_sessions",
      ),
    );
  }

  async upsertSession(session: CallSessionRecord) {
    if (!this.isEnabled()) {
      return;
    }

    const updatedAt = session.endedAt ?? new Date().toISOString();

    await this.databaseService!.query(
      `
        INSERT INTO crm.phase1_call_sessions (
          call_id,
          status,
          started_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb
        )
        ON CONFLICT (call_id) DO UPDATE SET
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        session.callId,
        session.status,
        session.startedAt,
        updatedAt,
        JSON.stringify(session),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Callcenter persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
