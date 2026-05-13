import { describe, expect, it } from "vitest";

import type {
  TenantQuotaLedgerEntry,
  TenantQuotaPolicyRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  type PersistTenantPartnerChanges,
  type TenantPartnerQueryExecutor,
  type TenantPartnerState,
  type TenantQuotaMonthlySnapshotRecord,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { toTenantQuotaPeriodKey } from "../../src/modules/tenant-partner/tenant-quota-ledger";

const TENANT_ID = "tenant-demo-001";
const COST_CENTER_CODE = "CC-FIN-04";
const RESERVATION_WINDOW_START = "2026-05-13T10:00:00.000Z";
const PERIOD_KEY = toTenantQuotaPeriodKey(RESERVATION_WINDOW_START);
const CONCURRENCY = 10;

type QuotaRepositoryState = Pick<
  TenantPartnerState,
  "quotaPolicies" | "quotaLedger" | "quotaMonthlySnapshots"
>;

type QuotaReserveResult = {
  ledgerEntries: TenantQuotaLedgerEntry[];
};

type ContentionStats = {
  transactionCount: number;
  maxConcurrentTransactions: number;
  lockWaitCount: number;
};

type RepositoryTransaction = {
  id: number;
  pendingQuotaLedger: Map<string, TenantQuotaLedgerEntry>;
  pendingQuotaMonthlySnapshots: Map<string, TenantQuotaMonthlySnapshotRecord>;
  heldLocks: Set<string>;
  waitedForContention: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeByKey<T>(
  current: readonly T[],
  incoming: readonly T[] | undefined,
  keyOf: (value: T) => string,
) {
  const merged = new Map(current.map((value) => [keyOf(value), clone(value)]));
  for (const value of incoming ?? []) {
    merged.set(keyOf(value), clone(value));
  }
  return [...merged.values()];
}

function createEmptyRepositoryState(
  state?: Partial<QuotaRepositoryState>,
): TenantPartnerState {
  return {
    notificationPreferences: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    slaProfiles: [],
    partnerEntries: [],
    partnerIngressCredentials: [],
    partnerEligibilityVerifications: [],
    approvalRules: [],
    approvalRequests: [],
    approvalDecisions: [],
    passengers: [],
    addresses: [],
    costCenters: [],
    quotaPolicies: clone(state?.quotaPolicies ?? []),
    quotaLedger: clone(state?.quotaLedger ?? []),
    quotaMonthlySnapshots: clone(state?.quotaMonthlySnapshots ?? []),
    userRoles: [],
    apiKeys: [],
  };
}

function quotaPolicyKey(
  record: Pick<
    TenantQuotaPolicyRecord,
    "tenantId" | "costCenterCode" | "period"
  >,
) {
  return `${record.tenantId}:${record.costCenterCode ?? "~"}:${record.period}`;
}

function quotaSnapshotKey(
  snapshot: Pick<
    TenantQuotaMonthlySnapshotRecord,
    "tenantId" | "costCenterCode" | "period" | "periodKey"
  >,
) {
  return `${snapshot.tenantId}:${snapshot.costCenterCode ?? "~"}:${snapshot.period}:${snapshot.periodKey}`;
}

function quotaPolicyLockKey(
  record: Pick<
    TenantQuotaPolicyRecord,
    "tenantId" | "costCenterCode" | "period"
  >,
) {
  return `policy:${quotaPolicyKey(record)}`;
}

function quotaSnapshotLockKey(
  snapshot: Pick<
    TenantQuotaMonthlySnapshotRecord,
    "tenantId" | "costCenterCode" | "period" | "periodKey"
  >,
) {
  return `snapshot:${quotaSnapshotKey(snapshot)}`;
}

class ContendedQuotaRepository {
  private state: QuotaRepositoryState = {
    quotaPolicies: [],
    quotaLedger: [],
    quotaMonthlySnapshots: [],
  };

  private readonly transactions = new WeakMap<
    TenantPartnerQueryExecutor,
    RepositoryTransaction
  >();

  private readonly lockOwners = new Map<string, number>();

  private readonly lockQueues = new Map<string, Array<() => void>>();

  private readonly contentionReady: Promise<void>;

  private releaseContentionReady: (() => void) | null = null;

  private nextTransactionId = 1;

  private startedTransactions = 0;

  private activeTransactions = 0;

  private contentionLeaderId: number | null = null;

  private readonly stats: ContentionStats = {
    transactionCount: 0,
    maxConcurrentTransactions: 0,
    lockWaitCount: 0,
  };

  constructor(private readonly expectedConcurrency: number) {
    this.contentionReady = new Promise<void>((resolve) => {
      this.releaseContentionReady = resolve;
    });
  }

  isEnabled() {
    return true;
  }

  async loadState(): Promise<TenantPartnerState> {
    return createEmptyRepositoryState(this.state);
  }

  async persistChanges(changes: PersistTenantPartnerChanges) {
    this.state.quotaPolicies = mergeByKey(
      this.state.quotaPolicies,
      changes.quotaPolicies,
      quotaPolicyKey,
    );
    this.state.quotaLedger = mergeByKey(
      this.state.quotaLedger,
      changes.quotaLedger,
      (entry) => entry.ledgerEntryId,
    );
    this.state.quotaMonthlySnapshots = mergeByKey(
      this.state.quotaMonthlySnapshots,
      changes.quotaMonthlySnapshots,
      quotaSnapshotKey,
    );
  }

  reportPersistenceFailure(error: unknown, context?: string) {
    void error;
    void context;
  }

  async withTransaction<T>(
    work: (executor: TenantPartnerQueryExecutor) => Promise<T>,
  ) {
    const executor: TenantPartnerQueryExecutor = {
      query: async () => {
        throw new Error(
          "Query execution is not implemented in the load-test double.",
        );
      },
    };
    const tx: RepositoryTransaction = {
      id: this.nextTransactionId++,
      pendingQuotaLedger: new Map(),
      pendingQuotaMonthlySnapshots: new Map(),
      heldLocks: new Set(),
      waitedForContention: false,
    };
    this.transactions.set(executor, tx);
    this.startedTransactions += 1;
    this.activeTransactions += 1;
    this.stats.transactionCount += 1;
    this.stats.maxConcurrentTransactions = Math.max(
      this.stats.maxConcurrentTransactions,
      this.activeTransactions,
    );
    if (this.startedTransactions >= this.expectedConcurrency) {
      this.releaseContentionReady?.();
      this.releaseContentionReady = null;
    }

    try {
      const result = await work(executor);
      this.commitTransaction(tx);
      return result;
    } finally {
      this.activeTransactions -= 1;
      this.releaseLocks(tx);
      this.transactions.delete(executor);
    }
  }

  async loadQuotaPoliciesForUpdate(
    tx: TenantPartnerQueryExecutor,
    tenantId: string,
    costCenterCode: string | null,
  ) {
    const scopedPolicies = this.listQuotaPolicies(tenantId, costCenterCode);
    await this.lockRows(
      tx,
      scopedPolicies.map((record) => quotaPolicyLockKey(record)),
    );
    await this.waitForContenders(this.requireTransaction(tx));
    return clone(this.listQuotaPolicies(tenantId, costCenterCode));
  }

  async ensureQuotaMonthlySnapshots(
    tx: TenantPartnerQueryExecutor,
    snapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    const transaction = this.requireTransaction(tx);
    const visibleSnapshots = this.visibleQuotaSnapshots(transaction);

    for (const snapshot of snapshots) {
      const key = quotaSnapshotKey(snapshot);
      if (!visibleSnapshots.has(key)) {
        const staged = clone(snapshot);
        transaction.pendingQuotaMonthlySnapshots.set(key, staged);
        visibleSnapshots.set(key, staged);
      }
    }
  }

  async loadQuotaMonthlySnapshotsForUpdate(
    tx: TenantPartnerQueryExecutor,
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
  ) {
    const transaction = this.requireTransaction(tx);
    await this.lockRows(
      tx,
      this.listVisibleQuotaSnapshots(
        transaction,
        tenantId,
        costCenterCode,
        periodKey,
      ).map((snapshot) => quotaSnapshotLockKey(snapshot)),
    );

    return clone(
      this.listVisibleQuotaSnapshots(
        transaction,
        tenantId,
        costCenterCode,
        periodKey,
      ),
    );
  }

  async persistQuotaReservation(
    tx: TenantPartnerQueryExecutor,
    changes: {
      quotaLedger?: readonly TenantQuotaLedgerEntry[];
      quotaMonthlySnapshots?: readonly TenantQuotaMonthlySnapshotRecord[];
    },
  ) {
    const transaction = this.requireTransaction(tx);

    for (const entry of changes.quotaLedger ?? []) {
      transaction.pendingQuotaLedger.set(entry.ledgerEntryId, clone(entry));
    }
    for (const snapshot of changes.quotaMonthlySnapshots ?? []) {
      transaction.pendingQuotaMonthlySnapshots.set(
        quotaSnapshotKey(snapshot),
        clone(snapshot),
      );
    }
  }

  getState() {
    return clone(this.state);
  }

  getStats(): ContentionStats {
    return { ...this.stats };
  }

  private requireTransaction(
    tx: TenantPartnerQueryExecutor,
  ): RepositoryTransaction {
    const transaction = this.transactions.get(tx);
    if (!transaction) {
      throw new Error("Missing transaction context for contention test.");
    }
    return transaction;
  }

  private listQuotaPolicies(tenantId: string, costCenterCode: string | null) {
    return this.state.quotaPolicies.filter((record) => {
      if (record.tenantId !== tenantId || record.period !== "monthly") {
        return false;
      }

      return (
        record.costCenterCode === null ||
        (costCenterCode !== null && record.costCenterCode === costCenterCode)
      );
    });
  }

  private visibleQuotaSnapshots(transaction: RepositoryTransaction) {
    const visible = new Map(
      this.state.quotaMonthlySnapshots.map((snapshot) => [
        quotaSnapshotKey(snapshot),
        clone(snapshot),
      ]),
    );

    for (const [key, snapshot] of transaction.pendingQuotaMonthlySnapshots) {
      visible.set(key, clone(snapshot));
    }

    return visible;
  }

  private listVisibleQuotaSnapshots(
    transaction: RepositoryTransaction,
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
  ) {
    return [...this.visibleQuotaSnapshots(transaction).values()].filter(
      (snapshot) => {
        if (
          snapshot.tenantId !== tenantId ||
          snapshot.period !== "monthly" ||
          snapshot.periodKey !== periodKey
        ) {
          return false;
        }

        return (
          snapshot.costCenterCode === null ||
          (costCenterCode !== null &&
            snapshot.costCenterCode === costCenterCode)
        );
      },
    );
  }

  private async waitForContenders(transaction: RepositoryTransaction) {
    if (transaction.waitedForContention || this.expectedConcurrency <= 1) {
      return;
    }

    transaction.waitedForContention = true;
    if (this.contentionLeaderId === null) {
      this.contentionLeaderId = transaction.id;
    }
    if (
      this.contentionLeaderId === transaction.id &&
      this.startedTransactions < this.expectedConcurrency
    ) {
      await this.contentionReady;
    }
  }

  private async lockRows(
    tx: TenantPartnerQueryExecutor,
    lockKeys: readonly string[],
  ) {
    const transaction = this.requireTransaction(tx);
    for (const key of [...lockKeys].sort()) {
      await this.acquireLock(transaction, key);
    }
  }

  private async acquireLock(transaction: RepositoryTransaction, key: string) {
    if (transaction.heldLocks.has(key)) {
      return;
    }

    while (true) {
      const ownerId = this.lockOwners.get(key);
      if (ownerId === undefined || ownerId === transaction.id) {
        this.lockOwners.set(key, transaction.id);
        transaction.heldLocks.add(key);
        return;
      }

      this.stats.lockWaitCount += 1;
      await new Promise<void>((resolve) => {
        const queue = this.lockQueues.get(key) ?? [];
        queue.push(resolve);
        this.lockQueues.set(key, queue);
      });
    }
  }

  private releaseLocks(transaction: RepositoryTransaction) {
    for (const key of transaction.heldLocks) {
      if (this.lockOwners.get(key) === transaction.id) {
        this.lockOwners.delete(key);
      }

      const queue = this.lockQueues.get(key);
      const next = queue?.shift();
      if (!queue || queue.length === 0) {
        this.lockQueues.delete(key);
      } else {
        this.lockQueues.set(key, queue);
      }
      next?.();
    }
  }

  private commitTransaction(transaction: RepositoryTransaction) {
    this.state.quotaLedger = mergeByKey(
      this.state.quotaLedger,
      [...transaction.pendingQuotaLedger.values()],
      (entry) => entry.ledgerEntryId,
    );
    this.state.quotaMonthlySnapshots = mergeByKey(
      this.state.quotaMonthlySnapshots,
      [...transaction.pendingQuotaMonthlySnapshots.values()],
      quotaSnapshotKey,
    );
  }
}

function createService() {
  const repository = new ContendedQuotaRepository(CONCURRENCY);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository as never,
  );

  return { repository, service };
}

function createReleaseGate() {
  let release: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    wait: () => ready,
    release: () => release?.(),
  };
}

async function runConcurrentReserves(
  service: TenantPartnerService,
  scenarioKey: string,
  input: {
    tenantId: string;
    costCenterCode?: string | null;
    estimatedAmountMinor?: number | null;
    currency?: string;
  },
) {
  const gate = createReleaseGate();
  const attempts = Array.from({ length: CONCURRENCY }, (_, index) =>
    (async () => {
      await gate.wait();
      return service.reserveTenantQuota({
        tenantId: input.tenantId,
        bookingId: `${scenarioKey}-booking-${index + 1}`,
        evaluationId: `${scenarioKey}-eval-${index + 1}`,
        reservationWindowStart: RESERVATION_WINDOW_START,
        ...(input.costCenterCode !== undefined
          ? { costCenterCode: input.costCenterCode }
          : {}),
        ...(input.estimatedAmountMinor !== undefined
          ? { estimatedAmountMinor: input.estimatedAmountMinor }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      }) as Promise<QuotaReserveResult>;
    })(),
  );

  gate.release();
  return Promise.allSettled(attempts);
}

function fulfilledResults(results: PromiseSettledResult<QuotaReserveResult>[]) {
  return results.filter(
    (result): result is PromiseFulfilledResult<QuotaReserveResult> =>
      result.status === "fulfilled",
  );
}

function extractQuotaErrors(
  results: PromiseSettledResult<QuotaReserveResult>[],
) {
  return results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map((result) => {
      expect(result.reason).toBeInstanceOf(ApiRequestError);
      const response = (result.reason as ApiRequestError).getResponse() as {
        error: {
          code: string;
          details?: Record<string, unknown>;
        };
      };

      expect(response.error.code).toBe("QUOTA_INSUFFICIENT_AT_COMMIT");
      return response.error;
    });
}

function uniqueBookingIds(entries: readonly TenantQuotaLedgerEntry[]) {
  return [...new Set(entries.map((entry) => entry.bookingId))];
}

function expectRealContention(repository: ContendedQuotaRepository) {
  const stats = repository.getStats();

  expect(stats.transactionCount).toBe(CONCURRENCY);
  expect(stats.maxConcurrentTransactions).toBe(CONCURRENCY);
  expect(stats.lockWaitCount).toBeGreaterThanOrEqual(CONCURRENCY - 1);
}

describe("tenant quota concurrent reserve load", () => {
  it("lets exactly one caller claim the last booking-count unit", async () => {
    const { repository, service } = createService();

    service.upsertTenantQuotaPolicy(TENANT_ID, {
      period: "monthly",
      limit: {
        bookingCountLimit: 1,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const results = await runConcurrentReserves(service, "booking-count", {
      tenantId: TENANT_ID,
    });
    const winners = fulfilledResults(results);
    const quotaErrors = extractQuotaErrors(results);
    const winnerBookingId = winners[0]!.value.ledgerEntries[0]!.bookingId;
    const serviceLedger = service.listTenantQuotaLedger(TENANT_ID, {
      periodKey: PERIOD_KEY,
    });
    const repositoryState = repository.getState();
    const summary = service.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    );

    expect(winners).toHaveLength(1);
    expect(quotaErrors).toHaveLength(9);
    expect(serviceLedger).toHaveLength(1);
    expect(serviceLedger[0]).toMatchObject({
      bookingId: winnerBookingId,
      costCenterCode: null,
      dimension: "booking_count",
      entryType: "reserve",
      periodKey: PERIOD_KEY,
    });
    expect(repositoryState.quotaLedger).toHaveLength(1);
    expect(uniqueBookingIds(repositoryState.quotaLedger)).toEqual([
      winnerBookingId,
    ]);
    expect(repositoryState.quotaMonthlySnapshots).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        costCenterCode: null,
        periodKey: PERIOD_KEY,
        usage: expect.objectContaining({
          bookingCountReserved: 1,
        }),
      }),
    ]);
    expect(summary.usage.bookingCountReserved).toBe(1);
    expectRealContention(repository);
  });

  it("lets exactly one caller reserve the final amount_minor capacity", async () => {
    const { repository, service } = createService();

    service.upsertTenantQuotaPolicy(TENANT_ID, {
      period: "monthly",
      limit: {
        bookingCountLimit: null,
        amountMinorLimit: 100,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const results = await runConcurrentReserves(service, "amount-minor", {
      tenantId: TENANT_ID,
      estimatedAmountMinor: 100,
      currency: "TWD",
    });
    const winners = fulfilledResults(results);
    const quotaErrors = extractQuotaErrors(results);
    const winnerBookingId = winners[0]!.value.ledgerEntries[0]!.bookingId;
    const serviceLedger = service.listTenantQuotaLedger(TENANT_ID, {
      periodKey: PERIOD_KEY,
    });
    const repositoryState = repository.getState();
    const summary = service.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    );

    expect(winners).toHaveLength(1);
    expect(quotaErrors).toHaveLength(9);
    expect(quotaErrors.map((error) => error.details?.dimension)).toStrictEqual(
      Array(9).fill("amount_minor"),
    );
    expect(serviceLedger).toHaveLength(2);
    expect(
      serviceLedger.filter((entry) => entry.dimension === "booking_count"),
    ).toHaveLength(1);
    expect(
      serviceLedger.filter((entry) => entry.dimension === "amount_minor"),
    ).toHaveLength(1);
    expect(repositoryState.quotaLedger).toHaveLength(2);
    expect(uniqueBookingIds(repositoryState.quotaLedger)).toEqual([
      winnerBookingId,
    ]);
    expect(repositoryState.quotaMonthlySnapshots).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        costCenterCode: null,
        periodKey: PERIOD_KEY,
        usage: expect.objectContaining({
          bookingCountReserved: 1,
          amountMinorReserved: 100,
        }),
      }),
    ]);
    expect(summary.usage.bookingCountReserved).toBe(1);
    expect(summary.usage.amountMinorReserved).toBe(100);
    expectRealContention(repository);
  });

  it("prefers the tenant hard block over a cost-center warn-only policy", async () => {
    const { repository, service } = createService();

    service.upsertTenantQuotaPolicy(TENANT_ID, {
      period: "monthly",
      limit: {
        bookingCountLimit: 1,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });
    service.upsertTenantQuotaPolicy(TENANT_ID, {
      costCenterCode: COST_CENTER_CODE,
      period: "monthly",
      limit: {
        bookingCountLimit: 1,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "warn_only",
      },
    });

    const results = await runConcurrentReserves(service, "mixed-scope", {
      tenantId: TENANT_ID,
      costCenterCode: COST_CENTER_CODE,
    });
    const winners = fulfilledResults(results);
    const quotaErrors = extractQuotaErrors(results);
    const winnerBookingId = winners[0]!.value.ledgerEntries[0]!.bookingId;
    const serviceLedger = service.listTenantQuotaLedger(TENANT_ID, {
      periodKey: PERIOD_KEY,
    });
    const repositoryState = repository.getState();
    const tenantSummary = service.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    );
    const costCenterSummary = service.getCostCenterQuotaSummary(
      TENANT_ID,
      COST_CENTER_CODE,
      RESERVATION_WINDOW_START,
    );

    expect(winners).toHaveLength(1);
    expect(quotaErrors).toHaveLength(9);
    expect(
      quotaErrors.map((error) => error.details?.costCenterCode),
    ).toStrictEqual(Array(9).fill(null));
    expect(serviceLedger).toHaveLength(2);
    expect(
      serviceLedger.filter(
        (entry) =>
          entry.dimension === "booking_count" && entry.costCenterCode === null,
      ),
    ).toHaveLength(1);
    expect(
      serviceLedger.filter(
        (entry) =>
          entry.dimension === "booking_count" &&
          entry.costCenterCode === COST_CENTER_CODE,
      ),
    ).toHaveLength(1);
    expect(repositoryState.quotaLedger).toHaveLength(2);
    expect(uniqueBookingIds(repositoryState.quotaLedger)).toEqual([
      winnerBookingId,
    ]);
    expect(repositoryState.quotaMonthlySnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: TENANT_ID,
          costCenterCode: null,
          periodKey: PERIOD_KEY,
          usage: expect.objectContaining({
            bookingCountReserved: 1,
          }),
        }),
        expect.objectContaining({
          tenantId: TENANT_ID,
          costCenterCode: COST_CENTER_CODE,
          periodKey: PERIOD_KEY,
          usage: expect.objectContaining({
            bookingCountReserved: 1,
          }),
        }),
      ]),
    );
    expect(tenantSummary.usage.bookingCountReserved).toBe(1);
    expect(costCenterSummary.limit.enforcementMode).toBe("warn_only");
    expect(costCenterSummary.usage.bookingCountReserved).toBe(1);
    expectRealContention(repository);
  });
});
