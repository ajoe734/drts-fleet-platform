import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  recoverOrders,
  finalizeCreatedOrders,
  passengerPageOperations,
  RecoveryOperationError,
} = require("../../../operations/verification/recover-interrupted-passenger-rehearsals.cjs");
const target = {
  orderId: "128b865e-68f4-4b38-8b09-cdca799435d5",
  phone: "0900000098",
  failedRunId: 39052144148,
  expectedDriverId: "pax-review-driver-a",
  expectedVehicleId: "pax-review-vehicle-a",
};
const ride = (status = "arrived_pickup") => ({
  order: { orderId: target.orderId, status },
  assignment: {
    assignmentId: "existing-assignment",
    driver: { driverId: target.expectedDriverId },
    vehicle: { vehicleId: target.expectedVehicleId },
  },
});
const ports = () => ({ login: vi.fn(), read: vi.fn(), cancel: vi.fn() });

describe("interrupted real rehearsal order lifecycle", () => {
  it("unwraps the original Passenger ride response before reading the canonical order", async () => {
    const get = vi.fn().mockResolvedValue({
      ok: () => true,
      json: async () => ({
        data: {
          ride: {
            order: { order_id: target.orderId, status: "arrived_pickup" },
            assignment: {
              assignment_id: "existing-assignment",
              driver: { driver_id: target.expectedDriverId },
              vehicle: { vehicle_id: target.expectedVehicleId },
            },
          },
        },
      }),
    });
    const p = passengerPageOperations(
      () => ({ request: { get } }),
      "https://passenger.invalid",
      "/unused",
    );
    const result = await p.read(target.orderId);
    expect(result).toMatchObject(ride());
    expect(get).toHaveBeenCalledExactlyOnceWith(
      `https://passenger.invalid/api/passenger-app/rides/${target.orderId}`,
    );
  });
  it("inspects the original owner order without cancelling or replacing it", async () => {
    const p = ports();
    p.read.mockResolvedValue(ride());
    const result = await recoverOrders([target], "inspect", p, vi.fn());
    expect(p.login).toHaveBeenCalledWith(target.phone);
    expect(p.read).toHaveBeenCalledExactlyOnceWith(target.orderId);
    expect(p.cancel).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      orderId: target.orderId,
      outcome: "inspected",
      before: { status: "arrived_pickup" },
    });
  });
  it("uses the original cancellation and reads back the same persisted order", async () => {
    const p = ports();
    p.read
      .mockResolvedValueOnce(ride())
      .mockResolvedValueOnce(ride("cancelled"));
    const result = await recoverOrders([target], "cancel", p, vi.fn());
    expect(p.cancel).toHaveBeenCalledExactlyOnceWith(target.orderId);
    expect(p.read.mock.calls).toEqual([[target.orderId], [target.orderId]]);
    expect(result[0]).toMatchObject({
      outcome: "cancelled_through_original_passenger_flow",
      after: { orderId: target.orderId, status: "cancelled" },
    });
  });
  it.each(["cancelled", "completed"])(
    "preserves an already %s order without another mutation",
    async (status) => {
      const p = ports();
      p.read.mockResolvedValue(ride(status));
      const result = await recoverOrders([target], "cancel", p, vi.fn());
      expect(p.cancel).not.toHaveBeenCalled();
      expect(result[0].outcome).toBe("already_terminal");
    },
  );
  it.each(["on_trip", "proof_pending"])(
    "retains a %s ride for its actual completion flow",
    async (status) => {
      const p = ports();
      p.read.mockResolvedValue(ride(status));
      const result = await recoverOrders([target], "cancel", p, vi.fn());
      expect(p.cancel).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        outcome: "unresolved",
        error: "Started trip requires its original completion flow",
      });
    },
  );
  it("leaves a reassigned resource alone", async () => {
    const p = ports();
    p.read.mockResolvedValue({
      ...ride(),
      assignment: {
        driver: { driverId: "other" },
        vehicle: { vehicleId: "other" },
      },
    });
    const result = await recoverOrders([target], "cancel", p, vi.fn());
    expect(p.cancel).not.toHaveBeenCalled();
    expect(result[0].outcome).toBe("unresolved");
  });
  it("keeps a failed owner read unresolved while inspecting the other explicit order", async () => {
    const other = {
      ...target,
      orderId: "1534dbdf-1048-430d-b84a-0f1e7fb3619c",
      phone: "0900000029",
    };
    const p = ports();
    p.read
      .mockRejectedValueOnce(
        new RecoveryOperationError("Owner order read HTTP404"),
      )
      .mockResolvedValueOnce({
        ...ride(),
        order: { ...ride().order, orderId: other.orderId },
      });
    const result = await recoverOrders([target, other], "inspect", p, vi.fn());
    expect(result.map((r: { outcome: string }) => r.outcome)).toEqual([
      "unresolved",
      "inspected",
    ]);
    expect(p.cancel).not.toHaveBeenCalled();
  });
  it("does not count an unconfirmed cancellation as a released resource", async () => {
    const p = ports();
    p.read.mockResolvedValue(ride());
    const result = await recoverOrders([target], "cancel", p, vi.fn());
    expect(result[0]).toMatchObject({
      outcome: "unresolved",
      error: "Cancellation readback is not confirmed",
    });
  });
  it("finalizes a failed journey's acknowledged order once and retains completed history", async () => {
    const completed = "1534dbdf-1048-430d-b84a-0f1e7fb3619c";
    const p = ports();
    p.read
      .mockResolvedValueOnce(ride())
      .mockResolvedValueOnce(ride("cancelled"))
      .mockResolvedValueOnce({
        ...ride("completed"),
        order: { orderId: completed, status: "completed" },
      });
    const result = await finalizeCreatedOrders(
      [target.orderId, target.orderId, completed],
      p,
    );
    expect(p.cancel).toHaveBeenCalledExactlyOnceWith(target.orderId);
    expect(result.map((r: { outcome: string }) => r.outcome)).toEqual([
      "cancelled_through_original_passenger_flow",
      "already_terminal",
    ]);
  });
  it("records an unfinished trip for completion instead of releasing its vehicle", async () => {
    const p = ports();
    p.read.mockResolvedValue(ride("on_trip"));
    const result = await finalizeCreatedOrders([target.orderId], p);
    expect(p.cancel).not.toHaveBeenCalled();
    expect(result[0].outcome).toBe("original_completion_required");
  });
  it("retains a failed acknowledgement as unresolved without replacing the order", async () => {
    const p = ports();
    p.read.mockResolvedValue(ride());
    p.cancel.mockRejectedValue(new Error("transport details"));
    const result = await finalizeCreatedOrders([target.orderId], p);
    expect(result[0]).toMatchObject({
      orderId: target.orderId,
      outcome: "unresolved",
      error: "Recovery operation did not complete",
    });
  });
});
