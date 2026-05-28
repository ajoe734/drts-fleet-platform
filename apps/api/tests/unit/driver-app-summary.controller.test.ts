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

function opsIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "ops-user-001",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops"],
    scopes: [],
    requestId: null,
  };
}

describe("DriverAppSummaryController", () => {
  it("wraps workspace summaries in the standard success envelope and scopes by bootstrap driver identity", async () => {
    const summaryService = {
      getWorkspaceSummary: vi.fn(async () => ({
        driverId: "driver-001",
        counts: {
          actionRequired: 1,
          awaitingPlatform: 0,
          inProgress: 0,
          blocked: 0,
          completed: 0,
          readOnly: 0,
          total: 1,
        },
        activeTrip: null,
        outstandingInstructionCount: 1,
        refresh: {
          generatedAt: "2026-05-28T05:00:00.000Z",
          staleAfterMs: 15000,
          dataFreshness: "fresh",
          source: "live",
        },
      })),
    };
    const controller = new DriverAppSummaryController(summaryService as never);

    const response = await controller.getWorkspaceSummary(
      driverIdentity("driver-001"),
      "driver-spoofed-999",
      "req-driver-workspace-001",
    );

    expect(summaryService.getWorkspaceSummary).toHaveBeenCalledWith(
      "driver-001",
    );
    expect(response).toEqual({
      data: {
        driverId: "driver-001",
        counts: {
          actionRequired: 1,
          awaitingPlatform: 0,
          inProgress: 0,
          blocked: 0,
          completed: 0,
          readOnly: 0,
          total: 1,
        },
        activeTrip: null,
        outstandingInstructionCount: 1,
        refresh: {
          generatedAt: "2026-05-28T05:00:00.000Z",
          staleAfterMs: 15000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-driver-workspace-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("uses the explicit driverId for platform presence summaries when the caller is not a driver bootstrap identity", async () => {
    const summaryService = {
      getPlatformPresenceSummary: vi.fn(async () => ({
        driverId: "driver-supervised-002",
        bindings: [],
        notes: [],
        health: {
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-05-28T05:00:00.000Z",
        },
        refresh: {
          generatedAt: "2026-05-28T05:00:00.000Z",
          staleAfterMs: 30000,
          dataFreshness: "fresh",
          source: "live",
        },
      })),
    };
    const controller = new DriverAppSummaryController(summaryService as never);

    const response = await controller.getPlatformPresenceSummary(
      opsIdentity(),
      "driver-supervised-002",
      "req-ops-platform-summary-001",
    );

    expect(summaryService.getPlatformPresenceSummary).toHaveBeenCalledWith(
      "driver-supervised-002",
    );
    expect(response).toEqual({
      data: {
        driverId: "driver-supervised-002",
        bindings: [],
        notes: [],
        health: {
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-05-28T05:00:00.000Z",
        },
        refresh: {
          generatedAt: "2026-05-28T05:00:00.000Z",
          staleAfterMs: 30000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-ops-platform-summary-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("rejects workspace summary requests without a driver bootstrap identity or explicit driverId", async () => {
    const summaryService = {
      getWorkspaceSummary: vi.fn(),
    };
    const controller = new DriverAppSummaryController(summaryService as never);

    await expect(
      controller.getWorkspaceSummary(null, undefined, "req-anon-workspace-001"),
    ).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_ID_REQUIRED",
          }),
        }),
      }),
    );
    expect(summaryService.getWorkspaceSummary).not.toHaveBeenCalled();
  });
});
