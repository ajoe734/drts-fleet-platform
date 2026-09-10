import { Module, type DynamicModule } from "@nestjs/common";

import { FileMailOutbox } from "./file-mail-outbox";
import {
  NotificationDeliveryService,
  type NotificationDeliveryOptions,
} from "./notification-delivery.service";
import type { MailOutbox, MailTransport } from "./notification-delivery.types";
import { createMailpitSmtpTransportFromEnv } from "./smtp-mail.transport";

export type NotificationDeliveryModuleOptions = NotificationDeliveryOptions & {
  outbox: MailOutbox;
  transport?: MailTransport | null;
};

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

  /** Missing storage is a startup error; missing transport stays unavailable. */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    const directory = env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
    if (!directory) {
      throw new Error("notification_outbox_unavailable");
    }
    return this.register({
      outbox: new FileMailOutbox(directory),
      transport: createMailpitSmtpTransportFromEnv(env),
    });
  }
}
