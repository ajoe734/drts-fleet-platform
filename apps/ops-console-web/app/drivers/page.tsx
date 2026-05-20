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
  rosterMeta: string;
  vehicleLabel: string;
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

const pageContentStyle = {
  padding: 24,
} as const;

const pageStackStyle = {
  display: "grid",
  gap: 12,
} as const;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} as const;

const pageBodyStyle = {
  display: "grid",
  gap: 12,
  alignItems: "start",
  gridTemplateColumns: "minmax(0, 2.2fr) minmax(280px, 0.9fr)",
} as const;

const railStackStyle = {
  display: "grid",
  gap: 12,
} as const;

const fieldStackStyle = {
  display: "grid",
  gap: 8,
} as const;

const pillWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

function pageSubtitle(locale: Locale, count: number) {
  const countLabel = t("drivers.subtitle", locale, { count });
  return locale === "en"
    ? `${countLabel} · roster · shift · license · rating · earnings drill-down`
    : `${countLabel} · 總表 · 班別 · license · 評分 · earnings drill-down`;
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
  driver: DriverRegistryRecord,
  locationByDriver: Map<string, DriverLocationSnapshot>,
  locationsError: string | null,
  locale: Locale,
): string {
  const snapshot = locationByDriver.get(driver.driverId);
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

function getDeviceLabel(driver: DriverRegistryRecord, locale: Locale) {
  const activeBinding = driver.deviceBindings.find(
    (binding) => binding.status === "active",
  );

  if (!activeBinding) {
    return locale === "en" ? "unassigned" : "未綁定";
  }

  return activeBinding.deviceLabel ?? activeBinding.deviceId;
}

function getRosterMeta(
  driver: DriverRegistryRecord,
  locationLabel: string,
  locale: Locale,
) {
  const blockedSummary = summarizeBlockedReasons(
    driver.eligibilityBlockedReasons,
    locale,
  );

  if (blockedSummary === t("drivers.list.eligibilityClear", locale)) {
    return `${locationLabel} · ${blockedSummary}`;
  }

  return `${locationLabel} · ${blockedSummary}`;
}

function summarizeTopBlockers(drivers: DriverRegistryRecord[], locale: Locale) {
  const counts = new Map<string, { label: string; count: number }>();

  for (const driver of drivers) {
    for (const reason of driver.eligibilityBlockedReasons) {
      const existing = counts.get(reason);
      if (existing) {
        existing.count += 1;
        continue;
      }

      counts.set(reason, {
        label: formatOpsCodeLabel(locale, reason),
        count: 1,
      });
    }
  }

  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
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
      const locationLabel = formatLocationState(
        driver,
        locationByDriver,
        locationsError,
        locale,
      );

      return {
        driverId: driver.driverId,
        driverName: driver.name,
        rosterMeta: getRosterMeta(driver, locationLabel, locale),
        vehicleLabel: getDeviceLabel(driver, locale),
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
        locationTone:
          locationLabel === t("drivers.list.locationLive", locale)
            ? "success"
            : locationLabel === t("drivers.list.locationStale", locale)
              ? "warn"
              : "neutral",
      };
    });

  const liveLocationCount = rows.filter(
    (row) => row.locationLabel === t("drivers.list.locationLive", locale),
  ).length;
  const staleLocationCount = rows.filter(
    (row) => row.locationLabel === t("drivers.list.locationStale", locale),
  ).length;
  const missingLocationCount = rows.filter(
    (row) => row.locationLabel === t("drivers.list.locationMissing", locale),
  ).length;
  const unknownLocationCount = rows.filter(
    (row) => row.locationLabel === t("drivers.list.locationUnknown", locale),
  ).length;
  const blockedCount = drivers.filter(
    (driver) => !driver.dispatchEligible,
  ).length;
  const validLicenseCount = drivers.filter(
    (driver) => driver.licensesValid,
  ).length;
  const activeBindingCount = drivers.filter((driver) =>
    driver.deviceBindings.some((binding) => binding.status === "active"),
  ).length;
  const topBlockers = summarizeTopBlockers(drivers, locale);
  const selectedTabLabel =
    activeTab === "eligible"
      ? locale === "en"
        ? "Dispatch eligible"
        : "可派"
      : activeTab === "on_shift"
        ? locale === "en"
          ? "On shift"
          : "在班"
        : activeTab === "offline"
          ? locale === "en"
            ? "Offline"
            : "下班"
          : t("common.all", locale);

  const columns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: "DRIVER",
      w: 260,
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
          <span
            style={{
              color: theme.textMuted,
              fontSize: 11,
              whiteSpace: "normal",
            }}
          >
            {row.rosterMeta}
          </span>
        </div>
      ),
    },
    {
      h: locale === "en" ? "VEHICLE" : "車輛",
      k: "vehicleLabel",
      w: 140,
      mono: true,
    },
    {
      h: "STATUS",
      w: 128,
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
      w: 128,
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
      h: "EXCL.",
      w: 112,
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
    <Shell
      theme={theme}
      nav={buildShellNav(locale)}
      active="drivers"
      currentPath="/drivers"
      breadcrumb={[
        locale === "en" ? "Registry" : "主資料",
        t("nav.drivers", locale),
      ]}
      searchPlaceholder={locale === "en" ? "Search driver..." : "搜尋司機..."}
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

      <div style={pageContentStyle}>
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
                  ? "Adjust the current tab or wait for registry data."
                  : "請調整目前頁籤，或等待名冊資料回傳。"
              }
            />
          ) : null}
          <div style={kpiGridStyle}>
            <KPI
              theme={theme}
              label={locale === "en" ? "Drivers" : "司機"}
              value={drivers.length}
              delta={`${counts.eligible} ${locale === "en" ? "eligible" : "可派"}`}
              deltaTone={counts.eligible > 0 ? "up" : "neutral"}
              sub={pageSubtitle(locale, drivers.length)}
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Dispatch Gate" : "可派閘門"}
              value={counts.eligible}
              delta={`${blockedCount} ${locale === "en" ? "blocked" : "受阻"}`}
              deltaTone={blockedCount > 0 ? "down" : "neutral"}
              sub={t("drivers.registrySummary", locale, {
                eligible: counts.eligible,
                blocked: blockedCount,
                live: liveLocationCount,
                stale: staleLocationCount,
              })}
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "License Valid" : "駕照有效"}
              value={validLicenseCount}
              delta={`${drivers.length - validLicenseCount} ${locale === "en" ? "needs review" : "待複核"}`}
              deltaTone={
                validLicenseCount === drivers.length ? "up" : "neutral"
              }
              sub={locale === "en" ? "registry compliance" : "名冊合規"}
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Bound Device" : "已綁定設備"}
              value={activeBindingCount}
              delta={`${drivers.length - activeBindingCount} ${locale === "en" ? "unassigned" : "未綁定"}`}
              deltaTone={
                activeBindingCount === drivers.length ? "up" : "neutral"
              }
              sub={locale === "en" ? "dispatch-ready devices" : "派遣就緒設備"}
            />
          </div>

          <div style={pageBodyStyle}>
            <Card
              theme={theme}
              padding={0}
              title={locale === "en" ? "Drivers Table" : "司機總表"}
              subtitle={
                locale === "en"
                  ? `${selectedTabLabel} · ${rows.length} visible`
                  : `${selectedTabLabel} · 顯示 ${rows.length} 筆`
              }
            >
              {rows.length > 0 ? (
                <Table theme={theme} columns={columns} rows={rows} />
              ) : null}
            </Card>

            <div style={railStackStyle}>
              <Card
                theme={theme}
                title={locale === "en" ? "Roster Summary" : "名冊摘要"}
                subtitle={t("drivers.registryFooter", locale)}
              >
                <Field
                  theme={theme}
                  label={locale === "en" ? "Current Tab" : "目前頁籤"}
                  hint={
                    locale === "en"
                      ? "Canvas handoff keeps list view read-first."
                      : "Canvas handoff 保持列表頁以讀取判斷為主。"
                  }
                >
                  <div style={pillWrapStyle}>
                    <Pill theme={theme} tone="info">
                      {selectedTabLabel}
                    </Pill>
                    <Pill theme={theme} tone="neutral">
                      {rows.length} / {drivers.length}
                    </Pill>
                  </div>
                </Field>

                <Field
                  theme={theme}
                  label={locale === "en" ? "Registry Signal" : "名冊訊號"}
                >
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        label: locale === "en" ? "Summary" : "摘要",
                        value: t("drivers.registrySummary", locale, {
                          eligible: counts.eligible,
                          blocked: blockedCount,
                          live: liveLocationCount,
                          stale: staleLocationCount,
                        }),
                      },
                      {
                        label: locale === "en" ? "On shift" : "在班",
                        value: `${counts.on_shift}`,
                        mono: true,
                      },
                      {
                        label: locale === "en" ? "Offline" : "下班",
                        value: `${counts.offline}`,
                        mono: true,
                      },
                    ]}
                  />
                </Field>
              </Card>

              <Card
                theme={theme}
                title={locale === "en" ? "Filter Snapshot" : "篩選快照"}
                subtitle={
                  locale === "en" ? "Dispatch-first triage" : "以派遣判斷優先"
                }
              >
                <div style={fieldStackStyle}>
                  <Field
                    theme={theme}
                    label={
                      locale === "en" ? "Eligibility blockers" : "阻塞原因"
                    }
                    hint={
                      topBlockers.length === 0
                        ? t("drivers.list.eligibilityClear", locale)
                        : undefined
                    }
                  >
                    <div style={pillWrapStyle}>
                      {topBlockers.length > 0 ? (
                        topBlockers.map((blocker) => (
                          <Pill key={blocker.key} theme={theme} tone="warn" dot>
                            {blocker.label} · {blocker.count}
                          </Pill>
                        ))
                      ) : (
                        <Pill theme={theme} tone="success">
                          {t("drivers.list.eligibilityClear", locale)}
                        </Pill>
                      )}
                    </div>
                  </Field>

                  <Field
                    theme={theme}
                    label={
                      locale === "en" ? "Location freshness" : "定位新鮮度"
                    }
                  >
                    <DL
                      theme={theme}
                      cols={2}
                      monoVal
                      items={[
                        {
                          label: t("drivers.list.locationLive", locale),
                          value: `${liveLocationCount}`,
                        },
                        {
                          label: t("drivers.list.locationStale", locale),
                          value: `${staleLocationCount}`,
                        },
                        {
                          label: t("drivers.list.locationMissing", locale),
                          value: `${missingLocationCount}`,
                        },
                        {
                          label: t("drivers.list.locationUnknown", locale),
                          value: `${unknownLocationCount}`,
                        },
                      ]}
                    />
                  </Field>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
