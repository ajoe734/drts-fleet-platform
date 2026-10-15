import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionRepository } from "../../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { ForwarderController } from "../../../apps/api/src/modules/forwarder/forwarder.controller";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import {
  ReviewSupplyService,
  REVIEW_SUPPLY,
} from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

/** No mock registry, order service, SQL schema, auth eligibility or clock.
 * Only the qualification/supply data explicitly created by ReviewSupplyService
 * and the harness's external fare/PSP ports are synthetic. Hosted DB only.
 */
describe.skipIf(!hostedPaymentEnabled)(
  "real prepare on A followed by preinitialized peer registration and same-order dispatch",
  () => {
    const h = new PaymentPostgresHarness();
    const peers: ReturnType<typeof makePeer>[] = [];
    beforeAll(async () => {
      accountSigningFixture();
      vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
      vi.stubEnv("DRTS_ENV", "test");
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      await h.open();
      await h.reset();
    }, 240000);
    afterAll(async () => {
      for (const peer of peers) {
        await peer.registry.onModuleDestroy();
        await peer.owned.onModuleDestroy();
        await peer.events.onModuleDestroy();
      }
      await h.close();
      vi.unstubAllEnvs();
    }, 30000);

    function makePeer(database: DatabaseService) {
      const audit = new AuditNotificationService();
      const profiles = new DriverProfileService(
        audit,
        new DriverProfileRepository(database),
      );
      const registryStore = new RegulatoryRegistryRepository(database);
      const registry = new RegulatoryRegistryService(
        new OpsDispatchEventsService(new EventEmitter() as never),
        audit,
        profiles,
        registryStore,
      );
      const taxiStore = new MultiTaxiRepository(database);
      const events = new OwnedMobilityTaskEventsService(
        new EventEmitter() as never,
        database,
      );
      const owned = new OwnedMobilityService(
        registry,
        audit,
        {
          registerRecordingAttachmentListener() {},
          registerRecordingStateChangeListener() {},
        } as never,
        events,
        undefined,
        new OwnedMobilityRepository(database, taxiStore),
      );
      const multi = new MultiTaxiService(owned, taxiStore, undefined, audit);
      const jwt = new JwtAuthService(
        new IdentityRepository(database),
        undefined,
        registry,
      );
      const sessions = new DriverDeviceSessionService(
        jwt,
        profiles,
        new DriverDeviceSessionRepository(database),
        registry,
      );
      const booking = new PassengerBookingService(
        new PassengerBookingRepository(database),
        multi,
        new PassengerFareRepository(database),
        h.accountStore,
        undefined,
        new PassengerPushDevicesService(
          new PassengerPushDevicesRepository(database),
        ),
      );
      return {
        database,
        profiles,
        registryStore,
        registry,
        events,
        owned,
        multi,
        jwt,
        sessions,
        booking,
        ops: new OwnedMobilityController(owned, {} as never),
        supplyControl: new RegulatoryRegistryController(registry),
      };
    }

    it("keeps native profile, token, work-state, candidate, task and driver guards authoritative across peers", async () => {
      const a = makePeer(h.database);
      const b = makePeer(h.peerDatabase());
      peers.push(a, b);
      // Only the established external qualification templates are seeded through
      // the real repository. No review driver, authorization or order exists yet.
      await a.registryStore.persistChanges({
        vehicles: a.registry.listVehicles(),
        drivers: a.registry.listDrivers(),
        supplyPairs: a.registry.listSupplyPairs(),
        contracts: a.registry.listContracts(),
        policies: a.registry.listPolicies(),
        exclusivities: a.registry.listExclusivities(),
      });
      for (const peer of peers) {
        await peer.profiles.onModuleInit();
        await peer.registry.onModuleInit();
        await peer.owned.onModuleInit();
        await peer.multi.onModuleInit();
        await peer.sessions.onModuleInit();
        await peer.events.onModuleInit();
      }
      expect(
        b.registry
          .listDrivers()
          .some((d) => d.driverId === REVIEW_SUPPLY[0]!.driverId),
      ).toBe(false);
      const prepared = await new ReviewSupplyService(
        h.database,
        a.registry,
        a.multi,
      ).prepare();
      vi.stubEnv(
        "MULTI_TAXI_DEFAULT_AUTHORIZATION_ID",
        prepared.authorizationId,
      );
      const fixture = REVIEW_SUPPLY[0]!;
      await a.profiles.updateProfile(fixture.driverId, {
        name: "Synthetic preserved profile",
        phone: "0900000011",
      });
      const invitation = await a.sessions.issueRegistrationInvitation({
        driverId: fixture.driverId,
      });
      const registered = await b.sessions.register({
        registrationCode: invitation.registrationCode,
        deviceId: "pg-review-peer-device",
      });
      await b.profiles.prepareProfileAuthority(fixture.driverId);
      expect(b.profiles.getProfileForDriver(fixture.driverId)).toMatchObject({
        name: "Synthetic preserved profile",
        phone: "0900000011",
        deviceBindings: [
          expect.objectContaining({ bindingId: registered.bindingId }),
        ],
      });
      expect(
        await a.jwt.verifyAccessToken(registered.accessToken),
      ).toMatchObject({ sub: fixture.driverId });
      await b.sessions.assertSessionAccessAllowed(
        registered.bindingId,
        registered.deviceId,
        fixture.driverId,
        "/driver/tasks",
      );
      await expect(
        b.sessions.assertSessionAccessAllowed(
          registered.bindingId,
          registered.deviceId,
          "foreign-driver",
          "/driver/tasks",
        ),
      ).rejects.toMatchObject({ code: "DRIVER_DEVICE_SESSION_INVALID" });

      // Peer Ops controls persist before responding; original native supply state
      // is read back on A, including the negative availability result.
      await b.supplyControl.updateDriverWorkState(fixture.driverId, {
        workState: "offline",
      });
      await a.registry.prepareDispatchSupply("standard_taxi");
      expect(
        a.registry.getDriverAvailability(fixture.driverId, "standard_taxi"),
      ).toBe(false);
      await b.supplyControl.updateDriverWorkState(fixture.driverId, {
        workState: "available",
      });
      const account = await h.authenticatedAccount();
      await h.accounts.updateMe(account.identity, {
        displayName: "Review peer passenger",
        contactPhone: "0900000012",
        contactConsent: true,
        termsVersion: "review-terms-v1",
        privacyVersion: "review-privacy-v1",
        feeAcknowledgementVersion: "qa-fees",
      });
      const method = await h.method(account.owner);
      const fares = await h.fareServices();
      const scheduledAt = new Date(Date.now() + 20 * 60000).toISOString();
      const quote = await fares.fares.quote(account.identity, {
        originLat: 25.08,
        originLng: 121.55,
        destinationLat: 25.1,
        destinationLng: 121.57,
        scheduledAt,
      });
      expect(quote.serviceAreaResult).toBe("serviceable");
      if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId)
        throw new Error(
          "Real fare service did not produce a serviceable quote.",
        );
      const created = await b.booking.createRide(account.owner, {
        origin: {
          lat: 25.08,
          lng: 121.55,
          address: "Synthetic New Taipei pickup",
        },
        destination: {
          lat: 25.1,
          lng: 121.57,
          address: "Synthetic New Taipei dropoff",
        },
        scheduledAt,
        fareSnapshotId: quote.fareSnapshotId!,
        paymentMethodId: method.paymentMethodId,
        passengerConfirmedAt: new Date().toISOString(),
      });
      const id = created.ride.order.orderId;
      expect((await a.ops.getOrder(id)).data.orderId).toBe(id);
      const job = (
        await a.ops.dispatchOrder(
          id,
          { mode: "auto" },
          undefined,
          `peer-dispatch-${id}`,
        )
      ).data;
      expect(
        (await b.ops.listDispatchCandidates(job.dispatchJobId, "true")).data
          .items,
      ).toContainEqual(
        expect.objectContaining({
          driverId: fixture.driverId,
          vehicleId: fixture.vehicleId,
        }),
      );
      const assignment = (
        await b.ops.assignDispatch(
          {
            dispatchJobId: job.dispatchJobId,
            driverId: fixture.driverId,
            vehicleId: fixture.vehicleId,
          },
          undefined,
          `peer-assign-${id}`,
        )
      ).data;
      const views = new ForwarderController(
        new ForwarderService({} as never, {} as never, [], undefined, a.owned),
      );
      expect(
        (await views.listDriverTaskViews(null, fixture.driverId)).data.items,
      ).toContainEqual(
        expect.objectContaining({ orderId: id, taskId: assignment.taskId }),
      );
      expect(
        (
          await views.getDriverTaskView(
            assignment.taskId,
            null,
            fixture.driverId,
          )
        ).data.orderId,
      ).toBe(id);
      await expect(
        views.getDriverTaskView(assignment.taskId, null, "foreign-driver"),
      ).rejects.toMatchObject({ code: "DRIVER_TASK_VIEW_NOT_FOUND" });
      await a.ops.acceptDriverTask(
        assignment.taskId,
        { acceptedAt: new Date().toISOString() },
        {
          realm: "driver",
          actorType: "driver_user",
          actorId: fixture.driverId,
        } as never,
      );
      expect((await b.ops.getDriverTask(assignment.taskId)).data.status).toBe(
        "accepted",
      );
      expect((await b.booking.getRide(account.owner, id)).order.orderId).toBe(
        id,
      );
      await a.registry.updateDriverLifecycle(fixture.driverId, {
        lifecycleStatus: "suspended",
      });
      expect(await b.jwt.verifyAccessToken(registered.accessToken)).toBeNull();
      await expect(
        b.sessions.assertSessionAccessAllowed(
          registered.bindingId,
          registered.deviceId,
          fixture.driverId,
          "/driver/tasks",
        ),
      ).rejects.toMatchObject({ code: "DRIVER_AUTH_SUSPENDED" });
      const rows = await h.pool!.query(
        "SELECT order_id,driver_id,status FROM ops.phase1_driver_tasks WHERE task_id=$1",
        [assignment.taskId],
      );
      expect(rows.rows).toEqual([
        expect.objectContaining({
          order_id: id,
          driver_id: fixture.driverId,
          status: "accepted",
        }),
      ]);
      process.stdout.write(
        `PAX review dynamic supply PG ${JSON.stringify({ orderId: id, taskId: assignment.taskId, sameOrder: true, profilePreserved: true, peerRegistered: true, foreignRejected: true, suspendedRejected: true })}\n`,
      );
    }, 90000);
  },
);
