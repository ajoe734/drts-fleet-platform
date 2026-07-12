import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  ApproveSandboxControlledEvidenceExportCommand,
  ApproveSandboxLegalHoldReleaseCommand,
  CreateSandboxLegalHoldCommand,
  RequestSandboxControlledEvidenceExportCommand,
  RequestSandboxLegalHoldReleaseCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
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
import { PlatformAdminComplianceService } from "./platform-admin-compliance.service";

const SANDBOX_COMPLIANCE_REFRESH_MS = 15_000;

@RequireRealms("platform", "ops")
@Controller("platform-admin")
export class PlatformAdminComplianceController {
  constructor(
    private readonly platformAdminComplianceService: PlatformAdminComplianceService,
  ) {}

  @Get("investigations")
  @RequireScopes("sandbox.investigation.read")
  listInvestigations(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminComplianceService.listInvestigations(),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.investigations.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get("investigations/:caseId")
  @RequireScopes("sandbox.investigation.read")
  getInvestigation(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(
        this.platformAdminComplianceService.getInvestigation(caseId),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
        },
      ),
      requestId,
    );
  }

  @Get("investigations/:caseId/timeline")
  @RequireScopes("sandbox.investigation.read")
  getInvestigationTimeline(
    @Param("caseId") caseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminComplianceService.getInvestigationTimeline(caseId),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.investigations.timeline.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get("compliance/takeover-reviews")
  @RequireScopes("sandbox.compliance.read")
  listTakeoverReviews(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminComplianceService.listTakeoverReviews(),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.compliance.takeover_reviews.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get("compliance/evidence-discrepancies")
  @RequireScopes("sandbox.compliance.read")
  listEvidenceDiscrepancies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminComplianceService.listEvidenceDiscrepancies(),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.compliance.evidence_discrepancies.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Get("evidence/manifests/:manifestId")
  @RequireScopes("sandbox.evidence.preview")
  getEvidenceManifest(
    @Param("manifestId") manifestId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      buildUiReadModelResource(
        this.platformAdminComplianceService.getEvidenceManifest(manifestId),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
        },
      ),
      requestId,
    );
  }

  @Get("evidence/exports")
  @RequireScopes("sandbox.evidence.preview")
  listControlledExports(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(
        this.platformAdminComplianceService.listControlledExports(),
        {
          staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
          emptyState: buildEmptyStateEnvelope(
            "no_data",
            "platform_admin.evidence.exports.empty",
          ),
        },
      ),
      requestId,
    );
  }

  @Post("evidence/exports/request")
  @RequireRealms("platform")
  @RequireScopes("sandbox.evidence.export.request")
  requestControlledExport(
    @Body() command: RequestSandboxControlledEvidenceExportCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.platformAdminComplianceService.requestControlledExport(
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
        message: "Controlled export request created.",
      },
      requestId,
    );
  }

  @Post("evidence/exports/:exportRequestId/approve")
  @RequireRealms("platform")
  @RequireScopes("sandbox.evidence.export.approve")
  approveControlledExport(
    @Param("exportRequestId") exportRequestId: string,
    @Body() command: ApproveSandboxControlledEvidenceExportCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.platformAdminComplianceService.approveControlledExport(
      exportRequestId,
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
        message: "Controlled export approved.",
      },
      requestId,
    );
  }

  @Get("evidence/legal-holds")
  @RequireScopes("sandbox.evidence.preview")
  listLegalHolds(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      buildUiReadModelList(this.platformAdminComplianceService.listLegalHolds(), {
        staleAfterMs: SANDBOX_COMPLIANCE_REFRESH_MS,
        emptyState: buildEmptyStateEnvelope(
          "no_data",
          "platform_admin.evidence.legal_holds.empty",
        ),
      }),
      requestId,
    );
  }

  @Post("evidence/legal-holds")
  @RequireRealms("platform")
  @RequireScopes("sandbox.legal_hold.place")
  placeLegalHold(
    @Body() command: CreateSandboxLegalHoldCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.platformAdminComplianceService.placeLegalHold(
      command,
      this.requireActorId(identity),
      requestId,
    );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        ...(requestId ? { actionId: requestId } : {}),
        resourceType: "sandbox_legal_hold",
        resourceId: result.data.holdId,
        message: "Sandbox legal hold placed.",
      },
      requestId,
    );
  }

  @Post("evidence/legal-holds/:holdId/release-request")
  @RequireRealms("platform")
  @RequireScopes("sandbox.legal_hold.release.request")
  requestLegalHoldRelease(
    @Param("holdId") holdId: string,
    @Body() command: RequestSandboxLegalHoldReleaseCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.platformAdminComplianceService.requestLegalHoldRelease(
      holdId,
      command,
      this.requireActorId(identity),
      requestId,
    );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        ...(requestId ? { actionId: requestId } : {}),
        resourceType: "sandbox_legal_hold",
        resourceId: result.data.holdId,
        message: "Sandbox legal hold release requested.",
      },
      requestId,
    );
  }

  @Post("evidence/legal-holds/:holdId/release-approve")
  @RequireRealms("platform")
  @RequireScopes("sandbox.legal_hold.release.approve")
  approveLegalHoldRelease(
    @Param("holdId") holdId: string,
    @Body() command: ApproveSandboxLegalHoldReleaseCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.platformAdminComplianceService.approveLegalHoldRelease(
      holdId,
      command,
      this.requireActorId(identity),
      requestId,
    );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        ...(requestId ? { actionId: requestId } : {}),
        resourceType: "sandbox_legal_hold",
        resourceId: result.data.holdId,
        message: "Sandbox legal hold released.",
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
}
