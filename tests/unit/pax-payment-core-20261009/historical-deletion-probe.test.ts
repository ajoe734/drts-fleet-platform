import { describe, expect, it, vi } from "vitest";
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";

// Optional historical module is a git-show snapshot with only import paths
// rewritten. It runs the actual repository; no reconstructed financial SQL.
const HistoricalRepository = process.env.PAX_PAYMENT_ACCOUNT_SOURCE
  ? (await import(process.env.PAX_PAYMENT_ACCOUNT_SOURCE))
      .PassengerAccountRepository
  : PassengerAccountRepository;

describe("minimal unpaid deletion probe on the selected production repository", () => {
  it("refuses account anonymization when an owned unsettled ride is returned", async () => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("FROM passenger.booking_histories")
          ? [{ exists: true }]
          : [],
      })),
      release: vi.fn(),
    };
    const repository = new HistoricalRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as DatabaseService);
    await expect(
      repository.transaction(
        async (tx: {
          anonymize: (id: string, now: string) => Promise<void>;
        }) => {
          await tx.anonymize("synthetic_owner", "2026-10-11T08:00:00Z");
        },
      ),
    ).rejects.toMatchObject({ code: "pending_payment_block" });
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes("status='deleted'")),
    ).toBe(false);
  });
});
