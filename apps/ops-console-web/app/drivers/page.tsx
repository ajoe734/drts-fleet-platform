import Link from "next/link";
import type {
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type DriversPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DriverFilterKey = "all" | "eligible" | "on_shift" | "offline";

type DriverTableRow = Record<string, unknown> & {
  driverId: string;
  driverName: string;
  driverMeta: string;
  blockerSummary: string;
  deviceLabel: string;
  statusLabel: string;
  statusTone: CanvasTone;
  shiftLabel: string;
  licenseLabel: string;
  licenseTone: CanvasTone;
  gateLabel: string;
  gateTone: CanvasTone;
  locationLabel: string;
  locationTone: CanvasTone;
};

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
} as const;

const sectionCardStyle = {
  overflow: "hidden",
} as const;

async function resolveSearchParams(
  searchParams: DriversPageProps["searchParams"],
) {
  return (searchParams ??
    Promise.resolve(
      {} as Record<string, string | string[] | undefined>,
    )) as Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilter(value: string | undefined): DriverFilterKey {
  switch (value) {
    case "eligible":
    case "on_shift":
    case "offline":
      return value;
    default:
      return "all";
  }
}

function buildDriversHref(filter: DriverFilterKey) {
  if (filter === "all") {
    return "/drivers";
  }
  return `/drivers?filter=${encodeURIComponent(filter)}`;
}

function buildFilterTabs(locale: Locale, activeFilter: DriverFilterKey) {
  const items: Array<{ key: DriverFilterKey; label: string; href: string }> = [
    {
      key: "all",
      label: t("common.all", locale),
      href: buildDriversHref("all"),
    },
    {
      key: "eligible",
      label: t("drivers.col.dispatchEligible", locale),
      href: buildDriversHref("eligible"),
    },
    {
      key: "on_shift",
      label: t("attendance.activeShifts", locale),
      href: buildDriversHref("on_shift"),
    },
    {
      key: "offline",
      label: formatOpsCodeLabel(locale, "offline"),
      href: buildDriversHref("offline"),
    },
  ];

  const tabs = items.map((item) => (
    <Link
      key={item.key}
      href={item.href}
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

function driverLinkStyle(themeValue: CanvasTheme) {
  return {
    color: themeValue.text,
    textDecoration: "none",
  } as const;
}

function summarizeBlockedReasons(
  reasons: DriverEligibilityBlockReason[],
  locale: Locale,
): string {
  if (!reasons || reasons.length === 0) {
    return t("drivers.list.eligibilityClear", locale);
  }
  return reasons.map((reason) => formatOpsCodeLabel(locale, reason)).join("、");
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return true;
  }
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) {
    return true;
  }
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function getStatusTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  if (workState === "available") return "success";
  if (workState === "offline") return "neutral";
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger";
  }
  if (workState === "on_trip" || workState === "enroute") {
    return "info";
  }
  return "warn";
}

function formatLocationState(
  driverId: string,
  locationByDriver: Map<string, DriverLocationSnapshot>,
  locationsError: string | null,
  locale: Locale,
): string {
  const snapshot = locationByDriver.get(driverId);
  if (locationsError) {
    return t("drivers.list.locationUnknown", locale);
  }
  if (!snapshot) {
    return t("drivers.list.locationMissing", locale);
  }
  if (isLocationStale(snapshot)) {
    return t("drivers.list.locationStale", locale);
  }
  return t("drivers.list.locationLive", locale);
}

function locationTone(label: string, locale: Locale): CanvasTone {
  if (label === t("drivers.list.locationLive", locale)) {
    return "success";
  }
  if (label === t("drivers.list.locationStale", locale)) {
    return "warn";
  }
  return "neutral";
}

function matchesFilter(driver: DriverRegistryRecord, filter: DriverFilterKey) {
  switch (filter) {
    case "eligible":
      return driver.dispatchEligible;
    case "on_shift":
      return driver.workState !== "offline";
    case "offline":
      return driver.workState === "offline";
    case "all":
    default:
      return true;
  }
}

function getDeviceLabel(driver: DriverRegistryRecord, locale: Locale) {
  const activeBinding = driver.deviceBindings.find(
    (binding: {
      status: string;
      deviceLabel?: string | null;
      deviceId: string;
    }) => binding.status === "active",
  );

  if (!activeBinding) {
    return locale === "en" ? "unassigned" : "未綁定";
  }

  return activeBinding.deviceLabel ?? activeBinding.deviceId;
}

function getHeaderSubtitle(locale: Locale) {
  return locale === "en"
    ? "master roster · shifts · license · eligibility · location watch"
    : "總表 · 班別 · license · eligibility · 定位監看";
}

export default async function DriversPage({ searchParams }: DriversPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    resolveSearchParams(searchParams),
  ]);

  const activeFilter = resolveFilter(firstParam(resolvedSearchParams.filter));

  let drivers: DriverRegistryRecord[] = [];
  let locations: DriverLocationSnapshot[] = [];
  let registryError: string | null = null;
  let locationsError: string | null = null;

  try {
    drivers = await client.listDrivers();
  } catch (error) {
    registryError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  try {
    locations = await client.listDriverLocations();
  } catch (error) {
    locationsError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  const locationByDriver = new Map<string, DriverLocationSnapshot>();
  for (const snapshot of locations) {
    locationByDriver.set(snapshot.driverId, snapshot);
  }

  const { active: activeTabNode, tabs } = buildFilterTabs(locale, activeFilter);

  const locationStats = drivers.reduce(
    (accumulator, driver) => {
      const snapshot = locationByDriver.get(driver.driverId);
      if (!snapshot || locationsError) {
        return accumulator;
      }
      if (isLocationStale(snapshot)) {
        accumulator.stale += 1;
      } else {
        accumulator.live += 1;
      }
      return accumulator;
    },
    { live: 0, stale: 0 },
  );

  const eligibleCount = drivers.filter(
    (driver) => driver.dispatchEligible,
  ).length;
  const blockedCount = Math.max(drivers.length - eligibleCount, 0);

  const rows: DriverTableRow[] = drivers
    .filter((driver) => matchesFilter(driver, activeFilter))
    .sort((left, right) => {
      const leftPriority = left.dispatchEligible ? 0 : 1;
      const rightPriority = right.dispatchEligible ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.driverId.localeCompare(right.driverId);
    })
    .map((driver) => {
      const locationLabel = formatLocationState(
        driver.driverId,
        locationByDriver,
        locationsError,
        locale,
      );

      return {
        driverId: driver.driverId,
        driverName: driver.name,
        driverMeta: `${driver.driverId} · ${locationLabel}`,
        blockerSummary: summarizeBlockedReasons(
          driver.eligibilityBlockedReasons,
          locale,
        ),
        deviceLabel: getDeviceLabel(driver, locale),
        statusLabel: formatOpsCodeLabel(locale, driver.workState),
        statusTone: getStatusTone(driver.workState),
        shiftLabel: formatOpsCodeLabel(locale, driver.lifecycleStatus),
        licenseLabel: driver.licensesValid
          ? t("common.valid", locale)
          : t("common.invalid", locale),
        licenseTone: driver.licensesValid ? "success" : "warn",
        gateLabel: driver.dispatchEligible
          ? t("common.yes", locale)
          : t("common.no", locale),
        gateTone: driver.dispatchEligible ? "success" : "warn",
        locationLabel,
        locationTone: locationTone(locationLabel, locale),
      };
    });

  const columns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: "DRIVER",
      w: 240,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Link
            href={`/drivers/${encodeURIComponent(row.driverId)}`}
            style={driverLinkStyle(theme)}
          >
            <span style={{ fontWeight: 600 }}>{row.driverName}</span>
          </Link>
          <span
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontFamily: theme.monoFamily,
            }}
          >
            {row.driverMeta}
          </span>
          <span
            style={{
              color: theme.textMuted,
              fontSize: 11,
              whiteSpace: "normal",
            }}
          >
            {row.blockerSummary}
          </span>
        </div>
      ),
    },
    {
      h: locale === "en" ? "DEVICE" : "設備",
      k: "deviceLabel",
      w: 140,
      mono: true,
    },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {row.statusLabel}
        </Pill>
      ),
    },
    {
      h: "SHIFT",
      k: "shiftLabel",
      w: 128,
      mono: true,
    },
    {
      h: "LICENSE",
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.licenseTone}
          dot={row.licenseTone !== "success"}
        >
          {row.licenseLabel}
        </Pill>
      ),
    },
    {
      h: "ELIG.",
      w: 108,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.gateTone}
          dot={row.gateTone !== "success"}
        >
          {row.gateLabel}
        </Pill>
      ),
    },
    {
      h: locale === "en" ? "TRACK" : "定位",
      w: 108,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.locationTone}
          dot={row.locationTone !== "success"}
        >
          {row.locationLabel}
        </Pill>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("nav.drivers", locale)}
        subtitle={getHeaderSubtitle(locale)}
        tabs={tabs}
        activeTab={activeTabNode}
        actions={
          <Btn theme={theme} icon="filter">
            {t("reports.detail.filters", locale)}
          </Btn>
        }
      />

      <div style={pageStackStyle}>
        {registryError ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("drivers.list.registryUnavailable", locale)}
            body={registryError}
          />
        ) : null}
        {locationsError ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("drivers.list.locationsUnavailable", locale)}
            body={locationsError}
          />
        ) : null}
        {!registryError ? (
          <Banner
            theme={theme}
            tone="info"
            icon="drivers"
            title={t("drivers.registrySummary", locale, {
              eligible: String(eligibleCount),
              blocked: String(blockedCount),
              live: String(locationStats.live),
              stale: String(locationStats.stale),
            })}
            body={t("drivers.registryFooter", locale)}
          />
        ) : null}
        {rows.length === 0 ? (
          <Banner
            theme={theme}
            tone="info"
            icon="warn"
            title={t("drivers.empty", locale)}
            body={
              locale === "en"
                ? "Adjust the current filter or wait for registry data."
                : "請調整目前篩選條件，或等待名冊資料回傳。"
            }
          />
        ) : null}
        <Card theme={theme} padding={0} style={sectionCardStyle}>
          {rows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={rows} />
          ) : null}
        </Card>
      </div>
    </>
  );
}
