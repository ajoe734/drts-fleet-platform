import { Injectable, Logger } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  Phase2AuditContext,
  Phase2ProviderCapability,
  ProviderCapabilityRequirement,
} from "@drts/contracts";
import {
  PHASE2_AUDIT_EVENT_CATALOG,
  PHASE2_PROVIDER_CAPABILITIES,
} from "@drts/contracts";

import {
  toActionReceipt,
  type ActionReceiptEnvelopeInput,
} from "../../common/action-receipt";
import { emitPhase2AuditEvent } from "../../common/phase2-audit";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";

export interface UpsertProviderCapabilityRequirementCommand {
  sandboxProgramId: string;
  capability: Phase2ProviderCapability;
  required: boolean;
  minSchemaVersion?: string | null;
  notes?: string | null;
  auditContext: Phase2AuditContext;
}

export interface UpsertProviderCapabilityRequirementResult {
  requirement: ProviderCapabilityRequirement & {
    requirementId: string;
    sandboxProgramId: string;
  };
  receipt: ActionReceipt;
  auditLog: AuditLogRecord;
}

/**
 * SandboxGovernanceService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the AV sandbox-program governance surface (provider
 * capability requirements, program activation/suspension) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete policy evaluation and
 * persistence against av_sandbox.provider_capability_requirements (V0037) land
 * in downstream waves.
 */
@Injectable()
export class SandboxGovernanceService {
  private readonly logger = new Logger(SandboxGovernanceService.name);

  // Required capability set per sandbox program, checked by the dispatch gate.
  private requirements: Array<
    ProviderCapabilityRequirement & {
      requirementId: string;
      sandboxProgramId: string;
    }
  > = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  upsertProviderCapabilityRequirement(
    command: UpsertProviderCapabilityRequirementCommand,
  ): UpsertProviderCapabilityRequirementResult {
    if (!PHASE2_PROVIDER_CAPABILITIES.includes(command.capability)) {
      throw new Error(`Unsupported provider capability: ${command.capability}`);
    }

    const existingIndex = this.requirements.findIndex(
      (requirement) =>
        requirement.sandboxProgramId === command.sandboxProgramId &&
        requirement.capability === command.capability,
    );

    const requirement = {
      requirementId:
        existingIndex >= 0
          ? this.requirements[existingIndex]!.requirementId
          : `${command.sandboxProgramId}:${command.capability}`,
      sandboxProgramId: command.sandboxProgramId,
      capability: command.capability,
      required: command.required,
      minSchemaVersion: command.minSchemaVersion ?? null,
      notes: command.notes ?? null,
    };

    if (existingIndex >= 0) {
      this.requirements[existingIndex] = requirement;
    } else {
      this.requirements = [...this.requirements, requirement];
    }

    const auditLog = emitPhase2AuditEvent(this.auditNotificationService, {
      eventName:
        existingIndex >= 0
          ? PHASE2_AUDIT_EVENT_CATALOG.sandboxProviderCapabilityRequirementAmended
          : PHASE2_AUDIT_EVENT_CATALOG.sandboxProviderCapabilityRequirementConfigured,
      resourceType: "provider_capability_requirement",
      resourceId: requirement.requirementId,
      context: command.auditContext,
      summary: {
        newValuesSummary: {
          sandboxProgramId: requirement.sandboxProgramId,
          capability: requirement.capability,
          required: requirement.required,
          minSchemaVersion: requirement.minSchemaVersion,
          notes: requirement.notes,
        },
      },
    });

    const receiptInput: ActionReceiptEnvelopeInput = {
      auditLog,
      resourceType: "provider_capability_requirement",
      resourceId: requirement.requirementId,
      message:
        existingIndex >= 0
          ? "Provider capability requirement amended."
          : "Provider capability requirement configured.",
    };
    if (command.auditContext.requestId) {
      receiptInput.actionId = command.auditContext.requestId;
    }

    const receipt = toActionReceipt(receiptInput);

    return {
      requirement,
      receipt,
      auditLog,
    };
  }
}
