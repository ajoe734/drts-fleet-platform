import { describe, expect, it, vi } from "vitest";

import type { AuditLogRecord, CommandReceipt, Phase2AuditContext } from "@drts/contracts";
import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";

import {
  emitPhase2AuditRecord,
  emitPhase2AuditedAction,
  type Phase2AuditSink,
} from "../../apps/api/src/common/phase2-audit";

function createAuditSink(auditId = "phase2-audit-001") {
  const recordAuditLog = vi.fn(
    (
      input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
        requestId?: string;
      },
    ): AuditLogRecord => ({
      ...input,
      auditId,
      requestId: input.requestId ?? "generated-request-id",
      createdAt: "2026-06-26T00:00:00.000Z",
    }),
  );

  return {
    sink: {
      recordAuditLog,
    } satisfies Phase2AuditSink,
    recordAuditLog,
  };
}

function createBaseAuditContext(): Phase2AuditContext {
  return {
    actorId: "ops-user-001",
    actorType: "ops_user",
    tenantId: null,
    moduleName: "regulatory-reporting",
    eventName: PHASE2_AUDIT_EVENT_CATALOG.regulatory.reportAmended,
    resourceType: "regulatory_report",
    resourceId: "RPT-2026-0001",
    requestId: "req-phase2-001",
    summary: {
      reportId: "RPT-2026-0001",
      correctionReason: "jurisdiction code normalized",
    },
    resourceVersion: "v2",
    supersedesAuditId: "11111111-1111-4111-8111-111111111111",
    amendsResourceVersion: "v1",
    sourceSystem: "regulatory_filing",
    sourceRef: "CA-DMV-2026-0001",
    occurredAt: "2026-06-26T00:00:00.000Z",
  };
}

describe("Phase 2 audit helper", () => {
  it("emits append-only amendment audits while stripping sensitive fields", () => {
    const { sink, recordAuditLog } = createAuditSink(
      "22222222-2222-4222-8222-222222222222",
    );

    const auditLog = emitPhase2AuditRecord(sink, {
      ...createBaseAuditContext(),
      summary: {
        reportId: "RPT-2026-0001",
        correctionReason: "jurisdiction code normalized",
        providerPayload: {
          raw: true,
        },
        signedUrl: "https://example.test/download",
        passengerEmail: "secret@example.test",
        safeSummary: {
          jurisdiction: "CA",
        },
      },
      previousSummary: {
        passengerName: "Jane Example",
        previousVersion: "v1",
      },
    });

    expect(recordAuditLog).toHaveBeenCalledWith({
      actorId: "ops-user-001",
      actorType: "ops_user",
      tenantId: null,
      moduleName: "regulatory-reporting",
      actionName: "regulatory.report.amended",
      resourceType: "regulatory_report",
      resourceId: "RPT-2026-0001",
      requestId: "req-phase2-001",
      oldValuesSummary: {
        previousVersion: "v1",
      },
      newValuesSummary: {
        reportId: "RPT-2026-0001",
        correctionReason: "jurisdiction code normalized",
        safeSummary: {
          jurisdiction: "CA",
        },
        resourceVersion: "v2",
        sourceSystem: "regulatory_filing",
        sourceRef: "CA-DMV-2026-0001",
        occurredAt: "2026-06-26T00:00:00.000Z",
        supersedesAuditId: "11111111-1111-4111-8111-111111111111",
        amendsResourceVersion: "v1",
      },
    });
    expect(auditLog.auditId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("rejects amendment metadata on non-amendment events", () => {
    const { sink } = createAuditSink();

    expect(() =>
      emitPhase2AuditRecord(sink, {
        ...createBaseAuditContext(),
        eventName:
          PHASE2_AUDIT_EVENT_CATALOG.regulatory.reportByStatus.submitted,
      }),
    ).toThrow(
      "Phase2 amendment metadata requires an '.amended' audit event name.",
    );
  });

  it("returns an ActionReceipt for a sample Tesla command write", () => {
    const { sink } = createAuditSink(
      "33333333-3333-4333-8333-333333333333",
    );
    const commandReceipt: CommandReceipt = {
      commandId: "cmd-001",
      idempotencyKey: "idem-001",
      vehicleId: "VEH-AV-001",
      commandType: "wake_up",
      status: "accepted",
      issuedBy: "ops-user-001",
      issuedAt: "2026-06-26T01:00:00.000Z",
      acknowledgedAt: null,
      providerRef: "tesla-cmd-001",
      failureReasonCode: null,
      source: {
        sourceSystem: "tesla_fleet_api",
        sourceRef: "tesla-cmd-001",
        ingestedAt: "2026-06-26T01:00:01.000Z",
        recordedAt: "2026-06-26T01:00:00.000Z",
        signatureRef: null,
        schemaVersion: "2026-06",
      },
    };

    const result = emitPhase2AuditedAction({
      sink,
      audit: {
        actorId: "ops-user-001",
        actorType: "ops_user",
        tenantId: null,
        moduleName: "tesla-integration",
        eventName:
          PHASE2_AUDIT_EVENT_CATALOG.tesla.commandReceiptByStatus[
            commandReceipt.status
          ],
        resourceType: "command_receipt",
        resourceId: commandReceipt.commandId,
        requestId: "req-command-001",
        summary: {
          vehicleId: commandReceipt.vehicleId,
          commandType: commandReceipt.commandType,
          status: commandReceipt.status,
          idempotencyKey: commandReceipt.idempotencyKey,
          providerRef: commandReceipt.providerRef,
          providerPayload: {
            shouldNotLeak: true,
          },
        },
        sourceSystem: commandReceipt.source.sourceSystem,
        sourceRef: commandReceipt.source.sourceRef,
        occurredAt: commandReceipt.issuedAt,
      },
      data: commandReceipt,
      status: "accepted",
      message: "Tesla remote command accepted.",
    });

    expect(result.auditLog.actionName).toBe("tesla.command_receipt.accepted");
    expect(result.receipt).toEqual({
      actionId: "req-command-001",
      auditId: "33333333-3333-4333-8333-333333333333",
      resourceType: "command_receipt",
      resourceId: "cmd-001",
      status: "accepted",
      message: "Tesla remote command accepted.",
    });
  });
});
