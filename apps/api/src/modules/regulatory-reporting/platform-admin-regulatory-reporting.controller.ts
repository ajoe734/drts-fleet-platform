import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AuditLogRecord,
  SubmitRegulatoryReportCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { toActionReceiptEnvelope } from "../../common/action-receipt";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
} from "../../common/ui-read-model";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

const REGULATORY_REPORT_REFRESH_MS = 30_000;

@RequireRealms("platform")
@Controller("platform-admin/regulatory-reports")
export class PlatformAdminRegulatoryReportingController {
  constructor(
    private readonly regulatoryReportingService: RegulatoryReportingService,
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  @RequireScopes("sandbox.regulatory_report.review")
  listReports(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.regulatoryReportingService.listReports(), {
        staleAfterMs: REGULATORY_REPORT_REFRESH_MS,
        emptyState: buildEmptyStateEnvelope(
          "no_data",
          "platform_admin.regulatory_reports.empty",
        ),
      }),
      requestId,
    );
  }

  @Post(":reportId/submit")
  @RequireScopes("sandbox.regulatory_report.submit")
  submitReport(
    @Param("reportId") reportId: string,
    @Body() command: SubmitRegulatoryReportCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const actorId = this.requireActorId(identity);
    const report = this.regulatoryReportingService.submitReport(
      reportId,
      command,
      actorId,
    );
    const auditLog = this.auditNotificationService.recordAuditLog({
      actorId,
      actorType: this.resolveAuditActorType(identity),
      tenantId: null,
      moduleName: "regulatory-reporting",
      actionName: "submit_sandbox_regulatory_report",
      resourceType: "regulatory_report",
      resourceId: report.reportId,
      newValuesSummary: {
        reportId: report.reportId,
        reportType: report.reportType,
        acknowledgementRef: report.acknowledgementRef,
        note: command.note?.trim() || null,
      },
      ...(requestId ? { requestId } : {}),
    });

    return toActionReceiptEnvelope(
      {
        auditLog,
        ...(requestId ? { actionId: requestId } : {}),
        resourceType: "regulatory_report",
        resourceId: report.reportId,
        message: "Regulatory report submitted.",
      },
      requestId,
    );
  }

  private requireActorId(identity: BootstrapRequestIdentity | null) {
    const actorId = identity?.actorId?.trim();
    if (!actorId) {
      throw new ApiRequestError(
        401,
        "SANDBOX_COMPLIANCE_IDENTITY_REQUIRED",
        "Authenticated actor identity is required for sandbox compliance actions.",
      );
    }
    return actorId;
  }

  private resolveAuditActorType(
    identity: BootstrapRequestIdentity | null,
  ): AuditLogRecord["actorType"] {
    switch (identity?.actorType) {
      case "system":
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
      case "referral_passenger":
        return identity.actorType;
      default:
        return "platform_admin";
    }
  }
}
