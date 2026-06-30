import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateServiceAreaBoundaryCommand,
  CreateStopPolicyCommand,
  EvaluateServiceAreaCommand,
  PublishServiceAreaBoundaryCommand,
  PublishStopPolicyCommand,
  RetireServiceAreaBoundaryCommand,
  RetireStopPolicyCommand,
  ServiceAreaAdminMutationResponse,
  ServiceAreaDefinitionsResponse,
  UpdateServiceAreaBoundaryCommand,
  UpdateStopPolicyCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { ServiceAreaService } from "./service-area.service";

@Controller("service-area")
export class ServiceAreaController {
  constructor(private readonly serviceAreaService: ServiceAreaService) {}

  @Get("definitions")
  listDefinitions(@Headers("x-request-id") requestId?: string) {
    const definitions: ServiceAreaDefinitionsResponse = {
      serviceAreas: this.serviceAreaService.listServiceAreas(),
      stopPolicies: this.serviceAreaService.listStopPolicies(),
      generatedAt: new Date().toISOString(),
    };
    return toApiSuccessEnvelope(definitions, requestId);
  }

  @Post("evaluate")
  evaluateServiceArea(
    @Body() command: EvaluateServiceAreaCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.serviceAreaService.evaluate(command),
      requestId,
    );
  }

  @Post("admin/service-areas")
  async createServiceArea(
    @Body() command: CreateServiceAreaBoundaryCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.createServiceArea(
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        serviceArea: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/service-areas/:serviceAreaId/update")
  async updateServiceArea(
    @Param("serviceAreaId") serviceAreaId: string,
    @Body() command: UpdateServiceAreaBoundaryCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.updateServiceArea(
      serviceAreaId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        serviceArea: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/service-areas/:serviceAreaId/submit-review")
  async submitServiceAreaForReview(
    @Param("serviceAreaId") serviceAreaId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.submitServiceAreaForReview(
      serviceAreaId,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        serviceArea: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/service-areas/:serviceAreaId/publish")
  async publishServiceArea(
    @Param("serviceAreaId") serviceAreaId: string,
    @Body() command: PublishServiceAreaBoundaryCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.publishServiceArea(
      serviceAreaId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        serviceArea: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/service-areas/:serviceAreaId/retire")
  async retireServiceArea(
    @Param("serviceAreaId") serviceAreaId: string,
    @Body() command: RetireServiceAreaBoundaryCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.retireServiceArea(
      serviceAreaId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        serviceArea: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/stop-policies")
  async createStopPolicy(
    @Body() command: CreateStopPolicyCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.createStopPolicy(
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        stopPolicy: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/stop-policies/:stopPolicyId/update")
  async updateStopPolicy(
    @Param("stopPolicyId") stopPolicyId: string,
    @Body() command: UpdateStopPolicyCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.updateStopPolicy(
      stopPolicyId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        stopPolicy: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/stop-policies/:stopPolicyId/submit-review")
  async submitStopPolicyForReview(
    @Param("stopPolicyId") stopPolicyId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.submitStopPolicyForReview(
      stopPolicyId,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        stopPolicy: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/stop-policies/:stopPolicyId/publish")
  async publishStopPolicy(
    @Param("stopPolicyId") stopPolicyId: string,
    @Body() command: PublishStopPolicyCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.publishStopPolicy(
      stopPolicyId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        stopPolicy: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  @Post("admin/stop-policies/:stopPolicyId/retire")
  async retireStopPolicy(
    @Param("stopPolicyId") stopPolicyId: string,
    @Body() command: RetireStopPolicyCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceAreaService.retireStopPolicy(
      stopPolicyId,
      command,
      this.toMutationContext(identity, requestId),
    );
    return toApiSuccessEnvelope(
      this.toMutationResponse({
        stopPolicy: result.record,
        audit: result.audit,
      }),
      requestId,
    );
  }

  private toMutationContext(
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    return {
      actorId: identity?.actorId ?? null,
      actorType: this.toAuditActorType(identity?.actorType),
      ...(requestId ? { requestId } : {}),
    };
  }

  private toAuditActorType(
    actorType: BootstrapRequestIdentity["actorType"] | undefined,
  ): AuditLogRecord["actorType"] {
    switch (actorType) {
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
      case "referral_passenger":
        return actorType;
      default:
        return "platform_admin";
    }
  }

  private toMutationResponse(input: {
    serviceArea?: ServiceAreaAdminMutationResponse["serviceArea"];
    stopPolicy?: ServiceAreaAdminMutationResponse["stopPolicy"];
    audit: AuditLogRecord | null;
  }): ServiceAreaAdminMutationResponse {
    return {
      ...(input.serviceArea ? { serviceArea: input.serviceArea } : {}),
      ...(input.stopPolicy ? { stopPolicy: input.stopPolicy } : {}),
      auditId: input.audit?.auditId ?? null,
      generatedAt: new Date().toISOString(),
    };
  }
}
