import type { VehicleRegistryRecord } from "@drts/contracts";
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
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

type VehicleTableRow = Record<string, unknown> & {
  plate: string;
  profile: string;
  operatingArea: string;
  serviceBuckets: string;
  dispatchable: boolean;
  dispatchableLabel: string;
  blockedBy: string;
  blockedTone: CanvasTone;
  contract: string;
  contractTone: CanvasTone;
  insurance: string;
  insuranceTone: CanvasTone;
  offboarding: string;
  offboardingTone: CanvasTone;
  lastChange: string;
  debrandingPending: boolean;
  _selected?: boolean;
};

function lifecycleTone(status: string): CanvasTone {
  if (status === "active" || status === "valid" || status === "completed") {
    return "success";
  }
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "cancelled"
  ) {
    return "danger";
  }
  if (status === "none" || status === "not_required" || status === "missing") {
    return "neutral";
  }
  return "warn";
}

function formatShortDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
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

function buildVehicleRows(
  vehicles: VehicleRegistryRecord[],
  locale: Locale,
): VehicleTableRow[] {
  return [...vehicles]
    .sort((left, right) => {
      const leftPriority =
        (left.supplyLifecycle.dispatch.blockedReasons.length > 0 ? 0 : 1) +
        (left.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? -1
          : 0);
      const rightPriority =
        (right.supplyLifecycle.dispatch.blockedReasons.length > 0 ? 0 : 1) +
        (right.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? -1
          : 0);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.plateNo.localeCompare(right.plateNo);
    })
    .map((vehicle) => ({
      plate: vehicle.plateNo,
      profile: vehicle.vehicleId,
      operatingArea: vehicle.operatingArea,
      serviceBuckets: vehicle.supportedServiceBuckets
        .map((bucket) => formatOpsCodeLabel(locale, bucket))
        .join(" · "),
      dispatchable: vehicle.dispatchableFlag,
      dispatchableLabel: vehicle.dispatchableFlag
        ? t("common.yes", locale)
        : t("common.no", locale),
      blockedBy:
        vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
          ? vehicle.supplyLifecycle.dispatch.blockedReasons
              .map((reason) => formatOpsCodeLabel(locale, reason))
              .join(" / ")
          : t("vehicles.noneBlocked", locale),
      blockedTone:
        vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
          ? "warn"
          : "neutral",
      contract: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.contract.lifecycleStatus,
      ),
      contractTone: lifecycleTone(
        vehicle.supplyLifecycle.contract.lifecycleStatus,
      ),
      insurance: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.insurance.lifecycleStatus,
      ),
      insuranceTone: lifecycleTone(
        vehicle.supplyLifecycle.insurance.lifecycleStatus,
      ),
      offboarding: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.offboarding.status,
      ),
      offboardingTone: lifecycleTone(vehicle.supplyLifecycle.offboarding.status),
      lastChange: vehicle.supplyLifecycle.lastTrace
        ? `${vehicle.supplyLifecycle.lastTrace.message} · ${formatShortDateTime(
            locale,
            vehicle.supplyLifecycle.lastTrace.occurredAt,
          )}`
        : t("vehicles.lastChangeNone", locale),
      debrandingPending:
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
      _selected:
        vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0 ||
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
    }));
}

export default async function VehiclesPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let vehicles: VehicleRegistryRecord[] = [];
  let error: string | null = null;

  try {
    vehicles = await client.listVehicles();
  } catch (nextError) {
    error =
      nextError instanceof Error
        ? nextError.message
        : t("common.unknown", locale);
  }

  const warningVehicles = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
  );
  const dispatchableCount = vehicles.filter(
    (vehicle) => vehicle.dispatchableFlag,
  ).length;
  const offboardingCount = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none",
  ).length;
  const debrandingPendingCount = vehicles.filter(
    (vehicle) =>
      vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
  ).length;

  const rows = buildVehicleRows(vehicles, locale);

  const columns: CanvasTableColumn<VehicleTableRow>[] = [
    {
      h: t("vehicles.col.plate", locale),
      w: 130,
      mono: true,
      r: (row) => <span style={{ fontWeight: 600 }}>{row.plate}</span>,
    },
    {
      h: t("vehicles.col.vehicleId", locale),
      w: 210,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 11.5,
              color: theme.text,
            }}
          >
            {row.profile}
          </span>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.serviceBuckets}
          </span>
        </div>
      ),
    },
    {
      h: t("vehicles.col.operatingArea", locale),
      w: 180,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{row.operatingArea}</span>
          <Pill theme={theme} tone={row.blockedTone}>
            {row.blockedBy}
          </Pill>
        </div>
      ),
    },
    {
      h: t("vehicles.col.dispatchable", locale),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.dispatchable ? "success" : "danger"}
          dot
        >
          {row.dispatchableLabel}
        </Pill>
      ),
    },
    {
      h: t("vehicles.col.contract", locale),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.contractTone} dot>
          {row.contract}
        </Pill>
      ),
    },
    {
      h: t("vehicles.col.insurance", locale),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.insuranceTone} dot>
          {row.insurance}
        </Pill>
      ),
    },
    {
      h: t("vehicles.col.offboarding", locale),
      w: 150,
      r: (row) => {
        if (row.debrandingPending) {
          return (
            <div style={{ display: "grid", gap: 4 }}>
              <Pill theme={theme} tone={row.offboardingTone} dot>
                {row.offboarding}
              </Pill>
              <span style={{ fontSize: 11.5, color: theme.warn }}>
                {t("vehicles.debrandingPending", locale)}
              </span>
            </div>
          );
        }

        return (
          <Pill theme={theme} tone={row.offboardingTone} dot>
            {row.offboarding}
          </Pill>
        );
      },
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
        active="vehicles"
        currentPath="/vehicles"
        breadcrumb={[
          locale === "en" ? "Registry" : "主資料",
          t("nav.vehicles", locale),
        ]}
        searchPlaceholder={
          locale === "en"
            ? "Search vehicle, plate, or area..."
            : "搜尋車輛、車牌或營運區域..."
        }
        brandLabel={t("app.name", locale)}
        brandSubLabel={t("app.sub", locale)}
        env={locale === "en" ? "staging" : "測試"}
        versionLabel="OC"
        avatarLabel="OC"
      >
        <PageHeader
          theme={theme}
          title={t("vehicles.title", locale)}
          subtitle={
            locale === "en"
              ? "dispatchable · contract · insurance · debrand"
              : "dispatchable · 合約 · 保險 · debrand"
          }
          actions={
            <Btn theme={theme} icon="filter">
              {locale === "en" ? "Filter" : "篩選"}
            </Btn>
          }
        />

        <div style={pageStackStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("vehicles.warningTitle", locale)}
              body={error}
            />
          ) : null}

          {warningVehicles.length > 0 ? (
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title={t("vehicles.warningTitle", locale)}
              body={t("vehicles.registrySummary", locale, {
                dispatchable: dispatchableCount,
                blocked: warningVehicles.length,
                offboarding: offboardingCount,
                debranding: debrandingPendingCount,
              })}
            />
          ) : null}

          <Card
            theme={theme}
            title={t("vehicles.title", locale)}
            subtitle={
              locale === "en"
                ? "dispatchable · contract · insurance · debrand"
                : "dispatchable · 合約 · 保險 · debrand"
            }
            padding={0}
          >
            {rows.length > 0 ? (
              <Table theme={theme} columns={columns} rows={rows} />
            ) : (
              <div
                style={{
                  padding: 16,
                  color: theme.textMuted,
                  fontSize: 12.5,
                }}
              >
                {t("vehicles.empty", locale)}
              </div>
            )}
          </Card>
        </div>
      </Shell>
    </div>
  );
}
