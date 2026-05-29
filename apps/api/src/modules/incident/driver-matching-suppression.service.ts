import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import {
  DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_HOURS,
  DRIVER_MATCHING_SUPPRESSION_REASON_CODES,
} from "@drts/contracts";
import type {
  AuditLogRecord,
  DriverMatchingSuppressionReasonCode,
  DriverMatchingSuppressionRecord,
  ExtendDriverMatchingSuppressionCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverMatchingSuppressionRepository } from "./driver-matching-suppression.repository";

const DEFAULT_TTL_MS =
  DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_HOURS * 60 * 60 * 1000;

const OPS_MANAGER_ROLE = "ops_manager";

export interface SuppressDriverMatchingInput {
  driverId: string;
  incidentId: string;
  reasonCode?: DriverMatchingSuppressionReasonCode;
  actor?: string;
  now?: Date;
}

export interface LiftDriverMatchingSuppressionOptions {
  reason?: string;
  now?: Date;
}

export interface ListDriverMatchingSuppressionsFilter {
  driverId?: string;
  activeOnly?: boolean;
  now?: Date;
}

/**
 * Owns the DriverMatchingSuppression read-model (Q-OPS09). Suppressions are
 * created when an incident is opened against a driver, auto-expire after the
 * default 24h TTL, and are lifted early when the source incident resolves.
 * Only an ops_manager may extend the window beyond the default cap.
 */
@Injectable()
export class DriverMatchingSuppressionService implements OnModuleInit {
  private suppressions: DriverMatchingSuppressionRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly repository?: DriverMatchingSuppressionRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;
    try {
      const state = await this.repository.loadState();
      if (state.suppressions.length === 0) return;
      this.suppressions = state.suppressions.map((s) => this.clone(s));
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  suppressForIncident(
    input: SuppressDriverMatchingInput,
    requestId?: string,
  ): DriverMatchingSuppressionRecord {
    this.assertNonBlank(input.driverId, "driverId");
    this.assertNonBlank(input.incidentId, "incidentId");
    const reasonCode = input.reasonCode ?? "incident";
    this.assertValidReasonCode(reasonCode);

    const now = input.now ?? new Date();

    // Idempotent: a driver already actively suppressed by this incident keeps
    // its existing window rather than spawning a duplicate suppression.
    const existing = this.suppressions.find(
      (s) =>
        s.driverId === input.driverId &&
        s.sourceIncidentId === input.incidentId &&
        this.isEffectivelyActive(s, now),
    );
    if (existing) {
      return this.clone(existing);
    }

    const nowIso = now.toISOString();
    const suppression: DriverMatchingSuppressionRecord = {
      suppressionId: `dms-${randomUUID()}`,
      driverId: input.driverId,
      active: true,
      reasonCode,
      sourceIncidentId: input.incidentId,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
      liftedAt: null,
      createdBy: input.actor ?? "system",
      extendedBy: null,
      liftReason: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.suppressions = [...this.suppressions, suppression];
    this.persist([suppression], "suppress_for_incident");
    this.recordAudit(
      {
        actorId: input.actor ?? "system",
        actorType: "system",
        tenantId: null,
        moduleName: "incident",
        actionName: "suppress_driver_matching",
        resourceType: "driver_matching_suppression",
        resourceId: suppression.suppressionId,
        newValuesSummary: {
          driverId: suppression.driverId,
          reasonCode: suppression.reasonCode,
          sourceIncidentId: suppression.sourceIncidentId,
          expiresAt: suppression.expiresAt,
        },
      },
      requestId,
    );

    return this.clone(suppression);
  }

  liftForIncident(
    incidentId: string,
    options: LiftDriverMatchingSuppressionOptions = {},
    requestId?: string,
  ): DriverMatchingSuppressionRecord[] {
    const now = options.now ?? new Date();
    const nowIso = now.toISOString();
    const lifted: DriverMatchingSuppressionRecord[] = [];

    this.suppressions = this.suppressions.map((s) => {
      if (s.sourceIncidentId !== incidentId || s.liftedAt !== null) {
        return s;
      }
      const updated: DriverMatchingSuppressionRecord = {
        ...s,
        active: false,
        liftedAt: nowIso,
        liftReason: options.reason ?? "incident_resolved",
        updatedAt: nowIso,
      };
      lifted.push(updated);
      return updated;
    });

    if (lifted.length === 0) {
      return [];
    }

    this.persist(lifted, "lift_for_incident");
    for (const suppression of lifted) {
      this.recordAudit(
        {
          actorId: "system",
          actorType: "system",
          tenantId: null,
          moduleName: "incident",
          actionName: "lift_driver_matching_suppression",
          resourceType: "driver_matching_suppression",
          resourceId: suppression.suppressionId,
          newValuesSummary: {
            driverId: suppression.driverId,
            sourceIncidentId: suppression.sourceIncidentId,
            liftReason: suppression.liftReason,
          },
        },
        requestId,
      );
    }

    return lifted.map((s) => this.clone(s));
  }

  extendSuppression(
    suppressionId: string,
    command: ExtendDriverMatchingSuppressionCommand,
    requestId?: string,
  ): DriverMatchingSuppressionRecord {
    this.assertNonBlank(command.requestedBy, "requestedBy");
    this.assertNonBlank(command.actorRole, "actorRole");

    const suppression = this.require(suppressionId);

    if (command.actorRole !== OPS_MANAGER_ROLE) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SUPPRESSION_EXTENSION_FORBIDDEN",
        "Only an ops_manager may extend a driver matching suppression.",
        { suppressionId, actorRole: command.actorRole },
      );
    }

    if (suppression.liftedAt !== null || !suppression.active) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SUPPRESSION_NOT_ACTIVE",
        "Cannot extend a suppression that has already been lifted.",
        { suppressionId },
      );
    }

    const newExpiry = new Date(command.expiresAt);
    if (Number.isNaN(newExpiry.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "expiresAt must be a valid ISO 8601 timestamp.",
        { expiresAt: command.expiresAt },
      );
    }
    if (newExpiry.getTime() <= new Date(suppression.expiresAt).getTime()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "expiresAt must extend the suppression beyond its current expiry.",
        {
          expiresAt: command.expiresAt,
          currentExpiresAt: suppression.expiresAt,
        },
      );
    }

    const nowIso = new Date().toISOString();
    const updated: DriverMatchingSuppressionRecord = {
      ...suppression,
      expiresAt: newExpiry.toISOString(),
      extendedBy: command.requestedBy,
      updatedAt: nowIso,
    };
    this.replace(updated);
    this.persist([updated], "extend_suppression");
    this.recordAudit(
      {
        actorId: command.requestedBy,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "extend_driver_matching_suppression",
        resourceType: "driver_matching_suppression",
        resourceId: updated.suppressionId,
        newValuesSummary: {
          driverId: updated.driverId,
          expiresAt: updated.expiresAt,
          actorRole: command.actorRole,
          note: command.note ?? null,
        },
      },
      requestId,
    );

    return this.clone(updated);
  }

  listSuppressions(
    filter: ListDriverMatchingSuppressionsFilter = {},
  ): DriverMatchingSuppressionRecord[] {
    const now = filter.now ?? new Date();
    return this.suppressions
      .filter((s) => (filter.driverId ? s.driverId === filter.driverId : true))
      .filter((s) =>
        filter.activeOnly ? this.isEffectivelyActive(s, now) : true,
      )
      .map((s) => this.clone(s));
  }

  getSuppression(suppressionId: string): DriverMatchingSuppressionRecord {
    return this.clone(this.require(suppressionId));
  }

  getActiveSuppressionForDriver(
    driverId: string,
    now: Date = new Date(),
  ): DriverMatchingSuppressionRecord | null {
    const active = this.suppressions
      .filter(
        (s) => s.driverId === driverId && this.isEffectivelyActive(s, now),
      )
      .sort(
        (a, b) =>
          new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
      );
    return active.length > 0 ? this.clone(active[0]!) : null;
  }

  isDriverMatchingSuppressed(driverId: string, now: Date = new Date()): boolean {
    return this.suppressions.some(
      (s) => s.driverId === driverId && this.isEffectivelyActive(s, now),
    );
  }

  // --- Private helpers ---

  /**
   * A suppression actually blocks matching only while it is not manually lifted
   * and its TTL has not elapsed. The stored `active` flag records operator
   * intent; expiry is enforced here so an expired-but-unlifted record stops
   * suppressing automatically.
   */
  private isEffectivelyActive(
    suppression: DriverMatchingSuppressionRecord,
    now: Date,
  ): boolean {
    return (
      suppression.active &&
      suppression.liftedAt === null &&
      new Date(suppression.expiresAt).getTime() > now.getTime()
    );
  }

  private require(suppressionId: string): DriverMatchingSuppressionRecord {
    const suppression = this.suppressions.find(
      (s) => s.suppressionId === suppressionId,
    );
    if (!suppression) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Driver matching suppression not found.",
        { suppressionId },
      );
    }
    return suppression;
  }

  private replace(updated: DriverMatchingSuppressionRecord) {
    this.suppressions = this.suppressions.map((s) =>
      s.suppressionId === updated.suppressionId ? updated : s,
    );
  }

  private clone(suppression: DriverMatchingSuppressionRecord) {
    return { ...suppression };
  }

  private persist(
    changes: readonly DriverMatchingSuppressionRecord[],
    context: string,
  ) {
    if (!this.repository) return;
    const payload = changes.map((s) => this.clone(s));
    void this.repository.persistChanges(payload).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) (log as any).requestId = requestId;
    this.auditNotificationService.recordAuditLog(log);
  }

  private assertValidReasonCode(
    reasonCode: string,
  ): asserts reasonCode is DriverMatchingSuppressionReasonCode {
    if (!DRIVER_MATCHING_SUPPRESSION_REASON_CODES.includes(reasonCode as any)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid driver matching suppression reason code.",
        { reasonCode },
      );
    }
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value || !value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
  }
}
