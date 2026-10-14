import { describe, expect, it, vi } from "vitest";
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";

function fixture(unpaid: boolean) {
  const calls: { sql: string; values: readonly unknown[] | undefined }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
      calls.push({ sql, values });
      return {
        rows:
          sql.includes("FROM passenger.booking_histories") && unpaid
            ? [{ exists: true }]
            : [],
      };
    }),
    release: vi.fn(),
  };
  const repo = new PassengerAccountRepository({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseService);
  return { repo, calls };
}

describe("production deletion transaction guard (database replies mocked; no PG acceptance claim)", () => {
  it("rolls back session revocation and refuses anonymization when debt/active obligations exist", async () => {
    const f = fixture(true);
    await expect(
      f.repo.transaction(async (tx) => {
        await tx.revokeAll(
          "synthetic_owner",
          "2026-10-11T08:00:00Z",
          "account_deleted",
        );
        await tx.anonymize("synthetic_owner", "2026-10-11T08:00:00Z");
      }),
    ).rejects.toMatchObject({ code: "pending_payment_block" });
    expect(f.calls.map((c) => c.sql)).toContain("ROLLBACK");
    expect(f.calls.map((c) => c.sql)).not.toContain("COMMIT");
    expect(f.calls.some((c) => c.sql.includes("status='deleted'"))).toBe(false);
    const guard = f.calls.find((c) =>
      c.sql.includes("FROM passenger.booking_histories"),
    );
    expect(guard?.values).toEqual(["synthetic_owner", "deletion"]);
  });
  it("keeps existing revocation/anonymization writes and financial retention on settled deletion", async () => {
    const f = fixture(false);
    await f.repo.transaction(async (tx) => {
      await tx.revokeAll(
        "synthetic_owner",
        "2026-10-11T08:00:00Z",
        "account_deleted",
      );
      await tx.anonymize("synthetic_owner", "2026-10-11T08:00:00Z");
    });
    expect(f.calls.at(-1)?.sql).toBe("COMMIT");
    expect(
      f.calls.filter(
        (c) => c.sql.startsWith("UPDATE") || c.sql.startsWith("DELETE"),
      ),
    ).toHaveLength(4);
    expect(
      f.calls.some((c) => /^(UPDATE|DELETE).*billing\./s.test(c.sql)),
    ).toBe(false);
  });
  it("guards last-identity Facebook deletion using the same production transaction method", async () => {
    const f = fixture(true);
    await expect(
      f.repo.transaction(async (tx) => {
        await tx.revokeAll(
          "synthetic_owner",
          "2026-10-11T08:00:00Z",
          "facebook_data_deleted",
        );
        await tx.anonymize("synthetic_owner", "2026-10-11T08:00:00Z");
      }),
    ).rejects.toMatchObject({ code: "pending_payment_block" });
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});
