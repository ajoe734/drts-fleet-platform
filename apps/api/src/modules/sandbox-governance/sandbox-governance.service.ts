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

import { emitPhase2AuditedAction } from "../../common/phase2-audit";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";

type ProviderCapabilityRequirementAuditContext = Pick<
  Phase2AuditContext,
  "actorId" | "actorType" | "tenantId" | "moduleName" | "requestId"
>;

export interface SandboxProviderCapabilityRequirementRecord
  extends ProviderCapabilityRequirement {
  requirementId: string;
  sandboxProgramId: string;
}

interface StoredProviderCapabilityRequirementRecord
  extends SandboxProviderCapabilityRequirementRecord {
  latestAuditId: string;
  resourceVersion: number;
}

export interface UpsertProviderCapabilityRequirementCommand {
  sandboxProgramId: string;
  capability: Phase2ProviderCapability;
  required: boolean;
  minSchemaVersion?: string | null;
  notes?: string | null;
  auditContext: ProviderCapabilityRequirementAuditContext;
}

export interface UpsertProviderCapabilityRequirementResult {
  requirement: SandboxProviderCapabilityRequirementRecord;
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
  private requirements: StoredProviderCapabilityRequirementRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  upsertProviderCapabilityRequirement(
    command: UpsertProviderCapabilityRequirementCommand,
  ): UpsertProviderCapabilityRequirementResult {
    if (!PHASE2_PROVIDER_CAPABILITIES.includes(command.capability)) {
      throw new Error(`Unsupported provider capability: ${command.capability}`);
    }

    const requirementId = `${command.sandboxProgramId}:${command.capability}`;
    const existing =
      this.requirements.find(
        (candidate) => candidate.requirementId === requirementId,
      ) ?? null;
    const requirement: SandboxProviderCapabilityRequirementRecord = {
      requirementId,
      sandboxProgramId: command.sandboxProgramId,
      capability: command.capability,
      required: command.required,
      minSchemaVersion: command.minSchemaVersion ?? null,
      notes: command.notes ?? null,
    };
    const nextResourceVersion = existing ? existing.resourceVersion + 1 : 1;

    const result = emitPhase2AuditedAction({
      sink: this.auditNotificationService,
      audit: {
        ...command.auditContext,
        eventName: existing
          ? PHASE2_AUDIT_EVENT_CATALOG.sandbox
              .providerCapabilityRequirementAmended
          : PHASE2_AUDIT_EVENT_CATALOG.sandbox
              .providerCapabilityRequirementConfigured,
        resourceType: "provider_capability_requirement",
        resourceId: requirement.requirementId,
        summary: this.buildRequirementAuditSummary(requirement),
        ...(existing
          ? {
              previousSummary: this.buildRequirementAuditSummary(existing),
              supersedesAuditId: existing.latestAuditId,
              amendsResourceVersion: this.formatResourceVersion(
                existing.resourceVersion,
              ),
            }
          : {}),
        resourceVersion: this.formatResourceVersion(nextResourceVersion),
      },
      data: requirement,
      message: existing
        ? "Provider capability requirement amended."
        : "Provider capability requirement configured.",
    });

    const storedRequirement: StoredProviderCapabilityRequirementRecord = {
      ...result.data,
      latestAuditId: result.auditLog.auditId,
      resourceVersion: nextResourceVersion,
    };

    this.requirements = existing
      ? this.requirements.map((candidate) =>
          candidate.requirementId === storedRequirement.requirementId
            ? storedRequirement
            : candidate,
        )
      : [...this.requirements, storedRequirement];

    return {
      requirement: result.data,
      receipt: result.receipt,
      auditLog: result.auditLog,
    };
  }

  private buildRequirementAuditSummary(
    requirement: SandboxProviderCapabilityRequirementRecord,
  ) {
    return {
      sandboxProgramId: requirement.sandboxProgramId,
      capability: requirement.capability,
      required: requirement.required,
      minSchemaVersion: requirement.minSchemaVersion,
      notes: requirement.notes,
    };
  }

  private formatResourceVersion(resourceVersion: number) {
    return `v${resourceVersion}`;
  }
}
