import { Injectable, Logger, Optional } from "@nestjs/common";

import { DatabaseService } from "../../common/db";
import type {
  AssistantMessageRecord,
  UserAssistantSession,
} from "./assistant.types";

type JsonRecordRow = {
  record: unknown;
};

export interface AssistantState {
  conversations: UserAssistantSession[];
  messages: AssistantMessageRecord[];
}

export interface PersistAssistantChanges {
  conversations?: readonly UserAssistantSession[];
  messages?: readonly AssistantMessageRecord[];
  deletedMessageIds?: readonly string[];
}

@Injectable()
export class AssistantRepository {
  private readonly logger = new Logger(AssistantRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<AssistantState> {
    if (!this.isEnabled()) {
      return {
        conversations: [],
        messages: [],
      };
    }

    const [conversationResult, messageResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM assistant.user_assistant_sessions
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM assistant.assistant_message_records
          ORDER BY created_at ASC, message_id ASC
        `,
      ),
    ]);

    return {
      conversations: conversationResult.rows.map((row) =>
        this.parseRecord<UserAssistantSession>(
          row.record,
          "assistant.user_assistant_sessions",
        ),
      ),
      messages: messageResult.rows.map((row) =>
        this.parseRecord<AssistantMessageRecord>(
          row.record,
          "assistant.assistant_message_records",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistAssistantChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const conversation of changes.conversations ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO assistant.user_assistant_sessions (
              conversation_id,
              realm,
              tenant_id,
              updated_at,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (conversation_id) DO UPDATE SET
              realm = EXCLUDED.realm,
              tenant_id = EXCLUDED.tenant_id,
              updated_at = EXCLUDED.updated_at,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            conversation.conversationId,
            conversation.realm,
            conversation.tenantId,
            conversation.updatedAt,
            conversation.createdAt,
            JSON.stringify(conversation),
          ],
        ),
      );
    }

    for (const message of changes.messages ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO assistant.assistant_message_records (
              message_id,
              conversation_id,
              realm,
              tenant_id,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (message_id) DO UPDATE SET
              conversation_id = EXCLUDED.conversation_id,
              realm = EXCLUDED.realm,
              tenant_id = EXCLUDED.tenant_id,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            message.messageId,
            message.conversationId,
            message.realm,
            message.tenantId,
            message.createdAt,
            JSON.stringify(message),
          ],
        ),
      );
    }

    for (const messageId of changes.deletedMessageIds ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            DELETE FROM assistant.assistant_message_records
            WHERE message_id = $1
          `,
          [messageId],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Assistant persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
