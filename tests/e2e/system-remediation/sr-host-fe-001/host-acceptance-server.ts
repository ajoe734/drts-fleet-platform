// Standalone process entry point for the browser-acceptance CI job.
//
// Boots the same isolated Host acceptance Nest composition used by
// host-api-sql-acceptance.test.ts (see host-acceptance-app.ts), but as a
// long-running background process on a fixed port, so the real
// fleet-partner-portal-web Next.js server (DRTS_API_URL pointed at this
// process) and Playwright can drive real browser traffic against it.
//
// Run via (from apps/api, so its tsconfig/decorator settings apply):
//   pnpm --filter @drts/api exec tsx \
//     ../../tests/e2e/system-remediation/sr-host-fe-001/host-acceptance-server.ts
//
// Requires DATABASE_URL and HOST_ACCEPTANCE_API_PORT in the environment.
// Exits non-zero immediately on any startup failure so a CI step chain
// depending on this process cannot silently proceed against a dead server.

import {
  buildHostAcceptanceCandidate,
  createHostAcceptanceApp,
} from "./host-acceptance-app";
import { seedHostAcceptanceFixtures } from "./host-acceptance-seed";

async function main() {
  const port = Number(process.env.HOST_ACCEPTANCE_API_PORT ?? 4101);
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "HOST_ACCEPTANCE_API_PORT server requires DATABASE_URL to be set.",
    );
  }

  buildHostAcceptanceCandidate();
  await seedHostAcceptanceFixtures();

  const app = await createHostAcceptanceApp();
  await app.listen(port, "0.0.0.0");
  console.log(`[host-acceptance-server] listening on http://0.0.0.0:${port}`);

  const shutdown = async () => {
    console.log("[host-acceptance-server] shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[host-acceptance-server] failed to start", error);
  process.exit(1);
});
