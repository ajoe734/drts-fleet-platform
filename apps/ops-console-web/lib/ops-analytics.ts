import type {
  AttendanceRecord,
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
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

export type RevenuePeriod = "today" | "yesterday" | "7d" | "30d";

export type RevenueChannelKey = "tenant" | "partner" | "phone" | "platform";

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
  ownedTrips: number;
  partnerTrips: number;
  queuedRevenueMinor: number;
  statementNetMinor: number;
  serviceBuckets: RevenueBreakdownRow[];
  vehicles: RevenueBreakdownRow[];
  channels: RevenueBreakdownRow[];
  payoutStatuses: Array<{
    status: DriverStatementRecord["payoutStatus"];
    count: number;
    netMinor: number;
  }>;
};

export type AttendanceView = "today" | "week" | "exceptions";

export type AttendanceAnomalyFilter =
  | "all"
  | "anomalous"
  | "absent"
  | "partial"
  | "abandoned"
  | "present";

export type AttendanceFilters = {
  view: AttendanceView;
  date: string | null;
  effectiveDate: string;
  driverId: string;
  anomaly: AttendanceAnomalyFilter;
};

export type AttendanceCanonicalRow = {
  rowKey: string;
  shiftId: string | null;
  attendanceId: string | null;
  date: string;
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  shiftStatus: ShiftRecord["status"] | null;
  attendanceStatus: AttendanceRecord["status"] | null;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  totalHours: number;
  startLocation: string | null;
  endLocation: string | null;
  isAnomalous: boolean;
  anomalyReason: "absent" | "partial" | "abandoned" | null;
};

export type AttendanceCanonicalView = {
  filters: AttendanceFilters;
  filtersActive: boolean;
  anchorDate: Date;
  dayStart: number;
  dayEnd: number;
  weekStart: number;
  weekEnd: number;
  rangeStart: number;
  rangeEnd: number;
  drivers: DriverRegistryRecord[];
  driversById: Map<string, DriverRegistryRecord>;
  todayShifts: ShiftRecord[];
  weekShifts: ShiftRecord[];
  scopeShifts: ShiftRecord[];
  scopeAttendance: AttendanceRecord[];
  filteredShifts: ShiftRecord[];
  filteredRows: AttendanceCanonicalRow[];
  scheduledDrivers: number;
  activeShifts: ShiftRecord[];
  completedShifts: ShiftRecord[];
  abandonedShifts: ShiftRecord[];
  absentCount: number;
  partialCount: number;
  exceptionCount: number;
  emptyReason: EmptyReason | null;
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

const REVENUE_PERIOD_KEYS: readonly RevenuePeriod[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
] as const;

const REVENUE_CHANNEL_ORDER: readonly RevenueChannelKey[] = [
  "platform",
  "partner",
  "phone",
  "tenant",
] as const;

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

function periodBounds(
  period: RevenuePeriod,
  reference = new Date(),
): { startMs: number; endMs: number } {
  const today = startOfToday(reference);
  const todayMs = today.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  switch (period) {
    case "today":
      return { startMs: todayMs, endMs: todayMs + dayMs };
    case "yesterday":
      return { startMs: todayMs - dayMs, endMs: todayMs };
    case "7d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { startMs: start.getTime(), endMs: todayMs + dayMs };
    }
    case "30d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { startMs: start.getTime(), endMs: todayMs + dayMs };
    }
  }
}

function matchesPeriod(
  timestamp: string | null | undefined,
  period: RevenuePeriod,
  reference = new Date(),
): boolean {
  if (!timestamp) return false;
  const { startMs, endMs } = periodBounds(period, reference);
  const ts = new Date(timestamp).getTime();
  return Number.isFinite(ts) && ts >= startMs && ts < endMs;
}

export function classifyOrderChannel(
  order: OwnedOrderRecord | null | undefined,
): RevenueChannelKey {
  if (!order) return "platform";
  if (order.businessDispatchSubtype === "enterprise_dispatch") return "tenant";
  if (order.partnerId) return "partner";
  if (order.orderSource === "phone") return "phone";
  return "platform";
}

export function formatRevenueBilledLabel(
  billedTemplate: string,
  periodLabel: string,
): string {
  if (billedTemplate.includes("(MTD)")) {
    return billedTemplate.replace("(MTD)", `(${periodLabel})`);
  }
  return `${billedTemplate} (${periodLabel})`;
}

export function resolveRevenueFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): RevenueFilters {
  const rawPeriod = firstSearchParam(searchParams?.period)?.trim();
  const period: RevenuePeriod = (
    REVENUE_PERIOD_KEYS as readonly string[]
  ).includes(rawPeriod ?? "")
    ? (rawPeriod as RevenuePeriod)
    : "7d";
  const rawServiceBucket = firstSearchParam(
    searchParams?.serviceBucket,
  )?.trim();
  const rawVehicleId = firstSearchParam(searchParams?.vehicleId)?.trim();
  return {
    period,
    serviceBucket:
      rawServiceBucket === "standard_taxi" ||
      rawServiceBucket === "business_dispatch"
        ? rawServiceBucket
        : "all",
    vehicleId:
      rawVehicleId && rawVehicleId.length > 0 && rawVehicleId !== "all"
        ? rawVehicleId
        : "all",
  };
}

function normalizeRevenueTask(
  task: DriverTaskRecord,
  ordersById: Map<string, OwnedOrderRecord>,
) {
  const order = ordersById.get(task.orderId);
  const hasActualFare = task.fare !== null && task.fare !== undefined;
  return {
    task,
    order,
    serviceBucket: order?.serviceBucket ?? null,
    channelKey: classifyOrderChannel(order),
    isPartner: Boolean(order?.partnerId),
    completedAt: task.completedAt,
    revenueMinor: hasActualFare
      ? toMinorAmount(task.fare)
      : toMinorAmount(order?.quotedFare ?? null),
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2).replace(/\.?0+$/, "")}`;
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
  const uniqueOrders: OwnedOrderRecord[] = [];
  const seenOrderIds = new Set<string>();
  for (const order of orders) {
    if (!order?.orderId || seenOrderIds.has(order.orderId)) {
      continue;
    }
    seenOrderIds.add(order.orderId);
    uniqueOrders.push(order);
  }
  const ordersById = new Map(
    uniqueOrders.map((order) => [order.orderId, order]),
  );

  const uniqueCompletedTasks: DriverTaskRecord[] = [];
  const seenTaskIds = new Set<string>();
  const seenCompletedOrderIds = new Set<string>();
  for (const task of tasks) {
    if (!task?.taskId || task.status !== "completed") {
      continue;
    }
    if (seenTaskIds.has(task.taskId)) {
      continue;
    }
    if (task.orderId && seenCompletedOrderIds.has(task.orderId)) {
      continue;
    }
    seenTaskIds.add(task.taskId);
    if (task.orderId) {
      seenCompletedOrderIds.add(task.orderId);
    }
    uniqueCompletedTasks.push(task);
  }

  const relevantTasks = uniqueCompletedTasks
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

  const queuedRevenueMinor = uniqueOrders
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
      if (!matchesPeriod(order.createdAt, filters.period, reference)) {
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
  const channelRows = new Map<RevenueChannelKey, RevenueBreakdownRow>();
  let ownedTrips = 0;
  let partnerTrips = 0;

  for (const entry of relevantTasks) {
    if (entry.isPartner) {
      partnerTrips += 1;
    } else {
      ownedTrips += 1;
    }

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

    const channelKey = entry.channelKey;
    const channelRow = channelRows.get(channelKey) ?? {
      key: channelKey,
      label: channelKey,
      trips: 0,
      revenueMinor: 0,
      averageMinor: 0,
    };
    channelRow.trips += 1;
    channelRow.revenueMinor += entry.revenueMinor;
    channelRows.set(channelKey, channelRow);
  }

  const uniqueStatements: DriverStatementRecord[] = [];
  const seenStatementIds = new Set<string>();
  for (const statement of statements) {
    if (!statement?.statementId || seenStatementIds.has(statement.statementId)) {
      continue;
    }
    seenStatementIds.add(statement.statementId);
    uniqueStatements.push(statement);
  }

  const statementNetMinor = uniqueStatements.reduce(
    (sum, statement) => sum + toMinorAmount(statement.netAmount),
    0,
  );
  const payoutStatusMap = new Map<
    DriverStatementRecord["payoutStatus"],
    { count: number; netMinor: number }
  >();
  for (const statement of uniqueStatements) {
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

  const channelPriority = new Map(
    REVENUE_CHANNEL_ORDER.map((key, index) => [key, index] as const),
  );
  const finalizedChannels = Array.from(channelRows.values())
    .map((row) => ({
      ...row,
      averageMinor:
        row.trips > 0 ? Math.round(row.revenueMinor / row.trips) : 0,
    }))
    .sort((left, right) => {
      if (right.revenueMinor !== left.revenueMinor) {
        return right.revenueMinor - left.revenueMinor;
      }
      return (
        (channelPriority.get(left.key as RevenueChannelKey) ?? 99) -
        (channelPriority.get(right.key as RevenueChannelKey) ?? 99)
      );
    });

  return {
    totalRevenueMinor,
    averageRevenueMinor,
    completedTrips,
    ownedTrips,
    partnerTrips,
    queuedRevenueMinor,
    statementNetMinor,
    serviceBuckets: finalizeRows(bucketRows),
    vehicles: finalizeRows(vehicleRows),
    channels: finalizedChannels,
    payoutStatuses: Array.from(payoutStatusMap.entries()).map(
      ([status, value]) => ({
        status,
        count: value.count,
        netMinor: value.netMinor,
      }),
    ),
  };
}

export function formatUtcDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseUtcDateString(
  rawDate: string | null | undefined,
): Date | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  if (!Number.isFinite(ms)) return null;
  const parsed = new Date(ms);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function resolveAttendanceView(
  value: string | null | undefined,
): AttendanceView {
  const normalized = value?.trim();
  if (normalized === "week" || normalized === "exceptions") {
    return normalized;
  }
  return "today";
}

export function resolveAttendanceAnomalyFilter(
  value: string | null | undefined,
): AttendanceAnomalyFilter {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "anomalous" ||
    normalized === "absent" ||
    normalized === "partial" ||
    normalized === "abandoned" ||
    normalized === "present"
  ) {
    return normalized;
  }
  if (
    normalized === "exceptions" ||
    normalized === "exception" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return "anomalous";
  }
  return "all";
}

export function resolveAttendanceFilters(
  searchParams?: Record<string, string | string[] | undefined>,
  reference = new Date(),
): AttendanceFilters {
  const view = resolveAttendanceView(firstSearchParam(searchParams?.view));
  const rawDate = firstSearchParam(searchParams?.date);
  const parsedDate = parseUtcDateString(rawDate);
  const date = parsedDate ? formatUtcDateString(parsedDate) : null;
  const effectiveDate = date ?? formatUtcDateString(reference);
  const rawDriver = (
    firstSearchParam(searchParams?.driverId) ??
    firstSearchParam(searchParams?.driver)
  )?.trim();
  const driverId =
    rawDriver && rawDriver.length > 0 && rawDriver !== "all"
      ? rawDriver
      : "all";
  const rawAnomaly =
    firstSearchParam(searchParams?.anomaly) ??
    firstSearchParam(searchParams?.status);
  const anomaly = resolveAttendanceAnomalyFilter(rawAnomaly);

  return {
    view,
    date,
    effectiveDate,
    driverId,
    anomaly,
  };
}

export function attendanceFiltersAreDefault(
  filters: AttendanceFilters,
): boolean {
  return (
    filters.view !== "exceptions" &&
    filters.date === null &&
    filters.driverId === "all" &&
    filters.anomaly === "all"
  );
}

export function buildAttendanceHref(
  filters: AttendanceFilters,
  overrides: Partial<{
    view: AttendanceView;
    date: string | null;
    driverId: string;
    anomaly: AttendanceAnomalyFilter;
  }> = {},
): string {
  const nextView = overrides.view ?? filters.view;
  const nextDate =
    "date" in overrides ? overrides.date ?? null : filters.date;
  const nextDriverId = overrides.driverId ?? filters.driverId;
  const nextAnomaly = overrides.anomaly ?? filters.anomaly;

  const params = new URLSearchParams();
  if (nextView !== "today") {
    params.set("view", nextView);
  }
  if (nextDate) {
    params.set("date", nextDate);
  }
  if (nextDriverId && nextDriverId !== "all") {
    params.set("driverId", nextDriverId);
  }
  if (nextAnomaly && nextAnomaly !== "all") {
    params.set("anomaly", nextAnomaly);
  }
  const query = params.toString();
  return query ? `/attendance?${query}` : "/attendance";
}

export function buildAttendanceExportHref(filters: AttendanceFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "today") {
    params.set("view", filters.view);
  }
  if (filters.date) {
    params.set("date", filters.date);
  }
  if (filters.driverId !== "all") {
    params.set("driverId", filters.driverId);
  }
  if (filters.anomaly !== "all") {
    params.set("anomaly", filters.anomaly);
  }
  const query = params.toString();
  return query ? `/attendance/export?${query}` : "/attendance/export";
}

function startOfUtcDayMs(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  );
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shiftIntersectsUtcRange(
  clockedInAt: string | null | undefined,
  clockedOutAt: string | null | undefined,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const startTime = parseTimestampMs(clockedInAt);
  if (startTime === null) {
    return false;
  }
  const endTime = parseTimestampMs(clockedOutAt) ?? rangeEnd;
  return startTime < rangeEnd && endTime >= rangeStart;
}

export function attendanceInUtcRange(
  record: AttendanceRecord,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const dateStart = Date.parse(`${record.date}T00:00:00.000Z`);
  return Number.isFinite(dateStart)
    ? dateStart >= rangeStart && dateStart < rangeEnd
    : false;
}

function computeShiftHours(
  clockedInAt: string | null | undefined,
  clockedOutAt: string | null | undefined,
): number {
  const startMs = parseTimestampMs(clockedInAt);
  const endMs = parseTimestampMs(clockedOutAt);
  if (startMs === null || endMs === null || endMs <= startMs) {
    return 0;
  }
  return Math.round(((endMs - startMs) / (60 * 60 * 1000)) * 100) / 100;
}

export function matchesAttendanceAnomalyFilter(
  row: Pick<
    AttendanceCanonicalRow,
    "shiftStatus" | "attendanceStatus" | "isAnomalous"
  >,
  anomaly: AttendanceAnomalyFilter,
  view: AttendanceView,
): boolean {
  if (anomaly === "all") {
    return view === "exceptions" ? row.isAnomalous : true;
  }
  switch (anomaly) {
    case "anomalous":
      return row.isAnomalous;
    case "absent":
      return row.attendanceStatus === "absent";
    case "partial":
      return row.attendanceStatus === "partial";
    case "abandoned":
      return row.shiftStatus === "abandoned";
    case "present":
      return (
        row.attendanceStatus === "present" ||
        (!row.isAnomalous &&
          (row.shiftStatus === "completed" || row.shiftStatus === "active"))
      );
  }
}

export function buildAttendanceCanonicalView(input: {
  shifts: ShiftRecord[];
  attendanceRecords: AttendanceRecord[];
  drivers: DriverRegistryRecord[];
  filters: AttendanceFilters;
  reference?: Date;
  ok?: boolean;
  errorCode?: string | null;
}): AttendanceCanonicalView {
  const reference = input.reference ?? new Date();
  const { filters } = input;
  const anchorDate =
    parseUtcDateString(filters.date) ?? new Date(startOfUtcDayMs(reference));
  const dayStart = startOfUtcDayMs(anchorDate);
  const dayEnd = dayStart + UTC_DAY_MS;
  const weekStart = dayStart - 6 * UTC_DAY_MS;
  const weekEnd = dayEnd;
  const rangeStart = filters.view === "week" ? weekStart : dayStart;
  const rangeEnd = filters.view === "week" ? weekEnd : dayEnd;

  const uniqueDrivers: DriverRegistryRecord[] = [];
  const seenDriverIds = new Set<string>();
  for (const driver of input.drivers) {
    if (!driver?.driverId || seenDriverIds.has(driver.driverId)) continue;
    seenDriverIds.add(driver.driverId);
    uniqueDrivers.push(driver);
  }
  const driversById = new Map(
    uniqueDrivers.map((driver) => [driver.driverId, driver]),
  );

  const uniqueShifts: ShiftRecord[] = [];
  const seenShiftIds = new Set<string>();
  for (const shift of input.shifts) {
    if (!shift?.shiftId || seenShiftIds.has(shift.shiftId)) continue;
    seenShiftIds.add(shift.shiftId);
    uniqueShifts.push(shift);
  }

  const uniqueAttendance: AttendanceRecord[] = [];
  const seenAttendanceIds = new Set<string>();
  for (const record of input.attendanceRecords) {
    if (!record?.attendanceId || seenAttendanceIds.has(record.attendanceId)) {
      continue;
    }
    seenAttendanceIds.add(record.attendanceId);
    uniqueAttendance.push(record);
  }

  const driverMatches = (driverId: string) =>
    filters.driverId === "all" || driverId === filters.driverId;

  const todayShifts = uniqueShifts.filter(
    (shift) =>
      driverMatches(shift.driverId) &&
      shiftIntersectsUtcRange(
        shift.clockedInAt,
        shift.clockedOutAt,
        dayStart,
        dayEnd,
      ),
  );
  const weekShifts = uniqueShifts.filter(
    (shift) =>
      driverMatches(shift.driverId) &&
      shiftIntersectsUtcRange(
        shift.clockedInAt,
        shift.clockedOutAt,
        weekStart,
        weekEnd,
      ),
  );
  const todayAttendance = uniqueAttendance.filter(
    (record) =>
      driverMatches(record.driverId) &&
      attendanceInUtcRange(record, dayStart, dayEnd),
  );
  const weekAttendance = uniqueAttendance.filter(
    (record) =>
      driverMatches(record.driverId) &&
      attendanceInUtcRange(record, weekStart, weekEnd),
  );

  const rawScopeShifts = filters.view === "week" ? weekShifts : todayShifts;
  const rawScopeAttendance =
    filters.view === "week" ? weekAttendance : todayAttendance;

  const attendanceByShiftId = new Map<string, AttendanceRecord>();
  for (const record of rawScopeAttendance) {
    if (record.shiftId && !attendanceByShiftId.has(record.shiftId)) {
      attendanceByShiftId.set(record.shiftId, record);
    }
  }

  const pairedAttendanceIds = new Set<string>();
  const joinedRows: AttendanceCanonicalRow[] = [];

  for (const shift of rawScopeShifts) {
    const linkedAttendance = attendanceByShiftId.get(shift.shiftId) ?? null;
    if (linkedAttendance) {
      pairedAttendanceIds.add(linkedAttendance.attendanceId);
    }
    const attendanceStatus = linkedAttendance?.status ?? null;
    const anomalyReason: AttendanceCanonicalRow["anomalyReason"] =
      attendanceStatus === "absent"
        ? "absent"
        : attendanceStatus === "partial"
          ? "partial"
          : shift.status === "abandoned"
            ? "abandoned"
            : null;
    const isAnomalous = anomalyReason !== null;
    const shiftTotalHours =
      linkedAttendance !== null &&
      typeof linkedAttendance.totalHours === "number" &&
      Number.isFinite(linkedAttendance.totalHours)
        ? linkedAttendance.totalHours
        : computeShiftHours(shift.clockedInAt, shift.clockedOutAt);

    joinedRows.push({
      rowKey: shift.shiftId,
      shiftId: shift.shiftId,
      attendanceId: linkedAttendance?.attendanceId ?? null,
      date: linkedAttendance?.date ?? shift.clockedInAt.slice(0, 10),
      driverId: shift.driverId,
      driverName: driversById.get(shift.driverId)?.name ?? shift.driverId,
      vehicleId: shift.vehicleId ?? null,
      shiftStatus: shift.status,
      attendanceStatus,
      clockedInAt: shift.clockedInAt ?? linkedAttendance?.clockedInAt ?? null,
      clockedOutAt:
        shift.clockedOutAt ?? linkedAttendance?.clockedOutAt ?? null,
      totalHours: shiftTotalHours,
      startLocation: shift.startLocation ?? null,
      endLocation: shift.endLocation ?? null,
      isAnomalous,
      anomalyReason,
    });
  }

  for (const record of rawScopeAttendance) {
    if (pairedAttendanceIds.has(record.attendanceId)) {
      continue;
    }
    const anomalyReason: AttendanceCanonicalRow["anomalyReason"] =
      record.status === "absent"
        ? "absent"
        : record.status === "partial"
          ? "partial"
          : null;
    const isAnomalous = anomalyReason !== null;
    const totalHours =
      typeof record.totalHours === "number" &&
      Number.isFinite(record.totalHours)
        ? record.totalHours
        : computeShiftHours(record.clockedInAt, record.clockedOutAt);

    joinedRows.push({
      rowKey: record.attendanceId,
      shiftId: record.shiftId ?? null,
      attendanceId: record.attendanceId,
      date: record.date,
      driverId: record.driverId,
      driverName: driversById.get(record.driverId)?.name ?? record.driverId,
      vehicleId: null,
      shiftStatus: null,
      attendanceStatus: record.status,
      clockedInAt: record.clockedInAt ?? null,
      clockedOutAt: record.clockedOutAt ?? null,
      totalHours,
      startLocation: null,
      endLocation: null,
      isAnomalous,
      anomalyReason,
    });
  }

  joinedRows.sort((left, right) => {
    const dateCmp = right.date.localeCompare(left.date);
    if (dateCmp !== 0) return dateCmp;
    const leftClock = left.clockedInAt ?? "";
    const rightClock = right.clockedInAt ?? "";
    const clockCmp = rightClock.localeCompare(leftClock);
    if (clockCmp !== 0) return clockCmp;
    return left.rowKey.localeCompare(right.rowKey);
  });

  const filteredRows = joinedRows.filter((row) =>
    matchesAttendanceAnomalyFilter(row, filters.anomaly, filters.view),
  );

  const rowByShiftId = new Map<string, AttendanceCanonicalRow>();
  for (const row of joinedRows) {
    if (row.shiftId) {
      rowByShiftId.set(row.shiftId, row);
    }
  }

  const scopeShifts =
    filters.anomaly === "all"
      ? rawScopeShifts
      : rawScopeShifts.filter((shift) => {
          const row = rowByShiftId.get(shift.shiftId);
          return row
            ? matchesAttendanceAnomalyFilter(row, filters.anomaly, "today")
            : false;
        });

  const scopeAttendance =
    filters.anomaly === "all"
      ? rawScopeAttendance
      : rawScopeAttendance.filter((record) => {
          const shiftRow = record.shiftId
            ? rowByShiftId.get(record.shiftId)
            : undefined;
          const row = shiftRow ?? {
            shiftStatus: null,
            attendanceStatus: record.status,
            isAnomalous:
              record.status === "absent" || record.status === "partial",
          };
          return matchesAttendanceAnomalyFilter(row, filters.anomaly, "today");
        });

  const filteredShiftIds = new Set(
    filteredRows
      .map((row) => row.shiftId)
      .filter((id): id is string => Boolean(id)),
  );
  const filteredShifts = rawScopeShifts.filter((shift) =>
    filteredShiftIds.has(shift.shiftId),
  );

  const scheduledDrivers = new Set(scopeShifts.map((shift) => shift.driverId))
    .size;
  const activeShifts = scopeShifts.filter((shift) => shift.status === "active");
  const completedShifts = scopeShifts.filter(
    (shift) => shift.status === "completed",
  );
  const abandonedShifts = scopeShifts.filter(
    (shift) => shift.status === "abandoned",
  );
  const absentCount = scopeAttendance.filter(
    (record) => record.status === "absent",
  ).length;
  const partialCount = scopeAttendance.filter(
    (record) => record.status === "partial",
  ).length;
  const exceptionCount = absentCount + partialCount;

  const filtersActive = !attendanceFiltersAreDefault(filters);
  const ok = input.ok ?? true;
  const isPermissionDenied =
    input.errorCode === "permission_denied" ||
    input.errorCode === "401" ||
    input.errorCode === "403";
  const provisioned =
    uniqueDrivers.length > 0 ||
    uniqueShifts.length > 0 ||
    uniqueAttendance.length > 0;

  let emptyReason: EmptyReason | null = null;
  if (!ok) {
    emptyReason = isPermissionDenied ? "permission_denied" : "fetch_failed";
  } else if (filteredRows.length === 0) {
    if (!provisioned && !filtersActive) {
      emptyReason = "not_provisioned";
    } else if (filtersActive) {
      emptyReason = "filtered_empty";
    } else {
      emptyReason = "no_data";
    }
  }

  return {
    filters,
    filtersActive,
    anchorDate,
    dayStart,
    dayEnd,
    weekStart,
    weekEnd,
    rangeStart,
    rangeEnd,
    drivers: uniqueDrivers,
    driversById,
    todayShifts:
      filters.anomaly === "all" ? todayShifts : filteredShifts,
    weekShifts,
    scopeShifts,
    scopeAttendance,
    filteredShifts,
    filteredRows,
    scheduledDrivers,
    activeShifts,
    completedShifts,
    abandonedShifts,
    absentCount,
    partialCount,
    exceptionCount,
    emptyReason,
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

export const ATTENDANCE_EXPORT_CSV_HEADERS = [
  "ShiftID",
  "AttendanceID",
  "Date",
  "DriverID",
  "DriverName",
  "VehicleID",
  "ShiftStatus",
  "AttendanceStatus",
  "AnomalyFlag",
  "ClockedInAt",
  "ClockedOutAt",
  "TotalHours",
  "StartLocation",
  "EndLocation",
] as const;

export function buildAttendanceExportCsv(
  rows: readonly AttendanceCanonicalRow[],
): string {
  const lines: string[] = [ATTENDANCE_EXPORT_CSV_HEADERS.join(",")];
  for (const row of rows) {
    const cells = [
      escapeCsvCell(row.shiftId ?? ""),
      escapeCsvCell(row.attendanceId ?? ""),
      escapeCsvCell(row.date),
      escapeCsvCell(row.driverId),
      escapeCsvCell(row.driverName),
      escapeCsvCell(row.vehicleId ?? ""),
      escapeCsvCell(row.shiftStatus ?? ""),
      escapeCsvCell(row.attendanceStatus ?? ""),
      escapeCsvCell(row.anomalyReason ?? "none"),
      escapeCsvCell(row.clockedInAt ?? ""),
      escapeCsvCell(row.clockedOutAt ?? ""),
      escapeCsvCell(row.totalHours),
      escapeCsvCell(row.startLocation ?? ""),
      escapeCsvCell(row.endLocation ?? ""),
    ];
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
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
