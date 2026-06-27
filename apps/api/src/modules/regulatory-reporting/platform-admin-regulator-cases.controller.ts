import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type { RequestSandboxRegulatorCaseExportCommand } from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { toActionReceiptEnvelope } from "../../common/action-receipt";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  buildEmptyStateEnvelope,
  buildUiReadModelList,
  buildUiReadModelResource,
} from "../../common/ui-read-model";
import { PlatformAdminRegulatorCasesService } from "./platform-admin-regulator-cases.service";

const SANDBOX_REGULATOR_CASE_REFRESH_MS = 15_000;

@RequireRealms("platform")
@Controller("platform-admin/compliance/regulator-cases")
export class PlatformAdminRegulatorCasesController {
  constructor(
    private readonly platformAdminRegulatorCasesService: PlatformAdminRegulatorCasesService,
  ) {}

  @Get()
  @RequireScopes("sandbox.regulatory_report.review")
  listCases(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminRegulatorCasesService.listRegulatorCases(),
        {
          staleAfterMs: SANDBOX_REGULATOR_CASE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.compliance.regulator_cases.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get(":caseId")
  @RequireScopes("sandbox.regulatory_report.review")
  getCase(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(
        this.platformAdminRegulatorCasesService.getRegulatorCase(caseId),
        {
          staleAfterMs: SANDBOX_REGULATOR_CASE_REFRESH_MS,
        },
      ),
      requestId,
    );
  }

  @Get(":caseId/exports")
  @RequireScopes("sandbox.regulatory_report.review")
  listCaseExports(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminRegulatorCasesService.listRegulatorCaseExports(caseId),
        {
          staleAfterMs: SANDBOX_REGULATOR_CASE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.compliance.regulator_cases.exports.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post(":caseId/exports")
  @RequireScopes("sandbox.evidence.export.request")
  requestCaseExport(
    @Param("caseId") caseId: string,
    @Body() command: RequestSandboxRegulatorCaseExportCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result =
      this.platformAdminRegulatorCasesService.requestRegulatorCaseExport(
        caseId,
        command,
        this.requireActorId(identity),
        requestId,
      );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        ...(requestId ? { actionId: requestId } : {}),
        resourceType: "sandbox_evidence_export",
        resourceId: result.data.exportRequestId,
        message: "Regulator case controlled export requested.",
      },
      requestId,
    );
  }

  @Get(":caseId/access-logs")
  @RequireScopes("sandbox.regulatory_report.review")
  listCaseAccessLogs(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminRegulatorCasesService.listRegulatorCaseAccessLogs(
          caseId,
        ),
        {
          staleAfterMs: SANDBOX_REGULATOR_CASE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.compliance.regulator_cases.access_logs.empty",
          ),
        },
      ),
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
}
