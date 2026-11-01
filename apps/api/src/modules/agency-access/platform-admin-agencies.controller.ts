import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import type {
  AgencyAccessLogQuery,
  AuditLogRecord,
  CreateRegulatoryAgencyCommand,
  InviteAgencyMemberCommand,
  UpdateAgencyAccessPeriodCommand,
  UpdateRegulatoryAgencyCommand,
} from "@drts/contracts";
import { AGENCY_ACCESS_LOG_ACTIONS } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { IdempotencyService } from "../../common/idempotency";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { AgencyAccessAuditService } from "./agency-access-audit.service";
import { AgencyDirectoryService } from "./agency-directory.service";

function requireActor(
  identity: BootstrapRequestIdentity | null,
): BootstrapRequestIdentity {
  if (!identity) {
    throw new ApiRequestError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Active session required.",
    );
  }
  return identity;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * BUREAU-R13 §2.4 / §5.4 platform-admin agency directory and access-log
 * review. Platform realm only; agencies have no route here (D8).
 */
@Controller("platform-admin")
@RequireRealms("platform")
export class PlatformAdminAgenciesController {
  constructor(
    private readonly agencyDirectoryService: AgencyDirectoryService,
    private readonly agencyAccessAuditService: AgencyAccessAuditService,
    private readonly idempotencyService: IdempotencyService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  @Get("agencies")
  @RequireScopes("agency:directory:read")
  async listAgencies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: await this.agencyDirectoryService.listAgencies() },
      requestId,
    );
  }

  @Post("agencies")
  @RequireScopes("agency:directory:write")
  async createAgency(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreateRegulatoryAgencyCommand,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    const actor = requireActor(identity);
    // agency_code UNIQUE already prevents duplicates; the optional
    // Idempotency-Key additionally replays the original response.
    const result = await this.idempotencyService.execute({
      scope: `platform-admin:agencies:create:${actor.principalId ?? actor.actorId ?? "anonymous"}`,
      idempotencyKey,
      required: false,
      requestPath: "platform-admin/agencies",
      payload: command,
      execute: async () =>
        this.agencyDirectoryService.createAgency(command, actor, requestId),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Get("agencies/:agencyId")
  @RequireScopes("agency:directory:read")
  async getAgency(
    @Param("agencyId") agencyId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.getAgency(agencyId),
      requestId,
    );
  }

  @Patch("agencies/:agencyId")
  @RequireScopes("agency:directory:write")
  async updateAgency(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("agencyId") agencyId: string,
    @Body() command: UpdateRegulatoryAgencyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.updateAgency(
        agencyId,
        command,
        requireActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("agencies/:agencyId/members")
  @RequireScopes("agency:directory:read")
  async listMembers(
    @Param("agencyId") agencyId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: await this.agencyDirectoryService.listMembers(agencyId) },
      requestId,
    );
  }

  @Get("agencies/:agencyId/invitations")
  @RequireScopes("agency:directory:read")
  async listInvitations(
    @Param("agencyId") agencyId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: await this.agencyDirectoryService.listInvitations(agencyId) },
      requestId,
    );
  }

  @Post("agencies/:agencyId/invitations")
  @RequireScopes("agency:directory:write")
  async inviteMember(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("agencyId") agencyId: string,
    @Body() command: InviteAgencyMemberCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.inviteMember(
        agencyId,
        command,
        requireActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("agencies/:agencyId/invitations/:invitationId/revoke")
  @RequireScopes("agency:directory:write")
  async revokeInvitation(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("agencyId") agencyId: string,
    @Param("invitationId") invitationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.revokeInvitation(
        agencyId,
        invitationId,
        requireActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("agencies/:agencyId/members/:membershipId/deactivate")
  @RequireScopes("agency:directory:write")
  async deactivateMember(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("agencyId") agencyId: string,
    @Param("membershipId") membershipId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.deactivateMember(
        agencyId,
        membershipId,
        requireActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Post("agencies/:agencyId/members/:membershipId/access-period")
  @RequireScopes("agency:directory:write")
  async updateAccessPeriod(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("agencyId") agencyId: string,
    @Param("membershipId") membershipId: string,
    @Body() command: UpdateAgencyAccessPeriodCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.agencyDirectoryService.updateAccessPeriod(
        agencyId,
        membershipId,
        command,
        requireActor(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("agency-access-logs")
  @RequireScopes("agency:access_audit:read")
  async listAccessLogs(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() rawQuery: Record<string, unknown>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const actor = requireActor(identity);
    const action = optionalText(rawQuery?.action);
    if (
      action !== undefined &&
      !AGENCY_ACCESS_LOG_ACTIONS.includes(
        action as (typeof AGENCY_ACCESS_LOG_ACTIONS)[number],
      )
    ) {
      throw new ApiRequestError(
        400,
        "AGENCY_ACCESS_LOG_QUERY_INVALID",
        "Unknown access-log action.",
      );
    }
    for (const field of ["from", "to"] as const) {
      const value = optionalText(rawQuery?.[field]);
      if (value !== undefined && !Number.isFinite(Date.parse(value))) {
        throw new ApiRequestError(
          400,
          "AGENCY_ACCESS_LOG_QUERY_INVALID",
          `${field} must be an ISO-8601 timestamp.`,
        );
      }
    }
    const query: AgencyAccessLogQuery = {
      ...(optionalText(rawQuery?.agencyId)
        ? { agencyId: optionalText(rawQuery.agencyId)! }
        : {}),
      ...(optionalText(rawQuery?.principalId)
        ? { principalId: optionalText(rawQuery.principalId)! }
        : {}),
      ...(action
        ? { action: action as NonNullable<AgencyAccessLogQuery["action"]> }
        : {}),
      ...(optionalText(rawQuery?.from)
        ? { from: optionalText(rawQuery.from)! }
        : {}),
      ...(optionalText(rawQuery?.to) ? { to: optionalText(rawQuery.to)! } : {}),
      page: Number(rawQuery?.page) || 1,
      pageSize: Number(rawQuery?.pageSize) || 50,
    };
    const result = await this.agencyAccessAuditService.list(query);
    // §5.4: reviewing agency access is itself audited.
    await this.auditNotificationService?.recordAuditLogAsync({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId: null,
      moduleName: "agency-access",
      actionName: "view_agency_access_logs",
      resourceType: "agency_access_log",
      resourceId: query.agencyId ?? null,
      newValuesSummary: {
        agencyId: query.agencyId ?? null,
        principalId: query.principalId ?? null,
        action: query.action ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        page: result.page,
        returned: result.items.length,
        total: result.total,
      },
      ...(requestId ? { requestId } : {}),
    });
    return toApiSuccessEnvelope(result, requestId);
  }
}
