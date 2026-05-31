import { Injectable, Logger, Optional } from "@nestjs/common";

import type { UserNotificationRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db/database.service";

type JsonRecordRow = {
  record: unknown;
};

type PersistNotificationChanges = {
  notifications?: readonly UserNotificationRecord[];
};

@Injectable()
export class NotificationRepository {
  private readonly logger = new Logger(NotificationRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<{ notifications: UserNotificationRecord[] }> {
    if (!this.isEnabled()) {
      return { notifications: [] };
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM core.phase1_user_notifications
        ORDER BY created_at DESC, notification_id DESC
      `,
    );

    return {
      notifications: result.rows.map((row) =>
        this.parseRecord<UserNotificationRecord>(
          row.record,
          "core.phase1_user_notifications",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistNotificationChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const notification of changes.notifications ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_user_notifications (
              notification_id,
              recipient_actor_id,
              recipient_realm,
              tenant_id,
              severity,
              event_type,
              read_at,
              created_at,
              record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            ON CONFLICT (notification_id) DO UPDATE SET
              recipient_actor_id = EXCLUDED.recipient_actor_id,
              recipient_realm = EXCLUDED.recipient_realm,
              tenant_id = EXCLUDED.tenant_id,
              severity = EXCLUDED.severity,
              event_type = EXCLUDED.event_type,
              read_at = EXCLUDED.read_at,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            notification.notificationId,
            notification.recipientActorId,
            notification.recipientRealm,
            notification.tenantId ?? null,
            notification.severity,
            notification.eventType,
            notification.readAt,
            notification.createdAt,
            JSON.stringify(notification),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Notification persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
