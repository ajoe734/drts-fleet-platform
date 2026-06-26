import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../src/modules/incident/incident.service";
import { RocOperationsController } from "../../src/modules/roc-operations/roc-operations.controller";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { TeslaIntegrationService } from "../../src/modules/tesla-integration/tesla-integration.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

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
  controllers: [RocOperationsController],
  providers: [
    RocOperationsService,
    SafetyOperatorService,
    AuditNotificationService,
    IncidentService,
    VehicleEvidenceService,
    SandboxDispatchGateService,
    TeslaIntegrationService,
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
    {
      provide: SandboxGovernanceService,
      useValue: sandboxGovernanceService,
    },
  ],
})
class RocOperationsIntegrationTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(RocOperationsIntegrationTestModule, {
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

function buildOpsHeaders() {
  return {
    "content-type": "application/json",
    "x-actor-type": "ops_user",
    "x-actor-id": "roc-user-001",
    "x-realm": "ops",
    "x-role-families": "ops",
    "x-roles": "roc_operator,ops_supervisor,ops_manager,safety_officer,dispatch_manager",
    "x-scopes": "dispatch:read,dispatch:write,incident:write",
  };
}

describe("INT-ROC-001 ROC operational actions", () => {
  afterEach(() => {
    // no-op placeholder to match the integration-suite structure.
  });

  it("publishes ROC alerts with available actions and applies stop/hold state to the dispatch gate", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const vehicleEvidenceService = app.get(VehicleEvidenceService);
      const gate = app.get(SandboxDispatchGateService);
      const recorder = buildMockRecorderFixture({
        recorderId: "rec-roc-001",
        vehicleId: "veh-roc-001",
      });
      vehicleEvidenceService.registerRecorder(recorder);
      vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
        overall: "unhealthy",
        clockDriftMs: 20_000,
        uploadQueueState: "error",
        uploadPendingCount: 3,
        storageState: "error",
      });

      const alertsResponse = await fetch(`${baseUrl}/api/roc/alerts`, {
        method: "GET",
        headers: buildOpsHeaders(),
      });
      expect(alertsResponse.ok).toBe(true);
      const alertsBody = await alertsResponse.json();
      const recorderAlert = alertsBody.data.items.find(
        (item: any) => item.alertId === "roc-alert-recorder-veh-roc-001",
      );
      expect(recorderAlert).toBeTruthy();
      expect(recorderAlert.availableActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "stop-new-dispatch",
            enabled: true,
          }),
          expect.objectContaining({
            action: "operational-hold",
            enabled: true,
          }),
        ]),
      );

      const stopResponse = await fetch(
        `${baseUrl}/api/roc/alerts/roc-alert-recorder-veh-roc-001/stop-new-dispatch`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({
            reason: "Hold vehicle until recorder recovers.",
          }),
        },
      );
      expect(stopResponse.ok).toBe(true);

      const holdResponse = await fetch(
        `${baseUrl}/api/roc/alerts/roc-alert-recorder-veh-roc-001/operational-hold`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({
            reason: "ROC requested human review.",
          }),
        },
      );
      expect(holdResponse.ok).toBe(true);

      const decision = gate.evaluateDispatch({
        orderId: "ord-roc-001",
        vehicleId: recorder.vehicleId,
        sandboxProgramId: "sandbox-demo-001",
        policyVersion: "phase2-roc-001",
      });
      expect(decision.decision).toBe("block");
      expect(decision.hardReasonCodes).toEqual(
        expect.arrayContaining([
          "RECORDER_UNHEALTHY",
          "ROC_STOP_NEW_DISPATCH",
          "ROC_OPERATIONAL_HOLD",
        ]),
      );

      const vehiclesResponse = await fetch(`${baseUrl}/api/roc/vehicles`, {
        method: "GET",
        headers: buildOpsHeaders(),
      });
      expect(vehiclesResponse.ok).toBe(true);
      const vehiclesBody = await vehiclesResponse.json();
      expect(vehiclesBody.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            vehicleId: recorder.vehicleId,
            stopNewDispatchActive: true,
            operationalHoldActive: true,
            gateReasonCodes: expect.arrayContaining([
              "RECORDER_UNHEALTHY",
              "ROC_STOP_NEW_DISPATCH",
              "ROC_OPERATIONAL_HOLD",
            ]),
          }),
        ]),
      );

      const drivingControlResponse = await fetch(
        `${baseUrl}/api/roc/driving-control`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({}),
        },
      );
      expect(drivingControlResponse.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("returns structured 400 errors when ROC action bodies omit required fields", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const vehicleEvidenceService = app.get(VehicleEvidenceService);
      const recorder = buildMockRecorderFixture({
        recorderId: "rec-roc-required-001",
        vehicleId: "veh-roc-required-001",
      });
      vehicleEvidenceService.registerRecorder(recorder);
      vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
        overall: "unhealthy",
        clockDriftMs: 20_000,
        uploadQueueState: "error",
        uploadPendingCount: 1,
        storageState: "error",
      });

      const assignResponse = await fetch(
        `${baseUrl}/api/roc/alerts/roc-alert-recorder-veh-roc-required-001/assign`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({}),
        },
      );
      expect(assignResponse.status).toBe(400);
      const assignBody = await assignResponse.json();
      expect(assignBody).toMatchObject({
        error: {
          code: "ROC_ACTION_FIELD_REQUIRED",
          message: "assigneeId is required.",
          details: {
            field: "assigneeId",
          },
        },
      });

      const requestSafetyActionResponse = await fetch(
        `${baseUrl}/api/roc/alerts/roc-alert-recorder-veh-roc-required-001/request-safety-action`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({
            sandboxProgramId: "sandbox-demo-001",
          }),
        },
      );
      expect(requestSafetyActionResponse.status).toBe(400);
      const requestSafetyActionBody =
        await requestSafetyActionResponse.json();
      expect(requestSafetyActionBody).toMatchObject({
        error: {
          code: "ROC_ACTION_FIELD_REQUIRED",
          message: "safetyOperatorId is required.",
          details: {
            field: "safetyOperatorId",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects anonymous ROC requests", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const response = await fetch(`${baseUrl}/api/roc/overview`, {
        method: "GET",
      });
      expect(response.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
