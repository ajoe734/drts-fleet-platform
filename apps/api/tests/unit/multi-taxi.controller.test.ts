import { describe, expect, it, vi } from "vitest";

import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

describe("MultiTaxiController ride intake", () => {
  it("awaits passenger ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-001", orderNo: "MTX-001" },
      passengerAccess: {
        tokenId: "token-001",
        accessToken: "opaque-access-token",
      },
    };
    const service = {
      createRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createRide(
      {} as never,
      null,
      "req-create-001",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createRide).toHaveBeenCalledWith({}, null, "req-create-001");
  });

  it("awaits call-center ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-002", orderNo: "MTX-002" },
      passengerAccess: {
        tokenId: "token-002",
        accessToken: "opaque-call-center-token",
      },
    };
    const service = {
      createCallCenterRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createCallCenterRide(
      {} as never,
      "req-create-002",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createCallCenterRide).toHaveBeenCalledWith(
      {},
      "req-create-002",
    );
  });

  it("wraps platform-admin trip records list responses after awaiting the service", async () => {
    const result = [
      {
        recordId: "mtr-order-001",
        orderId: "order-001",
        orderNo: "ZX-240720-0186",
      },
    ];
    const service = {
      listTripOperationalRecords: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.listTripOperationalRecords(
      { month: "2026-07" },
      "req-records-001",
    );

    expect(response.data.items).toEqual(result);
    expect(service.listTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-07",
    });
  });

  it("wraps platform-admin trip records export payload after awaiting the service", async () => {
    const result = {
      exportedAt: "2026-07-23T00:00:00.000Z",
      filename: "multi-taxi-trip-records-202607.csv",
      rows: [
        {
          orderNoMasked: "ZX-240...86",
          plateNoMasked: "BK...08",
        },
      ],
    };
    const service = {
      exportTripOperationalRecords: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.exportTripOperationalRecords(
      { month: "2026-07" },
      "req-records-export-001",
    );

    expect(response.data).toEqual(result);
    expect(service.exportTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-07",
    });
  });
});
