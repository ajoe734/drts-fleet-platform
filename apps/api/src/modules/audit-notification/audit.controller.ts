import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  CreateEvidenceDeletionExceptionCommand,
  CreateEvidenceLegalHoldCommand,
  EvidenceRetentionFamily,
  IdentityContext,
  ReleaseEvidenceLegalHoldCommand,
  ResolveEvidenceDeletionExceptionCommand,
} from "@drts/contracts";

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

  @Get("evidence-governance/:family/:subjectId")
  @RequireRealms("platform", "ops")
  getEvidenceSubjectGovernance(
    @Param("family") family: EvidenceRetentionFamily,
    @Param("subjectId") subjectId: string,
    @Query("tenantId") tenantId?: string,
    @Query("manifestHash") manifestHash?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.getEvidenceSubjectGovernance(
        family,
        subjectId,
        {
          tenantId: tenantId ?? null,
          manifestHash: manifestHash ?? null,
        },
      ),
      requestId,
    );
  }

  @Get("legal-holds")
  @RequireRealms("platform", "ops")
  listEvidenceLegalHolds(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listEvidenceLegalHolds(),
      },
      requestId,
    );
  }

  @Post("legal-holds")
  @RequireRealms("platform", "ops")
  placeEvidenceLegalHold(
    @Body() command: CreateEvidenceLegalHoldCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.placeEvidenceLegalHold(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("legal-holds/:holdId/release")
  @RequireRealms("platform", "ops")
  releaseEvidenceLegalHold(
    @Param("holdId") holdId: string,
    @Body() command: ReleaseEvidenceLegalHoldCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.releaseEvidenceLegalHold(
        holdId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("deletion-exceptions")
  @RequireRealms("platform", "ops")
  listEvidenceDeletionExceptions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listEvidenceDeletionExceptions(),
      },
      requestId,
    );
  }

  @Post("deletion-exceptions")
  @RequireRealms("platform", "ops")
  registerEvidenceDeletionException(
    @Body() command: CreateEvidenceDeletionExceptionCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.registerEvidenceDeletionException(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("deletion-exceptions/:exceptionId/resolve")
  @RequireRealms("platform", "ops")
  resolveEvidenceDeletionException(
    @Param("exceptionId") exceptionId: string,
    @Body() command: ResolveEvidenceDeletionExceptionCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.resolveEvidenceDeletionException(
        exceptionId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
