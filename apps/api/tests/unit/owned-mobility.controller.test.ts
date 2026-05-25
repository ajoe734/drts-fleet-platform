import { describe, expect, it, vi } from "vitest";

import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";

describe("OwnedMobilityController", () => {
  it("wraps owned queue read models in the standard success envelope", () => {
    const ownedMobilityService = {
      listOrdersReadModel: vi.fn(() => ({
        items: [
          {
            orderId: "ORD-queue-001",
            availableActions: [
              {
                action: "assign",
                enabled: true,
                riskLevel: "medium",
              },
            ],
          },
        ],
        refresh: {
          generatedAt: "2026-05-25T11:20:00.000Z",
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "live",
        },
      })),
    };
    const controller = new OwnedMobilityController(
      ownedMobilityService as never,
    );

    const response = controller.listOrders("req-owned-list-001");

    expect(ownedMobilityService.listOrdersReadModel).toHaveBeenCalledWith();
    expect(response).toEqual({
      data: {
        items: [
          {
            orderId: "ORD-queue-001",
            availableActions: [
              {
                action: "assign",
                enabled: true,
                riskLevel: "medium",
              },
            ],
          },
        ],
        refresh: {
          generatedAt: "2026-05-25T11:20:00.000Z",
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-owned-list-001",
        timestamp: expect.any(String),
      },
    });
  });
});
