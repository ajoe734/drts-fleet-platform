// Replay an actual successful outcome through the compiled production
// repository, with the previous/released fence. Never synthesize a receipt.
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseService as DatabaseType } from "../../../../apps/api/src/common/db/database.service";
import type { MultiTaxiRepository as RepositoryType } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DRTS_UAT_ENV !== "sandbox" ||
    !process.env.DATABASE_URL
  )
    throw new Error("Stale outcome probe requires authorized hosted UAT");
  const [outboxId, rawFence] = process.argv.slice(2);
  const fenceToken = Number(rawFence);
  if (!outboxId || !Number.isSafeInteger(fenceToken) || fenceToken < 1)
    throw new Error("Expected outbox ID and a previously observed fence");
  const apiRequire = createRequire(path.resolve("apps/api/package.json"));
  const { DatabaseService } = apiRequire(
    "./dist/common/db/database.service.js",
  ) as {
    DatabaseService: typeof DatabaseType;
  };
  const { MultiTaxiRepository } = apiRequire(
    "./dist/modules/multi-taxi/multi-taxi.repository.js",
  ) as {
    MultiTaxiRepository: typeof RepositoryType;
  };
  const db = new DatabaseService();
  try {
    const repository = new MultiTaxiRepository(db);
    const context = await repository.findPartnerNotificationContext(outboxId);
    const { rows } = await db.query(
      "SELECT * FROM ops.consumer_notification_outbox WHERE outbox_id=$1",
      [outboxId],
    );
    const row = rows[0];
    if (!context?.receiptId || row?.status !== "delivered" || !row.delivered_at)
      throw new Error(
        "Expected a real acknowledged delivery before stale replay",
      );
    const result = await repository.recordPushDeliveryOutcome({
      outboxId,
      passengerSubjectRef: row.passenger_subject_ref,
      fenceToken,
      providerName: "partner_webhook",
      providerAckState: "provider_acknowledged",
      providerMessageRef: context.receiptId,
      deliveryOutcome: {
        outboxId,
        status: "delivered",
        result: "delivered",
        attemptCount: row.attempt_count,
        nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
        deliveredAt: new Date(row.delivered_at).toISOString(),
        providerName: "partner_webhook",
      },
      partnerMetadata: {
        deliveryTarget: context.deliveryTarget,
        deliveryStage: context.deliveryStage,
        failureReason: context.failureReason,
        retryDisposition: context.retryDisposition,
        expiresAt: context.expiresAt,
        receiptId: context.receiptId,
        downstreamStatus: context.downstreamStatus,
      },
    });
    console.log(
      JSON.stringify({
        staleOutcome: result,
        fenceToken,
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
