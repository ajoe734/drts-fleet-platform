import { describe, expect, it, vi } from "vitest";

// Mock server-only for node environment in tests
vi.mock("server-only", () => ({}));

import {
  toHomeRole,
  roleView,
  quotaPct,
  BANK_ACTORS,
  type BankPersona,
} from "../../../../apps/bank-console-web/lib/home-data";
import {
  getContractRecord,
  countOpenExceptions,
  metricValue,
  metricTarget,
  metricDelta,
  formatDateTime,
  zhDateTime,
  formatPeriod,
} from "../../../../apps/bank-console-web/lib/contracts-data";
import { settlementStatements } from "../../../../apps/bank-console-web/lib/statements";
import {
  loadBankHomeSnapshot,
  loadBankContractsData,
  deriveStatementDates,
  getTaipeiDateString,
  formatPeriodDate,
} from "../../../../apps/bank-console-web/lib/bank-dev-read-models";

describe("SR-BANK-001: Bank Console Home, Contracts, and Statements Remediation", () => {
  const tenantId = "tenant-demo-001";

  describe("1. Three Personas Navigation & Access Boundary", () => {
    it("bank_program_admin has access to orders, quota, sla, and finance", () => {
      const persona: BankPersona = "bank_program_admin";
      const homeRole = toHomeRole(persona);
      expect(homeRole).toBe("admin");

      const actor = BANK_ACTORS.admin;
      expect(actor.persona).toBe(persona);
      expect(actor.display).toBe("周敬文");

      const view = roleView(homeRole);
      expect(view.seeOrders).toBe(true);
      expect(view.seeQuota).toBe(true);
      expect(view.seeSla).toBe(true);
      expect(view.seeFinance).toBe(true);
    });

    it("bank_ops_viewer has read-only operations access (orders, quota, sla), but not finance", () => {
      const persona: BankPersona = "bank_ops_viewer";
      const homeRole = toHomeRole(persona);
      expect(homeRole).toBe("ops");

      const actor = BANK_ACTORS.ops;
      expect(actor.persona).toBe(persona);
      expect(actor.display).toBe("黃怡安");

      const view = roleView(homeRole);
      expect(view.seeOrders).toBe(true);
      expect(view.seeQuota).toBe(true);
      expect(view.seeSla).toBe(true);
      expect(view.seeFinance).toBe(false);
    });

    it("bank_finance has access to finance and settlement, but not raw passenger orders", () => {
      const persona: BankPersona = "bank_finance";
      const homeRole = toHomeRole(persona);
      expect(homeRole).toBe("finance");

      const actor = BANK_ACTORS.finance;
      expect(actor.persona).toBe(persona);
      expect(actor.display).toBe("湯立群");

      const view = roleView(homeRole);
      expect(view.seeOrders).toBe(false);
      expect(view.seeQuota).toBe(true);
      expect(view.seeSla).toBe(true);
      expect(view.seeFinance).toBe(true);
    });
  });

  describe("2. Graceful Degradation & Zero Unhandled SSR Crashes (R06)", () => {
    it("loadBankHomeSnapshot degrades safely and returns fallback data without throwing", async () => {
      const snapshot = await loadBankHomeSnapshot(tenantId, "bank_program_admin");
      expect(snapshot).toBeDefined();
      expect(snapshot.data).toBeDefined();
      expect(snapshot.data.tallies).toBeDefined();
      expect(snapshot.data.tallies.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(snapshot.data.orders)).toBe(true);
      expect(Array.isArray(snapshot.data.usage)).toBe(true);
      expect(Array.isArray(snapshot.data.contracts)).toBe(true);
      expect(Array.isArray(snapshot.data.statements)).toBe(true);
    });

    it("loadBankContractsData degrades safely and returns contract items without throwing", async () => {
      const contractData = await loadBankContractsData(tenantId, "bank_ops_viewer");
      expect(contractData).toBeDefined();
      expect(contractData.data).toBeDefined();
      expect(Array.isArray(contractData.data.contracts)).toBe(true);
      expect(contractData.data.contracts.length).toBeGreaterThan(0);
    });

    it("countOpenExceptions safely handles undefined or empty exception arrays", () => {
      expect(countOpenExceptions(undefined)).toBe(0);
      expect(countOpenExceptions([])).toBe(0);
      expect(
        countOpenExceptions([
          {
            exceptionId: "ex-1",
            orderId: "ord-1",
            reasonCode: "test",
            status: "open",
            occurredAt: "2026-03-01T00:00:00Z",
            summary: "test",
          },
          {
            exceptionId: "ex-2",
            orderId: "ord-2",
            reasonCode: "test",
            status: "resolved",
            occurredAt: "2026-03-01T00:00:00Z",
            summary: "test",
          },
        ]),
      ).toBe(1);
    });
  });

  describe("3. Quota and SLA Metrics: Separation of Null vs True 0 (R16)", () => {
    it("quotaPct returns null when total is 0 or negative to prevent NaN%", () => {
      expect(quotaPct({ program: "all", used: 0, total: 0 })).toBeNull();
      expect(quotaPct({ program: "all", used: 10, total: 0 })).toBeNull();
      expect(quotaPct({ program: "all", used: 0, total: -5 })).toBeNull();
    });

    it("quotaPct returns real percentage when total is positive", () => {
      expect(quotaPct({ program: "all", used: 0, total: 100 })).toBe(0);
      expect(quotaPct({ program: "all", used: 25, total: 100 })).toBe(25);
      expect(quotaPct({ program: "all", used: 33, total: 100 })).toBe(33);
      expect(quotaPct({ program: "all", used: 100, total: 100 })).toBe(100);
      expect(quotaPct({ program: "all", used: 150, total: 100 })).toBe(150);
    });

    it("metricValue, metricTarget, and metricDelta return null safely when attainment or targets are missing", () => {
      const contract = getContractRecord("ctr_ctbc_world_elite_2026");
      expect(contract).toBeDefined();

      const val = metricValue(contract?.periodAttainment, "pickup_punctuality");
      expect(val).toBeTypeOf("number");

      const target = metricTarget(contract!, "pickup_punctuality");
      expect(target).toBeTypeOf("number");

      const delta = metricDelta(contract!, "pickup_punctuality");
      expect(delta).toBeTypeOf("number");

      expect(metricValue(undefined, "pickup_punctuality")).toBeNull();

      // @ts-expect-error testing invalid metric
      expect(metricValue(contract?.periodAttainment, "unknown_metric")).toBeNull();
    });
  });

  describe("4. Statement Dates: Immutable Dates, Asia/Taipei Timezone, and issuedAt <= dueAt (R28)", () => {
    it("seed statements contain period 2026-03 with valid immutable bounds", () => {
      const stmt202603 = settlementStatements.find((s) => s.period === "2026-03");
      expect(stmt202603).toBeDefined();
      expect(stmt202603?.issuedAt).toBe("2026-03-01T09:00:00+08:00");
      expect(stmt202603?.dueAt).toBe("2026-03-31T23:59:00+08:00");

      const issued = new Date(stmt202603!.issuedAt).getTime();
      const due = new Date(stmt202603!.dueAt).getTime();
      expect(issued).toBeLessThanOrEqual(due);
    });

    it("deriveStatementDates guarantees issuedAt is never later than dueAt even when API returns current generation timestamp", () => {
      const dates = deriveStatementDates({
        period: "2026-04",
        generated_at: "2026-09-06T14:30:00.000Z",
        due_at: "2026-04-30T23:59:00+08:00",
      });

      const issuedTime = new Date(dates.issuedAt).getTime();
      const dueTime = new Date(dates.dueAt).getTime();

      expect(issuedTime).toBeLessThanOrEqual(dueTime);
      expect(dates.dueAt.startsWith("2026-04-30")).toBe(true);
      expect(dates.issuedAt.startsWith("2026-04")).toBe(true);
    });

    it("deriveStatementDates falls back to monthly period bounds in Asia/Taipei when timestamps are missing", () => {
      const dates = deriveStatementDates({
        period: "2026-02",
      });

      expect(dates.issuedAt).toBe("2026-02-01T00:00:00+08:00");
      expect(dates.dueAt).toBe("2026-02-28T23:59:59+08:00");

      const issuedTime = new Date(dates.issuedAt).getTime();
      const dueTime = new Date(dates.dueAt).getTime();
      expect(issuedTime).toBeLessThanOrEqual(dueTime);
    });

    it("getTaipeiDateString accurately formats dates in Asia/Taipei without UTC drift", () => {
      const taipeiDate = getTaipeiDateString(new Date("2026-02-28T18:00:00Z"));
      expect(taipeiDate).toBe("2026-03-01");

      const taipeiDate2 = getTaipeiDateString(new Date("2026-03-01T01:00:00Z"));
      expect(taipeiDate2).toBe("2026-03-01");
    });

    it("formatDateTime and zhDateTime format dates in Asia/Taipei without timezone drifting", () => {
      const formattedZh = zhDateTime.format(new Date("2026-03-01T09:00:00+08:00"));
      expect(formattedZh).toContain("2026/03/01");

      const formattedEn = formatDateTime("2026-03-01T09:00:00+08:00");
      expect(formattedEn).toContain("2026/03/01");
    });

    it("formatPeriod and formatPeriodDate correctly render year-month period", () => {
      expect(formatPeriod("2026-03")).toBe("2026 年 03 月");
      expect(formatPeriodDate("2026-03")).toBe("2026-03-01T00:00:00+08:00");
      expect(formatPeriodDate("2026-03", true)).toBe("2026-03-31T23:59:59+08:00");
    });
  });

  describe("5. Multi-Key Contract Resolving", () => {
    it("resolves contract by contractId", () => {
      const record = getContractRecord("ctr_ctbc_world_elite_2026");
      expect(record).toBeDefined();
      expect(record?.contractId).toBe("ctr_ctbc_world_elite_2026");
      expect(record?.programCode).toBe("CTBC_WORLD_ELITE");
    });

    it("resolves contract by programId", () => {
      const record = getContractRecord("prog-ctbc-world-elite");
      expect(record).toBeDefined();
      expect(record?.contractId).toBe("ctr_ctbc_world_elite_2026");
    });

    it("resolves contract by programCode (case-insensitive, hyphen/underscore friendly)", () => {
      const record = getContractRecord("CTBC_WORLD_ELITE");
      expect(record).toBeDefined();
      expect(record?.contractId).toBe("ctr_ctbc_world_elite_2026");

      const recordShort = getContractRecord("world-elite");
      expect(recordShort).toBeDefined();
      expect(recordShort?.contractId).toBe("ctr_ctbc_world_elite_2026");

      const recordSig = getContractRecord("infinite");
      expect(recordSig).toBeDefined();
      expect(recordSig?.contractId).toBe("ctr_ctbc_infinite_2026");
    });
  });
});
