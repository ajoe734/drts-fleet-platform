import { Module, type DynamicModule } from "@nestjs/common";
import { Pool } from "pg";

import type { DatabaseService } from "../../common/db";
import { FileMailOutbox } from "./file-mail-outbox";
import {
  NotificationDeliveryService,
  type NotificationDeliveryOptions,
} from "./notification-delivery.service";
import type { MailOutbox, MailTransport } from "./notification-delivery.types";
import {
  PostgresMailOutbox,
  type PostgresMailOutboxOptions,
} from "./postgres-mail-outbox";
import { createMailpitSmtpTransportFromEnv } from "./smtp-mail.transport";

export type NotificationDeliveryModuleOptions = NotificationDeliveryOptions & {
  outbox: MailOutbox;
  transport?: MailTransport | null;
};

export type PostgresNotificationDeliveryModuleOptions =
  NotificationDeliveryOptions & {
    pool?: Pool | null;
    databaseService?: DatabaseService | null;
    connectionString?: string;
    lockTimeoutMs?: number;
    transport?: MailTransport | null;
  };

export { PostgresMailOutbox, type PostgresMailOutboxOptions };

/** Import explicitly from the downstream adapter module; no global side effects. */
@Module({})
export class NotificationDeliveryModule {
  static register(options: NotificationDeliveryModuleOptions): DynamicModule {
    return {
      module: NotificationDeliveryModule,
      providers: [
        {
          provide: NotificationDeliveryService,
          useFactory: () =>
            new NotificationDeliveryService(
              options.outbox,
              options.transport ?? null,
              options,
            ),
        },
      ],
      exports: [NotificationDeliveryService],
    };
  }

  static forPostgres(
    options: PostgresNotificationDeliveryModuleOptions,
  ): DynamicModule {
    let pool = options.pool;
    if (!pool && !options.databaseService && options.connectionString) {
      pool = new Pool({ connectionString: options.connectionString });
    }
    const outbox = new PostgresMailOutbox({
      pool,
      databaseService: options.databaseService,
      lockTimeoutMs: options.lockTimeoutMs,
    });
    return this.register({
      ...options,
      outbox,
      transport: options.transport ?? null,
    });
  }

  /** Missing storage is a startup error; missing transport stays unavailable. */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    const transport = createMailpitSmtpTransportFromEnv(env);
    const directory = env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
    const outboxType = env.NOTIFICATION_OUTBOX_TYPE?.trim();
    const databaseUrl = env.DATABASE_URL?.trim();

    if (outboxType === "postgres" || (!directory && databaseUrl)) {
      if (!databaseUrl) {
        throw new Error("notification_outbox_unavailable");
      }
      return this.forPostgres({
        connectionString: databaseUrl,
        transport,
      });
    }

    if (!directory) {
      throw new Error("notification_outbox_unavailable");
    }
    return this.register({
      outbox: new FileMailOutbox(directory),
      transport,
    });
  }
}
