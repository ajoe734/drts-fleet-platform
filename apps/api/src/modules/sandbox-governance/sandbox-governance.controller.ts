import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateApprovalDocumentVersionCommand,
  CreateSandboxOperatingAreaDraftCommand,
  CreateSandboxExperimentProgramCommand,
  CreateSandboxJurisdictionProfileCommand,
  CreateSandboxRouteDraftCommand,
  GenerateSandboxComplianceSnapshotCommand,
  PublishSandboxGovernanceVersionCommand,
  ResumeSandboxExperimentAuthorizationsCommand,
  RollbackSandboxGovernanceVersionCommand,
  SandboxGeometryLifecycleCommand,
  SuspendSandboxExperimentAuthorizationsCommand,
  UpsertApprovedOperatingAreasCommand,
  UpsertApprovedRoutesCommand,
  UpsertSafetyOperatorQualificationsCommand,
  UpdateApprovalDocumentVersionCommand,
  UpdateSandboxExperimentProgramCommand,
  UpdateSandboxJurisdictionProfileCommand,
  UpsertVehicleEnrollmentsCommand,
  ValidateOperatingAreaPointCommand,
  ValidateRouteContainmentCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { SandboxGovernanceService } from "./sandbox-governance.service";

@Controller("admin/sandbox-governance")
export class SandboxGovernanceController {
  constructor(
    private readonly sandboxGovernanceService: SandboxGovernanceService,
  ) {}

  @Get("experiments")
  listExperiments(
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listExperiments(asOf) },
      requestId,
    );
  }

  @Post("experiments")
  createExperiment(
    @Body() command: CreateSandboxExperimentProgramCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.createExperiment(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("experiments/:experimentId")
  getExperiment(
    @Param("experimentId") experimentId: string,
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.getExperiment(experimentId, asOf),
      requestId,
    );
  }

  @Patch("experiments/:experimentId")
  updateExperiment(
    @Param("experimentId") experimentId: string,
    @Body() command: UpdateSandboxExperimentProgramCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.updateExperiment(
        experimentId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Delete("experiments/:experimentId")
  archiveExperiment(
    @Param("experimentId") experimentId: string,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.archiveExperiment(
        experimentId,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/versions/:versionId/publish")
  publishExperimentVersion(
    @Param("experimentId") experimentId: string,
    @Param("versionId") versionId: string,
    @Body() command: PublishSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.publishExperimentVersion(
        experimentId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/suspend")
  suspendExperimentAuthorizations(
    @Param("experimentId") experimentId: string,
    @Body() command: SuspendSandboxExperimentAuthorizationsCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.suspendExperimentAuthorizations(
        experimentId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/resume-authorizations")
  resumeExperimentAuthorizations(
    @Param("experimentId") experimentId: string,
    @Body() command: ResumeSandboxExperimentAuthorizationsCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.resumeExperimentAuthorizations(
        experimentId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/rollback/:versionId")
  rollbackExperimentVersion(
    @Param("experimentId") experimentId: string,
    @Param("versionId") versionId: string,
    @Body() command: RollbackSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.rollbackExperimentVersion(
        experimentId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("jurisdictions")
  listJurisdictions(
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listJurisdictions(asOf) },
      requestId,
    );
  }

  @Post("jurisdictions")
  createJurisdiction(
    @Body() command: CreateSandboxJurisdictionProfileCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.createJurisdiction(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("jurisdictions/:jurisdictionId")
  getJurisdiction(
    @Param("jurisdictionId") jurisdictionId: string,
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.getJurisdiction(jurisdictionId, asOf),
      requestId,
    );
  }

  @Patch("jurisdictions/:jurisdictionId")
  updateJurisdiction(
    @Param("jurisdictionId") jurisdictionId: string,
    @Body() command: UpdateSandboxJurisdictionProfileCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.updateJurisdiction(
        jurisdictionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Delete("jurisdictions/:jurisdictionId")
  archiveJurisdiction(
    @Param("jurisdictionId") jurisdictionId: string,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.archiveJurisdiction(
        jurisdictionId,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("jurisdictions/:jurisdictionId/versions/:versionId/publish")
  publishJurisdictionVersion(
    @Param("jurisdictionId") jurisdictionId: string,
    @Param("versionId") versionId: string,
    @Body() command: PublishSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.publishJurisdictionVersion(
        jurisdictionId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("jurisdictions/:jurisdictionId/rollback/:versionId")
  rollbackJurisdictionVersion(
    @Param("jurisdictionId") jurisdictionId: string,
    @Param("versionId") versionId: string,
    @Body() command: RollbackSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.rollbackJurisdictionVersion(
        jurisdictionId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("approval-documents")
  listApprovalDocuments(
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listApprovalDocuments(asOf) },
      requestId,
    );
  }

  @Post("approval-documents")
  createApprovalDocument(
    @Body() command: CreateApprovalDocumentVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.createApprovalDocument(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("approval-documents/:documentId")
  getApprovalDocument(
    @Param("documentId") documentId: string,
    @Query("asOf") asOf?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.getApprovalDocument(documentId, asOf),
      requestId,
    );
  }

  @Patch("approval-documents/:documentId")
  uploadApprovalDocumentVersion(
    @Param("documentId") documentId: string,
    @Body() command: UpdateApprovalDocumentVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.uploadApprovalDocumentVersion(
        documentId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Delete("approval-documents/:documentId")
  archiveApprovalDocument(
    @Param("documentId") documentId: string,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.archiveApprovalDocument(
        documentId,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("approval-documents/:documentId/versions/:versionId/publish")
  publishApprovalDocumentVersion(
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() command: PublishSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.publishApprovalDocumentVersion(
        documentId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("approval-documents/:documentId/rollback/:versionId")
  rollbackApprovalDocumentVersion(
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() command: RollbackSandboxGovernanceVersionCommand,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.rollbackApprovalDocumentVersion(
        documentId,
        versionId,
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/compliance-snapshot")
  generateComplianceSnapshot(
    @Param("experimentId") experimentId: string,
    @Query("asOf") asOf: string | undefined,
    @Query("actorId") actorId: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const command: GenerateSandboxComplianceSnapshotCommand = {};
    if (asOf !== undefined) {
      command.asOf = asOf;
    }
    if (actorId !== undefined) {
      command.actorId = actorId;
    }
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.generateComplianceSnapshot(
        experimentId,
        command,
      ),
      requestId,
    );
  }

  @Get("operating-areas")
  listOperatingAreas(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listOperatingAreas() },
      requestId,
    );
  }

  @Get("operating-areas/geojson")
  exportOperatingAreasGeoJson(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.exportOperatingAreasGeoJson(),
      requestId,
    );
  }

  @Post("operating-areas/drafts")
  async createOperatingAreaDraft(
    @Body() command: CreateSandboxOperatingAreaDraftCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.createOperatingAreaDraft(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("operating-areas/:areaId/versions/:version/submit-review")
  async submitOperatingAreaForReview(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.submitOperatingAreaForReview(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("operating-areas/:areaId/versions/:version/publish")
  async publishOperatingArea(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.publishOperatingArea(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("operating-areas/:areaId/versions/:version/retire")
  async retireOperatingArea(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.retireOperatingArea(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("pickup-dropoff-zones/geojson")
  exportPickupDropoffZonesGeoJson(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.exportPickupDropoffZonesGeoJson(),
      requestId,
    );
  }

  @Post("pickup-dropoff-zones/drafts")
  async createPickupDropoffZoneDraft(
    @Body() command: CreateSandboxOperatingAreaDraftCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.createPickupDropoffZoneDraft(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("pickup-dropoff-zones/:areaId/versions/:version/submit-review")
  async submitPickupDropoffZoneForReview(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.submitOperatingAreaForReview(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("pickup-dropoff-zones/:areaId/versions/:version/publish")
  async publishPickupDropoffZone(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.publishOperatingArea(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("pickup-dropoff-zones/:areaId/versions/:version/retire")
  async retirePickupDropoffZone(
    @Param("areaId") areaId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.retireOperatingArea(
        areaId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Put("operating-areas")
  async updateOperatingAreas(
    @Body() command: UpsertApprovedOperatingAreasCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateOperatingAreas(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("routes")
  listRoutes(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listRoutes() },
      requestId,
    );
  }

  @Get("routes/geojson")
  exportRoutesGeoJson(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.exportRoutesGeoJson(),
      requestId,
    );
  }

  @Post("routes/drafts")
  async createRouteDraft(
    @Body() command: CreateSandboxRouteDraftCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.createRouteDraft(
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("routes/:routeId/versions/:version/submit-review")
  async submitRouteForReview(
    @Param("routeId") routeId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.submitRouteForReview(
        routeId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("routes/:routeId/versions/:version/publish")
  async publishRoute(
    @Param("routeId") routeId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.publishRoute(
        routeId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("routes/:routeId/versions/:version/retire")
  async retireRoute(
    @Param("routeId") routeId: string,
    @Param("version") version: string,
    @Body() command: SandboxGeometryLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.retireRoute(
        routeId,
        Number(version),
        command,
        toAuditActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Put("routes")
  async updateRoutes(
    @Body() command: UpsertApprovedRoutesCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateRoutes(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("vehicle-enrollments")
  listVehicleEnrollments(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listVehicleEnrollments() },
      requestId,
    );
  }

  @Put("vehicle-enrollments")
  async updateVehicleEnrollments(
    @Body() command: UpsertVehicleEnrollmentsCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateVehicleEnrollments(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("safety-operator-qualifications")
  listSafetyOperatorQualifications(
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.sandboxGovernanceService.listSafetyOperatorQualifications(),
      },
      requestId,
    );
  }

  @Put("safety-operator-qualifications")
  async updateSafetyOperatorQualifications(
    @Body() command: UpsertSafetyOperatorQualificationsCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items:
          await this.sandboxGovernanceService.updateSafetyOperatorQualifications(
            command,
            toAuditActor(identity),
            requestId,
          ),
      },
      requestId,
    );
  }

  @Post("validate-point")
  async validatePoint(
    @Body() command: ValidateOperatingAreaPointCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.validatePointInApprovedArea(command),
      requestId,
    );
  }

  @Post("validate-route")
  async validateRoute(
    @Body() command: ValidateRouteContainmentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxGovernanceService.validateRouteContainment(command),
      requestId,
    );
  }
}

function toAuditActor(identity: BootstrapRequestIdentity | null) {
  const actorType: AuditLogRecord["actorType"] =
    identity?.actorType === "driver_user"
      ? "ops_user"
      : (identity?.actorType ?? "system");
  return {
    actorId: identity?.actorId ?? null,
    actorType,
    tenantId: identity?.tenantId ?? null,
  };
}
