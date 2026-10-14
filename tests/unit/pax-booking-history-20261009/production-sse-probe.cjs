// Offline regression: real production controller/service/repository and Nest
// guard -> interceptor -> router/SSE -> exception-filter pipeline. Only DB,
// identity, lawful event producer, DI container and response transport are fixtures.
// No Nest app, HTTP listener, socket, PG, browser or provider is started.
/* eslint-disable @typescript-eslint/no-require-imports -- Historical TS is transpiled to CommonJS without changing the active worktree. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { EventEmitter, once } = require("node:events");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { Writable } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const root = path.resolve(__dirname, "../../..");
const reference = process.argv[2];
if (reference && !/^[a-f0-9]{40}$/.test(reference))
  throw new Error("Expected full immutable SHA");
const dependencies = Module.createRequire(
  path.join(root, "apps/api/package.json"),
);
dependencies("reflect-metadata");
const ts = require("typescript");
const { Observable, of } = dependencies("rxjs");
const { RequestMethod } = dependencies("@nestjs/common");
const { GUARDS_METADATA } = dependencies("@nestjs/common/constants");
const { RouterExecutionContext } = dependencies(
  "@nestjs/core/router/router-execution-context",
);
const { RouteParamsFactory } = dependencies(
  "@nestjs/core/router/route-params-factory",
);
const { GuardsConsumer } = dependencies("@nestjs/core/guards/guards-consumer");
const { GuardsContextCreator } = dependencies(
  "@nestjs/core/guards/guards-context-creator",
);
const { InterceptorsConsumer } = dependencies(
  "@nestjs/core/interceptors/interceptors-consumer",
);
const members = new Map();

function loader() {
  const cache = new Map();
  function load(file) {
    file = path.posix.normalize(file);
    if (cache.has(file)) return cache.get(file).exports;
    const raw = reference
      ? execFileSync("git", ["show", `${reference}:${file}`], { cwd: root })
      : fs.readFileSync(path.join(root, file));
    members.set(file, {
      file,
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
    const compiled = ts.transpileModule(raw.toString(), {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
      },
    });
    const module = { exports: {} };
    cache.set(file, module);
    function requireProduction(id) {
      if (id === "@drts/contracts")
        return load("packages/contracts/src/index.ts");
      if (id.startsWith(".")) {
        let next = path.posix.join(path.posix.dirname(file), id);
        if (!next.endsWith(".ts")) next += ".ts";
        return load(next);
      }
      return Module.createRequire(path.join(root, file))(id);
    }
    new Function("require", "module", "exports", compiled.outputText)(
      requireProduction,
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}

function latch() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

class CapturedResponse extends Writable {
  constructor(timeline) {
    super();
    this.timeline = timeline;
    this.statusCode = 200;
    this.headersSent = false;
    this.bytes = [];
    this.eventWritten = latch();
  }
  _write(chunk, encoding, done) {
    this.bytes.push(Buffer.from(chunk));
    if (chunk.toString().includes("fixture-control"))
      this.eventWritten.resolve();
    done();
  }
  writeHead(status, headers) {
    this.headersSent = true;
    this.statusCode = status;
    this.timeline.push(`headers:${status}`);
    this.headers = headers;
    return this;
  }
  flushHeaders() {}
  status(status) {
    this.statusCode = status;
    return this;
  }
  json(body) {
    this.writeHead(this.statusCode, { "Content-Type": "application/json" });
    this.end(JSON.stringify(body));
  }
}

const load = loader();
async function runCase({
  mode,
  owner,
  disconnect = false,
  identityRealm = "passenger",
  malformed = false,
}) {
  const { PassengerBookingController } = load(
    "apps/api/src/modules/passenger-app/booking/passenger-booking.controller.ts",
  );
  const { PassengerBookingService } = load(
    "apps/api/src/modules/passenger-app/booking/passenger-booking.service.ts",
  );
  const { PassengerBookingRepository } = load(
    "apps/api/src/modules/passenger-app/booking/passenger-booking.repository.ts",
  );
  const { SnakeCaseExceptionFilter } = load(
    "apps/api/src/common/snake-case.exception-filter.ts",
  );
  const { SnakeCaseInterceptor } = load(
    "apps/api/src/common/snake-case.interceptor.ts",
  );
  const timeline = [];
  const lookup = latch();
  const lookupStarted = latch();
  const own = "offline-own-account";
  const orderId = malformed
    ? "not-a-uuid"
    : "11111111-1111-4111-8111-111111111111";
  let queryCalls = 0;
  let streamCalls = 0;
  let authorityCalls = 0;
  let teardowns = 0;
  const repository = new PassengerBookingRepository({
    query: async (sql, params) => {
      queryCalls++;
      assert.deepEqual(params, [orderId]);
      assert.match(sql, /FROM passenger\.booking_histories/);
      timeline.push("owner-lookup:start");
      lookupStarted.resolve();
      const result = mode === "delayed" ? await lookup.promise : owner;
      timeline.push("owner-lookup:resolved");
      return { rows: result === null ? [] : [{ drts_passenger_id: result }] };
    },
  });
  const multi = {
    getPassengerRideById: async () => {
      authorityCalls++;
      return { order: { orderId } };
    },
    streamTrustedPassengerEvents: () => {
      streamCalls++;
      const event = { data: { orderId, eventType: "fixture-control" } };
      return disconnect
        ? new Observable((subscriber) => {
            subscriber.next(event);
            return () => {
              teardowns++;
            };
          })
        : of(event);
    },
  };
  const service = new PassengerBookingService(
    repository,
    multi,
    undefined,
    undefined,
  );
  const controller = new PassengerBookingController(service, multi);
  // Supply DI instances, but let real Nest metadata discovery and GuardsConsumer
  // determine whether/when the route guard executes. The frozen old route has none.
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, controller.getRideEvents) ?? [];
  const injectables = new Map(
    guards.map((Guard) => [
      Guard,
      {
        getInstanceByContextId: () => ({ instance: new Guard(service) }),
      },
    ]),
  );
  const guardCreator = new GuardsContextCreator({
    getModules: () => new Map([["offline-booking", { injectables }]]),
  });
  const pipes = {
    create: () => [],
    setModuleContext() {},
    createConcreteContext: () => [],
  };
  const response = new CapturedResponse(timeline);
  const finished = once(response, "finish");
  const request = new EventEmitter();
  if (disconnect === "request")
    request.socket = Object.assign(new EventEmitter(), {
      setKeepAlive() {},
      setNoDelay() {},
      setTimeout() {}, // Transport fixture, no TCP socket.
    });
  request.headers = {};
  request.params = { id: orderId };
  request.identity =
    identityRealm === null
      ? undefined
      : { realm: identityRealm, drtsPassengerId: own };
  const context = new RouterExecutionContext(
    new RouteParamsFactory(),
    pipes,
    {},
    guardCreator,
    new GuardsConsumer(),
    { create: () => [new SnakeCaseInterceptor()] },
    new InterceptorsConsumer(),
    { status: (res, status) => res.status(status) },
  );
  const handler = context.create(
    controller,
    controller.getRideEvents,
    "getRideEvents",
    "offline-booking",
    RequestMethod.GET,
  );
  const terminal = handler(request, response, () => {}).catch((error) => {
    timeline.push(`exception-filter:${error.getStatus?.() ?? 500}`);
    new SnakeCaseExceptionFilter().catch(error, {
      switchToHttp: () => ({ getResponse: () => response }),
    });
  });
  let headersWhileLookupPending = null;
  if (mode === "delayed") {
    await lookupStarted.promise;
    // Give the real next-macrotask SSE commit ample opportunity while DB is held.
    await delay(25);
    headersWhileLookupPending = response.headersSent;
    timeline.push("owner-lookup:release");
    lookup.resolve(owner);
  }
  if (disconnect) {
    await response.eventWritten.promise;
    if (disconnect === "request") request.socket.emit("close");
    else response.emit("close");
  }
  await terminal;
  await finished;
  const body = Buffer.concat(response.bytes).toString();
  const expectedStatus =
    identityRealm !== "passenger"
      ? 401
      : owner !== own || malformed
        ? 404
        : 200;
  const failures = [];
  if (response.statusCode !== expectedStatus)
    failures.push(
      `expected HTTP ${expectedStatus}, got ${response.statusCode}`,
    );
  if (expectedStatus !== 200 && headersWhileLookupPending === true)
    failures.push("headers committed while ownership was pending");
  if (expectedStatus !== 200) {
    assert.equal(streamCalls, 0, "No unauthorized event producer invocation");
    assert.equal(
      authorityCalls,
      0,
      "No unauthorized ride authority invocation",
    );
    if (response.statusCode === expectedStatus) {
      assert.equal(
        JSON.parse(body).error.code,
        expectedStatus === 404 ? "PASSENGER_RIDE_NOT_FOUND" : "UNAUTHORIZED",
      );
      assert.equal(response.headers["Content-Type"], "application/json");
      assert.doesNotMatch(body, /event:/);
    }
    if (identityRealm !== "passenger" || malformed) assert.equal(queryCalls, 0);
  } else {
    assert.equal(streamCalls, 1);
    assert.match(body, /fixture-control/);
    assert.match(body, /order_id/); // Production global serialization remains active.
    if (disconnect)
      assert.equal(
        teardowns,
        1,
        "Disconnect unsubscribes producer exactly once",
      );
  }
  assert.equal(
    request.listenerCount("close"),
    0,
    "Request close listeners cleared",
  );
  if (request.socket)
    assert.equal(
      request.socket.listenerCount("close"),
      0,
      "Socket-event close listeners cleared",
    );
  assert.equal(
    response.listenerCount("close"),
    0,
    "Response close listeners cleared",
  );
  return {
    mode,
    owner: owner === null ? "missing" : owner === own ? "own" : "foreign",
    identityRealm,
    malformed,
    disconnect,
    status: response.statusCode,
    expectedStatus,
    headersWhileLookupPending,
    streamCalls,
    authorityCalls,
    queryCalls,
    teardowns,
    body,
    timeline,
    failures,
  };
}

const watchdog = setTimeout(() => {
  console.error("Probe did not complete all cases");
  process.exit(2);
}, 25_000);
(async () => {
  const cases = [];
  for (const owner of [null, "offline-foreign-account", "offline-own-account"])
    for (const mode of ["immediate", "delayed"])
      cases.push(await runCase({ mode, owner }));
  for (const disconnect of ["request", "response"])
    cases.push(
      await runCase({
        mode: "delayed",
        owner: "offline-own-account",
        disconnect,
      }),
    );
  for (const identityRealm of ["partner", "system"])
    cases.push(
      await runCase({
        mode: "immediate",
        owner: "offline-own-account",
        identityRealm,
      }),
    );
  cases.push(
    await runCase({ mode: "immediate", owner: null, malformed: true }),
  );
  cases.push(
    await runCase({
      mode: "immediate",
      owner: "offline-own-account",
      disconnect: "request",
    }),
  );
  const failedCases = cases.filter((c) => c.failures.length > 0).length;
  const report = {
    classification:
      "Offline production/Nest regression; supplied identity and simulated DB/event/DI/Writable transport; no mounted HTTP, sessions, PG or production-feed acceptance credit.",
    reference: reference ?? "working-tree",
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    command: ["node", __filename, ...(reference ? [reference] : [])],
    cwd: process.cwd(),
    node: process.version,
    framework: {
      core: dependencies("@nestjs/core/package.json").version,
      common: dependencies("@nestjs/common/package.json").version,
      rxjs: dependencies("rxjs/package.json").version,
      typescript: ts.version,
    },
    frameworkMembers: [
      "@nestjs/core/router/router-execution-context",
      "@nestjs/core/router/router-response-controller",
      "@nestjs/core/router/sse-stream",
      "@nestjs/core/guards/guards-context-creator",
      "@nestjs/core/guards/guards-consumer",
      "@nestjs/core/interceptors/interceptors-consumer",
    ].map((id) => ({
      id,
      sha256: createHash("sha256")
        .update(fs.readFileSync(dependencies.resolve(id)))
        .digest("hex"),
    })),
    failedCases,
    passedCases: cases.length - failedCases,
    cases,
    members: [...members.values()],
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failedCases ? 1 : 0;
})()
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
