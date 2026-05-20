import Link from "next/link";
import type { ReactNode } from "react";
import type {
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverRegistryRecord,
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
  shiftLabel: string;
  shiftTone: CanvasTone;
  dispatchLabel: string;
  dispatchTone: CanvasTone;
  licenseLabel: string;
  licenseTone: CanvasTone;
  locationLabel: string;
  locationTone: CanvasTone;
  blockedReasons: string;
  blockedMeta: string;
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
  gap: 14,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.9fr)",
  gap: 14,
};

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
  snapshot: DriverLocationSnapshot | undefined;
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

  return { snapshot, state, label };
}

function formatProfileTimestamp(driver: DriverRegistryRecord) {
  return driver.profileUpdatedAt ?? driver.updatedAt ?? driver.createdAt;
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

function actionLinkStyle(themeValue: CanvasTheme) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    background: themeValue.accent,
    color: "#ffffff",
    border: `1px solid ${themeValue.accent}`,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
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

  const dispatchEligibleCount = counts.eligible;
  const blockedCount = drivers.filter(
    (driver) => driver.eligibilityBlockedReasons.length > 0,
  ).length;
  const liveLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return snapshot && !isLocationStale(snapshot);
  }).length;
  const staleLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return snapshot ? isLocationStale(snapshot) : false;
  }).length;

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
      const serviceBuckets = driver.supportedServiceBuckets.length
        ? driver.supportedServiceBuckets
            .map(
              (
                bucket: DriverRegistryRecord["supportedServiceBuckets"][number],
              ) => formatOpsCodeLabel(locale, bucket),
            )
            .join(" · ")
        : "—";

      return {
        driverId: driver.driverId,
        driverName: driver.name,
        serviceBuckets,
        shiftLabel: formatOpsCodeLabel(locale, driver.workState),
        shiftTone: getShiftTone(driver.workState),
        dispatchLabel: driver.dispatchEligible
          ? t("common.yes", locale)
          : t("common.no", locale),
        dispatchTone: driver.dispatchEligible ? "success" : "danger",
        licenseLabel: driver.licensesValid
          ? t("common.valid", locale)
          : t("common.invalid", locale),
        licenseTone: driver.licensesValid ? "success" : "warn",
        locationLabel: location.label,
        locationTone: getLocationTone(location.state),
        blockedReasons: summarizeBlockedReasons(
          driver.eligibilityBlockedReasons,
          locale,
        ),
        blockedMeta: location.snapshot?.recordedAt
          ? t("driverDetail.summary.locationRecordedAt", locale, {
              recordedAt: location.snapshot.recordedAt,
            })
          : formatProfileTimestamp(driver),
      };
    });

  const columns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: locale === "en" ? "Driver" : "司機",
      w: 260,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: theme.text, fontWeight: 700 }}>
            {row.driverName}
          </span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {row.driverId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.serviceBuckets}
          </span>
        </div>
      ),
    },
    {
      h: t("drivers.col.shift", locale),
      w: 170,
      r: (row) => (
        <Pill theme={theme} tone={row.shiftTone} dot>
          {row.shiftLabel}
        </Pill>
      ),
    },
    {
      h: t("drivers.col.dispatchEligible", locale),
      w: 132,
      r: (row) => (
        <Pill theme={theme} tone={row.dispatchTone} dot>
          {row.dispatchLabel}
        </Pill>
      ),
    },
    {
      h: t("drivers.col.location", locale),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.locationTone} dot>
          {row.locationLabel}
        </Pill>
      ),
    },
    {
      h: t("drivers.col.licenseValid", locale),
      w: 124,
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
      h: t("drivers.col.eligibilityBlocked", locale),
      w: 360,
      r: (row) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            whiteSpace: "normal",
          }}
        >
          <span>{row.blockedReasons}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {row.blockedMeta}
          </span>
        </div>
      ),
    },
    {
      h: t("common.actions", locale),
      w: 118,
      r: (row) => (
        <Link
          href={`/drivers/${encodeURIComponent(row.driverId)}`}
          style={actionLinkStyle(theme)}
          aria-label={getOpsLabel(locale, "openDriverDetail", {
            driverId: row.driverId,
          })}
        >
          {t("drivers.list.openDetail", locale)}
        </Link>
      ),
    },
  ];

  const headerActions: ReactNode = (
    <>
      <Btn theme={theme} icon="filter">
        {locale === "en" ? "Filter" : "篩選"}
      </Btn>
      <Btn theme={theme} variant="primary" icon="fleet">
        {locale === "en" ? "Driver detail drill-down" : "司機明細 drill-down"}
      </Btn>
    </>
  );

  const summaryItems = [
    {
      k: locale === "en" ? "Scope" : "範圍",
      v:
        activeTab === "eligible"
          ? locale === "en"
            ? "Dispatch eligible"
            : "可派遣"
          : activeTab === "on_shift"
            ? locale === "en"
              ? "On shift"
              : "在班"
            : activeTab === "offline"
              ? locale === "en"
                ? "Offline"
                : "下班"
              : t("common.all", locale),
    },
    {
      k: locale === "en" ? "Visible rows" : "目前列數",
      v: String(rows.length),
      mono: true,
    },
    {
      k: locale === "en" ? "Registry total" : "名冊總數",
      v: String(drivers.length),
      mono: true,
    },
    {
      k: locale === "en" ? "Location feed" : "定位資料",
      v: locationsError
        ? t("drivers.list.locationUnknown", locale)
        : `${liveLocationCount} ${t("drivers.list.locationLive", locale)} / ${staleLocationCount} ${t("drivers.list.locationStale", locale)}`,
    },
  ];

  return (
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
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale, { count: drivers.length })}
        tabs={tabs}
        activeTab={activeTabNode}
        actions={headerActions}
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
        {rows.length === 0 ? (
          <Banner
            theme={theme}
            tone="info"
            icon="warn"
            title={t("drivers.empty", locale)}
            body={
              locale === "en"
                ? "Adjust the tab or wait for registry data to return."
                : "請切換頁籤，或等待名冊資料回傳。"
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("drivers.col.driverId", locale)}
            value={drivers.length}
            sub={t("drivers.subtitle", locale, { count: drivers.length })}
          />
          <KPI
            theme={theme}
            label={t("drivers.col.dispatchEligible", locale)}
            value={dispatchEligibleCount}
            delta={`${blockedCount} ${locale === "en" ? "blocked" : "受阻"}`}
            deltaTone={blockedCount > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={t("drivers.col.location", locale)}
            value={liveLocationCount}
            delta={`${staleLocationCount} ${t("drivers.list.locationStale", locale)}`}
            deltaTone={staleLocationCount > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Offline" : "下班"}
            value={counts.offline}
            sub={
              locale === "en"
                ? "Driver roster in rest state"
                : "目前休班中的司機"
            }
          />
        </div>

        <div style={summaryGridStyle}>
          <Card
            theme={theme}
            title={locale === "en" ? "Registry overview" : "名冊總覽"}
            subtitle={t("drivers.registrySummary", locale, {
              eligible: dispatchEligibleCount,
              blocked: blockedCount,
              live: liveLocationCount,
              stale: staleLocationCount,
            })}
          >
            <DL theme={theme} cols={2} items={summaryItems} />
            <div style={{ height: 14 }} />
            <Field
              theme={theme}
              label={locale === "en" ? "Ops note" : "Ops 備註"}
              hint={
                locale === "en" ? "Read-only list view" : "列表頁維持只讀判斷"
              }
            >
              <div
                style={{
                  minHeight: 34,
                  padding: "9px 10px",
                  borderRadius: 8,
                  background: theme.surfaceLo,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                {t("drivers.registryFooter", locale)}
              </div>
            </Field>
          </Card>

          <Card
            theme={theme}
            title={locale === "en" ? "Canvas parity" : "Canvas 對齊"}
            subtitle={
              locale === "en"
                ? "Tabs + roster table preserved on server data"
                : "Tabs + roster table 直接接在現有 server data 上"
            }
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  k: locale === "en" ? "Primary focus" : "主焦點",
                  v:
                    locale === "en"
                      ? "Shift, dispatch readiness, blockers, location freshness"
                      : "班別、可派遣性、阻塞原因、定位新鮮度",
                },
                {
                  k: locale === "en" ? "Detail path" : "明細路徑",
                  v: "/drivers/[driverId]",
                  mono: true,
                },
                {
                  k: locale === "en" ? "Data source" : "資料來源",
                  v: "listDrivers() + listDriverLocations()",
                  mono: true,
                },
              ]}
            />
          </Card>
        </div>

        <Card
          theme={theme}
          title={locale === "en" ? "Drivers table" : "司機表格"}
          subtitle={t("drivers.subtitle", locale, { count: rows.length })}
          padding={0}
        >
          <Table theme={theme} columns={columns} rows={rows} />
        </Card>
      </div>
    </Shell>
  );
}
