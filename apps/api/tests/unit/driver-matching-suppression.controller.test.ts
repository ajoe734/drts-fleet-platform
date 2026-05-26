import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverMatchingSuppressionController } from "../../src/modules/driver-matching-suppression/driver-matching-suppression.controller";
import { DriverMatchingSuppressionService } from "../../src/modules/driver-matching-suppression/driver-matching-suppression.service";

function opsIdentity(actorId = "ops-user-001"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId,
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_user"],
    scopes: [],
    requestId: null,
  };
}

function driverIdentity(actorId = "drv-driver-001"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: [],
    requestId: null,
  };
}

function createController() {
  const auditNotificationService = new AuditNotificationService();
  const service = new DriverMatchingSuppressionService(
    auditNotificationService,
  );
  const controller = new DriverMatchingSuppressionController(service);

  return { auditNotificationService, controller };
}

describe("DriverMatchingSuppressionController", () => {
  it("creates a standalone suppression record with the 9-reason contract shape", () => {
    const { controller } = createController();

    const response = controller.createSuppression(
      "drv-driver-001",
      opsIdentity(),
      {
        platformCode: "grab_taiwan",
        serviceBucket: "standard_taxi",
        reason: "incident_hold",
        reasonMessage: "Driver is under incident investigation.",
      },
      "req-dms-create-001",
    );

    expect(response).toEqual({
      data: {
        suppressionId: expect.stringMatching(/^dms-/),
        driverId: "drv-driver-001",
        platformCode: "grab_taiwan",
        serviceBucket: "standard_taxi",
        reason: "incident_hold",
        reasonMessage: "Driver is under incident investigation.",
        status: "active",
        createdAt: expect.any(String),
        releasedAt: null,
        createdByActorId: "ops-user-001",
        releaseAction: {
          action: "release_matching_suppression",
          enabled: true,
          riskLevel: "medium",
        },
        auditId: expect.any(String),
      },
      meta: {
        requestId: "req-dms-create-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("lists a driver's suppression records from the driver-facing endpoint", () => {
    const { controller } = createController();

    controller.createSuppression(
      "drv-driver-001",
      opsIdentity(),
      {
        reason: "manual_ops_hold",
        reasonMessage: "Ops requested a manual hold.",
      },
      "req-dms-create-002",
    );

    const response = controller.listSuppressions(
      driverIdentity("drv-driver-001"),
      "req-dms-list-001",
    );

    expect(response).toEqual({
      data: {
        items: [
          expect.objectContaining({
            driverId: "drv-driver-001",
            reason: "manual_ops_hold",
            status: "active",
            releaseAction: null,
          }),
        ],
      },
      meta: {
        requestId: "req-dms-list-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("releases a suppression and returns an ActionReceipt with the release auditId", () => {
    const { auditNotificationService, controller } = createController();

    const created = controller.createSuppression(
      "drv-driver-001",
      opsIdentity(),
      {
        reason: "platform_reauth_required",
        reasonMessage: "Platform access token expired.",
      },
      "req-dms-create-003",
    );

    const releaseResponse = controller.releaseSuppression(
      "drv-driver-001",
      created.data.suppressionId,
      opsIdentity(),
      "req-dms-release-001",
    );

    expect(releaseResponse).toEqual({
      data: {
        actionId: expect.stringContaining(
          "release_driver_matching_suppression:",
        ),
        auditId: expect.any(String),
        resourceType: "driver_matching_suppression",
        resourceId: created.data.suppressionId,
        status: "completed",
        message: "Driver matching suppression released.",
      },
      meta: {
        requestId: "req-dms-release-001",
        timestamp: expect.any(String),
      },
    });

    const listed = controller.listSuppressions(
      driverIdentity("drv-driver-001"),
      "req-dms-list-002",
    );
    expect(listed.data.items).toEqual([
      expect.objectContaining({
        suppressionId: created.data.suppressionId,
        status: "released",
        releasedAt: expect.any(String),
        auditId: releaseResponse.data.auditId,
        releaseAction: null,
      }),
    ]);

    const releaseAudit = auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "release_driver_matching_suppression" &&
          entry.resourceId === created.data.suppressionId,
      );
    expect(releaseAudit?.auditId).toBe(releaseResponse.data.auditId);
  });

  it("forbids cross-actor release attempts", () => {
    const { controller } = createController();

    const created = controller.createSuppression(
      "drv-driver-001",
      opsIdentity("ops-user-creator"),
      {
        reason: "compliance_hold",
        reasonMessage: "Compliance review pending.",
      },
      "req-dms-create-004",
    );

    expect(() =>
      controller.releaseSuppression(
        "drv-driver-001",
        created.data.suppressionId,
        opsIdentity("ops-user-other"),
        "req-dms-release-002",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "MATCHING_SUPPRESSION_RELEASE_FORBIDDEN",
          }),
        }),
      }),
    );
  });
});
