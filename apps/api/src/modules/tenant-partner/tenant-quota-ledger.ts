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
