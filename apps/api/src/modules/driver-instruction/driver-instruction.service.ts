import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AcknowledgeDriverOpsInstructionResult,
  AuditLogRecord,
  CreateDriverOpsInstructionCommand,
  DriverOpsInstruction,
  IdentityContext,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverInstructionRepository } from "./driver-instruction.repository";

export interface PersistedDriverInstructionRecord extends DriverOpsInstruction {
  driverId: string;
  expiresAt: string | null;
  acknowledgedAt: string | null;
  notificationId: string | null;
  updatedAt: string;
}

@Injectable()
export class DriverInstructionService implements OnModuleInit {
  private readonly instructions = new Map<
    string,
    PersistedDriverInstructionRecord
  >();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: DriverInstructionRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const records = await this.repository.loadAll();
      for (const record of records) {
        this.instructions.set(
          record.instructionId,
          this.clonePersisted(record),
        );
      }
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  async createInstruction(
    command: CreateDriverOpsInstructionCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ): Promise<DriverOpsInstruction> {
    const actor = this.requireOpsIdentity(identity);
    const driverId = this.requireText("driverId", command.driverId);
    const taskId = this.requireText("taskId", command.taskId);
    const message = this.requireText("message", command.message);
    const issuedAt = new Date().toISOString();
    const expiresAt = this.normalizeExpiry(command.expiresAt, issuedAt);

    const instruction: PersistedDriverInstructionRecord = {
      instructionId: `drvinst-${randomUUID()}`,
      driverId,
      taskId,
      message,
      issuedBy: actor.actorId!,
      issuedAt,
      expiresAt,
      acknowledgedAt: null,
      notificationId: null,
      updatedAt: issuedAt,
    };

    const notification = this.auditNotificationService.recordNotification({
      tenantId: null,
      recipientUserId: driverId,
      channel: "driver_task",
      title: "Dispatch instruction",
      message,
      status: "unread",
    });
    instruction.notificationId = notification.notificationId;

    try {
      await this.persist(instruction, "create_instruction");
    } catch (error) {
      this.auditNotificationService.removeNotification(
        notification.notificationId,
      );
      throw error;
    }
    this.instructions.set(
      instruction.instructionId,
      this.clonePersisted(instruction),
    );
    this.auditNotificationService.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId: null,
      moduleName: "driver-ops-instruction",
      actionName: "issue_driver_ops_instruction",
      resourceType: "driver_ops_instruction",
      resourceId: instruction.instructionId,
      newValuesSummary: {
        driverId,
        taskId,
        expiresAt,
        notificationId: notification.notificationId,
      },
      ...(requestId ? { requestId } : {}),
    });

    return this.toPublicInstruction(instruction);
  }

  listInstructionsForDriver(
    identity: IdentityContext | null,
    taskId?: string,
  ): DriverOpsInstruction[] {
    const actor = this.requireDriverIdentity(identity);
    const normalizedTaskId = taskId?.trim();
    const now = Date.now();

    return [...this.instructions.values()]
      .filter((instruction) => instruction.driverId === actor.actorId)
      .filter((instruction) => instruction.acknowledgedAt === null)
      .filter((instruction) => !this.isExpired(instruction, now))
      .filter((instruction) =>
        normalizedTaskId ? instruction.taskId === normalizedTaskId : true,
      )
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt))
      .map((instruction) => this.toPublicInstruction(instruction));
  }

  async acknowledgeInstruction(
    instructionId: string,
    identity: IdentityContext | null,
    requestId?: string,
  ): Promise<AcknowledgeDriverOpsInstructionResult> {
    const actor = this.requireDriverIdentity(identity);
    const normalizedInstructionId = this.requireText(
      "instructionId",
      instructionId,
    );
    const existing = this.instructions.get(normalizedInstructionId);

    if (!existing || existing.driverId !== actor.actorId) {
      throw new ApiRequestError(
        404,
        "DRIVER_OPS_INSTRUCTION_NOT_FOUND",
        "Driver ops instruction was not found.",
        { instructionId: normalizedInstructionId },
      );
    }

    if (existing.acknowledgedAt !== null) {
      return {
        instructionId: existing.instructionId,
        taskId: existing.taskId,
        acknowledgedAt: existing.acknowledgedAt,
      };
    }

    if (this.isExpired(existing, Date.now())) {
      throw new ApiRequestError(
        410,
        "DRIVER_OPS_INSTRUCTION_EXPIRED",
        "Driver ops instruction has expired.",
        {
          instructionId: normalizedInstructionId,
          expiresAt: existing.expiresAt,
        },
      );
    }

    const acknowledgedAt = new Date().toISOString();
    const updated: PersistedDriverInstructionRecord = {
      ...existing,
      acknowledgedAt,
      updatedAt: acknowledgedAt,
    };

    await this.persist(updated, "acknowledge_instruction");
    this.instructions.set(updated.instructionId, this.clonePersisted(updated));

    if (updated.notificationId) {
      this.auditNotificationService.markNotificationsRead(
        { notificationIds: [updated.notificationId] },
        requestId,
      );
    }

    this.auditNotificationService.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId: null,
      moduleName: "driver-ops-instruction",
      actionName: "acknowledge_driver_ops_instruction",
      resourceType: "driver_ops_instruction",
      resourceId: updated.instructionId,
      newValuesSummary: {
        taskId: updated.taskId,
        acknowledgedAt,
      },
      ...(requestId ? { requestId } : {}),
    });

    return {
      instructionId: updated.instructionId,
      taskId: updated.taskId,
      acknowledgedAt,
    };
  }

  private requireOpsIdentity(identity: IdentityContext | null) {
    if (
      !identity?.actorId ||
      (identity.actorType !== "ops_user" &&
        identity.actorType !== "platform_admin")
    ) {
      throw new ApiRequestError(
        403,
        "OPS_IDENTITY_REQUIRED",
        "Ops or platform identity is required to issue driver instructions.",
      );
    }

    return identity;
  }

  private requireDriverIdentity(identity: IdentityContext | null) {
    if (!identity?.actorId || identity.actorType !== "driver_user") {
      throw new ApiRequestError(
        403,
        "DRIVER_IDENTITY_REQUIRED",
        "Driver identity is required.",
      );
    }

    return identity;
  }

  private requireText(field: string, value: unknown) {
    if (typeof value !== "string") {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_OPS_INSTRUCTION",
        `${field} is required.`,
        { field },
      );
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_OPS_INSTRUCTION",
        `${field} is required.`,
        { field },
      );
    }

    return normalized;
  }

  private normalizeExpiry(expiresAt: unknown, issuedAt: string) {
    if (expiresAt == null) {
      return null;
    }

    if (typeof expiresAt !== "string") {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
        "expiresAt must be a valid ISO timestamp.",
        { expiresAt },
      );
    }

    const normalized = expiresAt.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Date.parse(normalized);
    if (!Number.isFinite(parsed)) {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
        "expiresAt must be a valid ISO timestamp.",
        { expiresAt: normalized },
      );
    }

    if (parsed <= Date.parse(issuedAt)) {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
        "expiresAt must be in the future.",
        { expiresAt: normalized },
      );
    }

    return new Date(parsed).toISOString();
  }

  private isExpired(
    instruction: Pick<PersistedDriverInstructionRecord, "expiresAt">,
    now: number,
  ) {
    return (
      instruction.expiresAt !== null &&
      Number.isFinite(Date.parse(instruction.expiresAt)) &&
      Date.parse(instruction.expiresAt) <= now
    );
  }

  private toPublicInstruction(
    instruction: PersistedDriverInstructionRecord,
  ): DriverOpsInstruction {
    return {
      instructionId: instruction.instructionId,
      taskId: instruction.taskId,
      message: instruction.message,
      issuedBy: instruction.issuedBy,
      issuedAt: instruction.issuedAt,
      expiresAt: instruction.expiresAt,
    };
  }

  private clonePersisted(
    instruction: PersistedDriverInstructionRecord,
  ): PersistedDriverInstructionRecord {
    return { ...instruction };
  }

  private async persist(
    instruction: PersistedDriverInstructionRecord,
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    try {
      await this.repository.upsert(instruction);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, context);
      throw new ApiRequestError(
        503,
        "DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE",
        "Driver ops instruction storage is not available.",
        undefined,
        true,
      );
    }
  }
}
