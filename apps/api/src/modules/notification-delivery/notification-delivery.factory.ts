import type { DatabaseService } from "../../common/db";
import { FileMailOutbox } from "./file-mail-outbox";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { PostgresMailOutbox } from "./postgres-mail-outbox";
import { createMailTransportFromEnv } from "./smtp-mail.transport";

/** Validate transport even when optional delivery storage is absent. */
export function createNotificationDeliveryServiceFromEnv(
  env: NodeJS.ProcessEnv,
  databaseService?: DatabaseService,
): NotificationDeliveryService | null {
  const transport = createMailTransportFromEnv(env);
  if (env.NOTIFICATION_OUTBOX_TYPE?.trim() === "postgres") {
    // Explicit durable storage must never silently fall back to ephemeral files.
    if (!databaseService?.isEnabled()) {
      throw new Error("notification_outbox_unavailable");
    }
    return new NotificationDeliveryService(
      new PostgresMailOutbox(databaseService),
      transport,
    );
  }
  const directory = env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
  if (!directory) return null;
  return new NotificationDeliveryService(
    new FileMailOutbox(directory),
    transport,
  );
}
