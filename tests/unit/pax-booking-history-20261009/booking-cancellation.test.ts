import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "./production-booking-fixture";
import { observeTrustedCancellation } from "./production-cancellation-fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("R9: passenger cancellation checks the locked durable order", () => {
  for (const status of [
    "on_trip",
    "proof_pending",
    "completed",
    "cancelled",
  ] as const) {
    it.each(["synchronized", "stale", "race"] as const)(
      `denies ${status} with %s memory and no cancellation effects`,
      async (memory) => {
        const o = await observeTrustedCancellation(status, memory);
        expect(o.error).toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
        expect(o.result).toBeNull();
        expect(o.f.state.order).toEqual(o.durableBefore);
        expect(o.f.owned.listOrders()[0]).toEqual(o.memoryBefore);
        expect(o.effects).toEqual({ audit: 0, taskEvents: 0, orderEvents: 0 });
        expect(
          o.cancellationCalls.filter((c) =>
            /^(INSERT|UPDATE|DELETE)/.test(c.sql),
          ),
        ).toEqual([]);
        expect(o.cancellationCalls.some((c) => c.sql === "COMMIT")).toBe(false);
        if (memory !== "synchronized") {
          expect(
            o.cancellationCalls.some((c) => c.sql.includes("FOR UPDATE")),
          ).toBe(true);
          expect(o.cancellationCalls.some((c) => c.sql === "ROLLBACK")).toBe(
            true,
          );
        }
      },
    );
  }

  for (const status of [
    "ready_for_dispatch",
    "assigned",
    "driver_accepted",
  ] as const) {
    it.each([15, 20, 30, 120])(
      `allows pre-trip ${status}, lead=%i`,
      async (lead) => {
        const o = await observeTrustedCancellation(
          status,
          "synchronized",
          lead,
        );
        expect(o.error).toBeNull();
        expect(o.result).toMatchObject({ data: { success: true } });
        expect(o.f.state.order).toMatchObject({
          status: "cancelled",
          cancelReason: "passenger_requested",
        });
        expect(o.f.owned.listOrders()[0]?.status).toBe("cancelled");
        expect(o.cancellationCalls.some((c) => c.sql === "COMMIT")).toBe(true);
        expect(o.effects.audit).toBe(1);
        if (status !== "ready_for_dispatch") {
          expect(
            o.cancellationCalls.some((c) =>
              c.sql.startsWith("UPDATE ops.dispatch_resource_reservations"),
            ),
          ).toBe(true);
          for (const table of [
            "phase1_dispatch_assignments",
            "phase1_driver_tasks",
          ]) {
            const write = o.cancellationCalls.find((c) =>
              c.sql.startsWith(`INSERT INTO ops.${table}`),
            );
            expect(
              write?.values.some(
                (v) =>
                  typeof v === "string" && v.includes('"status":"cancelled"'),
              ),
            ).toBe(true);
          }
          expect(o.effects.taskEvents).toBe(1);
        }
      },
    );
  }

  it.each([15, 20, 30, 120])(
    "preserves system compensation at lead=%i",
    async (lead) => {
      const o = await observeTrustedCancellation(
        "ready_for_dispatch",
        "synchronized",
        lead,
        true,
      );
      expect(o.error).toBeNull();
      expect(o.f.state.order).toMatchObject({
        status: "cancelled",
        cancelReason: "creation_failed",
      });
      expect(o.cancellationCalls.some((c) => c.sql === "COMMIT")).toBe(true);
    },
  );
});
