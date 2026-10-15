import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
import type {
  PassengerRideSseEventEnvelope,
  PassengerTripRatingRecord,
} from "@drts/contracts";
import type { INestApplication } from "../../../apps/api/node_modules/@nestjs/common";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerRideEventsGuard } from "../../../apps/api/src/modules/passenger-app/booking/passenger-ride-events.guard";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PassengerClient } from "../../../packages/passenger-client/src/client";
import { NativePassengerRideStream } from "../../../packages/passenger-client/src/native/ride-stream";
import {
  mapPassengerRideAuthorityToFixture,
  subscribePassengerRideAuthority,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  assignedRide,
  bookedRide,
  bookingActor,
  startRide,
  type BookingActor,
} from "../pax-booking-history-20261009/native-booking-actions-fixture";
import {
  HostedEventSource,
  HostedNativeRequest,
  waitFor,
} from "./hosted-transports";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Module } = requireApi("@nestjs/common");
const { NestFactory, Reflector } = requireApi("@nestjs/core");

describe.skipIf(!hostedPaymentEnabled)(
  "PAX shared order: production schema, cross-role services and mounted HTTP",
  () => {
    const h = new PaymentPostgresHarness();
    const actors: BookingActor[] = [];
    const apps: INestApplication[] = [];
    const cleanup: (() => void)[] = [];
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
      vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
      vi.stubEnv("DRTS_INTERNAL_KEY", "");
      await h.reset();
      HostedEventSource.instances = [];
    }, 30000);
    afterEach(async () => {
      for (const close of cleanup.splice(0)) close();
      for (const es of HostedEventSource.instances) es.close();
      for (const app of apps.splice(0)) {
        app.getHttpServer().closeAllConnections();
        await app.close();
      }
      for (const actor of actors.splice(0)) await actor.owned.onModuleDestroy();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }, 30000);
    afterAll(() => h.close(), 30000);
    const track = (actor: BookingActor) => {
      actors.push(actor);
      return actor;
    };

    async function complete(actor: BookingActor, taskId: string) {
      return actor.owned.completeDriverTask(taskId, {
        completedAt: new Date().toISOString(),
        actualDistanceKm: 1.251,
        actualDurationSec: 60,
        fare: { amountMinor: 100, currency: "TWD" },
        proof: { photos: [] },
      });
    }
    async function completionEvent(orderId: string) {
      const row = await h.pool!.query(
        "SELECT payload FROM ops.driver_completion_outbox WHERE order_id=$1 AND effect_type='multi_taxi_certificate'",
        [orderId],
      );
      expect(row.rows).toHaveLength(1);
      return row.rows[0].payload.event;
    }
    function rating(
      orderId: string,
      assignmentId: string,
      driverId: string,
      owner: string,
    ): PassengerTripRatingRecord {
      const now = new Date().toISOString();
      return {
        ratingId: randomUUID(),
        orderId,
        tripId: assignmentId,
        driverId,
        passengerSubjectRef: owner,
        score: 5,
        tags: [],
        comment: null,
        status: "active",
        submittedAt: now,
        updatedAt: now,
      };
    }
    async function mount(actor: BookingActor) {
      Reflect.defineMetadata(
        "design:paramtypes",
        [PassengerBookingService, MultiTaxiService],
        PassengerBookingController,
      );
      Reflect.defineMetadata(
        "design:paramtypes",
        [PassengerBookingService],
        PassengerRideEventsGuard,
      );
      @Module({
        controllers: [PassengerBookingController],
        providers: [
          { provide: PassengerBookingService, useValue: actor.booking },
          { provide: MultiTaxiService, useValue: actor.multi },
          PassengerRideEventsGuard,
        ],
      })
      class SharedOrderModule {}
      const app: INestApplication = await NestFactory.create(
        SharedOrderModule,
        { logger: false, abortOnError: false },
      );
      apps.push(app);
      app.setGlobalPrefix("api");
      app.useGlobalGuards(
        new BootstrapAuthGuard(
          new Reflector(),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          h.accounts,
        ),
      );
      app.useGlobalInterceptors(new SnakeCaseInterceptor());
      app.useGlobalFilters(new SnakeCaseExceptionFilter());
      // Only this hosted guard enables listeners; Owned is not a Nest provider,
      // so no product scheduler/application bootstrap is started even in CI.
      await app.listen(0, "127.0.0.1");
      return app.getUrl();
    }

    it("one UUID survives real quote, booking, dispatch, every driver action, peer/history, simulated PSP and immutable rating", async () => {
      const peer = track(await bookingActor(h, h.peerDatabase())); // Before the booking exists.
      const f = await bookedRide(h);
      track(f.actor);
      const initial = await peer.booking.getRide(f.owner, f.orderId);
      const original = initial.bookingQuote!;
      expect(original.fareSnapshotId).toBeTruthy();
      expect(original.estimatedMax).toBeGreaterThanOrEqual(
        original.estimatedMin,
      );
      const source = (
        await h.pool!.query(
          `SELECT h.passenger_confirmed_at,s.* FROM passenger.booking_histories h
       JOIN passenger.fare_quote_snapshots s USING (fare_snapshot_id) WHERE h.order_id=$1`,
          [f.orderId],
        )
      ).rows[0];
      expect(original.route).toEqual(source.route);
      expect(original.tariffSnapshot).toEqual(source.tariff_snapshot);
      expect(original.breakdown).toEqual(source.breakdown);
      expect(original.passengerConfirmedAt).toBe(
        source.passenger_confirmed_at.toISOString(),
      );
      const assignment = await assignedRide(f.actor, f.orderId);
      const assigned = await peer.booking.getRide(f.owner, f.orderId);
      expect(assigned.assignment?.routeFare).toMatchObject({
        quoteSnapshotId: original.fareSnapshotId,
        routeSnapshotId: original.fareSnapshotId,
        estimatedDistanceMeters: original.route.distanceMeters,
        estimatedDurationSeconds: original.route.durationSeconds,
        encodedPolyline: original.route.encodedPolyline,
        passengerConfirmedAt: original.passengerConfirmedAt,
        farePolicyVersion: original.fareVersion,
        bookingQuote: original,
        estimatedFareMinor: original.estimatedMin * 100,
        payableFareMinor: null,
      });
      const estimateText = `預估 NT$ ${original.estimatedMin.toLocaleString("zh-TW")}`;
      expect(
        mapPassengerRideAuthorityToFixture(assigned, f.orderId).routeFareText,
      ).toBe(estimateText);
      expect(
        mapNativePassengerRideAuthorityToFixture(assigned, f.orderId)
          .routeFareText,
      ).toBe(estimateText);
      const driver = track(await bookingActor(h, h.peerDatabase()));
      const now = new Date().toISOString();
      await driver.owned.acceptDriverTask(assignment.taskId, {
        acceptedAt: now,
      });
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).order.status,
      ).toBe("driver_accepted");
      await driver.owned.departDriverTask(assignment.taskId, {
        departedAt: now,
      });
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).order.status,
      ).toBe("enroute_pickup");
      await driver.owned.arrivedPickup(assignment.taskId, { arrivedAt: now });
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).order.status,
      ).toBe("arrived_pickup");
      await driver.owned.startDriverTask(assignment.taskId, { startedAt: now });
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).order.status,
      ).toBe("on_trip");
      await complete(driver, assignment.taskId);
      expect(
        (
          await peer.booking.getRideList(f.owner, 10, undefined, "completed")
        ).rides.map((r) => r.order.orderId),
      ).toEqual([f.orderId]);
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).actions.canRate,
      ).toBe(false);
      const services = await h.receiptServices();
      const score = { rideId: f.orderId, rating: 5 as const };
      const record = rating(
        f.orderId,
        assignment.assignmentId,
        driver.candidate.driverId,
        f.owner,
      );
      const hook = services.complaints.preparePassengerRatingHook(
        f.owner,
        f.orderId,
        false,
        { score: 5, tags: [], comment: null },
      );
      await expect(
        services.booking.rateRide(f.owner, f.orderId, score),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_PAYMENT_REQUIRED" });
      await expect(
        h.taxi.persistPassengerRating(record, hook),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_PAYMENT_REQUIRED" });
      // Deliver the exact production completion outbox payload to its production
      // payment listener. Only PSP response and external notification delivery are simulated.
      const event = await completionEvent(f.orderId);
      h.provider.capture.mockResolvedValueOnce({
        status: "failed",
        error: "unavailable",
        retryable: true,
      });
      await h.chargeService.onTripCompleted(event);
      expect((await h.state(f.orderId)).billing.status).toBe("failed");
      await expect(
        services.booking.rateRide(f.owner, f.orderId, score),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_PAYMENT_REQUIRED" });
      await expect(
        h.taxi.persistPassengerRating(record, hook),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_PAYMENT_REQUIRED" });
      await h.chargeService.processOrder(f.orderId);
      expect((await h.state(f.orderId)).billing.status).toBe("captured");
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).actions.canRate,
      ).toBe(true);
      await services.booking.rateRide(f.owner, f.orderId, score);
      await services.booking.rateRide(f.owner, f.orderId, score); // Existing exact retry stays idempotent.
      await expect(
        services.booking.rateRide(f.owner, f.orderId, {
          rideId: f.orderId,
          rating: 4,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
      await expect(
        h.taxi.persistPassengerRating({ ...record, score: 4 }, hook),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
      const rows = (
        await h.pool!.query(
          "SELECT * FROM ops.passenger_trip_ratings WHERE order_id=$1",
          [f.orderId],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        order_id: f.orderId,
        trip_id: assignment.assignmentId,
        driver_id: driver.candidate.driverId,
        score: 5,
      });
      expect(
        (await peer.booking.getRide(f.owner, f.orderId)).actions.canRate,
      ).toBe(false);
      for (const table of [
        "phase1_dispatch_jobs",
        "phase1_dispatch_assignments",
        "phase1_driver_tasks",
      ]) {
        expect(
          (await h.pool!.query(`SELECT DISTINCT order_id FROM ops.${table}`))
            .rows,
        ).toEqual([{ order_id: f.orderId }]);
      }
      process.stdout.write(
        `PAX shared-order persisted ${JSON.stringify({ orderId: f.orderId, quoteId: original.fareSnapshotId, assignmentId: assignment.assignmentId, taskId: assignment.taskId, payment: "captured via simulated PSP", ratingRows: rows.length })}\n`,
      );
    }, 45000);

    it("mounted named frames reach real Web and Native subscribers across API instance change, then cancellation", async () => {
      const one = track(await bookingActor(h, h.peerDatabase()));
      const two = track(await bookingActor(h, h.peerDatabase()));
      const f = await bookedRide(h);
      track(f.actor);
      const firstAssignment = await assignedRide(f.actor, f.orderId);
      const dispatchJobId = (await one.booking.getRide(f.owner, f.orderId))
        .assignment!.dispatchJobId;
      // Both mounted readers predate this order and its assignment.
      const originOne = await mount(one);
      const originTwo = await mount(two);
      let origin = originOne;
      const authorization = `Bearer ${f.session.accessToken}`;
      const route = (url: string) =>
        url.replace("http://authority.example.invalid", origin);
      // Raise only the real process-local sequence with legitimate subscribers.
      const { firstValueFrom } = requireApi("rxjs");
      for (let n = 0; n < 8; n++)
        await firstValueFrom(
          one.multi.streamTrustedPassengerEvents(f.orderId, f.owner),
        );
      HostedEventSource.origin = () => origin;
      HostedEventSource.authorization = authorization;
      vi.stubGlobal("EventSource", HostedEventSource);
      const web: PassengerRideSseEventEnvelope[] = [];
      const native: PassengerRideSseEventEnvelope[] = [];
      const errors: unknown[] = [];
      cleanup.push(
        subscribePassengerRideAuthority(f.orderId, (event) => web.push(event)),
      );
      const requests: HostedNativeRequest[] = [];
      const stream = new NativePassengerRideStream({
        baseUrl: "http://authority.example.invalid",
        orderId: f.orderId,
        client: new PassengerClient({
          baseUrl: "http://authority.example.invalid",
          fetchFn: (url, options) =>
            fetch(route(url), {
              ...options,
              headers: { ...options?.headers, Authorization: authorization },
            }),
        }),
        session: {
          snapshot: async () => ({
            generation: 1,
            tokens: {
              accessToken: f.session.accessToken,
              refreshToken: f.session.refreshToken,
            },
          }),
        },
        createRequest: () => {
          const xhr = new HostedNativeRequest(route);
          requests.push(xhr);
          return xhr;
        },
        appState: { currentState: () => "active", subscribe: () => () => {} },
        onRide: (ride) => expect(ride.order.orderId).toBe(f.orderId),
        onEvent: (event) => native.push(event),
        onConnection() {},
        onError: (error) => errors.push(error),
      });
      cleanup.push(() => stream.stop());
      await stream.start();
      await waitFor(
        () => web.length > 0 && native.length > 0,
        "first named frames",
      );
      const previousWeb = web.at(-1)!.eventVersion,
        previousNative = native.at(-1)!.eventVersion;
      expect(Math.min(previousWeb, previousNative)).toBeGreaterThan(8);
      origin = originTwo;
      HostedEventSource.instances[0]!.reopen();
      await stream.reconnect();
      await waitFor(
        () =>
          web.some((e) => e.eventVersion < previousWeb) &&
          native.some((e) => e.eventVersion < previousNative),
        "fresh instance versions",
      );
      const replacement = await f.actor.owned.reassignDispatch({
        dispatchJobId,
        driverId: f.actor.candidate.driverId,
        vehicleId: f.actor.candidate.vehicleId,
        reasonCode: "qa_reconnect_reassignment",
      });
      expect(replacement.assignmentId).not.toBe(firstAssignment.assignmentId);
      await waitFor(
        () =>
          [web, native].every((events) =>
            events.some(
              (event) =>
                event.eventType === "assignment_replaced" &&
                event.data.assignment?.assignmentId ===
                  replacement.assignmentId &&
                event.assignmentVersion === 2,
            ),
          ),
        "persisted replacement frames",
      );
      await f.actor.multi.cancelTrustedPassengerRide(f.orderId, f.owner);
      await waitFor(
        () =>
          web.some((e) => e.eventType === "trip_cancelled") &&
          native.some((e) => e.eventType === "trip_cancelled"),
        "real cancellation frames",
      );
      expect(HostedEventSource.instances[0]!.frames.join("")).toContain(
        "event: trip_cancelled\n",
      );
      expect(requests.at(-1)!.responseText).toContain(
        "event: trip_cancelled\n",
      );
      expect(
        [...web, ...native].every(
          (e) => e.orderId === f.orderId && e.data.order.orderId === f.orderId,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(HostedEventSource.instances[0]!.errors).toEqual([]);
      process.stdout.write(
        `PAX shared-order HTTP ${JSON.stringify({ orderId: f.orderId, webVersions: web.map((e) => e.eventVersion), nativeVersions: native.map((e) => e.eventVersion), actualNamedFrames: true, servingInstances: 2 })}\n`,
      );
    }, 45000);

    it("a paid completed trip older than 24h is refused by both first-party service and actual PG writer", async () => {
      const f = await bookedRide(h);
      track(f.actor);
      const assignment = await assignedRide(f.actor, f.orderId);
      await startRide(f.actor, assignment.taskId);
      await complete(f.actor, assignment.taskId);
      await h.chargeService.onTripCompleted(await completionEvent(f.orderId));
      expect((await h.state(f.orderId)).billing.status).toBe("captured");
      const state = await f.actor.repository.loadState();
      const task = state.driverTasks.find(
        (t) => t.taskId === assignment.taskId,
      )!;
      // Temporal fixture only, persisted through the production repository and
      // formal schema after the real driver lifecycle. No alternate rating logic.
      await f.actor.repository.persistChanges({
        driverTasks: [
          {
            ...task,
            completedAt: new Date(Date.now() - 86401000).toISOString(),
          },
        ],
      });
      const services = await h.receiptServices();
      expect(
        (await services.booking.getRide(f.owner, f.orderId)).actions.canRate,
      ).toBe(false);
      await expect(
        services.booking.rateRide(f.owner, f.orderId, {
          rideId: f.orderId,
          rating: 5,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_WINDOW_CLOSED" });
      const record = rating(
        f.orderId,
        assignment.assignmentId,
        f.actor.candidate.driverId,
        f.owner,
      );
      const hook = services.complaints.preparePassengerRatingHook(
        f.owner,
        f.orderId,
        false,
        { score: 5, tags: [], comment: null },
      );
      await expect(
        h.taxi.persistPassengerRating(record, hook),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_WINDOW_CLOSED" });
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM ops.passenger_trip_ratings WHERE order_id=$1",
            [f.orderId],
          )
        ).rows,
      ).toEqual([]);
    }, 45000);
  },
);
