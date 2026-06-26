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
  AuditLogQueryFilter,
  CreateEvidenceDeletionExceptionCommand,
  CreateEvidenceLegalHoldCommand,
  EvidenceRetentionFamily,
  IdentityContext,
  Phase2AuditDomain,
  ReleaseEvidenceLegalHoldCommand,
  ResolveEvidenceDeletionExceptionCommand,
} from "@drts/contracts";
import { PHASE2_AUDIT_DOMAINS } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import { AuditNotificationService } from "./audit-notification.service";

const TRUTHY_QUERY_VALUES = new Set(["1", "true", "yes", "on"]);

function buildAuditLogQueryFilter(
  phase2?: string,
  phase2Domain?: string,
): AuditLogQueryFilter | undefined {
  const filter: AuditLogQueryFilter = {};

  if (phase2 !== undefined && TRUTHY_QUERY_VALUES.has(phase2.toLowerCase())) {
    filter.phase2Only = true;
  }

  if (
    phase2Domain &&
    (PHASE2_AUDIT_DOMAINS as readonly string[]).includes(phase2Domain)
  ) {
    filter.phase2Domain = phase2Domain as Phase2AuditDomain;
  }

  if (filter.phase2Only === undefined && filter.phase2Domain === undefined) {
    return undefined;
  }

  return filter;
}

@Controller("audit")
export class AuditController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  @RequireRealms("tenant", "platform", "ops")
  listAuditLogs(
    @CurrentIdentity() identity: IdentityContext | null,
    @Query("phase2") phase2?: string,
    @Query("phase2Domain") phase2Domain?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filter = buildAuditLogQueryFilter(phase2, phase2Domain);
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listAuditLogs(
          identity,
          requestId,
          filter,
        ),
      },
      requestId,
    );
  }

  @Get("evidence-access-logs")
  @RequireRealms("platform", "ops")
  listEvidenceAccessLogs(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listEvidenceAccessLogs(
          identity,
          requestId,
        ),
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
