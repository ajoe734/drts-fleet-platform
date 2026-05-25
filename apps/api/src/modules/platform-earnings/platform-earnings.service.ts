import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_REGISTRY,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "@drts/contracts";
import type {
  DriverEarningsDashboard,
  DriverEarningsPeriod,
  DriverEarningsPlatformBreakdownItem,
  DriverEarningsReconciliationIssueCard,
  DriverEarningsStatementListItem,
  DriverStatementRecord,
  EmptyStateEnvelope,
  MoneyAmount,
  PlatformCode,
  PlatformEarningsItem,
  ReconciliationIssueRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import {
  PlatformEarningsRepository,
  type PlatformEarningsPeriodWindow,
} from "./platform-earnings.repository";

const DEFAULT_CURRENCY = "TWD";

type PlatformEarningsSeedRecord = {
  driverId: string;
  platformCode: PlatformCode;
  periodDate: string;
  grossMinor: number;
  serviceFeeMinor: number;
  subsidyMinor: number;
  netMinor: number;
};

// Mirrors the billing-settlement demo March baselines so the non-DB fallback
// still exposes realistic per-platform earnings for seeded drivers.
const PLATFORM_EARNINGS_SEED: PlatformEarningsSeedRecord[] = [
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_UBER,
    periodDate: "2026-05-25",
    grossMinor: 124000,
    serviceFeeMinor: 0,
    subsidyMinor: 10000,
    netMinor: 134000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_GRAB,
    periodDate: "2026-05-25",
    grossMinor: 82000,
    serviceFeeMinor: 18000,
    subsidyMinor: 0,
    netMinor: 64000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_LINE_TAXI,
    periodDate: "2026-05-25",
    grossMinor: 0,
    serviceFeeMinor: 0,
    subsidyMinor: 0,
    netMinor: 0,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_UBER,
    periodDate: "2026-05-21",
    grossMinor: 196000,
    serviceFeeMinor: 24000,
    subsidyMinor: 12000,
    netMinor: 184000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_GRAB,
    periodDate: "2026-05-22",
    grossMinor: 146000,
    serviceFeeMinor: 22000,
    subsidyMinor: 8000,
    netMinor: 132000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_LINE_TAXI,
    periodDate: "2026-05-24",
    grossMinor: 38000,
    serviceFeeMinor: 0,
    subsidyMinor: 0,
    netMinor: 38000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_UBER,
    periodDate: "2026-05-10",
    grossMinor: 120000,
    serviceFeeMinor: 18000,
    subsidyMinor: 5000,
    netMinor: 107000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_GRAB,
    periodDate: "2026-05-12",
    grossMinor: 80000,
    serviceFeeMinor: 12000,
    subsidyMinor: 0,
    netMinor: 68000,
  },
  {
    driverId: "drv-demo-002",
    platformCode: PLATFORM_CODE_LINE_TAXI,
    periodDate: "2026-05-25",
    grossMinor: 150000,
    serviceFeeMinor: 22500,
    subsidyMinor: 10000,
    netMinor: 137500,
  },
];

const DEMO_DRIVER_ALIASES: Record<string, string> = {
  "demo-driver": "drv-demo-001",
  "driver-demo-001": "drv-demo-001",
};

function money(amountMinor: number): MoneyAmount {
  return {
    currency: DEFAULT_CURRENCY,
    amountMinor,
  };
}

function toSeedItem(record: PlatformEarningsSeedRecord): PlatformEarningsItem {
  return {
    platformCode: record.platformCode,
    grossEarning: money(record.grossMinor),
    serviceFee: money(record.serviceFeeMinor),
    subsidy: money(record.subsidyMinor),
    netAmount: money(record.netMinor),
  };
}

type SeedMemoryBucket = {
  periodDate: string;
  item: PlatformEarningsItem;
};

function buildSeedMemory(): Map<string, SeedMemoryBucket[]> {
  const memory = new Map<string, SeedMemoryBucket[]>();

  for (const record of PLATFORM_EARNINGS_SEED) {
    const bucket = memory.get(record.driverId) ?? [];
    bucket.push({
      periodDate: record.periodDate,
      item: toSeedItem(record),
    });
    memory.set(record.driverId, bucket);
  }

  return memory;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function aggregatePlatformItems(
  items: PlatformEarningsItem[],
): PlatformEarningsItem[] {
  const grouped = new Map<PlatformCode, PlatformEarningsItem>();

  for (const item of items) {
    const current = grouped.get(item.platformCode);
    if (!current) {
      grouped.set(item.platformCode, {
        ...item,
        grossEarning: { ...item.grossEarning },
        serviceFee: { ...item.serviceFee },
        subsidy: { ...item.subsidy },
        netAmount: { ...item.netAmount },
      });
      continue;
    }

    current.grossEarning.amountMinor += item.grossEarning.amountMinor;
    current.serviceFee.amountMinor += item.serviceFee.amountMinor;
    current.subsidy.amountMinor += item.subsidy.amountMinor;
    current.netAmount.amountMinor += item.netAmount.amountMinor;
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.platformCode.localeCompare(right.platformCode),
  );
}

@Injectable()
export class PlatformEarningsService {
  private readonly logger = new Logger(PlatformEarningsService.name);

  // in-memory fallback: driverId -> dated platform earnings rows
  private memory: Map<string, SeedMemoryBucket[]> = buildSeedMemory();

  constructor(
    private readonly billingSettlementService?: BillingSettlementService,
    @Optional() private readonly repo?: PlatformEarningsRepository,
  ) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  private resolveMemoryDriverId(driverId: string): string {
    return this.memory.has(driverId)
      ? driverId
      : (DEMO_DRIVER_ALIASES[driverId] ?? driverId);
  }

  private resolvePeriodWindow(
    period?: DriverEarningsPeriod,
    referenceDate = new Date(),
  ): PlatformEarningsPeriodWindow | undefined {
    if (!period) {
      return undefined;
    }

    const end = new Date(referenceDate);
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);

    if (period === "today") {
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
      };
    }

    if (period === "week") {
      start.setUTCDate(start.getUTCDate() - 6);
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
      };
    }

    start.setUTCDate(1);

    return {
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
    };
  }

  async byPlatform(driverId: string): Promise<{
    driverId: string;
    items: PlatformEarningsItem[];
    notes: string[];
  }>;
  async byPlatform(
    driverId: string,
    period: DriverEarningsPeriod,
  ): Promise<{
    driverId: string;
    items: PlatformEarningsItem[];
    notes: string[];
  }>;
  async byPlatform(
    driverId: string,
    period?: DriverEarningsPeriod,
  ): Promise<{
    driverId: string;
    items: PlatformEarningsItem[];
    notes: string[];
  }> {
    const periodWindow = this.resolvePeriodWindow(period);
    if (this.dbEnabled()) {
      const items = await this.repo!.aggregateByDriver(driverId, periodWindow);
      return {
        driverId,
        items,
        notes: [
          "Aggregated from ops.phase1_platform_earnings_ledger when DB is configured.",
          ...(period ? [`period=${period}`] : []),
        ],
      };
    }

    const memoryDriverId = this.resolveMemoryDriverId(driverId);
    const bucket = this.memory.get(memoryDriverId) ?? [];
    if (!this.memory.has(memoryDriverId))
      this.memory.set(memoryDriverId, bucket);
    const filteredItems = bucket
      .filter((entry) => {
        if (!periodWindow) {
          return true;
        }
        return (
          entry.periodDate >= periodWindow.startDate &&
          entry.periodDate <= periodWindow.endDate
        );
      })
      .map((entry) => entry.item);

    return {
      driverId,
      items: aggregatePlatformItems(filteredItems),
      notes: [
        "In-memory runtime fallback seeded from the billing settlement demo drivers.",
        "Configure DATABASE_URL to enable DB-backed aggregation.",
        ...(period ? [`period=${period}`] : []),
      ],
    };
  }

  async summary(driverId: string): Promise<{
    driverId: string;
    totalGross: MoneyAmount;
    totalServiceFee: MoneyAmount;
    totalSubsidy: MoneyAmount;
    totalNet: MoneyAmount;
    notes: string[];
  }>;
  async summary(
    driverId: string,
    period: DriverEarningsPeriod,
  ): Promise<{
    driverId: string;
    totalGross: MoneyAmount;
    totalServiceFee: MoneyAmount;
    totalSubsidy: MoneyAmount;
    totalNet: MoneyAmount;
    notes: string[];
  }>;
  async summary(
    driverId: string,
    period?: DriverEarningsPeriod,
  ): Promise<{
    driverId: string;
    totalGross: MoneyAmount;
    totalServiceFee: MoneyAmount;
    totalSubsidy: MoneyAmount;
    totalNet: MoneyAmount;
    notes: string[];
  }> {
    const { items } = period
      ? await this.byPlatform(driverId, period)
      : await this.byPlatform(driverId);
    const currency = items[0]?.grossEarning?.currency ?? DEFAULT_CURRENCY;

    const sum = (
      pick: (i: PlatformEarningsItem) => MoneyAmount,
    ): MoneyAmount => {
      let total = 0;
      for (const item of items) total += pick(item)?.amountMinor ?? 0;
      return { currency, amountMinor: total };
    };

    return {
      driverId,
      totalGross: sum((item) => item.grossEarning),
      totalServiceFee: sum((item) => item.serviceFee),
      totalSubsidy: sum((item) => item.subsidy),
      totalNet: sum((item) => item.netAmount),
      notes: ["Summary totals are derived from the per-platform aggregation."],
    };
  }

  async dashboard(
    driverId: string,
    period: DriverEarningsPeriod,
  ): Promise<DriverEarningsDashboard> {
    const [summary, breakdown] = await Promise.all([
      this.summary(driverId, period),
      this.byPlatform(driverId, period),
    ]);
    const statements = (
      this.billingSettlementService?.listDriverStatements() ?? []
    ).filter((statement) => statement.driverId === driverId);
    const reconciliationIssues = (
      this.billingSettlementService?.listReconciliationIssues({
        status: "open",
      }) ?? []
    ).filter(
      (issue) =>
        issue.forwardedFinanceContext &&
        breakdown.items.some(
          (item) =>
            item.platformCode === issue.forwardedFinanceContext?.platformCode,
        ),
    );
    const currency =
      breakdown.items[0]?.netAmount.currency ??
      statements[0]?.netAmount.currency ??
      summary.totalNet.currency ??
      DEFAULT_CURRENCY;
    const pendingPayoutAmount = statements.reduce(
      (total, statement) =>
        statement.payoutStatus === "paid"
          ? total
          : total + statement.netAmount.amountMinor,
      0,
    );
    const emptyState =
      breakdown.items.length === 0 && statements.length === 0
        ? ({
            reason: "no_data",
            messageCode: "driver.earnings.no_data",
          } satisfies EmptyStateEnvelope)
        : null;
    const firstReconciliationIssue = reconciliationIssues[0] ?? null;

    return {
      driverId,
      period,
      refreshTier: "manual",
      refresh: {
        generatedAt: new Date().toISOString(),
        staleAfterMs: 15 * 60 * 1000,
        dataFreshness: "fresh",
        source: this.dbEnabled() ? "live" : "sandbox",
      },
      summary: {
        netAmount: summary.totalNet,
        grossAmount: summary.totalGross,
        serviceFeeAmount: summary.totalServiceFee,
        pendingPayoutAmount: {
          currency,
          amountMinor: pendingPayoutAmount,
        },
        platformCount: breakdown.items.length,
      },
      platformBreakdown: breakdown.items.map((item) =>
        this.toDashboardBreakdownItem(item),
      ),
      statements: statements
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((statement) => this.toStatementListItem(statement)),
      reconciliationIssue: firstReconciliationIssue
        ? this.toReconciliationIssueCard(firstReconciliationIssue)
        : null,
      emptyState,
      availableActions: [
        {
          action: "refresh_earnings",
          enabled: true,
          riskLevel: "low",
        },
      ],
      notes: [
        ...(summary.notes ?? []),
        ...(breakdown.notes ?? []),
        `period=${period}`,
      ],
    };
  }

  private toDashboardBreakdownItem(
    item: PlatformEarningsItem,
  ): DriverEarningsPlatformBreakdownItem {
    const registryEntry =
      PLATFORM_CODE_REGISTRY[
        item.platformCode as keyof typeof PLATFORM_CODE_REGISTRY
      ];
    const referenceOnly = registryEntry?.status === "forwarder_stub";
    const owned = !registryEntry;

    return {
      ...item,
      platformName: registryEntry?.displayName ?? item.platformCode,
      authorityLabel: owned
        ? "DRTS 結算"
        : referenceOnly
          ? "鏡像參考"
          : "平台結算",
      authorityTone: owned
        ? "owned"
        : referenceOnly
          ? "reference_only"
          : "external",
      referenceOnly,
      availableActions: [],
    };
  }

  private toStatementListItem(
    statement: DriverStatementRecord,
  ): DriverEarningsStatementListItem {
    return {
      statementId: statement.statementId,
      receiptNo: statement.receiptNo,
      periodMonth: statement.periodMonth,
      tripCount: statement.lines.length,
      feePlanVersion: statement.feePlanVersion,
      payoutStatus: statement.payoutStatus,
      grossEarning: statement.grossEarning,
      serviceFee: statement.serviceFee,
      subsidy: statement.subsidy,
      netAmount: statement.netAmount,
      availableActions: [
        {
          action: "view_statement_detail",
          enabled: true,
          riskLevel: "low",
        } satisfies ResourceActionDescriptor,
      ],
    };
  }

  private toReconciliationIssueCard(
    issue: ReconciliationIssueRecord,
  ): DriverEarningsReconciliationIssueCard {
    const platformCode = issue.forwardedFinanceContext?.platformCode;
    const reference =
      issue.externalOrderId ??
      issue.mirrorOrderId ??
      issue.orderId ??
      issue.issueId;

    return {
      issueId: issue.issueId,
      summary: "1 筆對帳差異",
      detail: `${platformCode ?? issue.channelKey} · ${reference} · 由派車台處理 · 非請款動作`,
      severity: "warning",
      availableActions: [
        {
          action: "open_manager_review",
          enabled: true,
          riskLevel: "low",
        },
      ],
      managerReviewLink: {
        targetApp: "ops-console",
        route: `/revenue/reconciliation?issueId=${encodeURIComponent(issue.issueId)}`,
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        openMode: "new_tab",
        label: "前往派車台覆核",
      },
    };
  }
}
