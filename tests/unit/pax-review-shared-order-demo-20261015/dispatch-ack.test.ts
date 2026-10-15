import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

afterEach(() => vi.useRealTimers());

it.each([false, true])(
  "the real HTTP dispatch command waits for its own job write and propagates failure=%s",
  async (failWrite) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const booking = createProductionBookingFixture();
    await booking.service.createRide(OWNER, booking.command);
    const order = booking.state.order!;
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failure = new Error("dispatch job write rejected");
    let jobCommitted = false;
    let jobWrite: { dispatchJobId: string; orderId: string } | undefined;
    const database = {
      isEnabled: () => true,
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes("jsonb_build_object"))
          return {
            rows: [
              {
                record: {
                  orders: [structuredClone(order)],
                  dispatchJobs: [],
                  dispatchAttempts: [],
                  dispatchAssignments: [],
                  driverTasks: [],
                  dispatchTraceLogs: [],
                  passengerDisclosureSnapshots: [],
                },
              },
            ],
          };
        if (sql.includes("INSERT INTO ops.phase1_dispatch_jobs")) {
          jobWrite = {
            dispatchJobId: values[0] as string,
            orderId: values[1] as string,
          };
          enter();
          await gate;
          if (failWrite) throw failure;
          jobCommitted = true;
        }
        return { rows: [] };
      },
    };
    const audit = new AuditNotificationService();
    const events = new OpsDispatchEventsService(new EventEmitter() as never);
    const registry = new RegulatoryRegistryService(
      events,
      audit,
      new DriverProfileService(audit),
    );
    const owned = new OwnedMobilityService(
      registry,
      audit,
      new CallcenterService(audit),
      new OwnedMobilityTaskEventsService(new EventEmitter() as never),
      events,
      new OwnedMobilityRepository(database as never),
    );
    const controller = new OwnedMobilityController(owned, {} as never);
    let settled = false;
    const outcome = controller
      .dispatchOrder(
        order.orderId,
        { mode: "auto" },
        undefined,
        `dispatch-ack-${order.orderId}`,
      )
      .then(
        (value) => {
          settled = true;
          return { value };
        },
        (error: unknown) => {
          settled = true;
          return { error };
        },
      );
    try {
      await entered;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(jobCommitted).toBe(false);
      expect(jobWrite?.orderId).toBe(order.orderId);
      expect(settled).toBe(false);
      release();
      const result = await outcome;
      if (failWrite) {
        expect(result).toEqual({ error: failure });
        expect(jobCommitted).toBe(false);
      } else {
        expect(result).toMatchObject({
          value: {
            data: {
              dispatchJobId: jobWrite!.dispatchJobId,
              status: expect.any(String),
            },
          },
        });
        expect(jobCommitted).toBe(true);
      }
    } finally {
      release();
      await outcome;
      await owned.onModuleDestroy();
      await events.onModuleDestroy();
    }
  },
);
