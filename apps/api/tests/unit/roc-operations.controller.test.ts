import { describe, expect, it, vi } from "vitest";

import { RocOperationsController } from "../../src/modules/roc-operations/roc-operations.controller";
import type { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";

describe("RocOperationsController", () => {
  it("wraps ROC overview reads, alert lists, and safety-action writes in the standard API envelope", async () => {
    const service = {
      getOverview: vi.fn(() => ({
        generatedAt: "2026-06-26T04:00:00.000Z",
        activeVehicleCount: 1,
        activeTripCount: 1,
        activeTakeoverCount: 0,
        openAlertCount: 1,
        criticalAlertCount: 1,
        acknowledgedAlertCount: 0,
        stopNewDispatchVehicleCount: 0,
        operationalHoldVehicleCount: 0,
        evidenceFreezeVehicleCount: 0,
        humanFallbackVehicleCount: 0,
        providerHealth: {
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-06-26T04:00:00.000Z",
        },
      })),
      listAlerts: vi.fn(() => [
        {
          alertId: "roc-alert-001",
          alertType: "dispatch_gate",
          status: "open",
          severity: "critical",
          title: "Recorder unhealthy",
          summary: "Evidence recorder degraded.",
          vehicleId: "veh-roc-001",
          orderId: "ord-roc-001",
          sandboxProgramId: "sandbox-demo-001",
          providerCode: "onboard_recorder",
          sourceRecordId: "rec-001",
          acknowledgedAt: null,
          acknowledgedBy: null,
          assignedTo: null,
          assignedAt: null,
          linkedIncidentId: null,
          resolvedAt: null,
          resolvedBy: null,
          openedAt: "2026-06-26T04:00:00.000Z",
          updatedAt: "2026-06-26T04:00:00.000Z",
          availableActions: [
            {
              action: "stop-new-dispatch",
              enabled: true,
              requiresReason: true,
              riskLevel: "high",
            },
          ],
        },
      ]),
      requestSafetyAction: vi.fn(async () => ({
        actionId: "roc-action-001",
        auditId: "roc-audit-001",
        resourceType: "roc_alert",
        resourceId: "roc-alert-001",
        status: "completed",
        message: "request-safety-action: Safety operator assigned.",
      })),
    };
    const controller = new RocOperationsController(service as never);

    const overview = controller.getOverview("req-roc-overview-001", null);
    const alerts = controller.listAlerts("req-roc-alerts-001", null);
    const receipt = await controller.requestSafetyAction(
      "roc-alert-001",
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: "sandbox-demo-001",
      },
      "req-roc-action-001",
      null,
    );

    expect(service.getOverview).toHaveBeenCalledWith(null);
    expect(service.listAlerts).toHaveBeenCalledWith(null);
    expect(service.requestSafetyAction).toHaveBeenCalledWith(
      "roc-alert-001",
      expect.objectContaining({
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: "sandbox-demo-001",
      }),
      null,
    );
    expect(overview).toEqual({
      data: {
        item: expect.objectContaining({
          activeVehicleCount: 1,
          openAlertCount: 1,
        }),
        refresh: {
          generatedAt: "2026-06-26T04:00:00.000Z",
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "sandbox",
        },
      },
      meta: {
        requestId: "req-roc-overview-001",
        timestamp: expect.any(String),
      },
    });
    expect(alerts).toEqual({
      data: {
        items: [
          expect.objectContaining({
            alertId: "roc-alert-001",
            availableActions: [
              expect.objectContaining({
                action: "stop-new-dispatch",
                enabled: true,
              }),
            ],
          }),
        ],
        refresh: {
          generatedAt: expect.any(String),
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "sandbox",
        },
      },
      meta: {
        requestId: "req-roc-alerts-001",
        timestamp: expect.any(String),
      },
    });
    expect(receipt).toEqual({
      data: expect.objectContaining({
        actionId: "roc-action-001",
        resourceId: "roc-alert-001",
      }),
      meta: {
        requestId: "req-roc-action-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("awaits trip fallback-to-human before wrapping the API envelope", async () => {
    const service = {
      fallbackTripToHuman: vi.fn().mockResolvedValue({
        tripId: "order-av-001",
        orderId: "order-av-001",
        bookingId: "booking-av-001",
        dispatchJobId: "job-av-001",
        status: "assigned",
        etaSnapshot: {
          etaMinutes: 18,
          calculatedAt: "2026-06-26T10:00:00.000Z",
        },
        assignmentId: "assignment-human-001",
        taskId: "task-human-001",
        intervention: {
          interventionId: "intv-001",
        },
        report: {
          reportId: "report-001",
        },
        receipt: {
          actionId: "req-roc-001",
          auditId: "audit-001",
          resourceType: "sandbox_exception_report",
          resourceId: "report-001",
          status: "completed",
          message: "ROC fallback to human completed and report generated.",
        },
      }),
    } as unknown as RocOperationsService;
    const controller = new RocOperationsController(service);

    const response = await controller.fallbackTripToHuman(
      "order-av-001",
      {
        humanVehicleId: "veh-human-001",
        humanDriverId: "drv-human-001",
        revisedEtaMinutes: 18,
        reason: "AV gate blocked",
      },
      null,
      "req-roc-001",
    );

    expect(response.data).toMatchObject({
      tripId: "order-av-001",
      bookingId: "booking-av-001",
      assignmentId: "assignment-human-001",
      report: {
        reportId: "report-001",
      },
    });
    expect(service.fallbackTripToHuman).toHaveBeenCalledWith(
      "order-av-001",
      expect.objectContaining({
        humanVehicleId: "veh-human-001",
        humanDriverId: "drv-human-001",
        revisedEtaMinutes: 18,
      }),
      null,
      "req-roc-001",
    );
  });
});
