import { createHash } from "node:crypto";
import type {
  TenantBookingQuotaImpactResult,
  TenantQuotaLedgerEntry,
  TenantQuotaLimit,
  TenantQuotaUsage,
} from "@drts/contracts";

export type TenantQuotaSnapshotRecord = {
  tenantId: string;
  costCenterCode: string | null;
  period: "monthly";
  periodKey: string;
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
  refreshedAt: string;
};

export type TenantQuotaScope = "tenant" | "cost_center";

export type TenantQuotaReservationState = {
  costCenterCode: string | null;
  reservationWindowStart: string;
  estimatedAmountMinor: number;
};

export type TenantQuotaLifecycleEntrySpec = Pick<
  TenantQuotaLedgerEntry,
  "costCenterCode" | "periodKey" | "dimension" | "amount" | "entryType"
>;

export function toTenantQuotaPeriodKey(
  reservationWindowStart: string,
  timeZone = "Asia/Taipei",
) {
  const date = new Date(reservationWindowStart);
  if (Number.isNaN(date.getTime())) {
    throw new Error("reservationWindowStart must be a valid ISO-8601 datetime");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Unable to derive quota period key");
  }

  return `${year}-${month}`;
}

export function createEmptyTenantQuotaUsage(
  limit: TenantQuotaLimit,
): TenantQuotaUsage {
  return materializeUsage(limit, {
    pendingReservedBookingCount: 0,
    confirmedBookingCount: 0,
    pendingReservedAmountMinor: 0,
    confirmedAmountMinor: 0,
  });
}

export function materializeUsage(
  limit: TenantQuotaLimit,
  usage: Pick<
    TenantQuotaUsage,
    | "pendingReservedBookingCount"
    | "confirmedBookingCount"
    | "pendingReservedAmountMinor"
    | "confirmedAmountMinor"
  >,
): TenantQuotaUsage {
  const totalBookingUsage =
    usage.pendingReservedBookingCount + usage.confirmedBookingCount;
  const totalAmountUsage =
    usage.pendingReservedAmountMinor + usage.confirmedAmountMinor;
  const bookingCountRemaining =
    limit.bookingCountLimit === null
      ? null
      : limit.bookingCountLimit - totalBookingUsage;
  const amountMinorRemaining =
    limit.amountMinorLimit === null
      ? null
      : limit.amountMinorLimit - totalAmountUsage;

  const remainingPercent =
    limit.amountMinorLimit === null
      ? limit.bookingCountLimit === null
        ? null
        : percentage(bookingCountRemaining, limit.bookingCountLimit)
      : percentage(amountMinorRemaining, limit.amountMinorLimit);

  return {
    ...usage,
    bookingCountRemaining,
    amountMinorRemaining,
    remainingPercent,
  };
}

type QuotaUsageMutable = {
  pendingReservedBookingCount: number;
  confirmedBookingCount: number;
  pendingReservedAmountMinor: number;
  confirmedAmountMinor: number;
};

export function applyLedgerEntryToUsage(
  usage: TenantQuotaUsage,
  limit: TenantQuotaLimit,
  entry: Pick<TenantQuotaLedgerEntry, "dimension" | "amount" | "entryType">,
): TenantQuotaUsage {
  const next: QuotaUsageMutable = {
    pendingReservedBookingCount: usage.pendingReservedBookingCount,
    confirmedBookingCount: usage.confirmedBookingCount,
    pendingReservedAmountMinor: usage.pendingReservedAmountMinor,
    confirmedAmountMinor: usage.confirmedAmountMinor,
  };

  if (entry.dimension === "booking_count") {
    applyDimensionMutation(
      next,
      "pendingReservedBookingCount",
      "confirmedBookingCount",
      entry.entryType,
      entry.amount,
    );
  } else {
    applyDimensionMutation(
      next,
      "pendingReservedAmountMinor",
      "confirmedAmountMinor",
      entry.entryType,
      entry.amount,
    );
  }

  return materializeUsage(limit, next);
}

export function rebuildSnapshotUsage(
  entries: readonly TenantQuotaLedgerEntry[],
  limit: TenantQuotaLimit,
) {
  return entries.reduce(
    (usage, entry) => applyLedgerEntryToUsage(usage, limit, entry),
    createEmptyTenantQuotaUsage(limit),
  );
}

export function buildQuotaImpact(params: {
  scope: TenantQuotaScope;
  costCenterCode: string | null;
  periodKey: string;
  dimension: "booking_count" | "amount_minor";
  delta: number;
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
}): TenantBookingQuotaImpactResult {
  const remainingBefore =
    params.dimension === "booking_count"
      ? params.usage.bookingCountRemaining
      : params.usage.amountMinorRemaining;
  const limitValue =
    params.dimension === "booking_count"
      ? params.limit.bookingCountLimit
      : params.limit.amountMinorLimit;
  const remainingAfter =
    remainingBefore === null ? null : remainingBefore - params.delta;
  const remainingPercentAfter =
    limitValue === null ? null : percentage(remainingAfter, limitValue);

  return {
    scope: params.scope,
    costCenterCode: params.costCenterCode,
    periodKey: params.periodKey,
    dimension: params.dimension,
    remainingBefore,
    delta: params.delta,
    remainingAfter,
    limitValue,
    remainingPercentAfter,
    enforcementMode: params.limit.enforcementMode,
    triggered: computeTriggered(params.limit.enforcementMode, remainingAfter),
  };
}

export function computeTriggered(
  enforcementMode: TenantQuotaLimit["enforcementMode"],
  remainingAfter: number | null,
): TenantBookingQuotaImpactResult["triggered"] {
  if (remainingAfter === null || remainingAfter >= 0) {
    return "none";
  }
  if (enforcementMode === "warn_only") {
    return "warn";
  }
  if (enforcementMode === "require_approval") {
    return "approval";
  }
  return "block";
}

export function buildQuotaLifecycleEntrySpecs(params: {
  current: TenantQuotaReservationState | null;
  next: TenantQuotaReservationState | null;
  transition: "reserve" | "update" | "cancel" | "consume";
}): TenantQuotaLifecycleEntrySpec[] {
  if (params.transition === "reserve") {
    return params.next ? buildReservationEntries(params.next, "reserve") : [];
  }
  if (params.transition === "cancel") {
    return params.current
      ? buildReservationEntries(params.current, "release")
      : [];
  }
  if (params.transition === "consume") {
    return params.current
      ? buildReservationEntries(params.current, "consume")
      : [];
  }
  if (!params.current || !params.next) {
    return [];
  }

  const currentPeriodKey = toTenantQuotaPeriodKey(
    params.current.reservationWindowStart,
  );
  const nextPeriodKey = toTenantQuotaPeriodKey(
    params.next.reservationWindowStart,
  );
  const currentCostCenterCode = params.current.costCenterCode ?? null;
  const nextCostCenterCode = params.next.costCenterCode ?? null;

  if (
    currentPeriodKey !== nextPeriodKey ||
    currentCostCenterCode !== nextCostCenterCode
  ) {
    return [
      ...buildReservationEntries(params.current, "release"),
      ...buildReservationEntries(params.next, "reserve"),
    ];
  }

  const delta =
    params.next.estimatedAmountMinor - params.current.estimatedAmountMinor;
  if (delta === 0) {
    return [];
  }

  return buildScopeVariants(nextCostCenterCode).map((scopeCostCenterCode) => ({
    costCenterCode: scopeCostCenterCode,
    periodKey: nextPeriodKey,
    dimension: "amount_minor",
    amount: delta,
    entryType: "adjust",
  }));
}

function applyDimensionMutation(
  target: QuotaUsageMutable,
  reservedKey: keyof QuotaUsageMutable,
  consumedKey: keyof QuotaUsageMutable,
  entryType: TenantQuotaLedgerEntry["entryType"],
  amount: number,
) {
  if (entryType === "reserve" || entryType === "adjust") {
    target[reservedKey] += amount;
    return;
  }

  if (entryType === "release") {
    target[reservedKey] -= amount;
    return;
  }

  target[reservedKey] -= amount;
  target[consumedKey] += amount;
}

function percentage(remaining: number | null, limit: number) {
  if (remaining === null) {
    return null;
  }
  if (limit <= 0) {
    return remaining > 0 ? 100 : 0;
  }
  return Math.max(0, Math.round((Math.max(0, remaining) / limit) * 100));
}

function buildReservationEntries(
  state: TenantQuotaReservationState,
  entryType: TenantQuotaLedgerEntry["entryType"],
): TenantQuotaLifecycleEntrySpec[] {
  const periodKey = toTenantQuotaPeriodKey(state.reservationWindowStart);
  return buildScopeVariants(state.costCenterCode).flatMap(
    (scopeCostCenterCode) => {
      const entries: TenantQuotaLifecycleEntrySpec[] = [
        {
          costCenterCode: scopeCostCenterCode,
          periodKey,
          dimension: "booking_count",
          amount: 1,
          entryType,
        },
      ];
      if (state.estimatedAmountMinor !== 0) {
        entries.push({
          costCenterCode: scopeCostCenterCode,
          periodKey,
          dimension: "amount_minor",
          amount: state.estimatedAmountMinor,
          entryType,
        });
      }
      return entries;
    },
  );
}

function buildScopeVariants(costCenterCode: string | null) {
  return costCenterCode === null ? [null] : [null, costCenterCode];
}

export function buildQuotaReleaseLedgerEntryId(input: {
  tenantId: string;
  bookingId: string;
  costCenterCode: string | null;
  periodKey: string;
  dimension: TenantQuotaLedgerEntry["dimension"];
}): string {
  const digest = createHash("sha256")
    .update(input.tenantId)
    .update("\u0000")
    .update(input.bookingId)
    .update("\u0000")
    .update(input.costCenterCode ?? "__tenant__")
    .update("\u0000")
    .update(input.periodKey)
    .update("\u0000")
    .update(input.dimension)
    .digest("hex");

  return `quota-ledger-release-${digest.slice(0, 32)}`;
}

export function buildQuotaReleaseEntries(params: {
  tenantId: string;
  bookingId: string;
  sourceEntries: readonly TenantQuotaLedgerEntry[];
}): TenantQuotaLedgerEntry[] {
  const outstanding = new Map<
    string,
    {
      costCenterCode: string | null;
      periodKey: string;
      dimension: TenantQuotaLedgerEntry["dimension"];
      amount: number;
      evaluationId: string;
    }
  >();

  const bookingEntries = params.sourceEntries
    .filter(
      (entry) =>
        entry.tenantId === params.tenantId &&
        entry.bookingId === params.bookingId,
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.ledgerEntryId.localeCompare(right.ledgerEntryId),
    );

  for (const entry of bookingEntries) {
    const key = `${entry.costCenterCode ?? "__tenant__"}:${entry.periodKey}:${entry.dimension}`;
    const current = outstanding.get(key) ?? {
      costCenterCode: entry.costCenterCode,
      periodKey: entry.periodKey,
      dimension: entry.dimension,
      amount: 0,
      evaluationId: entry.evaluationId,
    };
    const direction =
      entry.entryType === "reserve" || entry.entryType === "adjust" ? 1 : -1;
    current.amount += direction * entry.amount;
    current.evaluationId = entry.evaluationId;
    outstanding.set(key, current);
  }

  const now = new Date().toISOString();
  return [...outstanding.values()]
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({
      ledgerEntryId: buildQuotaReleaseLedgerEntryId({
        tenantId: params.tenantId,
        bookingId: params.bookingId,
        costCenterCode: entry.costCenterCode,
        periodKey: entry.periodKey,
        dimension: entry.dimension,
      }),
      tenantId: params.tenantId,
      bookingId: params.bookingId,
      evaluationId: entry.evaluationId,
      costCenterCode: entry.costCenterCode,
      periodKey: entry.periodKey,
      dimension: entry.dimension,
      amount: entry.amount,
      entryType: "release" as const,
      createdAt: now,
    }));
}

export function releaseTenantQuotaInMemory(
  service: any,
  input: { tenantId: string; bookingId: string },
): { ledgerEntries: TenantQuotaLedgerEntry[] } {
  const sourceEntries: TenantQuotaLedgerEntry[] = service.quotaLedger ?? [];
  const entries = buildQuotaReleaseEntries({
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    sourceEntries,
  });

  if (entries.length === 0) {
    return { ledgerEntries: [] };
  }

  let updatedSnapshots: any[] = [];
  if (typeof service.applyQuotaLedgerEntries === "function") {
    updatedSnapshots = service.applyQuotaLedgerEntries(input.tenantId, entries);
  } else if (typeof service.applyQuotaLedgerEntriesToSnapshots === "function") {
    const snapshots = Array.from(
      (service.quotaMonthlySnapshots?.values() ?? []) as any[],
    );
    updatedSnapshots = service.applyQuotaLedgerEntriesToSnapshots(
      input.tenantId,
      entries,
      snapshots,
      (costCenterCode: string | null) =>
        service.resolveQuotaPolicy(input.tenantId, costCenterCode),
    );
    for (const snapshot of updatedSnapshots) {
      const key = `${snapshot.tenantId}:${snapshot.costCenterCode ?? "null"}:${snapshot.period}:${snapshot.periodKey}`;
      service.quotaMonthlySnapshots?.set(key, { ...snapshot });
    }
  } else {
    for (const entry of entries) {
      const policy = service.resolveQuotaPolicy
        ? service.resolveQuotaPolicy(input.tenantId, entry.costCenterCode)
        : null;
      const limit = policy?.limit ?? {
        bookingCountLimit: null,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "hard_block",
      };
      const key = `${input.tenantId}:${entry.costCenterCode ?? "null"}:monthly:${entry.periodKey}`;
      const snapshot = service.quotaMonthlySnapshots?.get(key) ?? {
        tenantId: input.tenantId,
        costCenterCode: entry.costCenterCode,
        period: "monthly",
        periodKey: entry.periodKey,
        limit,
        usage: createEmptyTenantQuotaUsage(limit),
        refreshedAt: new Date().toISOString(),
      };
      snapshot.usage = applyLedgerEntryToUsage(snapshot.usage, limit, entry);
      snapshot.refreshedAt = entry.createdAt;
      service.quotaMonthlySnapshots?.set(key, snapshot);
      updatedSnapshots.push(snapshot);
    }
  }

  if (typeof service.applyQuotaReservationCommit === "function") {
    service.applyQuotaReservationCommit(entries, updatedSnapshots);
  } else {
    service.quotaLedger = [
      ...entries.map((entry) => ({ ...entry })),
      ...(service.quotaLedger ?? []),
    ];
  }

  if (typeof service.persistChanges === "function") {
    service.persistChanges(
      {
        quotaLedger: entries.map((entry) => ({ ...entry })),
        quotaMonthlySnapshots: updatedSnapshots.map((snapshot) => ({
          ...snapshot,
          limit: { ...snapshot.limit },
          usage: { ...snapshot.usage },
        })),
      },
      "release tenant quota",
    );
  }

  if (typeof service.recordQuotaReservationAudits === "function") {
    service.recordQuotaReservationAudits(
      input.tenantId,
      entries,
      updatedSnapshots,
    );
  }

  return {
    ledgerEntries: entries.map((entry) => ({ ...entry })),
  };
}

export async function prepareTenantQuotaRelease(
  service: any,
  executor: any,
  input: { tenantId: string; bookingId: string },
) {
  const existingEntries =
    await service.tenantPartnerRepository.loadQuotaLedgerForBookingForUpdate(
      executor,
      input.tenantId,
      input.bookingId,
    );
  const entries = buildQuotaReleaseEntries({
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    sourceEntries: existingEntries,
  });

  if (entries.length === 0) {
    return {
      tenantId: input.tenantId,
      ledgerEntries: [],
      updatedSnapshots: [],
      auditEntries: [],
    };
  }

  const claimedEntries =
    await service.tenantPartnerRepository.claimQuotaLedgerEntries(
      executor,
      entries,
    );

  if (claimedEntries.length === 0) {
    return {
      tenantId: input.tenantId,
      ledgerEntries: [],
      updatedSnapshots: [],
      auditEntries: [],
    };
  }

  const snapshotGroups = new Map<
    string,
    { costCenterCode: string | null; periodKey: string }
  >();
  for (const entry of claimedEntries) {
    const key = `${entry.costCenterCode ?? "__tenant__"}:${entry.periodKey}`;
    snapshotGroups.set(key, {
      costCenterCode: entry.costCenterCode,
      periodKey: entry.periodKey,
    });
  }

  const lockedSnapshots = (
    await Promise.all(
      [...snapshotGroups.values()].map((group) =>
        service.tenantPartnerRepository.loadQuotaMonthlySnapshotsForUpdate(
          executor,
          input.tenantId,
          group.costCenterCode,
          group.periodKey,
        ),
      ),
    )
  ).flat();

  const uniqueSnapshots = new Map<string, any>();
  for (const snapshot of lockedSnapshots) {
    const key = `${snapshot.tenantId}:${snapshot.costCenterCode ?? "null"}:${snapshot.period}:${snapshot.periodKey}`;
    uniqueSnapshots.set(key, snapshot);
  }

  const updatedSnapshots = service.applyQuotaLedgerEntriesToSnapshots(
    input.tenantId,
    claimedEntries,
    [...uniqueSnapshots.values()],
    (costCenterCode: string | null) =>
      service.resolveQuotaPolicy(input.tenantId, costCenterCode),
  );

  await service.tenantPartnerRepository.persistQuotaReservation(executor, {
    quotaMonthlySnapshots: updatedSnapshots,
  });

  const auditEntries =
    typeof service.buildQuotaReservationAuditEntries === "function"
      ? service.buildQuotaReservationAuditEntries(
          input.tenantId,
          claimedEntries,
          updatedSnapshots,
        )
      : [];

  return {
    tenantId: input.tenantId,
    ledgerEntries: claimedEntries.map((entry: any) => ({ ...entry })),
    updatedSnapshots: updatedSnapshots.map((snapshot: any) => ({
      ...snapshot,
      limit: { ...snapshot.limit },
      usage: { ...snapshot.usage },
    })),
    auditEntries,
  };
}

export async function releaseTenantQuotaWithDatabase(
  service: any,
  input: { tenantId: string; bookingId: string },
) {
  const committed = await service.tenantPartnerRepository.withTransaction(
    (executor: any) => prepareTenantQuotaRelease(service, executor, input),
  );

  applyCommittedQuotaRelease(service, committed);
  if (typeof service.recordQuotaAuditEntries === "function") {
    service.recordQuotaAuditEntries(committed.auditEntries);
  }

  return {
    ledgerEntries: committed.ledgerEntries.map((entry: any) => ({ ...entry })),
  };
}

export function applyCommittedQuotaRelease(service: any, committed: any) {
  if (
    !committed ||
    !committed.ledgerEntries ||
    committed.ledgerEntries.length === 0
  ) {
    return;
  }

  if (typeof service.applyQuotaReservationCommit === "function") {
    service.applyQuotaReservationCommit(
      committed.ledgerEntries,
      committed.updatedSnapshots,
    );
  } else {
    service.quotaLedger = [
      ...committed.ledgerEntries.map((entry: any) => ({ ...entry })),
      ...(service.quotaLedger ?? []),
    ];
    for (const snapshot of committed.updatedSnapshots ?? []) {
      const key = `${snapshot.tenantId}:${snapshot.costCenterCode ?? "null"}:${snapshot.period}:${snapshot.periodKey}`;
      service.quotaMonthlySnapshots?.set(key, { ...snapshot });
    }
  }
}

export function releaseTenantQuota(
  service: any,
  txOrInput: any,
  maybeInput?: any,
):
  | { ledgerEntries: TenantQuotaLedgerEntry[] }
  | Promise<{ ledgerEntries: TenantQuotaLedgerEntry[] }> {
  const tx = maybeInput ? txOrInput : null;
  const input = maybeInput ?? txOrInput;

  if (service?.tenantPartnerRepository?.isEnabled()) {
    if (tx) {
      return prepareTenantQuotaRelease(service, tx, input).then(
        (committed: any) => ({
          ledgerEntries: committed.ledgerEntries.map((entry: any) => ({
            ...entry,
          })),
        }),
      );
    }
    return releaseTenantQuotaWithDatabase(service, input);
  }

  return releaseTenantQuotaInMemory(service, input);
}

export function installTenantQuotaRelease(target: any) {
  const proto = target?.prototype ?? target;
  if (!proto) return;
  if (typeof proto.releaseTenantQuota === "function") return;

  proto.releaseTenantQuota = function (txOrInput: any, maybeInput?: any) {
    return releaseTenantQuota(this, txOrInput, maybeInput);
  };

  proto.prepareTenantQuotaRelease = function (tx: any, input: any) {
    return prepareTenantQuotaRelease(this, tx, input);
  };

  proto.applyCommittedQuotaRelease = function (committed: any) {
    return applyCommittedQuotaRelease(this, committed);
  };
}

declare module "./tenant-partner.service" {
  interface TenantPartnerService {
    releaseTenantQuota(
      tx: any,
      input: { tenantId: string; bookingId: string },
    ): Promise<{ ledgerEntries: TenantQuotaLedgerEntry[] }>;
    releaseTenantQuota(input: {
      tenantId: string;
      bookingId: string;
    }):
      | { ledgerEntries: TenantQuotaLedgerEntry[] }
      | Promise<{ ledgerEntries: TenantQuotaLedgerEntry[] }>;
    prepareTenantQuotaRelease(
      tx: any,
      input: { tenantId: string; bookingId: string },
    ): Promise<{
      tenantId: string;
      ledgerEntries: TenantQuotaLedgerEntry[];
      updatedSnapshots: any[];
      auditEntries: any[];
    }>;
    applyCommittedQuotaRelease(committed: any): void;
  }
}

