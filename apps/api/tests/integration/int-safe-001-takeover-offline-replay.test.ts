import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { SafetyOperatorController } from "../../src/modules/safety-operator/safety-operator.controller";
import { SafetyOperatorRepository } from "../../src/modules/safety-operator/safety-operator.repository";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";

class InMemorySafetyOperatorRepository {
  async loadState() {
    return {
      assignments: [],
      shifts: [],
      checklists: [],
      takeoverReports: [],
      tripCloseouts: [],
    };
  }

  async saveAssignment(record: any) {
    return { ...record };
  }

  async saveShift(record: any) {
    return {
      ...record,
      startLocation: record.startLocation ? { ...record.startLocation } : null,
      endLocation: record.endLocation ? { ...record.endLocation } : null,
    };
  }

  async savePreTripChecklist(record: any) {
    return {
      ...record,
      blockerCodes: [...record.blockerCodes],
      items: record.items.map((item: any) => ({ ...item })),
    };
  }

  async saveTakeoverReport(record: any) {
    return {
      ...record,
      evidenceArtifactIds: [...record.evidenceArtifactIds],
    };
  }

  async saveTripCloseout(record: any) {
    return {
      ...record,
      takeoverReportIds: [...record.takeoverReportIds],
      evidenceArtifactIds: [...record.evidenceArtifactIds],
    };
  }

  reportPersistenceFailure() {}
}

const sandboxGovernanceService = {
  listSafetyOperatorQualifications: () => [
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
  ],
};

@Module({
  controllers: [SafetyOperatorController],
  providers: [
    SafetyOperatorService,
    AuditNotificationService,
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
    {
      provide: SafetyOperatorRepository,
      useClass: InMemorySafetyOperatorRepository,
    },
    {
      provide: SandboxGovernanceService,
      useValue: sandboxGovernanceService,
    },
  ],
})
class SafetyOperatorIntegrationTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(SafetyOperatorIntegrationTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function buildDriverHeaders() {
  return {
    "content-type": "application/json",
    "x-actor-type": "driver_user",
    "x-actor-id": "safe-op-001",
    "x-realm": "driver",
    "x-role-families": "driver",
    "x-scopes": "driver:read,driver:write",
  };
}

describe("INT-SAFE-001 takeover offline replay", () => {
  afterEach(() => {
    // no-op placeholder so the suite stays aligned with the integration-test style
  });

  it("dedupes replayed takeover uploads and preserves the original report body", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const assignmentResponse = await fetch(
        `${baseUrl}/api/safety-operator/assignments`,
        {
          method: "POST",
          headers: buildDriverHeaders(),
          body: JSON.stringify({
            safetyOperatorId: "safe-op-001",
            vehicleId: "veh-safe-001",
            orderId: "ord-safe-001",
            sandboxProgramId: "sandbox-demo-001",
          }),
        },
      );
      expect(assignmentResponse.ok).toBe(true);
      const assignmentBody = await assignmentResponse.json();
      const assignmentId = assignmentBody.data.assignmentId as string;

      const shiftResponse = await fetch(
        `${baseUrl}/api/safety-operator/shifts/start`,
        {
          method: "POST",
          headers: buildDriverHeaders(),
          body: JSON.stringify({
            safetyOperatorId: "safe-op-001",
            sandboxProgramId: "sandbox-demo-001",
            deviceId: "device-safe-001",
            vehicleId: "veh-safe-001",
            assignmentId,
            startLocation: {
              lat: 24.1477,
              lng: 120.6736,
            },
            notes: "Shift online.",
          }),
        },
      );
      expect(shiftResponse.ok).toBe(true);
      const shiftBody = await shiftResponse.json();
      const shiftId = shiftBody.data.shiftId as string;

      const firstResponse = await fetch(
        `${baseUrl}/api/safety-operator/takeover-reports`,
        {
          method: "POST",
          headers: buildDriverHeaders(),
          body: JSON.stringify({
            clientGeneratedReportId: "client-report-001",
            safetyOperatorId: "safe-op-001",
            vehicleId: "veh-safe-001",
            orderId: "ord-safe-001",
            sandboxProgramId: "sandbox-demo-001",
            shiftId,
            assignmentId,
            correlationId: "corr-safe-001",
            trigger: "vehicle_alert",
            reasonCode: "sensor_fault",
            disposition: "continued_manual",
            fsdResumed: false,
            bookmarkId: "bookmark-safe-001",
            incidentId: null,
            evidenceArtifactIds: ["artifact-safe-001"],
            notes: "Original takeover report.",
            occurredAt: "2026-06-26T02:00:00.000Z",
          }),
        },
      );
      expect(firstResponse.ok).toBe(true);
      const firstBody = await firstResponse.json();

      const replayResponse = await fetch(
        `${baseUrl}/api/safety-operator/takeover-reports`,
        {
          method: "POST",
          headers: buildDriverHeaders(),
          body: JSON.stringify({
            clientGeneratedReportId: "client-report-001",
            safetyOperatorId: "safe-op-001",
            vehicleId: "veh-safe-001",
            orderId: "ord-safe-001",
            sandboxProgramId: "sandbox-demo-001",
            shiftId,
            assignmentId,
            correlationId: "corr-safe-001",
            trigger: "vehicle_alert",
            reasonCode: "sensor_fault",
            disposition: "trip_ended",
            fsdResumed: true,
            bookmarkId: "bookmark-safe-001",
            incidentId: "inc-safe-001",
            evidenceArtifactIds: ["artifact-safe-002"],
            notes:
              "Replay payload should not overwrite provider-linked report data.",
            occurredAt: "2026-06-26T02:00:05.000Z",
          }),
        },
      );
      expect(replayResponse.ok).toBe(true);
      const replayBody = await replayResponse.json();

      const listResponse = await fetch(
        `${baseUrl}/api/safety-operator/takeover-reports?correlationId=corr-safe-001`,
        {
          method: "GET",
          headers: buildDriverHeaders(),
        },
      );
      expect(listResponse.ok).toBe(true);
      const listBody = await listResponse.json();

      expect(firstBody.data.receipt.duplicate).toBe(false);
      expect(replayBody.data.receipt.duplicate).toBe(true);
      expect(replayBody.data.receipt.reportId).toBe(
        firstBody.data.receipt.reportId,
      );
      expect(replayBody.data.receipt.serverReceivedAt).toBe(
        firstBody.data.receipt.serverReceivedAt,
      );
      expect(replayBody.data.report.disposition).toBe("continued_manual");
      expect(replayBody.data.report.fsdResumed).toBe(false);
      expect(replayBody.data.report.notes).toBe("Original takeover report.");
      expect(listBody.data.items).toHaveLength(1);
      expect(listBody.data.items[0]).toEqual(
        expect.objectContaining({
          reportId: firstBody.data.report.reportId,
          correlationId: "corr-safe-001",
          clientGeneratedReportId: "client-report-001",
        }),
      );
    } finally {
      await app.close();
    }
  });

  it("rejects anonymous safety-operator requests", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const response = await fetch(
        `${baseUrl}/api/safety-operator/assignments`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
