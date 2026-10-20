/* eslint-disable @typescript-eslint/no-require-imports -- Fresh CommonJS processes reproduce the production decorator/import order, which Vitest's ESM transform cannot preserve. */
// Socket-free rating DI regression. AppModule import order, Nest injection,
// controller, booking validation and ComplaintService hooks are production code.
// Ride lookup/submission and complaint persistence are external fixtures; existing
// rating-transaction tests cover the real MultiTaxi/Complaint repository path.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const api = path.join(root, "apps/api");
const apiRequire = Module.createRequire(path.join(api, "package.json"));
const ts = apiRequire("typescript");
apiRequire("reflect-metadata");
const ref = process.env.PAX_REVIEW_RATING_SOURCE_REF;
const sources = new Map();
function source(file) {
  if (sources.has(file)) return sources.get(file);
  const relative = path.relative(root, file).split(path.sep).join("/");
  let result = null;
  try {
    result = ref
      ? execFileSync("git", ["show", `${ref}:${relative}`], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          maxBuffer: 20_000_000,
        })
      : fs.readFileSync(file, "utf8");
  } catch {
    // Resolution also tries nonexistent candidates, just as Node does.
  }
  sources.set(file, result);
  return result;
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  let base;
  if (request.startsWith("@drts/")) {
    const [pkg, ...rest] = request.slice(6).split("/");
    base = path.join(root, "packages", pkg, "src", rest.join("/") || "index");
  } else if (request.startsWith(".")) {
    base = path.resolve(path.dirname(parent.filename), request);
  } else if (path.isAbsolute(request)) base = request;
  if (base?.startsWith(root + path.sep) && !base.includes("/node_modules/")) {
    for (const file of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ])
      if (/\.tsx?$/.test(file) && source(file) !== null) return file;
  }
  return resolve.call(this, request, parent, ...args);
};
for (const extension of [".ts", ".tsx"])
  Module._extensions[extension] = (m, filename) => {
    const text = filename.includes("/node_modules/")
      ? fs.readFileSync(filename, "utf8")
      : source(filename);
    assert.notEqual(text, null, `Missing source: ${filename}`);
    m._compile(
      ts.transpileModule(text, {
        fileName: filename,
        compilerOptions: {
          strict: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      filename,
    );
  };
require("node:net").Server.prototype.listen = () => {
  throw new Error("This repository probe must never start a server");
};

const scenarios = [];
async function scenario(mode) {
  require(path.join(api, "src/app.module.ts"));
  const { Logger } = apiRequire("@nestjs/common");
  Logger.overrideLogger(false);
  const { Injector } = apiRequire("@nestjs/core/injector/injector");
  const { Module: NestModule } = apiRequire("@nestjs/core/injector/module");
  const { NestContainer } = apiRequire("@nestjs/core/injector/container");
  const load = (file) => require(path.join(api, "src/modules", file));
  const { PassengerBookingService } = load(
    "passenger-app/booking/passenger-booking.service.ts",
  );
  const { PassengerBookingController } = load(
    "passenger-app/booking/passenger-booking.controller.ts",
  );
  const { PassengerAppModule } = load("passenger-app/passenger-app.module.ts");
  const { ComplaintService } = load("complaint/complaint.service.ts");
  const { ComplaintModule } = load("complaint/complaint.module.ts");
  assert(
    Reflect.getMetadata("imports", PassengerAppModule).includes(
      ComplaintModule,
    ),
  );
  assert(
    Reflect.getMetadata("providers", ComplaintModule).includes(
      ComplaintService,
    ),
  );
  assert(
    Reflect.getMetadata("exports", ComplaintModule).includes(ComplaintService),
  );

  const low = mode === "low" || mode === "low-no-contact";
  const contactRequested = mode === "low";
  const orderId = "92bbfe0b-bd78-49a0-b7cd-8036c55d2901";
  const passenger = "drts_passenger_11111111-1111-4111-8111-111111111111";
  const client = {};
  let ratingWrites = 0;
  const consentWrites = [];
  const complaint = new ComplaintService(
    {},
    {
      isEnabled: () => mode !== "disabled-storage",
      persistPassengerRatingConsent: async (
        tx,
        rating,
        consent,
        hash,
        isNew,
        draft,
      ) => {
        assert.equal(tx, client);
        assert.equal(isNew, true);
        assert.match(hash, /^[a-f0-9]{64}$/);
        consentWrites.push({ rating, consent, hasDraft: !!draft });
        return null;
      },
    },
  );
  const multi = {
    getPassengerRideById: async (id, owner) => {
      assert.equal(id, orderId);
      assert.equal(owner, passenger);
      return { order: { orderId } };
    },
    submitTrustedPassengerRating: async (id, command, owner, hook) => {
      assert.equal(id, orderId);
      assert.equal(owner, passenger);
      // Simulated submission/storage boundary. Actual admission, idempotency,
      // completed/payment/24h and SQL transaction behavior run in existing tests.
      const rating = {
        ...command,
        ratingId: "fixture-rating",
        orderId,
        passengerSubjectRef: owner,
      };
      await hook.execute(client, rating, true);
      ratingWrites++;
    },
  };
  const providers = [
    [
      load("passenger-app/booking/passenger-booking.repository.ts")
        .PassengerBookingRepository,
      {
        getBookingHistoryOwner: async (id) => {
          assert.equal(id, orderId);
          return mode === "foreign-owner" ? "other-passenger" : passenger;
        },
      },
    ],
    [load("multi-taxi/multi-taxi.service.ts").MultiTaxiService, multi],
    [
      load("passenger-app/fare/passenger-fare.repository.ts")
        .PassengerFareRepository,
      {},
    ],
    [
      load("passenger-app/account/passenger-account.repository.ts")
        .PassengerAccountRepository,
      {},
    ],
    [
      load("passenger-push-devices/passenger-push-devices.service.ts")
        .PassengerPushDevicesService,
      {},
    ],
  ];
  if (mode !== "missing-provider")
    providers.push([ComplaintService, complaint]);
  const moduleRef = new NestModule(
    class RatingInjectionSlice {},
    new NestContainer(),
  );
  providers.forEach(([provide, useValue]) =>
    moduleRef.addProvider({ provide, useValue }),
  );
  moduleRef.addProvider(PassengerBookingService);
  const injector = new Injector();
  const wrapper = moduleRef.providers.get(PassengerBookingService);
  injector.loadPrototype(wrapper, moduleRef.providers);
  await injector.loadProvider(wrapper, moduleRef);
  const service = wrapper.instance;
  const controller = new PassengerBookingController(service, multi);
  let error;
  let response;
  try {
    response = await controller.rateRide(
      {
        realm: "passenger",
        actorType: "first_party_passenger",
        drtsPassengerId: passenger,
      },
      orderId,
      {
        rating: mode === "invalid-score" ? 0 : low ? 2 : 5,
        tags: [],
        contactRequested,
      },
    );
  } catch (caught) {
    error = caught;
  }
  const report = {
    mode,
    sourceRef: ref || "working-tree",
    compiler: {
      typescript: ts.version,
      strict: true,
      module: "CommonJS",
      emitDecoratorMetadata: true,
    },
    actualAppModuleImport: true,
    actualNestInjector: true,
    actualControllerAndRateRide: true,
    complaintProviderPresent: moduleRef.providers.has(ComplaintService),
    complaintInjected: service.complaintService === complaint,
    paramtypes: Reflect.getMetadata(
      "design:paramtypes",
      PassengerBookingService,
    ).map((t) => t?.name),
    explicitTokens: Reflect.getMetadata(
      "self:paramtypes",
      PassengerBookingService,
    )?.map((e) => ({ index: e.index, token: e.param?.name })),
    ratingResult: {
      status: error?.getStatus?.(),
      code: error?.code,
      data: response?.data,
      ratingWrites,
      consentWrites,
    },
    limits:
      "Socket-free Nest/controller/hook regression; ride lookup/submission and complaint persistence fixtures, no lifecycle hooks or PG/browser/runtime acceptance credit.",
  };
  scenarios.push(report);
  if (mode === "missing-provider")
    assert.equal(service.complaintService, undefined);
  else
    assert.equal(
      report.complaintInjected,
      true,
      "Nest must inject the existing ComplaintService provider",
    );
  const rejected = {
    "foreign-owner": [404, "PASSENGER_RIDE_NOT_FOUND"],
    "invalid-score": [400, "PASSENGER_RATING_SCORE_INVALID"],
    "missing-provider": [503, "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE"],
    "disabled-storage": [503, "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE"],
  }[mode];
  if (rejected) {
    assert.equal(report.ratingResult.status, rejected[0]);
    assert.equal(report.ratingResult.code, rejected[1]);
    assert.equal(ratingWrites, 0);
    assert.deepEqual(consentWrites, []);
  } else {
    assert.ifError(error);
    assert.deepEqual(response.data, { success: true });
    assert.equal(ratingWrites, 1);
    assert.equal(consentWrites.length, 1);
    assert.equal(consentWrites[0].rating.orderId, orderId);
    assert.equal(consentWrites[0].rating.score, low ? 2 : 5);
    assert.equal(consentWrites[0].consent, contactRequested);
    assert.equal(consentWrites[0].hasDraft, low);
  }
}
async function main() {
  const modes = process.argv[2]
    ? [process.argv[2]]
    : [
        "high",
        "low",
        "low-no-contact",
        "foreign-owner",
        "invalid-score",
        "missing-provider",
        "disabled-storage",
      ];
  const failures = [];
  // Import the graph once, then create a fresh provider slice per scenario.
  // Reusing Node's normal module cache avoids seven expensive AppModule builds.
  for (const mode of modes) {
    try {
      await scenario(mode);
    } catch (error) {
      failures.push({ mode, error: error.message });
    }
  }
  console.log(JSON.stringify({ scenarios, failures }, null, 2));
  assert.deepEqual(failures, []);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
