import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { AuditNotificationService } from "./audit-notification.service";

@Controller("audit")
export class AuditController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  listAuditLogs(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listAuditLogs(),
      },
      requestId,
    );
  }
}
