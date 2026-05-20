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
  model: string;
  modelMeta: string;
  year: string;
  dispatchable: boolean;
  dispatchableLabel: string;
  contract: string;
  insurance: string;
  debrandDue: string;
  debrandTone: "neutral" | "warn" | "success";
};

function formatShortDate(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(value));
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
    .sort((left, right) => left.plateNo.localeCompare(right.plateNo))
    .map((vehicle) => ({
      plate: vehicle.plateNo,
      model: vehicle.vehicleId,
      modelMeta: vehicle.operatingArea,
      year: "—",
      dispatchable: vehicle.dispatchableFlag,
      dispatchableLabel: vehicle.dispatchableFlag
        ? t("common.yes", locale)
        : t("common.no", locale),
      contract: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.contract.lifecycleStatus,
      ),
      insurance: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.insurance.lifecycleStatus,
      ),
      debrandDue: vehicle.supplyLifecycle.offboarding.debrandingRequired
        ? formatShortDate(
            locale,
            vehicle.supplyLifecycle.offboarding.debrandingDueAt,
          )
        : "—",
      debrandTone:
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? "warn"
          : vehicle.supplyLifecycle.offboarding.debrandingStatus ===
              "completed"
            ? "success"
            : "neutral",
    }));
}

function buildDebrandLabel(row: VehicleTableRow, locale: Locale) {
  if (row.debrandDue === "—") {
    return locale === "en" ? "not due" : "無";
  }

  if (row.debrandTone === "warn") {
    return locale === "en"
      ? `due ${row.debrandDue}`
      : `到期 ${row.debrandDue}`;
  }

  if (row.debrandTone === "neutral") {
    return row.debrandDue;
  }

  return locale === "en"
    ? `cleared ${row.debrandDue}`
    : `已完成 ${row.debrandDue}`;
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

  const rows = buildVehicleRows(vehicles, locale);

  const columns: CanvasTableColumn<VehicleTableRow>[] = [
    {
      h: t("vehicles.col.plate", locale),
      w: 130,
      mono: true,
      r: (row) => <span style={{ fontWeight: 600 }}>{row.plate}</span>,
    },
    {
      h: locale === "en" ? "MODEL" : "車型 / 車輛",
      w: 210,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.text,
            }}
          >
            {row.model}
          </span>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.modelMeta}
          </span>
        </div>
      ),
    },
    {
      h: locale === "en" ? "YEAR" : "年份",
      w: 80,
      mono: true,
      align: "right",
      r: (row) => row.year,
    },
    {
      h: t("vehicles.col.dispatchable", locale),
      w: 140,
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
      k: "contract",
      w: 130,
      mono: true,
    },
    {
      h: t("vehicles.col.insurance", locale),
      k: "insurance",
      w: 130,
      mono: true,
    },
    {
      h: locale === "en" ? "DEBRAND DUE" : "除標識期限",
      w: 160,
      mono: true,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.debrandTone}
          dot={row.debrandTone !== "neutral"}
        >
          {buildDebrandLabel(row, locale)}
        </Pill>
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

          <Card
            theme={theme}
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
