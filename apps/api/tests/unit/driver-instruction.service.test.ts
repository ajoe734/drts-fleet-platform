import type { CreateDriverOpsInstructionCommand } from "@drts/contracts";
import { describe, expect, it, vi } from "vitest";

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

const BASE_COMMAND: CreateDriverOpsInstructionCommand = {
  driverId: "drv-demo-001",
  taskId: "task-001",
  message: "Call dispatch before pickup.",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function createCommand(
  overrides: Partial<CreateDriverOpsInstructionCommand> = {},
): CreateDriverOpsInstructionCommand {
  return {
    ...BASE_COMMAND,
    ...overrides,
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe("DriverInstructionService", () => {
  it("lists only active unacknowledged instructions for the current driver", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    const active = await service.createInstruction(
      createCommand(),
      OPS_IDENTITY,
      "req-driver-inst-001",
    );

    await service.createInstruction(
      createCommand({
        taskId: "task-002",
        message: "Use the secondary pickup lane.",
        expiresAt: "2099-01-02T00:00:00.000Z",
      }),
      OPS_IDENTITY,
    );

    await service.createInstruction(
      createCommand({
        driverId: "drv-demo-002",
        message: "Other driver instruction",
        expiresAt: "2099-01-03T00:00:00.000Z",
      }),
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

  it("hides expired instructions and marks linked notifications read on acknowledge", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);
    const now = Date.now();

    const active = await service.createInstruction(
      createCommand({
        message: "Proceed to manual fallback rendezvous point.",
      }),
      OPS_IDENTITY,
      "req-driver-inst-002",
    );

    await service.createInstruction(
      createCommand({
        message: "Short-lived instruction",
        expiresAt: new Date(now + 50).toISOString(),
      }),
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

      const acknowledged = await service.acknowledgeInstruction(
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

  it("rejects invalid or expired expiry timestamps", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    await expect(
      service.createInstruction(
        createCommand({
          message: "Bad expiry",
          expiresAt: "not-a-date",
        }),
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(ApiRequestError);

    await expect(
      service.createInstruction(
        createCommand({
          message: "Past expiry",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
          }),
        }),
      }),
    );
  });

  it("rejects missing required fields with INVALID_DRIVER_OPS_INSTRUCTION", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    await expect(
      service.createInstruction(
        {
          taskId: "task-001",
          message: "Missing driver id.",
          expiresAt: null,
        } as CreateDriverOpsInstructionCommand,
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION",
            details: {
              field: "driverId",
            },
          }),
        }),
      }),
    );
  });

  it("rejects null bodies and non-string create fields without throwing runtime errors", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    await expect(
      service.createInstruction(null as never, OPS_IDENTITY),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION",
            details: { field: "driverId" },
          }),
        }),
      }),
    );

    await expect(
      service.createInstruction(
        createCommand({ taskId: 123 as never }),
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION",
            details: { field: "taskId" },
          }),
        }),
      }),
    );

    await expect(
      service.createInstruction(
        createCommand({ message: { text: "Call dispatch" } as never }),
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION",
            details: { field: "message" },
          }),
        }),
      }),
    );

    await expect(
      service.createInstruction(
        createCommand({ expiresAt: 123 as never }),
        OPS_IDENTITY,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY",
          }),
        }),
      }),
    );
  });

  it("waits for durable create persistence before exposing the instruction", async () => {
    const auditNotificationService = new AuditNotificationService();
    const deferred = createDeferred();
    const repository = {
      upsert: vi.fn().mockReturnValueOnce(deferred.promise),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new DriverInstructionService(
      auditNotificationService,
      repository as never,
    );

    const createPromise = service.createInstruction(
      createCommand(),
      OPS_IDENTITY,
    );
    await Promise.resolve();

    expect(repository.upsert).toHaveBeenCalledTimes(1);
    expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([]);

    deferred.resolve();

    const instruction = await createPromise;
    expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([
      instruction,
    ]);
  });

  it("returns storage unavailable and leaves no in-memory residue when create persistence fails", async () => {
    const auditNotificationService = new AuditNotificationService();
    const repository = {
      upsert: vi.fn().mockRejectedValue(new Error("db unavailable")),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new DriverInstructionService(
      auditNotificationService,
      repository as never,
    );

    await expect(
      service.createInstruction(createCommand(), OPS_IDENTITY),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE",
            retryable: true,
          }),
        }),
      }),
    );

    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "create_instruction",
    );
    expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([]);
    expect(
      auditNotificationService
        .listNotifications()
        .some((entry) => entry.message === BASE_COMMAND.message),
    ).toBe(false);
  });

  it("rejects acknowledging an expired instruction", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    const now = Date.now();
    const instruction = await service.createInstruction(
      createCommand({
        message: "Expires immediately",
        expiresAt: new Date(now + 10).toISOString(),
      }),
      OPS_IDENTITY,
    );

    const originalDateNow = Date.now;
    Date.now = () => now + 1000;

    try {
      await expect(
        service.acknowledgeInstruction(
          instruction.instructionId,
          DRIVER_IDENTITY,
        ),
      ).rejects.toThrowError(
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

  it("waits for durable acknowledge persistence before marking the instruction read", async () => {
    const auditNotificationService = new AuditNotificationService();
    const deferred = createDeferred();
    const repository = {
      upsert: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(deferred.promise),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new DriverInstructionService(
      auditNotificationService,
      repository as never,
    );

    const instruction = await service.createInstruction(
      createCommand(),
      OPS_IDENTITY,
    );
    const linkedNotification = auditNotificationService
      .listNotifications()
      .find((entry) => entry.message === instruction.message);

    const acknowledgePromise = service.acknowledgeInstruction(
      instruction.instructionId,
      DRIVER_IDENTITY,
    );
    await Promise.resolve();

    expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([
      instruction,
    ]);
    expect(linkedNotification?.status).toBe("unread");

    deferred.resolve();

    await expect(acknowledgePromise).resolves.toMatchObject({
      instructionId: instruction.instructionId,
      taskId: instruction.taskId,
    });

    const refreshedNotification = auditNotificationService
      .listNotifications()
      .find(
        (entry) => entry.notificationId === linkedNotification?.notificationId,
      );
    expect(service.listInstructionsForDriver(DRIVER_IDENTITY)).toEqual([]);
    expect(refreshedNotification?.status).toBe("read");
  });

  it("keeps acknowledge idempotent after the instruction later expires", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    const now = Date.now();
    const instruction = await service.createInstruction(
      createCommand({
        message: "Acknowledge before expiry.",
        expiresAt: new Date(now + 10).toISOString(),
      }),
      OPS_IDENTITY,
    );

    const firstAck = await service.acknowledgeInstruction(
      instruction.instructionId,
      DRIVER_IDENTITY,
    );

    const originalDateNow = Date.now;
    Date.now = () => now + 1000;

    try {
      await expect(
        service.acknowledgeInstruction(
          instruction.instructionId,
          DRIVER_IDENTITY,
        ),
      ).resolves.toEqual(firstAck);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("rejects non-string task filters instead of throwing from trim", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverInstructionService(auditNotificationService);

    await service.createInstruction(createCommand(), OPS_IDENTITY);

    expect(() =>
      service.listInstructionsForDriver(DRIVER_IDENTITY, ["task-001"] as never),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_DRIVER_OPS_INSTRUCTION",
            details: { field: "taskId" },
          }),
        }),
      }),
    );
  });
});
