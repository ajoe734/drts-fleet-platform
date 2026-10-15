/* eslint-disable @typescript-eslint/no-require-imports -- Fresh CommonJS processes reproduce the production decorator/import order, which Vitest's ESM transform cannot preserve. */
// Socket-free DI regression. Only unrelated providers and database responses
// are fixtures. AppModule imports, Nest metadata/injector, controller, both
// services and OwnedMobilityRepository SQL/read/mapping are production code.
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
const ref = process.env.PAX_REVIEW_FORWARDER_SOURCE_REF;
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

async function main() {
  const mode = process.argv[2];
  // Evaluate the real import graph only. No Nest application, lifecycle hooks,
  // database connection, scheduler or runtime is initialized.
  if (mode !== "direct") require(path.join(api, "src/app.module.ts"));
  const { Logger } = apiRequire("@nestjs/common");
  Logger.overrideLogger(false);
  const { Injector } = apiRequire("@nestjs/core/injector/injector");
  const { Module: NestModule } = apiRequire("@nestjs/core/injector/module");
  const { NestContainer } = apiRequire("@nestjs/core/injector/container");
  const load = (file) => require(path.join(api, "src", file));
  const { ForwarderService } = load("modules/forwarder/forwarder.service.ts");
  const { ForwarderController } = load(
    "modules/forwarder/forwarder.controller.ts",
  );
  const { OwnedMobilityService } = load(
    "modules/owned-mobility/owned-mobility.service.ts",
  );
  const { OwnedMobilityRepository } = load(
    "modules/owned-mobility/owned-mobility.repository.ts",
  );
  const { RegulatoryRegistryService } = load(
    "modules/regulatory-registry/regulatory-registry.service.ts",
  );
  const { AuditNotificationService } = load(
    "modules/audit-notification/audit-notification.service.ts",
  );
  const task = {
    taskId: "11111111-1111-4111-8111-111111111111",
    orderId: "22222222-2222-4222-8222-222222222222",
    dispatchJobId: "33333333-3333-4333-8333-333333333333",
    assignmentId: "44444444-4444-4444-8444-444444444444",
    driverId: "pax-review-driver-a",
    vehicleId: "pax-review-vehicle-a",
    sourcePlatform: null,
    routeProvided: false,
    waypoints: [],
    status: "pending_acceptance",
    acceptedAt: null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: null,
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
  };
  const queries = [];
  const database = {
    isEnabled: () => true,
    query: async (sql) => {
      queries.push(sql.trim());
      if (mode === "app-db-error")
        throw new Error("fixture database read refused");
      if (sql.includes("FROM ops.phase1_driver_tasks"))
        return {
          rows: [
            task,
            {
              ...task,
              taskId: "55555555-5555-4555-8555-555555555555",
              driverId: "foreign-driver",
            },
          ].map((record) => ({ record })),
        };
      if (sql.includes("FROM ops.phase1_owned_orders")) return { rows: [] };
      throw new Error("Unexpected external database query");
    },
  };
  const owned = new OwnedMobilityService(
    {},
    {},
    {},
    {},
    undefined,
    new OwnedMobilityRepository(database),
  );
  const moduleRef = new NestModule(
    class InjectionSlice {},
    new NestContainer(),
  );
  for (const provider of [
    { provide: RegulatoryRegistryService, useValue: {} },
    { provide: AuditNotificationService, useValue: {} },
    { provide: OwnedMobilityService, useValue: owned },
    ForwarderService,
  ])
    moduleRef.addProvider(provider);
  // Use Nest's actual optional-dependency resolution and constructor injection.
  // InstanceLoader creates the prototype first, which forwardRef requires.
  const injector = new Injector();
  injector.loadPrototype(
    moduleRef.providers.get(ForwarderService),
    moduleRef.providers,
  );
  const wrapper = moduleRef.providers.get(ForwarderService);
  await injector.loadProvider(wrapper, moduleRef);
  const forwarder = wrapper.instance;
  const controller = new ForwarderController(forwarder);
  const identity = {
    realm: "driver",
    actorType: "driver_user",
    actorId: task.driverId,
  };
  const types = Reflect.getMetadata("design:paramtypes", ForwarderService);
  const report = {
    mode,
    paramtypes: types.map((item) => item?.name),
    ownedInjected: forwarder.ownedMobilityService === owned,
    databaseBoundary:
      "synthetic SQL responses; no PostgreSQL/runtime acceptance credit",
    startedServers: 0,
    initHooksInvoked: 0,
  };
  if (mode === "app-db-error") {
    let error;
    try {
      await controller.listDriverTaskViews(identity);
    } catch (caught) {
      error = caught;
    }
    console.log(
      JSON.stringify({ ...report, queries, error: error?.message ?? null }),
    );
    assert.equal(
      error?.message,
      "fixture database read refused",
      "A real owned reader failure must propagate instead of returning empty success",
    );
  } else {
    const {
      data: { items },
    } = await controller.listDriverTaskViews(identity, "foreign-driver");
    const foreign = await controller.listDriverTaskViews({
      ...identity,
      actorId: "unassigned-driver",
    });
    console.log(JSON.stringify({ ...report, queries, items }));
    assert.equal(
      items.length,
      1,
      "The actual Driver caller must see its assigned owned task after AppModule imports",
    );
    assert.deepEqual(
      items.map(({ taskId, orderId, localStatus, allowedActions }) => ({
        taskId,
        orderId,
        localStatus,
        allowedActions,
      })),
      [
        {
          taskId: task.taskId,
          orderId: task.orderId,
          localStatus: "pending_acceptance",
          allowedActions: ["accept", "reject"],
        },
      ],
    );
    assert.deepEqual(
      foreign.data.items,
      [],
      "An unassigned driver must not see this task",
    );
    assert.ok(
      queries.some((sql) => sql.includes("FROM ops.phase1_driver_tasks")),
    );
  }
  assert.equal(report.ownedInjected, true);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
