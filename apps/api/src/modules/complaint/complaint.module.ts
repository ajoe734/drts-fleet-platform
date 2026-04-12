import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintController } from "./complaint.controller";
import { ComplaintRepository } from "./complaint.repository";
import { ComplaintService } from "./complaint.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [ComplaintController],
  providers: [ComplaintRepository, ComplaintService],
  exports: [ComplaintService],
})
export class ComplaintModule {}
