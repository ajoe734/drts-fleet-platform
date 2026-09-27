import { createRequire } from "node:module";
import path from "node:path";
import type { OwnedMobilityRepository as OwnedType } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { PassengerPushPort } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";
import type { PartnerNotificationTransport as TransportType } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.transport";

async function main() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.DRTS_UAT_ENV !== "sandbox" || !process.env.DATABASE_URL)
    throw new Error("Availability probe requires authorized hosted UAT");
  const apiRequire = createRequire(path.resolve("apps/api/package.json"));
  apiRequire("reflect-metadata");
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = apiRequire("./dist/app.module.js");
  const { OwnedMobilityRepository } = apiRequire("./dist/modules/owned-mobility/owned-mobility.repository.js");
  const { PASSENGER_PUSH_PORT } = apiRequire("./dist/modules/multi-taxi/passenger-push.port.js");
  const { PASSENGER_PUSH_TRANSPORT } = apiRequire("./dist/modules/multi-taxi/passenger-push.adapter.js");
  const { PartnerNotificationTransport } = apiRequire("./dist/modules/multi-taxi/partner-notification.transport.js");
  // Production DI, repositories and lifecycle; no provider overrides or listen.
  // Its normal scheduler is allowed only on the hosted runner and is closed below.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const repository: OwnedType = app.get(OwnedMobilityRepository);
    const port: PassengerPushPort = app.get(PASSENGER_PUSH_PORT);
    const transport: TransportType = app.get(PASSENGER_PUSH_TRANSPORT);
    const record = (await repository.loadState()).consumerNotificationOutbox.find(
      (row) => row.outboxId === process.argv[2],
    );
    if (!record) throw new Error("Expected persisted notification");
    console.log(JSON.stringify({
      availability: await port.isAvailableFor?.(record),
      serviceAvailable: port.isAvailable(),
      transportMode: port.transportMode,
      providerName: port.providerName(),
      partnerTransportBound: transport instanceof PartnerNotificationTransport,
      candidateSha: process.env.CANDIDATE_SHA,
    }));
  } finally { await app.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
