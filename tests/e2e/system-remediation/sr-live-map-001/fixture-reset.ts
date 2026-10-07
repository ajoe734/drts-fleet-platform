import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DatabaseService } from "../../../../apps/api/src/common/db";
import { resetLiveMapFixture } from "../../../../apps/api/src/modules/regulatory-registry/live-map-fixture";

// Out-of-band recovery for an acceptance run that leaves the reserved live
// map fixture driver bound: it talks to Postgres directly, so it still works
// when the API process itself cannot start (the exact DEV-OUTAGE-LIVE-MAP-
// FIXTURE-STARTUP-20261006 failure mode). resetLiveMapFixture only ever
// touches the hardcoded fixture driver id; no other driver can be targeted.
export async function runLiveMapFixtureReset() {
  const database = new DatabaseService();
  try {
    return await resetLiveMapFixture(database);
  } finally {
    await database.onModuleDestroy();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runLiveMapFixtureReset()
    .then((result) => {
      console.log(JSON.stringify(result));
      if (result.status !== "reset") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(
        `Live map fixture reset failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
