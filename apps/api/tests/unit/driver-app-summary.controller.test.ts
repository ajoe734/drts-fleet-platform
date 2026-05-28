import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { DriverAppSummaryController } from "../../src/modules/driver-app/driver-app-summary.controller";

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: [],
    requestId: null,
  };
}

describe("DriverAppSummaryController", () => {
  it("scopes workspace summary to the bootstrap driver identity", async () => {
    const service = {
      getWorkspaceSummary: vi.fn(async () => ({
        driverId: "driver-010",
        taskCounts: {
          total: 1,
          actionRequired: 0,
          awaitingPlatform: 0,
          inProgress: 1,
          blocked: 0,
          completed: 0,
          readOnly: 0,
        },
        taskCountsByState: [],
        activeTrip: null,
        outstandingInstructionCount: 0,
        instructions: [],
        refresh: {
          generatedAt: "2026-05-26T12:00:00Z",
          staleAfterMs: 15000,
          dataFreshness: "fresh",
          source: "sandbox",
        },
      })),
      getPlatformPresenceSummary: vi.fn(),
    };
    const controller = new DriverAppSummaryController(service as never);

    const response = await controller.getWorkspaceSummary(
      driverIdentity("driver-010"),
      undefined,
      "req-workspace-001",
    );

    expect(service.getWorkspaceSummary).toHaveBeenCalledWith("driver-010");
    expect(response).toEqual({
      data: expect.objectContaining({
        driverId: "driver-010",
      }),
      meta: {
        requestId: "req-workspace-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("allows platform/ops callers to specify a driverId query", async () => {
    const service = {
      getWorkspaceSummary: vi.fn(),
      getPlatformPresenceSummary: vi.fn(async () => ({
        driverId: "driver-011",
        bindings: [],
        instructions: [],
        suppressions: [],
        health: {
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-05-26T12:00:00Z",
        },
        refresh: {
          generatedAt: "2026-05-26T12:00:00Z",
          staleAfterMs: 15000,
          dataFreshness: "fresh",
          source: "sandbox",
        },
      })),
    };
    const controller = new DriverAppSummaryController(service as never);

    await controller.getPlatformPresenceSummary(
      null,
      "driver-011",
      "req-platform-summary-001",
    );

    expect(service.getPlatformPresenceSummary).toHaveBeenCalledWith(
      "driver-011",
    );
  });
});
