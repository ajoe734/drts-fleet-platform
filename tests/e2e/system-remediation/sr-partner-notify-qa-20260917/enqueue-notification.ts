// Hosted-only fixture boundary: persist a synthetic event through the production
// repository/sequence transaction. No AppModule, worker, or replacement schema.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { disclosureFixture, type SyntheticEvent } from "./synthetic-event";
import type { DatabaseService as DatabaseType } from "../../../../apps/api/src/common/db/database.service";
import type { MultiTaxiRepository as MultiTaxiType } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import type { OwnedMobilityRepository as OwnedType } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { resolvePassengerSubjectRef as ResolveSubject } from "../../../../apps/api/src/common/sensitive-data-policy";

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DRTS_UAT_ENV !== "sandbox" ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      "Notification fixtures require the authorized hosted UAT job",
    );
  const [orderId, mode, eventJson = "{}"] = process.argv.slice(2);
  const event = JSON.parse(eventJson) as SyntheticEvent;
  if (event.createdAt && !Number.isFinite(Date.parse(event.createdAt)))
    throw new Error("Invalid synthetic event timestamp");
  if (event.nextAttemptAt && !Number.isFinite(Date.parse(event.nextAttemptAt)))
    throw new Error("Invalid synthetic event schedule");
  if (!orderId || !["partner", "missing_route"].includes(mode ?? ""))
    throw new Error("Expected order ID and partner/missing_route mode");
  const apiRequire = createRequire(path.resolve("apps/api/package.json"));
  const { DatabaseService } = apiRequire(
    "./dist/common/db/database.service.js",
  ) as { DatabaseService: typeof DatabaseType };
  const { MultiTaxiRepository } = apiRequire(
    "./dist/modules/multi-taxi/multi-taxi.repository.js",
  ) as { MultiTaxiRepository: typeof MultiTaxiType };
  const { OwnedMobilityRepository } = apiRequire(
    "./dist/modules/owned-mobility/owned-mobility.repository.js",
  ) as { OwnedMobilityRepository: typeof OwnedType };
  const db = new DatabaseService();
  try {
    const multiTaxi = new MultiTaxiRepository(db);
    const owned = new OwnedMobilityRepository(db, multiTaxi);
    const order = await owned.findOrderById(orderId);
    if (!order) throw new Error("Authoritative order was not persisted");
    const route = await multiTaxi.findOrderPartnerNotificationRoute(orderId);
    if ((mode === "partner") !== Boolean(route))
      throw new Error("Unexpected route fixture state");
    const outboxId = randomUUID();
    const now = new Date().toISOString();
    // A missing-route event has no external recipient. Derive the subject with
    // the same production resolver; never manufacture an identity link/route.
    const { resolvePassengerSubjectRef } = apiRequire(
      "./dist/common/sensitive-data-policy.js",
    ) as {
      resolvePassengerSubjectRef: typeof ResolveSubject;
    };
    await owned.persistChanges({
      ...(event.relevanceVersion === undefined
        ? {}
        : {
            passengerDisclosureSnapshots: [
              disclosureFixture(orderId, event.relevanceVersion, now),
            ],
          }),
      consumerNotificationOutbox: [
        {
          outboxId,
          orderId,
          passengerSubjectRef:
            route?.passengerSubjectRef ??
            resolvePassengerSubjectRef(order.passenger),
          eventType: event.eventType ?? "receipt_ready",
          assignmentVersion: event.assignmentVersion ?? null,
          payload: event.payload ?? {},
          status: "pending",
          attemptCount: 0,
          nextAttemptAt: event.nextAttemptAt ?? now,
          createdAt: event.createdAt ?? now,
          deliveredAt: null,
        },
      ],
    });
    console.log(
      JSON.stringify({
        outboxId,
        orderId,
        route,
        candidateSha: process.env.CANDIDATE_SHA,
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
