import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  CreateDriverMatchingSuppressionCommand,
  DriverMatchingSuppression,
  DriverMatchingSuppressionReason,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverMatchingSuppressionRepository } from "./driver-matching-suppression.repository";

const DRIVER_MATCHING_SUPPRESSION_REASON_VALUES = [
  "shift_offline",
  "platform_offline",
  "platform_reauth_required",
  "driver_cert_invalid",
  "vehicle_ineligible",
  "incident_hold",
  "manual_ops_hold",
  "external_platform_suspension",
  "compliance_hold",
] as const;

type MatchingSuppressionActor = {
  actorId: string;
  actorType: "ops_user";
};

@Injectable()
export class DriverMatchingSuppressionService implements OnModuleInit {
  private suppressions: DriverMatchingSuppression[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly repository?: DriverMatchingSuppressionRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;

    try {
      const data = await this.repository.loadAll();
      if (data.length === 0) return;
      this.suppressions = data.map((record) => this.cloneStored(record));
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  createSuppression(
    driverId: string,
    command: CreateDriverMatchingSuppressionCommand,
    actor: MatchingSuppressionActor,
    requestId?: string,
  ) {
    const normalizedDriverId = this.normalizeRequiredText("driverId", driverId);
    const now = new Date().toISOString();
    const stored: DriverMatchingSuppression = {
      suppressionId: `dms-${randomUUID()}`,
      driverId: normalizedDriverId,
      platformCode: this.normalizeOptionalText(command.platformCode),
      serviceBucket: this.normalizeOptionalText(command.serviceBucket),
      reason: this.requireReason(command.reason),
      reasonMessage: this.normalizeRequiredText(
        "reasonMessage",
        command.reasonMessage,
      ),
      status: "active",
      createdAt: now,
      releasedAt: null,
      createdByActorId: actor.actorId,
      releaseAction: null,
      auditId: null,
    };

    const auditLog = this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: null,
        moduleName: "driver-matching-suppression",
        actionName: "create_driver_matching_suppression",
        resourceType: "driver_matching_suppression",
        resourceId: stored.suppressionId,
        newValuesSummary: {
          driverId: stored.driverId,
          platformCode: stored.platformCode,
          serviceBucket: stored.serviceBucket ?? null,
          reason: stored.reason,
          status: stored.status,
        },
      },
      requestId,
    );

    stored.auditId = auditLog.auditId;
    this.suppressions = [this.cloneStored(stored), ...this.suppressions];
    this.persist(stored, "create_driver_matching_suppression");

    return this.present(stored, actor);
  }

  listForDriver(driverId: string) {
    const normalizedDriverId = this.normalizeRequiredText("driverId", driverId);

    return this.suppressions
      .filter((record) => record.driverId === normalizedDriverId)
      .map((record) => this.present(record, null));
  }

  releaseSuppression(
    driverId: string,
    suppressionId: string,
    actor: MatchingSuppressionActor,
    requestId?: string,
  ): ActionReceipt {
    const suppression = this.requireSuppression(driverId, suppressionId);

    if (
      suppression.createdByActorId &&
      suppression.createdByActorId !== actor.actorId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "MATCHING_SUPPRESSION_RELEASE_FORBIDDEN",
        "Only the actor who created the suppression may release it.",
        {
          suppressionId,
          createdByActorId: suppression.createdByActorId,
          actorId: actor.actorId,
        },
      );
    }

    if (suppression.status === "released") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MATCHING_SUPPRESSION_ALREADY_RELEASED",
        "Driver matching suppression has already been released.",
        {
          suppressionId,
          releasedAt: suppression.releasedAt,
        },
      );
    }

    const releasedAt = new Date().toISOString();
    const updated: DriverMatchingSuppression = {
      ...this.cloneStored(suppression),
      status: "released",
      releasedAt,
      releaseAction: null,
    };

    const auditLog = this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: null,
        moduleName: "driver-matching-suppression",
        actionName: "release_driver_matching_suppression",
        resourceType: "driver_matching_suppression",
        resourceId: suppression.suppressionId,
        oldValuesSummary: {
          status: suppression.status,
          releasedAt: suppression.releasedAt,
        },
        newValuesSummary: {
          status: updated.status,
          releasedAt,
        },
      },
      requestId,
    );

    updated.auditId = auditLog.auditId;
    this.replace(updated);
    this.persist(updated, "release_driver_matching_suppression");

    return {
      actionId: `release_driver_matching_suppression:${randomUUID()}`,
      auditId: auditLog.auditId,
      resourceType: "driver_matching_suppression",
      resourceId: updated.suppressionId,
      status: "completed",
      message: "Driver matching suppression released.",
    };
  }

  private requireSuppression(driverId: string, suppressionId: string) {
    const normalizedDriverId = this.normalizeRequiredText("driverId", driverId);
    const normalizedSuppressionId = this.normalizeRequiredText(
      "suppressionId",
      suppressionId,
    );
    const suppression = this.suppressions.find(
      (record) =>
        record.driverId === normalizedDriverId &&
        record.suppressionId === normalizedSuppressionId,
    );

    if (!suppression) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "MATCHING_SUPPRESSION_NOT_FOUND",
        "Driver matching suppression not found.",
        {
          driverId: normalizedDriverId,
          suppressionId: normalizedSuppressionId,
        },
      );
    }

    return suppression;
  }

  private replace(updated: DriverMatchingSuppression) {
    this.suppressions = this.suppressions.map((record) =>
      record.suppressionId === updated.suppressionId
        ? this.cloneStored(updated)
        : record,
    );
  }

  private present(
    record: DriverMatchingSuppression,
    actor: MatchingSuppressionActor | null,
  ) {
    return {
      ...this.cloneStored(record),
      releaseAction: this.buildReleaseAction(record, actor),
    };
  }

  private buildReleaseAction(
    record: DriverMatchingSuppression,
    actor: MatchingSuppressionActor | null,
  ) {
    if (record.status !== "active") {
      return null;
    }

    if (!actor) {
      return null;
    }

    if (record.createdByActorId && record.createdByActorId !== actor.actorId) {
      return {
        action: "release_matching_suppression",
        enabled: false,
        disabledReasonCode: "created_by_other_actor",
        riskLevel: "medium" as const,
      };
    }

    return {
      action: "release_matching_suppression",
      enabled: true,
      riskLevel: "medium" as const,
    };
  }

  private persist(record: DriverMatchingSuppression, context: string) {
    if (!this.repository) return;

    void this.repository.upsert(this.cloneStored(record)).catch((error) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = { ...input };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    return this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  private requireReason(reason: string): DriverMatchingSuppressionReason {
    if (
      DRIVER_MATCHING_SUPPRESSION_REASON_VALUES.includes(
        reason as DriverMatchingSuppressionReason,
      )
    ) {
      return reason as DriverMatchingSuppressionReason;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Invalid driver matching suppression reason.",
      { reason },
    );
  }

  private normalizeRequiredText(field: string, value: string) {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private cloneStored(
    record: DriverMatchingSuppression,
  ): DriverMatchingSuppression {
    return {
      ...record,
      serviceBucket: record.serviceBucket ?? null,
      releaseAction: record.releaseAction ? { ...record.releaseAction } : null,
      auditId: record.auditId ?? null,
    };
  }
}
