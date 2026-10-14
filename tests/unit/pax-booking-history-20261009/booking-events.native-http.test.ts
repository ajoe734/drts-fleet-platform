import { randomUUID } from "node:crypto";
import {
  get,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import type { Socket } from "node:net";
import type { INestApplication } from "../../../apps/api/node_modules/@nestjs/common";
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
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { InternalKeyMiddleware } from "../../../apps/api/src/common/auth/internal-key.middleware";
import { CandidateShaMiddleware } from "../../../apps/api/src/common/candidate-sha.middleware";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerRideEventsGuard } from "../../../apps/api/src/modules/passenger-app/booking/passenger-ride-events.guard";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  bookedRide,
  evidence,
  latch,
  settled,
  within,
} from "./native-booking-actions-fixture";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Module } = requireApi(
  "@nestjs/common",
) as typeof import("../../../apps/api/node_modules/@nestjs/common");
const { NestFactory, Reflector } = requireApi(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");
const { defer, finalize } = requireApi(
  "rxjs",
) as typeof import("../../../apps/api/node_modules/rxjs");

describe.skipIf(!hostedPaymentEnabled)(
  "PAX Book persistent-session native mounted SSE",
  () => {
    const h = new PaymentPostgresHarness();
    let app: INestApplication | undefined;
    let origin: string;
    let f: Awaited<ReturnType<typeof bookedRide>> | undefined;
    const readers = new Set<ClientRequest>();
    const sockets = new Set<Socket>();
    let subscriptions = 0;
    let finalized = 0;
    let producerCalls = 0;
    let responsesClosed = 0;
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
      vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
      vi.stubEnv("DRTS_INTERNAL_KEY", "");
      await h.reset();
      subscriptions = 0;
      finalized = 0;
      producerCalls = 0;
      responsesClosed = 0;
      f = await bookedRide(h);
      const actor = f.actor;
      const original = actor.multi.streamTrustedPassengerEvents.bind(
        actor.multi,
      );
      // Only observe subscriptions to the untouched production timer/feed.
      vi.spyOn(actor.multi, "streamTrustedPassengerEvents").mockImplementation(
        (...args) => {
          producerCalls++;
          const source = original(...args);
          return defer(() => {
            subscriptions++;
            return source.pipe(
              finalize(() => {
                finalized++;
              }),
            );
          });
        },
      );
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
      class BookEventsModule {}
      app = await NestFactory.create(BookEventsModule, {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api");
      const candidate = new CandidateShaMiddleware();
      const internal = new InternalKeyMiddleware();
      app.use(
        (
          req: Parameters<InternalKeyMiddleware["use"]>[0],
          res: ServerResponse,
          next: (error?: unknown) => void,
        ) => {
          candidate.use(req, res, () => {
            void internal.use(req, res, next).catch(next);
          });
        },
      );
      app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.endsWith("/events"))
          res.once("close", () => {
            responsesClosed++;
          });
        next();
      });
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
      // Owned is intentionally not a Nest provider: no scheduler/bootstrap runtime.
      const server = app.getHttpServer();
      server.on("connection", (socket: Socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      await app.listen(0, "127.0.0.1");
      origin = await app.getUrl();
      evidence("mounted composition", {
        controllers: [PassengerBookingController.name],
        guard: PassengerRideEventsGuard.name,
        accountSessions: "production persisted issued credentials",
        transport: "native hosted loopback HTTP",
        runId: process.env.GITHUB_RUN_ID,
        utc: new Date().toISOString(),
      });
    }, 30000);
    afterEach(async () => {
      try {
        if (f) delete f.actor.bookings.ownerObserved;
        for (const reader of readers) reader.destroy();
        readers.clear();
        await waitFor(
          () => subscriptions === finalized && sockets.size === 0,
          "subscription/socket cleanup",
        );
      } finally {
        // Cleanup still runs if a transport/subscription assertion fails.
        for (const socket of sockets) socket.destroy();
        const mounted = app;
        app = undefined;
        try {
          await within(Promise.resolve(mounted?.close()), "mounted app close");
        } finally {
          try {
            await within(
              Promise.resolve(f?.actor.owned.onModuleDestroy()),
              "Owned cleanup",
            );
          } finally {
            f = undefined;
            vi.restoreAllMocks();
            vi.unstubAllEnvs();
          }
        }
      }
    }, 30000);
    afterAll(() => h.close(), 30000);

    async function waitFor(predicate: () => boolean, label: string, ms = 3000) {
      const deadline = performance.now() + ms;
      while (!predicate()) {
        if (performance.now() >= deadline)
          throw new Error(`Timed out: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    function read(
      orderId: string,
      token?: string,
      headers: Record<string, string> = {},
    ) {
      let status: number | undefined;
      let body = "";
      let contentType = "";
      const ended = latch();
      const closed = latch();
      let resolveResponse!: () => void;
      let rejectResponse!: (error: unknown) => void;
      const response = settled(
        new Promise<void>((resolve, reject) => {
          resolveResponse = resolve;
          rejectResponse = reject;
        }),
      );
      const request = get(
        `${origin}/api/passenger-app/rides/${orderId}/events`,
        {
          agent: false,
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...headers,
          },
        },
      );
      readers.add(request);
      request.on("socket", (socket) => socket.once("close", closed.release));
      request.on("error", rejectResponse);
      request.on("response", (res) => {
        status = res.statusCode;
        contentType = String(res.headers["content-type"]);
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", ended.release);
        res.on("error", rejectResponse);
        resolveResponse();
      });
      return {
        get status() {
          return status;
        },
        get body() {
          return body;
        },
        get contentType() {
          return contentType;
        },
        response,
        ended,
        async abort() {
          request.destroy();
          await within(closed.promise, "reader socket closes");
          readers.delete(request);
        },
      };
    }
    async function delayOwner() {
      const entered = latch();
      const release = latch();
      let observations = 0;
      f!.actor.bookings.ownerObserved = async () => {
        if (++observations === 1) {
          entered.release();
          await within(release.promise, "native owner-query completion gate");
        }
      };
      return { entered, release, count: () => observations };
    }

    it("delayed genuine owner query returns 200 and production trip_cancelled JSON after lawful authenticated cancellation, then reader abort cleans feed/socket", async () => {
      const gate = await delayOwner();
      // The accepted QA observer reports executor PIDs for the actual owner SQL.
      const transport = h.nativeQuerySessions([f!.actor.database], async () => {
        const reader = read(f!.orderId, f!.session.accessToken);
        try {
          await within(gate.entered.promise, "real owner query observed");
          await new Promise((resolve) => setTimeout(resolve, 120));
          expect(reader.status).toBeUndefined();
          expect(producerCalls).toBe(0);
          gate.release.release();
          const response = await within(reader.response, "own headers");
          expect(response.error).toBeUndefined();
          expect(reader.status).toBe(200);
          expect(reader.contentType).toContain("text/event-stream");
          await waitFor(() => subscriptions === 1, "real producer subscribes");
          const cancellation = await fetch(
            `${origin}/api/passenger-app/rides/${f!.orderId}/cancel`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${f!.session.accessToken}`,
                "x-request-id": "book-sse-lawful-cancel",
                connection: "close",
              },
              signal: AbortSignal.timeout(8000),
            },
          );
          expect(cancellation.status).toBe(201);
          expect(await cancellation.json()).toMatchObject({
            data: { success: true },
          });
          await waitFor(
            () => reader.body.includes('"event_type":"trip_cancelled"'),
            "production cancellation frame",
            10000,
          );
          const frames = reader.body.replaceAll("\r\n", "\n").split("\n\n");
          const line = frames
            .flatMap((frame) => frame.split("\n"))
            .find(
              (value) =>
                value.startsWith("data:") &&
                value.includes('"event_type":"trip_cancelled"'),
            );
          expect(line).toBeDefined();
          const envelope = JSON.parse(line!.slice(5).trim());
          expect(envelope).toMatchObject({
            event_type: "trip_cancelled",
            order_id: f!.orderId,
            data: { order: { status: "cancelled", order_id: f!.orderId } },
          });
          expect(envelope.event_id).toEqual(expect.any(String));
          expect(envelope.event_version).toEqual(expect.any(Number));
          evidence("own HTTP production frames", {
            status: reader.status,
            contentType: reader.contentType,
            wire: reader.body,
            ownerQueries: gate.count(),
          });
        } finally {
          gate.release.release();
          await reader.abort();
        }
      });
      const { sessions } = await within(
        transport,
        "native own query/HTTP",
        15000,
      );
      expect(sessions.length).toBeGreaterThan(0);
      await waitFor(
        () => finalized === 1 && responsesClosed === 1 && sockets.size === 0,
        "own abort propagated",
      );
      evidence("own cleanup", {
        sessions,
        subscriptions,
        finalized,
        responsesClosed,
        sockets: sockets.size,
      });
    }, 30000);

    it("delayed foreign and missing native owner queries produce indistinguishable JSON 404 before producer subscription", async () => {
      const foreign = await h.authenticatedAccount();
      const denials: unknown[] = [];
      for (const [orderId, token] of [
        [f!.orderId, foreign.session.accessToken],
        [randomUUID(), f!.session.accessToken],
      ]) {
        const gate = await delayOwner();
        const reader = read(orderId!, token!);
        try {
          const observed = h.nativeQuerySessions(
            [f!.actor.database],
            async () => {
              await within(
                gate.entered.promise,
                "foreign/missing actual owner query",
              );
              await new Promise((resolve) => setTimeout(resolve, 120));
              expect(reader.status).toBeUndefined();
              expect(producerCalls).toBe(0);
              gate.release.release();
              expect(
                (await within(reader.response, "404 headers")).error,
              ).toBeUndefined();
              await within(reader.ended.promise, "404 JSON end");
            },
          );
          expect(
            (await within(observed, "native denial query/HTTP")).sessions
              .length,
          ).toBeGreaterThan(0);
          expect(reader.status).toBe(404);
          expect(reader.contentType).toContain("application/json");
          const json = JSON.parse(reader.body);
          expect(json.error.code).toBe("PASSENGER_RIDE_NOT_FOUND");
          denials.push(json.error);
          expect(producerCalls).toBe(0);
          expect(subscriptions).toBe(0);
          evidence("delayed owner denial", {
            status: reader.status,
            contentType: reader.contentType,
            body: json,
            ownerQueries: gate.count(),
          });
        } finally {
          gate.release.release();
          await reader.abort();
        }
      }
      expect(denials[0]).toEqual(denials[1]);
      expect(finalized).toBe(0);
    }, 30000);

    it("missing, invalid, revoked and bootstrap identity credentials refuse SSE without owner query or producer", async () => {
      const revoked = await h.authenticatedAccount();
      await h.accounts.logout(revoked.session.refreshToken);
      let ownerQueries = 0;
      f!.actor.bookings.ownerObserved = async () => {
        ownerQueries++;
      };
      for (const credential of [
        { token: undefined, headers: {} },
        { token: "invalid-book-token", headers: {} },
        { token: revoked.session.accessToken, headers: {} },
        {
          token: undefined,
          headers: { "x-realm": "passenger", "x-actor-id": f!.owner },
        },
      ]) {
        const reader = read(f!.orderId, credential.token, credential.headers);
        try {
          expect(
            (await within(reader.response, "auth denial")).error,
          ).toBeUndefined();
          await within(reader.ended.promise, "auth JSON end");
          expect(reader.status).toBe(401);
          expect(reader.contentType).toContain("application/json");
          evidence("auth denial", {
            status: reader.status,
            error: JSON.parse(reader.body).error,
          });
        } finally {
          await reader.abort();
        }
      }
      expect(ownerQueries).toBe(0);
      expect(producerCalls).toBe(0);
      expect(subscriptions).toBe(0);
    });
  },
);
