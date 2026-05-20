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
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type DriversPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DriverTabKey = "all" | "eligible" | "on_shift" | "offline";

type DriverTableRow = Record<string, unknown> & {
  driverId: string;
  driverName: string;
  serviceBuckets: string;
  lifecycleLabel: string;
  shiftLabel: string;
  shiftTone: CanvasTone;
  licenseLabel: string;
  licenseTone: CanvasTone;
  dispatchLabel: string;
  dispatchTone: CanvasTone;
  locationLabel: string;
  locationTone: CanvasTone;
  blockedReasons: string;
};

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function pageSubtitle(locale: Locale, count: number) {
  const countLabel = t("drivers.subtitle", locale, { count });
  return locale === "en"
    ? `${countLabel} · roster · shift · license · dispatch eligibility`
    : `${countLabel} · 總表 · 班別 · 駕照 · 可派狀態`;
}

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

function resolveTab(value: string | undefined): DriverTabKey {
  switch (value) {
    case "eligible":
    case "on_shift":
    case "offline":
      return value;
    default:
      return "all";
  }
}

function buildDriversHref(tab: DriverTabKey) {
  if (tab === "all") {
    return "/drivers";
  }
  return `/drivers?tab=${encodeURIComponent(tab)}`;
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

function getShiftTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  if (workState === "available") return "success";
  if (workState === "offline") return "neutral";
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger";
  }
  return "warn";
}

function getLocationTone(state: "live" | "stale" | "missing" | "unknown") {
  if (state === "live") return "success" as const;
  if (state === "unknown") return "neutral" as const;
  return "warn" as const;
}

function formatLocationState(
  driver: DriverRegistryRecord,
  locationByDriver: Map<string, DriverLocationSnapshot>,
  locationsError: string | null,
  locale: Locale,
): {
  state: "live" | "stale" | "missing" | "unknown";
  label: string;
} {
  const snapshot = locationByDriver.get(driver.driverId);
  const state = locationsError
    ? "unknown"
    : !snapshot
      ? "missing"
      : isLocationStale(snapshot)
        ? "stale"
        : "live";

  const label =
    state === "unknown"
      ? t("drivers.list.locationUnknown", locale)
      : state === "missing"
        ? t("drivers.list.locationMissing", locale)
        : state === "stale"
          ? t("drivers.list.locationStale", locale)
          : t("drivers.list.locationLive", locale);

  return { state, label };
}

function buildTabLinks(
  locale: Locale,
  counts: Record<DriverTabKey, number>,
  activeTab: DriverTabKey,
) {
  const items: Array<{ key: DriverTabKey; label: string; href: string }> = [
    {
      key: "all",
      label: `${t("common.all", locale)} ${counts.all}`,
      href: buildDriversHref("all"),
    },
    {
      key: "eligible",
      label: `${locale === "en" ? "Dispatch eligible" : "可派"} ${counts.eligible}`,
      href: buildDriversHref("eligible"),
    },
    {
      key: "on_shift",
      label: `${locale === "en" ? "On shift" : "在班"} ${counts.on_shift}`,
      href: buildDriversHref("on_shift"),
    },
    {
      key: "offline",
      label: `${locale === "en" ? "Offline" : "下班"} ${counts.offline}`,
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

  const activeIndex = items.findIndex((item) => item.key === activeTab);
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

function matchesTab(driver: DriverRegistryRecord, tab: DriverTabKey) {
  switch (tab) {
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

export default async function DriversPage({ searchParams }: DriversPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    resolveSearchParams(searchParams),
  ]);

  const activeTab = resolveTab(firstParam(resolvedSearchParams.tab));

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

  const counts = {
    all: drivers.length,
    eligible: drivers.filter((driver) => driver.dispatchEligible).length,
    on_shift: drivers.filter((driver) => driver.workState !== "offline").length,
    offline: drivers.filter((driver) => driver.workState === "offline").length,
  } satisfies Record<DriverTabKey, number>;

  const { active: activeTabNode, tabs } = buildTabLinks(
    locale,
    counts,
    activeTab,
  );

  const rows: DriverTableRow[] = drivers
    .filter((driver) => matchesTab(driver, activeTab))
    .sort((left, right) => {
      const leftPriority = left.dispatchEligible ? 0 : 1;
      const rightPriority = right.dispatchEligible ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.driverId.localeCompare(right.driverId);
    })
    .map((driver) => {
      const location = formatLocationState(
        driver,
        locationByDriver,
        locationsError,
        locale,
      );

      return {
        driverId: driver.driverId,
        driverName: driver.name,
        serviceBuckets: driver.supportedServiceBuckets.length
          ? driver.supportedServiceBuckets
              .map(
                (
                  bucket: DriverRegistryRecord["supportedServiceBuckets"][number],
                ) => formatOpsCodeLabel(locale, bucket),
              )
              .join(" · ")
          : "—",
        lifecycleLabel: formatOpsCodeLabel(locale, driver.lifecycleStatus),
        shiftLabel: formatOpsCodeLabel(locale, driver.workState),
        shiftTone: getShiftTone(driver.workState),
        licenseLabel: driver.licensesValid
          ? t("common.valid", locale)
          : t("common.invalid", locale),
        licenseTone: driver.licensesValid ? "success" : "warn",
        dispatchLabel: driver.dispatchEligible
          ? t("common.yes", locale)
          : t("common.no", locale),
        dispatchTone: driver.dispatchEligible ? "success" : "warn",
        locationLabel: location.label,
        locationTone: getLocationTone(location.state),
        blockedReasons: summarizeBlockedReasons(
          driver.eligibilityBlockedReasons,
          locale,
        ),
      };
    });

  const columns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: "DRIVER",
      w: 240,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/drivers/${encodeURIComponent(row.driverId)}`}
            style={driverLinkStyle(theme)}
          >
            <span style={{ fontWeight: 700 }}>{row.driverName}</span>
          </Link>
          <span
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontFamily: theme.fontMono,
            }}
          >
            {row.driverId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.serviceBuckets}
          </span>
        </div>
      ),
    },
    {
      h: locale === "en" ? "STATUS" : "狀態",
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.shiftTone} dot>
          {row.shiftLabel}
        </Pill>
      ),
    },
    {
      h: locale === "en" ? "SHIFT" : "班別",
      w: 140,
      mono: true,
      r: (row) => row.lifecycleLabel,
    },
    {
      h: locale === "en" ? "LICENSE" : "駕照",
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
      h: locale === "en" ? "ELIGIBLE" : "可派",
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.dispatchTone} dot>
          {row.dispatchLabel}
        </Pill>
      ),
    },
    {
      h: locale === "en" ? "LOCATION" : "定位",
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.locationTone} dot>
          {row.locationLabel}
        </Pill>
      ),
    },
    {
      h: locale === "en" ? "BLOCKERS" : "阻塞原因",
      w: 340,
      r: (row) => (
        <span style={{ color: theme.text, whiteSpace: "normal" }}>
          {row.blockedReasons}
        </span>
      ),
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: theme.bg,
      }}
    >
      <Shell
        theme={theme}
        nav={buildShellNav(locale)}
        active="drivers"
        currentPath="/drivers"
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
          title={t("nav.drivers", locale)}
          subtitle={pageSubtitle(locale, drivers.length)}
          tabs={tabs}
          activeTab={activeTabNode}
          actions={
            <Btn theme={theme} icon="filter">
              {locale === "en" ? "Filter" : "篩選"}
            </Btn>
          }
        />

        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 12 }}>
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
            {rows.length === 0 ? (
              <Banner
                theme={theme}
                tone="info"
                icon="warn"
                title={t("drivers.empty", locale)}
                body={
                  locale === "en"
                    ? "Adjust the current tab or wait for registry data."
                    : "請調整目前頁籤，或等待名冊資料回傳。"
                }
              />
            ) : null}

            <Card theme={theme} padding={0}>
              <Table theme={theme} columns={columns} rows={rows} />
            </Card>
          </div>
        </div>
      </Shell>
    </div>
  );
}
