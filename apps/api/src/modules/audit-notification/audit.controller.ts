import { Controller, Get, Headers, Param } from "@nestjs/common";

import type { EvidenceRetentionFamily, IdentityContext } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import { AuditNotificationService } from "./audit-notification.service";

@Controller("audit")
export class AuditController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  @RequireRealms("tenant", "platform", "ops")
  listAuditLogs(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listAuditLogs(identity, requestId),
      },
      requestId,
    );
  }

  @Get("evidence-policies")
  @RequireRealms("tenant", "platform", "ops", "partner")
  listEvidencePolicies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.getEvidenceGovernanceCatalog(),
      requestId,
    );
  }

  @Get("evidence-policies/:family")
  @RequireRealms("tenant", "platform", "ops", "partner")
  getEvidencePolicy(
    @Param("family") family: EvidenceRetentionFamily,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.getEvidenceRetentionPolicy(family),
      requestId,
    );
  }
}
