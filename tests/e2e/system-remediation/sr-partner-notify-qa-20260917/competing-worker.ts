// Hosted-only second process with the production module graph and scheduler.
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline";

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DRTS_UAT_ENV !== "sandbox" ||
    !process.env.DATABASE_URL
  )
    throw new Error("Competing worker requires authorized hosted UAT");
  const apiRequire = createRequire(path.resolve("apps/api/package.json"));
  apiRequire("reflect-metadata");
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = apiRequire("./dist/app.module.js");
  // No overrides, replacement worker, timer, or HTTP listener. AppModule owns
  // its normal lifecycle, including the real PartnerNotificationWorker.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const input = createInterface({ input: process.stdin });
  try {
    console.log(
      JSON.stringify({
        competingWorkerReady: true,
        pid: process.pid,
        candidateSha: process.env.CANDIDATE_SHA,
      }),
    );
    for await (const line of input) {
      if (line === "stop") break;
      throw new Error("Unknown worker lifecycle command");
    }
  } finally {
    input.close();
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
