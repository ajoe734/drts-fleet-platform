import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { NotificationsController } from "./notifications.controller";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationRepository, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
