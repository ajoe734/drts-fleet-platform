// Replay the same production boundary fixture against an immutable prior SHA.
// No checkout/reset, server, real PG or substituted business SQL.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");
const reference = process.argv[2];
if (reference && !/^[a-f0-9]{40}$/.test(reference))
  throw new Error("Expected full immutable SHA");
const previousFiles = new Set([
  "apps/api/src/modules/passenger-app/booking/passenger-booking.service.ts",
  "apps/api/src/modules/passenger-app/booking/passenger-booking.repository.ts",
  "apps/api/src/modules/multi-taxi/multi-taxi.service.ts",
  "apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
]);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "@drts/contracts")
    return path.join(root, "packages/contracts/src/index.ts");
  if (request === "@drts/control-plane-auth")
    return path.join(root, "packages/control-plane-auth/src/index.ts");
  return resolve.call(this, request, ...args);
};
require.extensions[".ts"] = (module, filename) => {
  const relative = path.relative(root, filename);
  const source =
    reference && previousFiles.has(relative)
      ? execFileSync("git", ["show", `${reference}:${relative}`], {
          cwd: root,
          encoding: "utf8",
        })
      : fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
};
const { Logger } = require(
  path.join(root, "apps/api/node_modules/@nestjs/common"),
);
Logger.overrideLogger(false);
const {
  createProductionBookingFixture,
  NOW,
  OWNER,
} = require("./production-booking-fixture.ts");
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [NOW]));
  }
  static now() {
    return NOW;
  }
};
process.env.REQUIRE_SMS_VERIFICATION = "false";
process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES = "15";
delete process.env.MULTI_TAXI_DEFAULT_AUTHORIZATION_ID;
async function main() {
  let failures = 0;
  for (const faults of [
    [],
    ["order"],
    ["history", "cancel_connect"],
    ["history", "cancel_write"],
    ["token", "cancel_connect"],
    ["history", "rollback"],
  ]) {
    const f = createProductionBookingFixture(faults);
    let error = null;
    try {
      await f.service.createRide(OWNER, f.command);
    } catch (e) {
      error = e.code || e.message;
    }
    const safe =
      faults.length === 0
        ? error === null &&
          f.state.history?.[0] === OWNER &&
          f.published.length === 1
        : error !== null &&
          f.state.order === null &&
          f.state.history === null &&
          f.state.token === null &&
          f.published.length === 0 &&
          f.owned.listOrders().length === 0;
    if (!safe) failures++;
    console.log(
      JSON.stringify({
        sha: reference || "working-tree",
        faults,
        error,
        durable: f.state.order?.status || null,
        memory: f.owned.listOrders()[0]?.status || null,
        history: !!f.state.history,
        token: !!f.state.token,
        published: f.published.length,
        historyEntry: f.historyObservations,
        safe,
      }),
    );
  }
  console.log(`PRODUCTION_FAILURE_PROBE failures=${failures}`);
  process.exitCode = failures ? 1 : 0;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
