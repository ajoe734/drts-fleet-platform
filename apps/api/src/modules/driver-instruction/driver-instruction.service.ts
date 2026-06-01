import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateDriverOpsInstructionCommand,
  DriverOpsInstruction,
  DriverOpsInstructionStatus,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverInstructionRepository } from "./driver-instruction.repository";

export interface ListForDriverOptions {
  /** Include already-acknowledged instructions. Expired ones are always excluded. */
  includeAcknowledged?: boolean;
}

@Injectable()
export class DriverInstructionService implements OnModuleInit {
  private instructions: DriverOpsInstruction[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: DriverInstructionRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;
    try {
      const data = await this.repository.loadAll();
      if (data.length === 0) return;
      this.instructions = data.map((instruction) => this.clone(instruction));
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  /** Ops-side: create a new instruction targeted at a driver. */
  createInstruction(
    command: CreateDriverOpsInstructionCommand,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    const instruction: DriverOpsInstruction = {
      instructionId: `drvops_${randomUUID()}`,
      driverId: command.driverId,
      title: command.title,
      body: command.body,
      severity: command.severity ?? "info",
      createdBy: command.createdBy ?? null,
      createdAt: now,
      expiresAt: command.expiresAt ?? null,
      acknowledgedAt: null,
      status: "active",
    };

    this.instructions.push(instruction);
    this.persist(instruction);
    this.recordAudit(
      {
        actorId: command.createdBy ?? null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-instruction",
        actionName: "create_driver_instruction",
        resourceType: "driver_ops_instruction",
        resourceId: instruction.instructionId,
        newValuesSummary: {
          driverId: instruction.driverId,
          severity: instruction.severity,
          expiresAt: instruction.expiresAt,
        },
      },
      requestId,
    );

    return this.present(instruction);
  }

  /** Driver-side: list instructions a driver should currently see. */
  listForDriver(driverId: string, options: ListForDriverOptions = {}) {
    const includeAcknowledged = options.includeAcknowledged ?? true;
    const now = Date.now();

    return this.instructions
      .filter((instruction) => instruction.driverId === driverId)
      .map((instruction) => this.present(instruction, now))
      .filter((instruction) => instruction.status !== "expired")
      .filter(
        (instruction) =>
          includeAcknowledged || instruction.status !== "acknowledged",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Driver-side: acknowledge receipt of an instruction. */
  acknowledge(instructionId: string, driverId?: string, requestId?: string) {
    const instruction = this.instructions.find(
      (entry) => entry.instructionId === instructionId,
    );

    if (!instruction || (driverId && instruction.driverId !== driverId)) {
      throw new ApiRequestError(
        404,
        "driver_instruction_not_found",
        `Driver instruction ${instructionId} was not found`,
      );
    }

    if (instruction.acknowledgedAt === null) {
      instruction.acknowledgedAt = new Date().toISOString();
      this.persist(instruction);
      this.recordAudit(
        {
          actorId: instruction.driverId,
          actorType: "system",
          tenantId: null,
          moduleName: "driver-instruction",
          actionName: "acknowledge_driver_instruction",
          resourceType: "driver_ops_instruction",
          resourceId: instruction.instructionId,
          newValuesSummary: {
            acknowledgedAt: instruction.acknowledgedAt,
          },
        },
        requestId,
      );
    }

    return this.present(instruction);
  }

  /** Ops-side: list every instruction with its current computed status. */
  listAll() {
    const now = Date.now();
    return this.instructions
      .map((instruction) => this.present(instruction, now))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- Private helpers ---

  private present(
    instruction: DriverOpsInstruction,
    now: number = Date.now(),
  ): DriverOpsInstruction {
    return {
      ...this.clone(instruction),
      status: this.computeStatus(instruction, now),
    };
  }

  private computeStatus(
    instruction: DriverOpsInstruction,
    now: number,
  ): DriverOpsInstructionStatus {
    if (instruction.acknowledgedAt !== null) {
      return "acknowledged";
    }
    if (
      instruction.expiresAt !== null &&
      Date.parse(instruction.expiresAt) <= now
    ) {
      return "expired";
    }
    return "active";
  }

  private clone(instruction: DriverOpsInstruction) {
    return { ...instruction };
  }

  private persist(instruction: DriverOpsInstruction) {
    if (!this.repository) return;
    void this.repository.upsert(instruction).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, "upsert_instruction");
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    } = { ...input };
    if (requestId) log.requestId = requestId;
    this.auditNotificationService.recordAuditLog(log);
  }
}
