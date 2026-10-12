import { describe, expect, it, vi } from "vitest";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";

const RECEIPT = {
  actionId: "synthetic_action",
  auditId: "synthetic_audit",
  resourceType: "multi_taxi_payment_exception",
  resourceId: "synthetic_payment",
  status: "accepted" as const,
  message: "Synthetic manual handoff.",
};
const INPUT = {
  recoveryCommandId: "synthetic_recovery",
  paymentId: "synthetic_payment",
  action: "begin_manual_recovery" as const,
  state: "accepted" as const,
  receipt: RECEIPT,
  passengerLedgerManaged: true as const,
};

function fixture() {
  const authority = {
    charge_status: "manual_recovery",
    billing_status: "manual_recovery",
    charge_attempts: 2,
    billing_attempts: 2,
    charge_amount: "12345",
    billing_amount: "12345",
    charge_currency: "TWD",
    billing_currency: "TWD",
    provider_capture_ref: null,
    provider_payment_ref: null,
  };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith("SELECT drts_passenger_id")
      ? [{ drts_passenger_id: "synthetic_owner" }]
      : sql.includes("SELECT c.status AS charge_status")
        ? [authority]
        : [],
    rowCount: 1,
  }));
  const release = vi.fn();
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    connect: async () => ({ query, release }),
  } as never);
  return { repository, query, release, authority };
}

describe("real Billing recovery receipt writer with mocked PG reply boundary", () => {
  it("locks account and verifies both ledgers before recording receipt, without a second financial write", async () => {
    const f = fixture();
    await f.repository.completeMultiTaxiPaymentRecoveryCommand(INPUT);
    const sql = f.query.mock.calls.map(([text]) => text);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql[2]).toContain("FROM passenger.accounts");
    expect(sql[2]).toContain("FOR UPDATE");
    expect(sql[3]).toContain("FOR UPDATE OF c,p");
    expect(sql.filter((text) => text.trim().startsWith("UPDATE"))).toEqual([
      expect.stringContaining(
        "UPDATE billing.multi_taxi_payment_recovery_commands",
      ),
    ]);
    expect(f.authority.charge_attempts).toBe(2);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it("refuses a legacy port's claim of core capture/manual status", async () => {
    const f = fixture();
    await expect(
      f.repository.completeMultiTaxiPaymentRecoveryCommand({
        recoveryCommandId: INPUT.recoveryCommandId,
        paymentId: INPUT.paymentId,
        action: INPUT.action,
        state: INPUT.state,
        receipt: INPUT.receipt,
      }),
    ).rejects.toThrow("requires its core writer");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(
      f.query.mock.calls.some(([sql]) => sql.trim().startsWith("UPDATE")),
    ).toBe(false);
  });

  it.each(["status", "attempt", "amount", "currency", "reference"])(
    "refuses %s drift before writing a receipt",
    async (kind) => {
      const f = fixture();
      if (kind === "status") f.authority.billing_status = "captured";
      if (kind === "attempt") f.authority.billing_attempts = 3;
      if (kind === "amount") f.authority.billing_amount = "999";
      if (kind === "currency") f.authority.billing_currency = "NTD";
      if (kind === "reference")
        f.authority.provider_payment_ref = "synthetic_drift" as never;
      await expect(
        f.repository.completeMultiTaxiPaymentRecoveryCommand(INPUT),
      ).rejects.toThrow("does not match");
      expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
      expect(
        f.query.mock.calls.some(([sql]) => sql.trim().startsWith("UPDATE")),
      ).toBe(false);
    },
  );

  it("does not accept a manual handoff receipt when both ledgers still show a captured payment", async () => {
    const f = fixture();
    f.authority.charge_status = f.authority.billing_status = "captured";
    await expect(
      f.repository.completeMultiTaxiPaymentRecoveryCommand(INPUT),
    ).rejects.toThrow("does not match");
  });
});
