import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { ForwarderController } from "../../../apps/api/src/modules/forwarder/forwarder.controller";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  bookedRide,
  bookingActor,
  type BookingActor,
} from "../pax-booking-history-20261009/native-booking-actions-fixture";
import type { TestInfo } from "@playwright/test";
import { recordOrderEvidence } from "../../e2e/pax-review-shared-order/evidence";

describe.skipIf(!hostedPaymentEnabled)(
  "committed same-order Ops/Driver reads on peers initialized before booking",
  () => {
    const h = new PaymentPostgresHarness();
    const actors: BookingActor[] = [];
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
      await h.reset();
    }, 30000);
    afterEach(async () => {
      for (const actor of actors.splice(0)) await actor.owned.onModuleDestroy();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }, 30000);
    afterAll(() => h.close(), 30000);
    const own = (actor: BookingActor) => {
      actors.push(actor);
      return actor;
    };

    it("peer lists/details/candidates and Driver task-views follow actual assignment and native peer acceptance", async () => {
      const peer = own(await bookingActor(h)); // Truly initialized before create/dispatch.
      const ops = new OwnedMobilityController(peer.owned, {} as never);
      const driver = new ForwarderController(
        new ForwarderService(
          {} as never,
          {} as never,
          [],
          undefined,
          peer.owned,
        ),
      );
      expect((await ops.listOrders()).data.items).toEqual([]);
      const f = await bookedRide(h);
      own(f.actor);
      expect((await ops.listOrders()).data.items).toContainEqual(
        expect.objectContaining({ orderId: f.orderId }),
      );
      expect((await ops.getOrder(f.orderId)).data.orderId).toBe(f.orderId);
      const job = (
        await ops.dispatchOrder(
          f.orderId,
          { mode: "auto" },
          undefined,
          `review-peer-dispatch-${f.orderId}`,
        )
      ).data;
      const original = new OwnedMobilityController(f.actor.owned, {} as never);
      const assignment = (
        await original.assignDispatch(
          {
            dispatchJobId: job.dispatchJobId,
            driverId: peer.candidate.driverId,
            vehicleId: peer.candidate.vehicleId,
          },
          undefined,
          `review-peer-assign-${f.orderId}`,
        )
      ).data;
      expect((await ops.listDispatchJobs()).data.items).toContainEqual(
        expect.objectContaining({
          orderId: f.orderId,
          dispatchJobId: job.dispatchJobId,
        }),
      );
      expect(
        (await ops.listDispatchCandidates(job.dispatchJobId, "true")).data
          .items,
      ).toContainEqual(
        expect.objectContaining({ driverId: peer.candidate.driverId }),
      );
      expect(
        (await driver.listDriverTaskViews(null, peer.candidate.driverId)).data
          .items,
      ).toContainEqual(
        expect.objectContaining({
          taskId: assignment.taskId,
          orderId: f.orderId,
        }),
      );
      expect(
        (
          await driver.getDriverTaskView(
            assignment.taskId,
            null,
            peer.candidate.driverId,
          )
        ).data,
      ).toMatchObject({
        taskId: assignment.taskId,
        orderId: f.orderId,
        localStatus: "pending_acceptance",
      });
      expect((await ops.getDriverTask(assignment.taskId)).data.orderId).toBe(
        f.orderId,
      );
      const identity = {
        realm: "driver",
        actorType: "driver_user",
        actorId: peer.candidate.driverId,
      } as never;
      expect(
        (await ops.getDriverTaskOrder(assignment.taskId, identity)).data,
      ).toMatchObject({
        orderId: f.orderId,
        proofRequirements: (await original.getOrder(f.orderId)).data
          .proofRequirements,
        fixedPrice: (await original.getOrder(f.orderId)).data.fixedPrice,
      });
      await expect(
        ops.getDriverTaskOrder(assignment.taskId, {
          ...(identity as object),
          actorId: "foreign-driver",
        } as never),
      ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
      await expect(
        ops.getDriverTask(assignment.taskId, {
          ...(identity as object),
          actorId: "foreign-driver",
        } as never),
      ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
      await expect(
        driver.getDriverTaskView(assignment.taskId, null, "foreign-driver"),
      ).rejects.toMatchObject({ code: "DRIVER_TASK_VIEW_NOT_FOUND" });
      await ops.acceptDriverTask(
        assignment.taskId,
        { acceptedAt: new Date().toISOString() },
        identity,
      );
      expect(
        (await original.getDriverTask(assignment.taskId)).data.status,
      ).toBe("accepted");
      expect((await original.getOrder(f.orderId)).data.status).toBe(
        "driver_accepted",
      );
      const rows = await h.pool!.query(
        "SELECT status,record FROM ops.phase1_driver_tasks WHERE task_id=$1",
        [assignment.taskId],
      );
      expect(rows.rows[0]).toMatchObject({
        status: "accepted",
        record: { taskId: assignment.taskId, orderId: f.orderId },
      });
      // Execute the actual browser evidence query against this case's formal
      // schema and production-created order, without substituting SQL or rows.
      // Only Playwright's attachment sink is replaced; no browser is needed.
      const caseUrl = h.pool!.options.connectionString;
      if (!caseUrl) throw new Error("Missing hosted case database URL.");
      vi.stubEnv("DATABASE_URL", caseUrl);
      vi.stubEnv("PAX_REVIEW_SHARED_DEV_SMOKE", "false");
      const facts = await recordOrderEvidence(f.orderId, "peer-accepted", {}, {
        attach: vi.fn().mockResolvedValue(undefined),
      } as unknown as TestInfo);
      const order = (await original.getOrder(f.orderId)).data;
      expect(Number.isFinite(Date.parse(order.reservationWindowStart!))).toBe(
        true,
      );
      expect(facts.length).toBeGreaterThan(0);
      for (const row of facts) {
        expect(row.order_id).toBe(f.orderId);
        expect(row.requested_pickup_at).toBe(order.reservationWindowStart);
      }
      process.stdout.write(
        `PAX review peer PG ${JSON.stringify({ orderId: f.orderId, taskId: assignment.taskId, peerAccepted: true })}\n`,
      );
    }, 60000);
  },
);
