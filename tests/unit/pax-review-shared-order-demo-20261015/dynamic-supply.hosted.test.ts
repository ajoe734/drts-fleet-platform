import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { DriverDeviceSessionRepository } from "../../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VehicleEligibilityRepository } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
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
      const products = new ServiceProductService(
        audit,
        new ServiceProductRepository(database),
      );
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
      const eligibility = new VehicleEligibilityService(
        registry,
        audit,
        new VehicleEligibilityRepository(database),
        products,
      );
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
        undefined,
        eligibility,
        products,
      );
      const multi = new MultiTaxiService(owned, taxiStore, products, audit);
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
        products,
        profiles,
        registryStore,
        registry,
        eligibility,
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
        await peer.products.onModuleInit();
        await peer.profiles.onModuleInit();
        await peer.registry.onModuleInit();
        await peer.eligibility.onModuleInit();
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
      expect(
        b.products.getRuntimeServiceProductByType("taxi_reservation")?.active,
      ).toBe(false);
      const prepared = await new ReviewSupplyService(
        h.database,
        a.registry,
        a.multi,
        a.products,
        a.eligibility,
        new FleetPartnerService(
          {} as never,
          a.owned,
          a.registry,
          new FleetPartnerRepository(h.database),
        ),
        a.profiles,
      ).prepare();
      expect(
        (
          await new ServiceProductRepository(h.database).findRuntimeContext(
            "multi_taxi_direct",
            "taxi_reservation",
          )
        ).record?.active,
      ).toBe(true);
      // B existed before A's prepare and still has its original snapshot.
      expect(
        b.products.getRuntimeServiceProductByType("taxi_reservation")?.active,
      ).toBe(false);
      // Shared dev already has committed rehearsal supply when a new API
      // revision starts. Remove only the external bootstrap fixture from this
      // isolated hosted DB, and age the synthetic GPS; never seed an order.
      await h.pool!.query(
        "DELETE FROM reg.phase1_registry_vehicles WHERE vehicle_id=$1",
        ["veh-demo-001"],
      );
      await h.pool!.query(
        "UPDATE ops.phase1_driver_locations SET recorded_at=$2,updated_at=$2 WHERE driver_id=ANY($1::text[])",
        [
          REVIEW_SUPPLY.map((f) => f.driverId),
          new Date(Date.now() - 3600000).toISOString(),
        ],
      );
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await restarted.products.onModuleInit();
      await restarted.profiles.onModuleInit();
      await restarted.registry.onModuleInit();
      await restarted.eligibility.onModuleInit();
      await restarted.owned.onModuleInit();
      await restarted.multi.onModuleInit();
      await restarted.sessions.onModuleInit();
      await restarted.events.onModuleInit();
      expect(
        restarted.registry
          .listVehicles()
          .some((v) => v.vehicleId === "veh-demo-001"),
      ).toBe(false);
      const preparationStarted = Date.now();
      const preparedAgain = await new ReviewSupplyService(
        restarted.database,
        restarted.registry,
        restarted.multi,
        restarted.products,
        restarted.eligibility,
        new FleetPartnerService(
          {} as never,
          restarted.owned,
          restarted.registry,
          new FleetPartnerRepository(restarted.database),
        ),
        restarted.profiles,
      ).prepare();
      expect(preparedAgain.fleetPartnerId).toBe(prepared.fleetPartnerId);
      const refreshedLocations = (
        await restarted.registryStore.listLatestDriverLocations()
      ).filter((l) => REVIEW_SUPPLY.some((f) => f.driverId === l.driverId));
      expect(refreshedLocations).toHaveLength(2);
      expect(
        refreshedLocations.every(
          (l) => Date.parse(l.recordedAt) >= preparationStarted,
        ),
      ).toBe(true);
      // All original registration, ownership, offline/available, dispatch,
      // acceptance and trip assertions below continue against that same DB.
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
      expect(
        b.products.getRuntimeServiceProductByType("taxi_reservation")?.active,
      ).toBe(true);
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
        "SELECT order_id,record->>'driverId' AS driver_id,status FROM ops.phase1_driver_tasks WHERE task_id=$1",
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
