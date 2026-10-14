// Diagnostic: default reproduces F3 on the old checkpoint; --expect-coherent
// verifies the V3 fix on the current source with the same controlled queries.
// Run from apps/api with node -r ts-node/register/transpile-only <this file>.
// This is controlled-query source evidence, not real PostgreSQL acceptance.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
const load = createRequire(import.meta.url);
const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const apiSource = path.join(sourceRoot, "apps/api/src");
// Worker node_modules is shared; resolve this checkout's built contracts.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  return originalLoad.call(
    this,
    request === "@drts/contracts" || request === "@drts/control-plane-auth"
      ? path.join(sourceRoot, "packages", request.slice(6), "dist/index.js")
      : request,
    parent,
    isMain,
  );
};
const { OpsDispatchEventsService } = load(
  path.join(apiSource, "common/ops-dispatch-events.service.ts"),
);
const { AuditNotificationService } = load(
  path.join(
    apiSource,
    "modules/audit-notification/audit-notification.service.ts",
  ),
);
const { DriverProfileService } = load(
  path.join(apiSource, "modules/driver-profile/driver-profile.service.ts"),
);
const { RegulatoryRegistryRepository } = load(
  path.join(
    apiSource,
    "modules/regulatory-registry/regulatory-registry.repository.ts",
  ),
);
const { RegulatoryRegistryService } = load(
  path.join(
    apiSource,
    "modules/regulatory-registry/regulatory-registry.service.ts",
  ),
);

async function run() {
  const expectCoherent = process.argv.includes("--expect-coherent");
  const writes = [];
  let stored;
  const query = async (sql, params) => {
    if (!sql.includes("INSERT INTO reg.phase1_registry_drivers"))
      return { rows: [] };
    const record = JSON.parse(params[5]);
    return new Promise((resolve) =>
      writes.push({
        record,
        commit: () => {
          stored = record;
          resolve({ rows: [] });
        },
      }),
    );
  };
  const repository = new RegulatoryRegistryRepository({
    isEnabled: () => true,
    query,
  });
  const audit = new AuditNotificationService();
  const service = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter()),
    audit,
    new DriverProfileService(audit),
    repository,
  );
  const master = service.updateDriverLicenses("drv-demo-001", {
    licensesValid: false,
  });
  for (let i = 0; i < 40; i++) await Promise.resolve();
  const workState = service.updateDriverWorkState("drv-demo-001", {
    workState: "paused",
  });
  const pendingQueries = writes.length;
  assert.equal(workState.workState, "paused");
  writes[0].commit();
  const acknowledgedMaster = await master;
  assert.equal(acknowledgedMaster.licensesValid, false);
  for (let i = 0; i < 40; i++) await Promise.resolve();
  writes[1].commit();
  for (let i = 0; i < 40; i++) await Promise.resolve();
  const current = service
    .listDrivers()
    .find((driver) => driver.driverId === "drv-demo-001");
  assert.equal(pendingQueries, expectCoherent ? 1 : 2);
  assert.equal(stored.licensesValid, !expectCoherent);
  assert.equal(current.licensesValid, false);
  assert.equal(current.workState, expectCoherent ? "paused" : "available");
  if (expectCoherent) assert.deepEqual(stored, current);
  process.stdout.write(
    JSON.stringify(
      {
        diagnostic:
          "F3 inherited work-state versus strict master full-row ordering",
        obstructionConfirmed: !expectCoherent,
        coherent: expectCoherent,
        pendingQueries,
        acknowledgedMaster,
        inheritedResponse: workState,
        finalStored: stored,
        finalMemory: current,
        storageBoundary:
          "controlled external query; no real PostgreSQL or HTTP",
      },
      null,
      2,
    ) + "\n",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
