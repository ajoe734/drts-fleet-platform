import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type {
  ActionReceipt,
  DriverMatchingSuppression,
  PlatformCode,
} from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceService } from "../platform-presence/platform-presence.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";

type ForceOfflineCommand = {
  reasonCode: string;
  note: string;
  expiresAt: string;
  relatedIncidentId?: string | null;
};

type RequestReauthCommand = {
  tokenExpiresAt?: string | null;
};

type SuppressMatchingCommand = {
  reasonCode: DriverMatchingSuppression["reasonCode"];
  note: string;
  expiresAt: string;
  relatedIncidentId?: string | null;
};

type LiftSuppressionCommand = {
  note?: string | null;
};

type MarkForwardedUnavailableCommand = {
  reason: string;
  note?: string | null;
};

type GenerateStatementCommand = {
  periodMonth: string;
};

@Controller("ops/drivers")
@RequireRealms("ops")
export class OpsDriverActionsController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    private readonly billingSettlementService: BillingSettlementService,
    private readonly forwarderService: ForwarderService,
    private readonly platformPresenceService: PlatformPresenceService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Post(":driverId/platforms/:platformCode/force-offline")
  async forceOffline(
    @Param("driverId") driverId: string,
    @Param("platformCode") platformCode: string,
    @Body() command: ForceOfflineCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertNonBlank(command.reasonCode, "reasonCode");
    this.assertNonBlank(command.note, "note");
    this.assertIsoTimestamp(command.expiresAt, "expiresAt");

    await this.platformPresenceService.setOffline(
      driverId,
      platformCode as PlatformCode,
      requestId,
      {
        reasonCode: command.reasonCode,
        note: command.note,
        expiresAt: command.expiresAt,
        relatedIncidentId: command.relatedIncidentId ?? null,
      },
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(requestId, "force_offline", "platform_presence"),
      requestId,
    );
  }

  @Post(":driverId/platforms/:platformCode/request-reauth")
  async requestReauth(
    @Param("driverId") driverId: string,
    @Param("platformCode") platformCode: string,
    @Body() command: RequestReauthCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.platformPresenceService.setOnline(
      driverId,
      platformCode as PlatformCode,
      command.tokenExpiresAt ?? new Date().toISOString(),
      requestId,
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(requestId, "request_reauth", "platform_presence"),
      requestId,
    );
  }

  @Post(":driverId/matching-suppression")
  async suppressMatching(
    @Param("driverId") driverId: string,
    @Body() command: SuppressMatchingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertNonBlank(command.reasonCode, "reasonCode");
    this.assertNonBlank(command.note, "note");
    this.assertIsoTimestamp(command.expiresAt, "expiresAt");

    this.regulatoryRegistryService.setMatchingSuppression(driverId, {
      active: true,
      reasonCode: command.reasonCode,
      sourceIncidentId: command.relatedIncidentId ?? null,
      expiresAt: command.expiresAt,
      liftedAt: null,
    });
    this.regulatoryRegistryService.updateDriverWorkState(
      driverId,
      { workState: "incident_hold" },
      requestId,
      {
        actionNameOverride: "suppress_matching",
        newValuesSummary: {
          reasonCode: command.reasonCode,
          note: command.note,
          expiresAt: command.expiresAt,
          relatedIncidentId: command.relatedIncidentId ?? null,
        },
      },
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(requestId, "suppress_matching", "driver"),
      requestId,
    );
  }

  @Post(":driverId/matching-suppression/lift")
  async liftSuppression(
    @Param("driverId") driverId: string,
    @Body() command: LiftSuppressionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const current =
      this.regulatoryRegistryService.getMatchingSuppression(driverId);
    this.regulatoryRegistryService.setMatchingSuppression(driverId, null);
    this.regulatoryRegistryService.updateDriverWorkState(
      driverId,
      { workState: "available" },
      requestId,
      {
        actionNameOverride: "lift_suppression",
        newValuesSummary: {
          note: command.note?.trim() || null,
          previousReasonCode: current?.reasonCode ?? null,
          previousExpiresAt: current?.expiresAt ?? null,
          relatedIncidentId: current?.sourceIncidentId ?? null,
        },
      },
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(requestId, "lift_suppression", "driver"),
      requestId,
    );
  }

  @Post(":driverId/forwarded-orders/:orderId/mark-unavailable")
  async markForwardedUnavailable(
    @Param("orderId") orderId: string,
    @Body() command: MarkForwardedUnavailableCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertNonBlank(command.reason, "reason");

    this.forwarderService.engageManualFallback(
      orderId,
      {
        reason: command.reason,
        requestedBy: "ops-driver-actions",
        notes: command.note?.trim() || null,
      },
      requestId,
      "mark_forwarded_unavailable",
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(
        requestId,
        "mark_forwarded_unavailable",
        "forwarded_order",
      ),
      requestId,
    );
  }

  @Post(":driverId/statements/generate")
  async generateStatement(
    @Param("driverId") driverId: string,
    @Body() command: GenerateStatementCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertNonBlank(command.periodMonth, "periodMonth");
    await this.billingSettlementService.generateDriverStatements(
      {
        driverId,
        periodMonth: command.periodMonth,
      },
      requestId,
    );

    return toApiSuccessEnvelope(
      this.buildReceipt(
        requestId,
        "generate_driver_statement",
        "driver_statement",
      ),
      requestId,
    );
  }

  private buildReceipt(
    requestId: string | undefined,
    actionId: string,
    resourceType: string,
  ): ActionReceipt {
    const auditLog = this.auditNotificationService
      .getAuditLogsSnapshot()
      .find((entry) => requestId && entry.requestId === requestId);

    if (!auditLog) {
      throw new ApiRequestError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "AUDIT_RECEIPT_NOT_FOUND",
        "Audit receipt could not be resolved for the completed action.",
      );
    }

    return {
      actionId,
      auditId: auditLog.auditId,
      resourceType,
      resourceId: auditLog.resourceId ?? "unknown",
      status: "completed",
      message: `${actionId} completed`,
    };
  }

  private assertIsoTimestamp(value: string, field: string) {
    this.assertNonBlank(value, field);
    if (Number.isNaN(new Date(value).getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_TIME_RANGE",
        `${field} must be a valid ISO timestamp.`,
        { field },
      );
    }
  }

  private assertNonBlank(value: string | null | undefined, field: string) {
    if (!value?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
  }
}
