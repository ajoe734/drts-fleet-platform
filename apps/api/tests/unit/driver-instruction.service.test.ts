import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverInstructionService } from "../../src/modules/driver-instruction/driver-instruction.service";

function buildService() {
  const auditNotificationService = new AuditNotificationService();
  const service = new DriverInstructionService(auditNotificationService);
  return { auditNotificationService, service };
}

describe("DriverInstructionService", () => {
  it("lets ops create an instruction that the driver can then read", () => {
    const { service } = buildService();

    const created = service.createInstruction(
      {
        driverId: "drv-demo-001",
        title: "Return to depot",
        body: "Please return your vehicle to the north depot by 18:00.",
        severity: "warning",
        createdBy: "ops-user-009",
      },
      "req-instruction-001",
    );

    expect(created).toMatchObject({
      driverId: "drv-demo-001",
      title: "Return to depot",
      severity: "warning",
      createdBy: "ops-user-009",
      acknowledgedAt: null,
      status: "active",
    });
    expect(created.instructionId).toMatch(/^drvops_/);

    const feed = service.listForDriver("drv-demo-001");
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      instructionId: created.instructionId,
      status: "active",
    });

    // A different driver does not receive it.
    expect(service.listForDriver("drv-other-002")).toHaveLength(0);
  });

  it("defaults severity to info and createdBy to null", () => {
    const { service } = buildService();

    const created = service.createInstruction({
      driverId: "drv-demo-001",
      title: "Reminder",
      body: "Check tyre pressure before your next shift.",
    });

    expect(created.severity).toBe("info");
    expect(created.createdBy).toBeNull();
    expect(created.expiresAt).toBeNull();
  });

  it("treats past-dated instructions as expired and hides them from the driver feed", () => {
    const { service } = buildService();

    service.createInstruction({
      driverId: "drv-demo-001",
      title: "Expired notice",
      body: "This one is already past its expiry.",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    // Excluded from the driver-facing feed.
    expect(service.listForDriver("drv-demo-001")).toHaveLength(0);

    // Still visible to ops with an expired status.
    const all = service.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("expired");
  });

  it("keeps future-dated instructions active in the driver feed", () => {
    const { service } = buildService();

    service.createInstruction({
      driverId: "drv-demo-001",
      title: "Future notice",
      body: "Still valid for a while.",
      expiresAt: "2999-01-01T00:00:00.000Z",
    });

    const feed = service.listForDriver("drv-demo-001");
    expect(feed).toHaveLength(1);
    expect(feed[0].status).toBe("active");
  });

  it("marks an instruction acknowledged and records who acknowledged it", () => {
    const { service, auditNotificationService } = buildService();

    const created = service.createInstruction({
      driverId: "drv-demo-001",
      title: "Acknowledge me",
      body: "Tap to confirm you have read this.",
    });

    const acknowledged = service.acknowledge(
      created.instructionId,
      "drv-demo-001",
      "req-ack-001",
    );

    expect(acknowledged.status).toBe("acknowledged");
    expect(acknowledged.acknowledgedAt).not.toBeNull();

    // includeAcknowledged=false filters acknowledged items out of the feed.
    expect(
      service.listForDriver("drv-demo-001", { includeAcknowledged: false }),
    ).toHaveLength(0);
    // Default feed still surfaces it.
    expect(service.listForDriver("drv-demo-001")).toHaveLength(1);

    const auditLog = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "acknowledge_driver_instruction");
    expect(auditLog).toMatchObject({
      resourceId: created.instructionId,
      actorId: "drv-demo-001",
    });
  });

  it("is idempotent on repeated acknowledgement", () => {
    const { service } = buildService();

    const created = service.createInstruction({
      driverId: "drv-demo-001",
      title: "Acknowledge me once",
      body: "Confirm receipt.",
    });

    const first = service.acknowledge(created.instructionId, "drv-demo-001");
    const second = service.acknowledge(created.instructionId, "drv-demo-001");

    expect(second.acknowledgedAt).toBe(first.acknowledgedAt);
  });

  it("rejects acknowledgement of unknown or mismatched instructions", () => {
    const { service } = buildService();

    const created = service.createInstruction({
      driverId: "drv-demo-001",
      title: "Owned by demo-001",
      body: "Only this driver may acknowledge it.",
    });

    const expectNotFound = (run: () => void) => {
      try {
        run();
        throw new Error("expected acknowledge to throw");
      } catch (error) {
        const httpError = error as {
          getStatus?: () => number;
          getResponse?: () => unknown;
        };
        expect(httpError.getStatus?.()).toBe(404);
        expect(httpError.getResponse?.()).toMatchObject({
          error: { code: "driver_instruction_not_found" },
        });
      }
    };

    // Unknown instruction id.
    expectNotFound(() => service.acknowledge("drvops_missing"));
    // Right instruction id, wrong driver.
    expectNotFound(() =>
      service.acknowledge(created.instructionId, "drv-other-002"),
    );
  });

  it("records an ops audit log when an instruction is created", () => {
    const { service, auditNotificationService } = buildService();

    const created = service.createInstruction(
      {
        driverId: "drv-demo-001",
        title: "Audited create",
        body: "Should leave an audit trail.",
        severity: "critical",
        createdBy: "ops-user-009",
      },
      "req-instruction-audit-001",
    );

    const auditLog = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "create_driver_instruction");
    expect(auditLog).toMatchObject({
      actorType: "ops_user",
      actorId: "ops-user-009",
      resourceType: "driver_ops_instruction",
      resourceId: created.instructionId,
      requestId: "req-instruction-audit-001",
    });
    expect(auditLog?.newValuesSummary).toMatchObject({
      driverId: "drv-demo-001",
      severity: "critical",
    });
  });
});
