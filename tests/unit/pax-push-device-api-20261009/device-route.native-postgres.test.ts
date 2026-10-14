import { randomUUID } from "node:crypto";
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
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { PassengerPushService } from "../../../apps/api/src/modules/passenger-app/push/passenger-push.service";
import { PassengerPushController } from "../../../apps/api/src/modules/passenger-app/push/passenger-push.controller";
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  bookingActor,
  type BookingActor,
} from "../pax-booking-history-20261009/native-booking-actions-fixture";

// Uses the existing hosted harness: production db-apply.sh, checksummed migrations,
// native pg, and a fresh case-owned database. No local database or HTTP server.
describe.skipIf(!hostedPaymentEnabled)(
  "Passenger push device API and atomic route native PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    const actors: BookingActor[] = [];
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "false");
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
      vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
      await h.reset();
    }, 30000);
    afterEach(async () => {
      for (const actor of actors.splice(0)) await actor.owned.onModuleDestroy();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });
    afterAll(() => h.close(), 30000);

    function push() {
      const devices = new PassengerPushDevicesService(
        new PassengerPushDevicesRepository(h.database),
      );
      const service = new PassengerPushService(h.accounts, devices, h.database);
      return {
        devices,
        service,
        controller: new PassengerPushController(service),
      };
    }
    const body = () => ({
      platform: "ios",
      provider: "fcm_v1",
      app_id: "synthetic-native-app",
      app_version: "1",
      token: `synthetic-token-${randomUUID()}`,
      notification_consent_version: "synthetic-notification-v1",
    });

    async function bookingFixture(register = true) {
      const account = await h.authenticatedAccount();
      await h.accounts.updateMe(account.identity, {
        contactPhone: "0900000000",
      });
      const p = push();
      if (register) await p.service.register(account.identity, body());
      const method = await h.method(account.owner);
      const fares = await h.fareServices();
      const actor = await bookingActor(h);
      actors.push(actor);
      const scheduledAt = new Date(Date.now() + 20 * 60000).toISOString();
      const quote = await fares.fares.quote(account.identity, {
        originLat: 25.08,
        originLng: 121.55,
        destinationLat: 25.1,
        destinationLng: 121.57,
        scheduledAt,
      });
      if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId)
        throw new Error("Production quote fixture missing snapshot.");
      const command = {
        origin: { lat: 25.08, lng: 121.55 },
        destination: { lat: 25.1, lng: 121.57 },
        scheduledAt,
        fareSnapshotId: quote.fareSnapshotId,
        paymentMethodId: method.paymentMethodId,
        passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
      };
      return { ...account, p, actor, command };
    }

    it("requires a persistent live session, stores real device metadata, and returns only the device ID", async () => {
      const a = await h.authenticatedAccount();
      const other = await h.authenticatedAccount();
      const p = push();
      await expect(p.controller.upsert(null, body())).rejects.toMatchObject({
        status: 401,
      });
      const registration = body();
      const response = await p.controller.upsert(a.identity, registration);
      expect(Object.keys(response.data!)).toEqual(["deviceId"]);
      const id = response.data!.deviceId;
      const repeated = await p.controller.upsert(a.identity, registration);
      expect(repeated.data).toEqual({ deviceId: id });
      expect(
        (
          await h.pool!.query(
            "SELECT device_id FROM iam.phase1_passenger_push_devices WHERE drts_passenger_id=$1",
            [a.owner],
          )
        ).rows,
      ).toEqual([{ device_id: id }]);
      expect(await p.devices.resolveActiveDevices(a.owner)).toEqual([
        expect.objectContaining({
          deviceId: id,
          appId: "synthetic-native-app",
          notificationConsentVersion: "synthetic-notification-v1",
          status: "active",
        }),
      ]);
      await expect(
        p.controller.unregister(other.identity, id),
      ).rejects.toMatchObject({ status: 404 });
      await p.controller.unregister(a.identity, id);
      await p.controller.unregister(a.identity, id);
      expect(await p.devices.resolveActiveDevices(a.owner)).toEqual([]);
      await h.accounts.logout(a.session.refreshToken);
      await expect(
        p.controller.upsert(a.identity, body()),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("commits tenant-null route, order, access token, and history using the actual registered consent", async () => {
      const f = await bookingFixture();
      const created = await f.actor.booking.createRide(f.owner, f.command);
      const orderId = created.ride.order.orderId;
      const routes = await h.pool!.query(
        "SELECT * FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
        [orderId],
      );
      expect(routes.rows).toEqual([
        expect.objectContaining({
          tenant_id: null,
          drts_passenger_id: f.owner,
          passenger_subject_ref: f.owner,
          app_id: "synthetic-native-app",
          consent_version: "synthetic-notification-v1",
          ride_ref: orderId,
        }),
      ]);
      expect(await f.actor.bookings.getBookingHistoryOwner(orderId)).toBe(
        f.owner,
      );
      expect(
        (
          await h.pool!.query(
            "SELECT token_id FROM ops.passenger_ride_access_tokens WHERE order_id=$1",
            [orderId],
          )
        ).rows.length,
      ).toBe(1);
      expect(
        f.actor.owned.listOrders().some((o) => o.orderId === orderId),
      ).toBe(true);
    });

    it("retains successful durable booking without any registered notification device", async () => {
      const f = await bookingFixture(false);
      const created = await f.actor.booking.createRide(f.owner, f.command);
      const orderId = created.ride.order.orderId;
      expect(await f.actor.bookings.getBookingHistoryOwner(orderId)).toBe(
        f.owner,
      );
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
            [orderId],
          )
        ).rows,
      ).toEqual([]);
    });

    it("rolls back order/token/history when the route INSERT encounters a native constraint error", async () => {
      const f = await bookingFixture();
      const original =
        PassengerPushDevicesService.prototype.writeFirstPartyRoute;
      let failedOrder = "";
      // Fault boundary only: send overlength metadata into the real writer so
      // production V0107's varchar constraint aborts the actual pg transaction.
      vi.spyOn(
        PassengerPushDevicesService.prototype,
        "writeFirstPartyRoute",
      ).mockImplementation(function (
        this: PassengerPushDevicesService,
        command,
        client,
      ) {
        failedOrder = command.orderId;
        return original.call(
          this,
          { ...command, appId: "x".repeat(151) },
          client,
        );
      });
      await expect(
        f.actor.booking.createRide(f.owner, f.command),
      ).rejects.toMatchObject({
        name: "PassengerPushDeviceOperationError",
        code: "22001",
      });
      expect(failedOrder).not.toBe("");
      expect(await f.actor.bookings.getBookingHistoryOwner(failedOrder)).toBe(
        null,
      );
      expect(
        (
          await h.pool!.query(
            "SELECT token_id FROM ops.passenger_ride_access_tokens WHERE order_id=$1",
            [failedOrder],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id=$1",
            [failedOrder],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
            [failedOrder],
          )
        ).rows,
      ).toEqual([]);
      expect(
        f.actor.owned.listOrders().some((o) => o.orderId === failedOrder),
      ).toBe(false);
    });

    it("uses the borrowed native transaction for replay, mismatch and rollback while preserving standalone commits", async () => {
      const p = push();
      const orderId = randomUUID();
      const command = {
        orderId,
        tenantId: null,
        drtsPassengerId: "synthetic-owner",
        passengerSubjectRef: "synthetic-owner",
        appId: "synthetic-app",
        consentVersion: "v1",
        rideRef: orderId,
      };
      expect((await p.devices.writeFirstPartyRoute(command)).outcome).toBe(
        "created",
      );
      const client = await h.database.connect();
      try {
        await client.query("BEGIN");
        expect(
          (await p.devices.writeFirstPartyRoute(command, client)).outcome,
        ).toBe("idempotent_replay");
        expect(
          (
            await p.devices.writeFirstPartyRoute(
              { ...command, consentVersion: "v2" },
              client,
            )
          ).outcome,
        ).toBe("rejected_content_mismatch");
        const newId = randomUUID();
        expect(
          (
            await p.devices.writeFirstPartyRoute(
              { ...command, orderId: newId, rideRef: newId },
              client,
            )
          ).outcome,
        ).toBe("created");
        expect(
          (
            await h.pool!.query(
              "SELECT order_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
              [newId],
            )
          ).rows,
        ).toEqual([]);
        await client.query("ROLLBACK");
        expect(
          (
            await h.pool!.query(
              "SELECT order_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
              [newId],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await h.pool!.query(
              "SELECT consent_version,tenant_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id=$1",
              [orderId],
            )
          ).rows,
        ).toEqual([{ consent_version: "v1", tenant_id: null }]);
      } finally {
        client.release();
      }
    });
  },
);
