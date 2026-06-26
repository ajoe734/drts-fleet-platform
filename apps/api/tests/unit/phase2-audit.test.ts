import { describe, expect, it, vi } from "vitest";

import type { AuditLogRecord } from "@drts/contracts";
import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";

import { emitPhase2AuditEvent } from "../../src/common/phase2-audit";
import {
  SandboxGovernanceService,
  type UpsertProviderCapabilityRequirementCommand,
} from "../../src/modules/sandbox-governance/sandbox-governance.service";

describe("Phase 2 audit helper", () => {
  it("sanitizes sensitive summary fields and preserves amendment metadata as append-only", () => {
    const captured: Array<
      Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
        requestId?: string;
      }
    > = [];

    const sink = {
      recordAuditLog: vi.fn((input: (typeof captured)[number]) => {
        captured.push(input);
        return {
          auditId: "11111111-1111-4111-8111-111111111111",
          requestId: input.requestId ?? "req-phase2-001",
          createdAt: "2026-06-26T00:00:00.000Z",
          ...input,
        };
      }),
    };

    const auditLog = emitPhase2AuditEvent(sink, {
      eventName: PHASE2_AUDIT_EVENT_CATALOG.evidenceRegulatoryReportAmended,
      resourceType: "regulatory_report",
      resourceId: "report-001",
      context: {
        actorId: "ops-user-001",
        actorType: "ops_user",
        tenantId: null,
        moduleName: "regulatory-reporting",
        requestId: "req-phase2-001",
      },
      summary: {
        newValuesSummary: {
          status: "generated",
          providerPayload: { raw: true },
          accessToken: "secret",
          signedUrl: "https://example.test/download",
          passengerName: "Hidden Rider",
          acknowledgementRef: "ack-001",
        },
        supersedesAuditId: "00000000-0000-4000-8000-000000000001",
        amendsResourceVersion: "v2",
      },
    });

    expect(captured[0]?.newValuesSummary).toEqual({
      status: "generated",
      acknowledgementRef: "ack-001",
      supersedesAuditId: "00000000-0000-4000-8000-000000000001",
      amendsResourceVersion: "v2",
    });
    expect(auditLog.auditId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("SandboxGovernanceService sample write command", () => {
  it("returns ActionReceipt with auditId for provider capability writes", () => {
    const auditNotificationService = {
      recordAuditLog: vi.fn(
        (
          input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
            requestId?: string;
          },
        ) => ({
          auditId: "22222222-2222-4222-8222-222222222222",
          requestId: input.requestId ?? "req-sandbox-001",
          createdAt: "2026-06-26T00:00:00.000Z",
          ...input,
        }),
      ),
    };

    const service = new SandboxGovernanceService(
      auditNotificationService as never,
    );

    const command: UpsertProviderCapabilityRequirementCommand = {
      sandboxProgramId: "sandbox-program-001",
      capability: "telemetry_stream",
      required: true,
      minSchemaVersion: "1.2.0",
      notes: "No raw payload or signed URL should be audited.",
      auditContext: {
        actorId: "ops-user-001",
        actorType: "ops_user",
        tenantId: null,
        moduleName: "sandbox-governance",
        requestId: "req-sandbox-001",
      },
    };

    const result = service.upsertProviderCapabilityRequirement(command);

    expect(result.requirement).toEqual({
      requirementId: "sandbox-program-001:telemetry_stream",
      sandboxProgramId: "sandbox-program-001",
      capability: "telemetry_stream",
      required: true,
      minSchemaVersion: "1.2.0",
      notes: "No raw payload or signed URL should be audited.",
    });
    expect(result.auditLog.actionName).toBe(
      "sandbox.provider_capability_requirement.configured",
    );
    expect(result.receipt).toEqual({
      actionId: "req-sandbox-001",
      auditId: "22222222-2222-4222-8222-222222222222",
      resourceType: "provider_capability_requirement",
      resourceId: "sandbox-program-001:telemetry_stream",
      status: "completed",
      message: "Provider capability requirement configured.",
    });
  });
});
