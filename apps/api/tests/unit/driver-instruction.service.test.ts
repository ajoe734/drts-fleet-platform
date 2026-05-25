import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverInstructionService } from "../../src/modules/driver-instruction/driver-instruction.service";

const OPS_IDENTITY = {
  actorId: "ops-user-001",
  actorType: "ops_user" as const,
  realm: "ops" as const,
  authMode: "bootstrap_headers" as const,
  roleFamilies: ["ops"] as const,
  roles: ["ops_dispatcher"],
  scopes: ["dispatch:write"],
  tenantId: null,
  supportedExecutionModes: ["supervisor_managed_execution"] as const,
};

const DRIVER_IDENTITY = {
  actorId: "drv-demo-001",
  actorType: "driver_user" as const,
  realm: "driver" as const,
  authMode: "bootstrap_headers" as const,
  roleFamilies: ["driver"] as const,
  roles: ["driver"],
  scopes: ["driver:read", "driver:write"],
  tenantId: null,
  supportedExecutionModes: ["supervisor_managed_execution"] as const,
};

describe("DriverInstructionService", () => {
  it("lists only active unacknowledged instructions for the current driver", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    const active = service.createInstruction(
      {
        driverId: "drv-demo-001",
        taskId: "task-001",
        message: "Call dispatch before pickup.",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      OPS_IDENTITY,
      "req-driver-inst-001",
    );

    service.createInstruction(
      {
        driverId: "drv-demo-001",
        taskId: "task-002",
        message: "Use the secondary pickup lane.",
        expiresAt: "2099-01-02T00:00:00.000Z",
      },
      OPS_IDENTITY,
    );

    service.createInstruction(
      {
        driverId: "drv-demo-002",
        taskId: "task-001",
        message: "Other driver instruction",
        expiresAt: "2099-01-03T00:00:00.000Z",
      },
      OPS_IDENTITY,
    );

    const listed = service.listInstructionsForDriver(DRIVER_IDENTITY);
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(
      expect.arrayContaining([
        active,
        expect.objectContaining({ taskId: "task-002" }),
      ]),
    );
    expect(
      service.listInstructionsForDriver(DRIVER_IDENTITY, "task-001"),
    ).toEqual([active]);
  });

  it("hides expired instructions and marks linked notifications read on acknowledge", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);
    const now = Date.now();

    const active = service.createInstruction(
      {
        driverId: "drv-demo-001",
        taskId: "task-001",
        message: "Proceed to manual fallback rendezvous point.",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      OPS_IDENTITY,
      "req-driver-inst-002",
    );

    service.createInstruction(
      {
        driverId: "drv-demo-001",
        taskId: "task-001",
        message: "Short-lived instruction",
        expiresAt: new Date(now + 50).toISOString(),
      },
      OPS_IDENTITY,
    );

    const originalDateNow = Date.now;
    Date.now = () => now + 1000;

    try {
      const listed = service.listInstructionsForDriver(
        DRIVER_IDENTITY,
        "task-001",
      );
      expect(listed).toEqual([active]);

      const acknowledged = service.acknowledgeInstruction(
        active.instructionId,
        DRIVER_IDENTITY,
        "req-driver-inst-ack-001",
      );
      expect(acknowledged).toMatchObject({
        instructionId: active.instructionId,
        taskId: "task-001",
      });
      expect(acknowledged.acknowledgedAt).toMatch(/Z$/);

      expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([]);
    } finally {
      Date.now = originalDateNow;
    }

    const linkedNotification = auditNotificationService
      .listNotifications()
      .find((entry) => entry.message === active.message);
    expect(linkedNotification?.status).toBe("read");
    expect(linkedNotification?.readAt).not.toBeNull();
  });

  it("rejects invalid or expired expiry timestamps", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    expect(() =>
      service.createInstruction(
        {
          driverId: "drv-demo-001",
          taskId: "task-001",
          message: "Bad expiry",
          expiresAt: "not-a-date",
        },
        OPS_IDENTITY,
      ),
    ).toThrowError(ApiRequestError);

    expect(() =>
      service.createInstruction(
        {
          driverId: "drv-demo-001",
          taskId: "task-001",
          message: "Past expiry",
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
        OPS_IDENTITY,
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
          }),
        }),
      }),
    );
  });

  it("rejects acknowledging an expired instruction", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    const now = Date.now();
    const instruction = service.createInstruction(
      {
        driverId: "drv-demo-001",
        taskId: "task-001",
        message: "Expires immediately",
        expiresAt: new Date(now + 10).toISOString(),
      },
      OPS_IDENTITY,
    );

    const originalDateNow = Date.now;
    Date.now = () => now + 1000;

    try {
      expect(() =>
        service.acknowledgeInstruction(
          instruction.instructionId,
          DRIVER_IDENTITY,
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "DRIVER_OPS_INSTRUCTION_EXPIRED",
            }),
          }),
        }),
      );
    } finally {
      Date.now = originalDateNow;
    }
  });
});
