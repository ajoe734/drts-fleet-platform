import { Module } from "@nestjs/common";

import { NotificationsController } from "./notifications.controller";
import { NotificationService } from "./notification.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
