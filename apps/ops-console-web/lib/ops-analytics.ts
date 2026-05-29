import type {
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  IncidentRecord,
  MaintenanceRecord,
  OwnedOrderRecord,
  ReportJobRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

type MoneyLike = {
  amountMinor: number;
  currency: string;
} | null;

export type RevenuePeriod = "today" | "yesterday" | "7d" | "30d" | "all";

export type RevenueFilters = {
  period: RevenuePeriod;
  serviceBucket: OwnedOrderRecord["serviceBucket"] | "all";
  vehicleId: string | "all";
};

export type RevenueBreakdownRow = {
  key: string;
  label: string;
  trips: number;
  revenueMinor: number;
  averageMinor: number;
};

export type RevenueInsights = {
  totalRevenueMinor: number;
  averageRevenueMinor: number;
  completedTrips: number;
  queuedRevenueMinor: number;
  statementNetMinor: number;
  serviceBuckets: RevenueBreakdownRow[];
  vehicles: RevenueBreakdownRow[];
  payoutStatuses: Array<{
    status: DriverStatementRecord["payoutStatus"];
    count: number;
    netMinor: number;
  }>;
};

export type DashboardTrendPoint = {
  date: string;
  label: string;
  completedTrips: number;
  revenueMinor: number;
  createdOrders: number;
  incidents: number;
};

const ACTIVE_ORDER_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "redispatch_required",
  "dispatch_failed",
  "exception_hold",
]);

const PENDING_DISPATCH_JOB_STATUSES = new Set<DispatchJobRecord["status"]>([
  "matching",
  "reserved",
  "queued",
  "redispatch_required",
]);

const OPEN_INCIDENT_STATUSES = new Set<IncidentRecord["status"]>([
  "open",
  "investigating",
]);

function toMinorAmount(value: MoneyLike): number {
  return value?.amountMinor ?? 0;
}

function bucketDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function startOfToday(reference = new Date()): Date {
  const copy = new Date(reference);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function periodStart(
  period: RevenuePeriod,
  reference = new Date(),
): Date | null {
  if (period === "all") return null;
  const base = startOfToday(reference);
  if (period === "yesterday") {
    base.setDate(base.getDate() - 1);
    return base;
  }
  const days = period === "today" ? 0 : period === "7d" ? 6 : 29;
  base.setDate(base.getDate() - days);
  return base;
}

function matchesPeriod(
  timestamp: string | null | undefined,
  period: RevenuePeriod,
  reference = new Date(),
): boolean {
  if (!timestamp) return false;
  if (period === "yesterday") {
    const start = periodStart(period, reference);
    const end = startOfToday(reference);
    if (!start) return false;
    const value = new Date(timestamp).getTime();
    return value >= start.getTime() && value < end.getTime();
  }
  const start = periodStart(period, reference);
  if (!start) return true;
  return new Date(timestamp).getTime() >= start.getTime();
}

function normalizeRevenueTask(
  task: DriverTaskRecord,
  ordersById: Map<string, OwnedOrderRecord>,
) {
  const order = ordersById.get(task.orderId);
  return {
    task,
    order,
    serviceBucket: order?.serviceBucket ?? null,
    completedAt: task.completedAt,
    revenueMinor:
      toMinorAmount(task.fare) || toMinorAmount(order?.quotedFare ?? null),
  };
}

export function formatMinorCurrency(
  amountMinor: number,
  currency = "TWD",
): string {
  try {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(0)}`;
  }
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function isMaintenanceOverdue(record: MaintenanceRecord): boolean {
  if (record.status === "overdue") return true;
  if (record.status === "completed" || record.status === "cancelled") {
    return false;
  }
  if (!record.scheduledAt) return false;
  return new Date(record.scheduledAt).getTime() < Date.now();
}

export function buildDispatchInsights(
  orders: OwnedOrderRecord[],
  dispatchJobs: DispatchJobRecord[],
) {
  const queueJobs = dispatchJobs.filter((job) =>
    PENDING_DISPATCH_JOB_STATUSES.has(job.status),
  );
  const etaValues = queueJobs
    .map((job) => job.latestEtaMinutes)
    .filter((eta): eta is number => typeof eta === "number");
  const queuedRevenueMinor = orders
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status))
    .reduce((sum, order) => sum + toMinorAmount(order.quotedFare), 0);

  return {
    activeOrders: orders.filter((order) =>
      ACTIVE_ORDER_STATUSES.has(order.status),
    ).length,
    queueDepth: queueJobs.length,
    redispatchOrders: orders.filter(
      (order) =>
        order.status === "redispatch_required" ||
        order.status === "dispatch_timeout",
    ).length,
    exceptionOrders: orders.filter(
      (order) =>
        order.status === "exception_hold" ||
        order.status === "no_supply" ||
        order.status === "delayed_queue",
    ).length,
    averageEtaMinutes:
      etaValues.length > 0
        ? Math.round(
            etaValues.reduce((sum, value) => sum + value, 0) / etaValues.length,
          )
        : null,
    queuedRevenueMinor,
  };
}

export function buildRevenueInsights(
  orders: OwnedOrderRecord[],
  tasks: DriverTaskRecord[],
  statements: DriverStatementRecord[],
  filters: RevenueFilters,
  reference = new Date(),
): RevenueInsights {
  const ordersById = new Map(orders.map((order) => [order.orderId, order]));
  const relevantTasks = tasks
    .filter((task) => task.status === "completed")
    .map((task) => normalizeRevenueTask(task, ordersById))
    .filter((entry) => {
      if (!matchesPeriod(entry.completedAt, filters.period, reference)) {
        return false;
      }
      if (
        filters.serviceBucket !== "all" &&
        entry.serviceBucket !== filters.serviceBucket
      ) {
        return false;
      }
      if (
        filters.vehicleId !== "all" &&
        entry.task.vehicleId !== filters.vehicleId
      ) {
        return false;
      }
      return true;
    });

  const totalRevenueMinor = relevantTasks.reduce(
    (sum, entry) => sum + entry.revenueMinor,
    0,
  );
  const completedTrips = relevantTasks.length;
  const averageRevenueMinor =
    completedTrips > 0 ? Math.round(totalRevenueMinor / completedTrips) : 0;

  const queuedRevenueMinor = orders
    .filter((order) => {
      if (!ACTIVE_ORDER_STATUSES.has(order.status)) {
        return false;
      }
      if (
        filters.serviceBucket !== "all" &&
        order.serviceBucket !== filters.serviceBucket
      ) {
        return false;
      }
      if (
        filters.period !== "all" &&
        !matchesPeriod(order.createdAt, filters.period)
      ) {
        return false;
      }
      if (filters.vehicleId === "all") {
        return true;
      }
      return relevantTasks.some(
        (entry) => entry.task.orderId === order.orderId,
      );
    })
    .reduce((sum, order) => sum + toMinorAmount(order.quotedFare), 0);

  const bucketRows = new Map<string, RevenueBreakdownRow>();
  const vehicleRows = new Map<string, RevenueBreakdownRow>();

  for (const entry of relevantTasks) {
    const bucketKey = entry.serviceBucket ?? "unmapped";
    const bucketRow = bucketRows.get(bucketKey) ?? {
      key: bucketKey,
      label: bucketKey.replace(/_/g, " "),
      trips: 0,
      revenueMinor: 0,
      averageMinor: 0,
    };
    bucketRow.trips += 1;
    bucketRow.revenueMinor += entry.revenueMinor;
    bucketRows.set(bucketKey, bucketRow);

    const vehicleKey = entry.task.vehicleId;
    const vehicleRow = vehicleRows.get(vehicleKey) ?? {
      key: vehicleKey,
      label: vehicleKey,
      trips: 0,
      revenueMinor: 0,
      averageMinor: 0,
    };
    vehicleRow.trips += 1;
    vehicleRow.revenueMinor += entry.revenueMinor;
    vehicleRows.set(vehicleKey, vehicleRow);
  }

  const statementNetMinor = statements.reduce(
    (sum, statement) => sum + toMinorAmount(statement.netAmount),
    0,
  );
  const payoutStatusMap = new Map<
    DriverStatementRecord["payoutStatus"],
    { count: number; netMinor: number }
  >();
  for (const statement of statements) {
    const current = payoutStatusMap.get(statement.payoutStatus) ?? {
      count: 0,
      netMinor: 0,
    };
    current.count += 1;
    current.netMinor += toMinorAmount(statement.netAmount);
    payoutStatusMap.set(statement.payoutStatus, current);
  }

  const finalizeRows = (rows: Map<string, RevenueBreakdownRow>) =>
    Array.from(rows.values())
      .map((row) => ({
        ...row,
        averageMinor:
          row.trips > 0 ? Math.round(row.revenueMinor / row.trips) : 0,
      }))
      .sort((left, right) => right.revenueMinor - left.revenueMinor);

  return {
    totalRevenueMinor,
    averageRevenueMinor,
    completedTrips,
    queuedRevenueMinor,
    statementNetMinor,
    serviceBuckets: finalizeRows(bucketRows),
    vehicles: finalizeRows(vehicleRows),
    payoutStatuses: Array.from(payoutStatusMap.entries()).map(
      ([status, value]) => ({
        status,
        count: value.count,
        netMinor: value.netMinor,
      }),
    ),
  };
}

export function buildDashboardTrend(
  orders: OwnedOrderRecord[],
  tasks: DriverTaskRecord[],
  incidents: IncidentRecord[],
  reference = new Date(),
): DashboardTrendPoint[] {
  const today = startOfToday(reference);
  const points: DashboardTrendPoint[] = [];

  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - index);
    const key = day.toISOString().slice(0, 10);
    const label = `${day.getMonth() + 1}/${day.getDate()}`;
    const dayTasks = tasks.filter(
      (task) =>
        task.status === "completed" && bucketDate(task.completedAt) === key,
    );
    points.push({
      date: key,
      label,
      completedTrips: dayTasks.length,
      revenueMinor: dayTasks.reduce(
        (sum, task) => sum + toMinorAmount(task.fare),
        0,
      ),
      createdOrders: orders.filter(
        (order) => bucketDate(order.createdAt) === key,
      ).length,
      incidents: incidents.filter(
        (incident) => bucketDate(incident.createdAt) === key,
      ).length,
    });
  }

  return points;
}

export function buildOperationsOverview(input: {
  vehicles: VehicleRegistryRecord[];
  drivers: DriverRegistryRecord[];
  shifts: ShiftRecord[];
  incidents: IncidentRecord[];
  maintenance: MaintenanceRecord[];
  reportJobs: ReportJobRecord[];
}) {
  const activeShifts = input.shifts.filter(
    (shift) => shift.status === "active",
  );
  const onlineDrivers =
    activeShifts.length > 0
      ? activeShifts.length
      : input.drivers.filter((driver) => driver.workState === "available")
          .length;

  return {
    dispatchableVehicles: input.vehicles.filter(
      (vehicle) =>
        vehicle.dispatchableFlag &&
        vehicle.exclusivityApproved &&
        vehicle.insuranceStatus === "valid",
    ).length,
    offlineVehicles: input.vehicles.filter(
      (vehicle) =>
        !vehicle.dispatchableFlag || vehicle.insuranceStatus !== "valid",
    ).length,
    onlineDrivers,
    openIncidents: input.incidents.filter((incident) =>
      OPEN_INCIDENT_STATUSES.has(incident.status),
    ).length,
    overdueMaintenance: input.maintenance.filter((record) =>
      isMaintenanceOverdue(record),
    ).length,
    failedReports: input.reportJobs.filter((job) => job.status === "failed")
      .length,
  };
}
