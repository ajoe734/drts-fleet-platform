import { describe, expect, it, vi } from "vitest";

import { DriverInstructionRepository } from "../../apps/api/src/modules/driver-instruction/driver-instruction.repository";
import type { PersistedDriverInstructionRecord } from "../../apps/api/src/modules/driver-instruction/driver-instruction.service";

describe("driver instruction repository", () => {
  it("loads persisted instructions from ops.phase1_driver_ops_instructions", async () => {
    const instruction: PersistedDriverInstructionRecord = {
      instructionId: "drvinst-db-001",
      driverId: "drv-demo-001",
      taskId: "task-demo-001",
      message: "Call dispatch before pickup.",
      issuedBy: "ops-user-001",
      issuedAt: "2026-05-25T17:00:00.000Z",
      expiresAt: "2026-05-25T18:00:00.000Z",
      acknowledgedAt: null,
      notificationId: "notif-001",
      updatedAt: "2026-05-25T17:00:00.000Z",
    };
    const query = vi.fn().mockResolvedValue({
      rows: [{ record: instruction }],
    });
    const repository = new DriverInstructionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(repository.loadAll()).resolves.toEqual([instruction]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM ops.phase1_driver_ops_instructions"),
    );
  });

  it("upserts persisted instructions into ops.phase1_driver_ops_instructions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DriverInstructionRepository({
      isEnabled: () => true,
      query,
    } as never);
    const instruction: PersistedDriverInstructionRecord = {
      instructionId: "drvinst-db-002",
      driverId: "drv-demo-002",
      taskId: "task-demo-002",
      message: "Use the fallback meeting point.",
      issuedBy: "ops-user-002",
      issuedAt: "2026-05-25T17:30:00.000Z",
      expiresAt: null,
      acknowledgedAt: "2026-05-25T17:45:00.000Z",
      notificationId: "notif-002",
      updatedAt: "2026-05-25T17:45:00.000Z",
    };

    await repository.upsert(instruction);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ops.phase1_driver_ops_instructions"),
      [
        instruction.instructionId,
        instruction.driverId,
        instruction.taskId,
        instruction.issuedAt,
        instruction.expiresAt,
        instruction.acknowledgedAt,
        instruction.updatedAt,
        JSON.stringify(instruction),
      ],
    );
  });
});
