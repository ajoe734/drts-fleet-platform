import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  DriverLocationSnapshot,
  DriverRegistryRecord,
  DriverTaskRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type DriversPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type DriverFilter = "all" | "eligible" | "on_duty" | "offline";
type LocationState = "live" | "stale" | "missing" | "unknown";

type DriverRow = Record<string, unknown> & {
  driverId: string;
  detailHref: string;
  name: string;
  driverMetaLabel: string;
  vehicleLabel: string;
  workStateLabel: string;
  workStateTone: CanvasTone;
  shiftLabel: string;
  shiftHint: string;
  licenseLabel: string;
  licenseTone: CanvasTone;
  exclusivityLabel: string;
  exclusivityTone: CanvasTone;
  hasExclusivity: boolean;
  ratingLabel: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;

const WORK_STATE_PRIORITY: Record<DriverRegistryRecord["workState"], number> = {
  available: 0,
  reserved: 1,
  enroute: 2,
  arrived: 3,
  on_trip: 4,
  paused: 5,
  incident_hold: 6,
  suspended: 7,
  offline: 8,
};

const TASK_STATUS_PRIORITY: Record<DriverTaskRecord["status"], number> = {
  on_trip: 0,
  arrived_pickup: 1,
  enroute_pickup: 2,
  accepted: 3,
  pending_acceptance: 4,
  proof_pending: 5,
  completed: 6,
  rejected: 7,
  cancelled: 8,
};

const SHIFT_STATUS_PRIORITY: Record<ShiftRecord["status"], number> = {
  active: 0,
  completed: 1,
  abandoned: 2,
};

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const cellStackStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.92fr)",
  gap: 16,
  marginTop: 16,
};

const secondaryTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.4,
  whiteSpace: "normal" as const,
};

const monoSecondaryTextStyle = {
  ...secondaryTextStyle,
  fontFamily: theme.monoFamily,
};

const driverLinkStyle: CSSProperties = {
  color: theme.text,
  textDecoration: "none",
  fontWeight: 600,
};

const emptyStateStyle = {
  padding: "24px 16px",
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center" as const,
};

async function loadWithError<T>(
  loader: () => Promise<T>,
  locale: Locale,
  fallback: T,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: fallback,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
    };
  }
}

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilter(value: string | undefined): DriverFilter {
  switch (value) {
    case "eligible":
    case "on_duty":
    case "offline":
      return value;
    default:
      return "all";
  }
}

function buildDriversHref(filter: DriverFilter) {
  if (filter === "all") {
    return "/drivers";
  }

  return `/drivers?filter=${filter}`;
}

function buildFilterItems(locale: Locale) {
  return [
    { key: "all" as const, label: t("common.all", locale) },
    {
      key: "eligible" as const,
      label: t("drivers.col.dispatchEligible", locale),
    },
    {
      key: "on_duty" as const,
      label: locale === "zh" ? "在班" : "On duty",
    },
    {
      key: "offline" as const,
      label: formatOpsCodeLabel(locale, "offline"),
    },
  ];
}

function buildTabLinks(locale: Locale, activeFilter: DriverFilter) {
  const items = buildFilterItems(locale);

  const tabs = items.map((item) => (
    <Link
      key={item.key}
      href={buildDriversHref(item.key)}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {item.label}
    </Link>
  ));

  const activeIndex = items.findIndex((item) => item.key === activeFilter);
  return {
    active: tabs[activeIndex] ?? tabs[0],
    tabs,
  };
}

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
      matchPaths: ["/drivers"],
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return true;
  }

  const recordedAt = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recordedAt)) {
    return true;
  }

  return Date.now() - recordedAt > STALE_LOCATION_THRESHOLD_MS;
}

function resolveLocationState(
  snapshot: DriverLocationSnapshot | undefined,
  locationsErrored: boolean,
): LocationState {
  if (locationsErrored) {
    return "unknown";
  }
  if (!snapshot) {
    return "missing";
  }
  if (isLocationStale(snapshot)) {
    return "stale";
  }
  return "live";
}

function workStateTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  if (workState === "available") return "success";
  if (
    workState === "reserved" ||
    workState === "enroute" ||
    workState === "arrived" ||
    workState === "on_trip"
  ) {
    return "info";
  }
  if (workState === "paused") return "warn";
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger";
  }
  return "neutral";
}

function locationLabel(state: LocationState, locale: Locale) {
  if (state === "live") return t("drivers.list.locationLive", locale);
  if (state === "stale") return t("drivers.list.locationStale", locale);
  if (state === "missing") return t("drivers.list.locationMissing", locale);
  return t("drivers.list.locationUnknown", locale);
}

function formatClockTime(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function bindingLabel(locale: Locale, count: number) {
  return locale === "zh"
    ? `${count} 個裝置綁定`
    : `${count} device binding${count === 1 ? "" : "s"}`;
}

function formatShiftLabel(locale: Locale, shift: ShiftRecord | undefined) {
  if (!shift) {
    return t("common.dash", locale);
  }

  const start = formatClockTime(locale, shift.clockedInAt);
  const end = shift.clockedOutAt
    ? formatClockTime(locale, shift.clockedOutAt)
    : "LIVE";

  return `${start}-${end}`;
}

function matchesFilter(driver: DriverRegistryRecord, filter: DriverFilter) {
  if (filter === "eligible") {
    return driver.dispatchEligible;
  }
  if (filter === "on_duty") {
    return driver.workState !== "offline";
  }
  if (filter === "offline") {
    return driver.workState === "offline";
  }
  return true;
}

function sortDrivers(left: DriverRegistryRecord, right: DriverRegistryRecord) {
  const leftPriority = WORK_STATE_PRIORITY[left.workState] ?? 99;
  const rightPriority = WORK_STATE_PRIORITY[right.workState] ?? 99;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.name.localeCompare(right.name);
}

function driverTaskTimestamp(task: DriverTaskRecord) {
  return (
    task.completedAt ??
    task.startedAt ??
    task.arrivedPickupAt ??
    task.departedAt ??
    task.acceptedAt ??
    null
  );
}

function shiftTimestamp(shift: ShiftRecord) {
  return shift.updatedAt ?? shift.clockedOutAt ?? shift.clockedInAt;
}

function sortDriverTasks(left: DriverTaskRecord, right: DriverTaskRecord) {
  const leftPriority = TASK_STATUS_PRIORITY[left.status] ?? 99;
  const rightPriority = TASK_STATUS_PRIORITY[right.status] ?? 99;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (
    new Date(driverTaskTimestamp(right) ?? 0).getTime() -
    new Date(driverTaskTimestamp(left) ?? 0).getTime()
  );
}

function sortShifts(left: ShiftRecord, right: ShiftRecord) {
  const leftPriority = SHIFT_STATUS_PRIORITY[left.status] ?? 99;
  const rightPriority = SHIFT_STATUS_PRIORITY[right.status] ?? 99;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (
    new Date(shiftTimestamp(right)).getTime() -
    new Date(shiftTimestamp(left)).getTime()
  );
}

function resolveVehicleId(
  task: DriverTaskRecord | undefined,
  shift: ShiftRecord | undefined,
) {
  return task?.vehicleId ?? shift?.vehicleId ?? null;
}

function resolveExclusivity(
  locale: Locale,
  vehicleId: string | null,
  vehicleById: Map<string, VehicleRegistryRecord>,
) {
  if (!vehicleId) {
    return {
      label: t("common.dash", locale),
      tone: "neutral" as CanvasTone,
      hasExclusivity: false,
    };
  }

  const vehicle = vehicleById.get(vehicleId);
  if (!vehicle) {
    return {
      label: t("common.dash", locale),
      tone: "neutral" as CanvasTone,
      hasExclusivity: false,
    };
  }

  return vehicle.exclusivityApproved
    ? {
        label: t("vehicles.exclusivityApproved", locale),
        tone: "success" as CanvasTone,
        hasExclusivity: true,
      }
    : {
        label: t("vehicles.exclusivityPending", locale),
        tone: "warn" as CanvasTone,
        hasExclusivity: true,
      };
}

function buildDriverMetaLabel(
  driver: DriverRegistryRecord,
  locale: Locale,
  locationState: LocationState,
) {
  const firstBlockedReason = driver.eligibilityBlockedReasons[0];
  const detail = firstBlockedReason
    ? formatOpsCodeLabel(locale, firstBlockedReason)
    : locationLabel(locationState, locale);

  return `${driver.driverId} · ${detail}`;
}

function buildReadinessScore(
  driver: DriverRegistryRecord,
  locationState: LocationState,
  hasVehicle: boolean,
) {
  let score = 0.82;

  if (driver.dispatchEligible) {
    score += 0.1;
  } else {
    score -= 0.14;
  }

  if (driver.licensesValid) {
    score += 0.03;
  } else {
    score -= 0.1;
  }

  if (driver.lifecycleStatus === "draft") {
    score -= 0.05;
  } else if (driver.lifecycleStatus === "suspended") {
    score -= 0.14;
  } else if (driver.lifecycleStatus === "retired") {
    score -= 0.18;
  }

  if (driver.workState === "available") {
    score += 0.03;
  } else if (
    driver.workState === "reserved" ||
    driver.workState === "enroute" ||
    driver.workState === "arrived" ||
    driver.workState === "on_trip"
  ) {
    score -= 0.07;
  } else if (driver.workState === "paused") {
    score -= 0.05;
  } else if (
    driver.workState === "incident_hold" ||
    driver.workState === "suspended"
  ) {
    score -= 0.14;
  } else if (driver.workState === "offline") {
    score -= 0.09;
  }

  if (locationState === "live") {
    score += 0.02;
  } else if (locationState === "stale") {
    score -= 0.04;
  } else if (locationState === "missing") {
    score -= 0.06;
  }

  if (hasVehicle) {
    score += 0.01;
  }

  score -= Math.min(0.06, driver.eligibilityBlockedReasons.length * 0.02);

  return Math.max(0.52, Math.min(0.99, score)).toFixed(2);
}

export default async function DriversPage({ searchParams }: DriversPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);

  const filter = resolveFilter(firstParam(resolvedSearchParams?.filter));
  const { active: activeTab, tabs } = buildTabLinks(locale, filter);
  const filterLabel =
    buildFilterItems(locale).find((item) => item.key === filter)?.label ??
    t("common.all", locale);

  const [driversResult, locationsResult, driverTasks, shifts, vehicles] =
    await Promise.all([
      loadWithError(
        () => client.listDrivers(),
        locale,
        [] as DriverRegistryRecord[],
      ),
      loadWithError(
        () => client.listDriverLocations(),
        locale,
        [] as DriverLocationSnapshot[],
      ),
      resolveOrFallback(
        () => client.listDriverTasks(),
        [] as DriverTaskRecord[],
      ),
      resolveOrFallback(() => client.listShifts(), [] as ShiftRecord[]),
      resolveOrFallback(
        () => client.listVehicles(),
        [] as VehicleRegistryRecord[],
      ),
    ]);

  const drivers = driversResult.data;
  const locations = locationsResult.data;
  const registryError = driversResult.error;
  const locationsError = locationsResult.error;

  const locationByDriver = new Map<string, DriverLocationSnapshot>();
  for (const snapshot of locations) {
    locationByDriver.set(snapshot.driverId, snapshot);
  }

  const taskByDriver = new Map<string, DriverTaskRecord>();
  for (const task of [...driverTasks].sort(sortDriverTasks)) {
    if (!taskByDriver.has(task.driverId)) {
      taskByDriver.set(task.driverId, task);
    }
  }

  const shiftByDriver = new Map<string, ShiftRecord>();
  for (const shift of [...shifts].sort(sortShifts)) {
    if (!shiftByDriver.has(shift.driverId)) {
      shiftByDriver.set(shift.driverId, shift);
    }
  }

  const vehicleById = new Map<string, VehicleRegistryRecord>();
  for (const vehicle of vehicles) {
    vehicleById.set(vehicle.vehicleId, vehicle);
  }

  const sortedDrivers = [...drivers].sort(sortDrivers);
  const filteredDrivers = sortedDrivers.filter((driver) =>
    matchesFilter(driver, filter),
  );
  const dispatchEligibleCount = drivers.filter(
    (driver) => driver.dispatchEligible,
  ).length;
  const blockedCount = drivers.filter(
    (driver) => driver.eligibilityBlockedReasons.length > 0,
  ).length;
  const liveLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return resolveLocationState(snapshot, Boolean(locationsError)) === "live";
  }).length;
  const staleLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return resolveLocationState(snapshot, Boolean(locationsError)) === "stale";
  }).length;

  const rows: DriverRow[] = filteredDrivers.map((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    const resolvedLocationState = resolveLocationState(
      snapshot,
      Boolean(locationsError),
    );
    const task = taskByDriver.get(driver.driverId);
    const shift = shiftByDriver.get(driver.driverId);
    const vehicleId = resolveVehicleId(task, shift);
    const exclusivity = resolveExclusivity(locale, vehicleId, vehicleById);

    return {
      driverId: driver.driverId,
      detailHref: `/drivers/${encodeURIComponent(driver.driverId)}`,
      name: driver.name,
      driverMetaLabel: buildDriverMetaLabel(
        driver,
        locale,
        resolvedLocationState,
      ),
      vehicleLabel: vehicleId ?? t("common.dash", locale),
      workStateLabel: formatOpsCodeLabel(locale, driver.workState),
      workStateTone: workStateTone(driver.workState),
      shiftLabel: formatShiftLabel(locale, shift),
      shiftHint:
        driver.supportedServiceBuckets.join(" · ") ||
        bindingLabel(locale, driver.deviceBindings.length),
      licenseLabel: driver.licensesValid
        ? t("common.valid", locale)
        : t("common.invalid", locale),
      licenseTone: driver.licensesValid ? "success" : "warn",
      exclusivityLabel: exclusivity.label,
      exclusivityTone: exclusivity.tone,
      hasExclusivity: exclusivity.hasExclusivity,
      ratingLabel: buildReadinessScore(
        driver,
        resolvedLocationState,
        Boolean(vehicleId),
      ),
    };
  });

  const subtitle = t("drivers.subtitle", locale, { count: drivers.length });
  const showRegistrySummary =
    Boolean(registryError) || Boolean(locationsError) || rows.length === 0;

  const columns: CanvasTableColumn<DriverRow>[] = [
    {
      h: t("common.driver", locale),
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <Link
            href={row.detailHref}
            style={driverLinkStyle}
            aria-label={getOpsLabel(locale, "openDriverDetail", {
              driverId: row.driverId,
            })}
          >
            {row.name}
          </Link>
          <span style={monoSecondaryTextStyle}>{row.driverMetaLabel}</span>
        </div>
      ),
    },
    {
      h: t("common.vehicle", locale),
      k: "vehicleLabel",
      w: 130,
      mono: true,
    },
    {
      h: t("common.status", locale),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={row.workStateTone} dot>
          {row.workStateLabel}
        </Pill>
      ),
    },
    {
      h: t("drivers.col.shift", locale),
      w: 130,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={monoSecondaryTextStyle}>{row.shiftLabel}</span>
          <span style={secondaryTextStyle}>{row.shiftHint}</span>
        </div>
      ),
    },
    {
      h: t("drivers.col.licenseValid", locale),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.licenseTone}>
          {row.licenseLabel}
        </Pill>
      ),
    },
    {
      h: "EXCL.",
      w: 140,
      r: (row) =>
        row.hasExclusivity ? (
          <Pill theme={theme} tone={row.exclusivityTone} dot>
            {row.exclusivityLabel}
          </Pill>
        ) : (
          <span style={monoSecondaryTextStyle}>{row.exclusivityLabel}</span>
        ),
    },
  ];
  columns.push({
    h: locale === "zh" ? "評分" : "Rating",
    w: 88,
    align: "right",
    mono: true,
    r: (row) => row.ratingLabel,
  });

  return (
    <Shell
      theme={theme}
      nav={buildShellNav(locale)}
      active="drivers"
      currentPath={buildDriversHref(filter)}
      breadcrumb={[
        locale === "en" ? "Registry" : "主資料",
        t("nav.drivers", locale),
      ]}
      searchPlaceholder={
        locale === "en"
          ? "Search order, tenant, or driver..."
          : "搜尋訂單、租戶或司機..."
      }
      brandLabel={t("app.name", locale)}
      brandSubLabel={t("app.sub", locale)}
      env={locale === "en" ? "staging" : "測試"}
      versionLabel="OC"
      avatarLabel="OC"
    >
      <PageHeader
        theme={theme}
        title={t("drivers.title", locale)}
        subtitle={subtitle}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <Btn theme={theme} icon="filter">
            {locale === "zh" ? "篩選" : "Filter"}
          </Btn>
        }
      />

      <div style={pageStackStyle}>
        {registryError ? (
          <Banner
            theme={theme}
            tone="danger"
            title={t("drivers.list.registryUnavailable", locale)}
            body={registryError}
          />
        ) : null}

        {locationsError ? (
          <Banner
            theme={theme}
            tone="warn"
            title={t("drivers.list.locationsUnavailable", locale)}
            body={locationsError}
          />
        ) : null}

        <Card theme={theme} padding={0}>
          {rows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={rows} />
          ) : (
            <div style={emptyStateStyle}>{t("drivers.empty", locale)}</div>
          )}
        </Card>

        {showRegistrySummary ? (
          <Card theme={theme}>
            <div style={kpiGridStyle}>
              <KPI
                theme={theme}
                label={t("common.driver", locale)}
                value={drivers.length}
                sub={t("common.visible", locale, {
                  count: filteredDrivers.length,
                })}
              />
              <KPI
                theme={theme}
                label={t("drivers.col.dispatchEligible", locale)}
                value={dispatchEligibleCount}
              />
              <KPI
                theme={theme}
                label={t("drivers.col.location", locale)}
                value={liveLocationCount}
                hint={`${staleLocationCount} ${t("drivers.list.locationStale", locale)}`}
              />
              <KPI
                theme={theme}
                label={t("driverDetail.dispatchEligibleNo", locale)}
                value={blockedCount}
                sub={
                  blockedCount === 0
                    ? t("drivers.list.eligibilityClear", locale)
                    : undefined
                }
              />
            </div>

            <div style={summaryGridStyle}>
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: t("drivers.col.dispatchEligible", locale),
                    v: `${dispatchEligibleCount} / ${drivers.length}`,
                    mono: true,
                  },
                  {
                    k: t("drivers.col.location", locale),
                    v: t("drivers.registrySummary", locale, {
                      eligible: dispatchEligibleCount,
                      blocked: blockedCount,
                      live: liveLocationCount,
                      stale: staleLocationCount,
                    }),
                  },
                  {
                    k: t("common.driver", locale),
                    v: `${filteredDrivers.length} / ${drivers.length}`,
                    mono: true,
                  },
                  {
                    k: t("common.status", locale),
                    v:
                      registryError || locationsError
                        ? [
                            registryError
                              ? t("drivers.list.registryUnavailable", locale)
                              : null,
                            locationsError
                              ? t("drivers.list.locationsUnavailable", locale)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : filterLabel,
                  },
                ]}
              />

              <Field
                theme={theme}
                label={t("common.notes", locale)}
                hint={t("drivers.registryFooter", locale)}
              >
                <div
                  style={{
                    minHeight: 84,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.surfaceLo,
                    color: theme.textMuted,
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {`${filterLabel} · ${t("common.visible", locale, {
                    count: filteredDrivers.length,
                  })}`}
                </div>
              </Field>
            </div>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}
