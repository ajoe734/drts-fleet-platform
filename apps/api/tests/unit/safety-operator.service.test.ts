import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { ApiRequestError } from "../../src/common/api-envelope";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";

function buildDriverIdentity(
  safetyOperatorId: string,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: safetyOperatorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId: "req-safe-001",
  };
}

function buildGovernanceService() {
  return {
    listSafetyOperatorQualifications: vi.fn(() => [
      {
        qualificationId: "qual-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        safetyOperatorId: "safe-op-001",
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["area-001"],
        approvedRouteIds: ["route-001"],
        certificationRefs: ["cert-001"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]),
  };
}

describe("SafetyOperatorService", () => {
  it("dedupes replayed takeover reports without overwriting the original payload", async () => {
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    };
    const governanceService = buildGovernanceService();
    const service = new SafetyOperatorService(
      auditNotificationService as never,
      undefined,
      governanceService as never,
    );
    const identity = buildDriverIdentity("safe-op-001");

    const assignment = await service.createAssignment(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
      },
      identity,
      "req-assignment-001",
    );
    const shift = await service.startShift(
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: "sandbox-demo-001",
        deviceId: "device-safe-001",
        vehicleId: "veh-safe-001",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 24.1477, lng: 120.6736 },
        notes: "Shift online.",
      },
      identity,
      "req-shift-001",
    );

    const first = await service.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-safe-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: "bookmark-safe-001",
        incidentId: null,
        evidenceArtifactIds: ["artifact-safe-001"],
        notes: "First takeover payload.",
        occurredAt: "2026-06-26T02:00:00.000Z",
      },
      identity,
      "req-takeover-001",
    );

    const replay = await service.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-safe-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "trip_ended",
        fsdResumed: true,
        bookmarkId: "bookmark-safe-001",
        incidentId: "inc-safe-001",
        evidenceArtifactIds: ["artifact-safe-002"],
        notes: "Replay should not overwrite the original report.",
        occurredAt: "2026-06-26T02:00:05.000Z",
      },
      identity,
      "req-takeover-002",
    );

    const reports = service.listTakeoverReports({}, identity);

    expect(first.receipt.duplicate).toBe(false);
    expect(replay.receipt.duplicate).toBe(true);
    expect(replay.receipt.serverReceivedAt).toBe(
      first.receipt.serverReceivedAt,
    );
    expect(replay.report.reportId).toBe(first.report.reportId);
    expect(replay.report.disposition).toBe("continued_manual");
    expect(replay.report.fsdResumed).toBe(false);
    expect(replay.report.notes).toBe("First takeover payload.");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        reportId: first.report.reportId,
        correlationId: "corr-safe-001",
        clientGeneratedReportId: "client-report-001",
      }),
    );
  });

  it("reports qualification status and active assignment linkage", async () => {
    const service = new SafetyOperatorService(
      {
        recordAuditLog: vi.fn(),
      } as never,
      undefined,
      buildGovernanceService() as never,
    );
    const identity = buildDriverIdentity("safe-op-001");

    const assignment = await service.createAssignment(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: null,
        sandboxProgramId: "sandbox-demo-001",
      },
      identity,
    );

    const qualification = service.checkQualification(
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: "sandbox-demo-001",
        vehicleId: "veh-safe-001",
        asOf: "2026-06-26T02:00:00.000Z",
      },
      identity,
    );

    expect(qualification.qualified).toBe(true);
    expect(qualification.matchedQualificationIds).toEqual(["qual-safe-001"]);
    expect(qualification.activeAssignmentId).toBe(assignment.assignmentId);
  });

  it("rejects writes when the device identity tries to act as a different operator", async () => {
    const service = new SafetyOperatorService(
      {
        recordAuditLog: vi.fn(),
      } as never,
      undefined,
      buildGovernanceService() as never,
    );

    try {
      await service.createAssignment(
        {
          safetyOperatorId: "safe-op-002",
          vehicleId: "veh-safe-002",
          orderId: null,
          sandboxProgramId: "sandbox-demo-001",
        },
        buildDriverIdentity("safe-op-001"),
      );
      throw new Error("expected createAssignment to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(403);
    }
  });
});
