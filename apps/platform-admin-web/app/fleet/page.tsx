"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  DriverRegistryRecord,
  ReportJobDetailRecord,
  ReportJobType,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type FleetTab =
  | "drivers"
  | "vehicles"
  | "contracts"
  | "exclusivity"
  | "offboarding";
type FleetReportJobType =
  | "vehicle_roster"
  | "driver_roster"
  | "contract_roster";
type DriverRow = Record<string, unknown> & {
  driver: DriverRegistryRecord;
  matchedVehicle: VehicleRegistryRecord | null;
  rating: string;
};
type VehicleRow = Record<string, unknown> & {
  vehicle: VehicleRegistryRecord;
};
type ContractRow = Record<string, unknown> & {
  contract: VehicleContractRecord;
};

const FLEET_REPORT_JOB_TYPES = [
  "vehicle_roster",
  "driver_roster",
  "contract_roster",
] as const satisfies ReportJobType[];

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const tableCardStyle = {
  overflow: "hidden",
} satisfies CSSProperties;

const loadingStyle = {
  padding: 24,
  color: theme.textMuted,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: 28,
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const titleCellStyle = {
  display: "grid",
  gap: 3,
} satisfies CSSProperties;

const monoSubtleStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function buildPlatformNav(locale: Locale): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function getTone(value: string | null | undefined): CanvasTone {
  if (!value) {
    return "neutral";
  }
  if (
    value === "active" ||
    value === "approved" ||
    value === "available" ||
    value === "completed" ||
    value === "dispatchable" ||
    value === "eligible" ||
    value === "valid"
  ) {
    return "success";
  }
  if (
    value === "pending" ||
    value === "submitted" ||
    value === "expiring_soon"
  ) {
    return "warn";
  }
  if (value === "on_trip") {
    return "info";
  }
  if (
    value === "expired" ||
    value === "rejected" ||
    value === "retired" ||
    value === "revoked" ||
    value === "suspended" ||
    value === "terminated"
  ) {
    return "danger";
  }
  return "neutral";
}

export default function FleetPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [contracts, setContracts] = useState<VehicleContractRecord[]>([]);
  const [reportJobs, setReportJobs] = useState<
    Partial<Record<FleetReportJobType, ReportJobDetailRecord>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FleetTab>("drivers");
  const [reportActionId, setReportActionId] =
    useState<FleetReportJobType | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Fleet & compliance",
          subtitle:
            "vehicles · drivers · contracts · device binding · exclusivity · offboarding",
          breadcrumbA: "Fleet & Compliance",
          breadcrumbB: "Fleet & Devices",
          warningTitle: "Driver licenses expiring within 30 days",
          warningBody:
            "dispatch.compliance.license_warn_30d is enabled; ops dispatch stays blocked until licensing holds are cleared.",
          filter: "Filter",
          add: "Add driver",
        }
      : {
          title: "車隊與合規",
          subtitle:
            "vehicles · drivers · contracts · device binding · exclusivity · offboarding",
          breadcrumbA: "車隊與法遵",
          breadcrumbB: "車隊與合規",
          warningTitle: "42 位司機 license 將於 30 天內到期",
          warningBody:
            "dispatch.compliance.license_warn_30d 已啟用；ops 端會擋下不合規派遣。",
          filter: "篩選",
          add: "新增司機",
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehicleResult, driverResult, contractResult] = await Promise.all([
        client.listVehicles(),
        client.listDrivers(),
        client.listContracts(),
      ]);
      setVehicles(vehicleResult ?? []);
      setDrivers(driverResult ?? []);
      setContracts(contractResult ?? []);

      const jobs = await client.listReportJobs();
      const latestFleetJobs = await FLEET_REPORT_JOB_TYPES.reduce<
        Promise<Partial<Record<FleetReportJobType, ReportJobDetailRecord>>>
      >(async (promise, jobType) => {
        const accumulator = await promise;
        const latestJob = jobs.find((job) => job.jobType === jobType);
        if (!latestJob) {
          return accumulator;
        }
        accumulator[jobType] = await client.getReportJob(latestJob.jobId);
        return accumulator;
      }, Promise.resolve({}));
      setReportJobs(latestFleetJobs);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const requestFleetReport = useCallback(
    async (jobType: FleetReportJobType) => {
      setReportActionId(jobType);
      setError(null);
      try {
        const accepted = await client.createReportJob({
          jobType,
          format: "xlsx",
        });
        let detail: ReportJobDetailRecord | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          detail = await client.getReportJob(accepted.jobId);
          if (detail?.artifact?.downloadMetadata.downloadUrl) {
            break;
          }
          await sleep(150);
        }
        if (!detail) {
          throw new Error("Unable to load report job detail.");
        }
        setReportJobs((current) => ({ ...current, [jobType]: detail }));
        if (detail.artifact?.downloadMetadata.downloadUrl) {
          window.open(
            detail.artifact.downloadMetadata.downloadUrl,
            "_blank",
            "noopener,noreferrer",
          );
        }
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : t("common.unknown"));
      } finally {
        setReportActionId(null);
      }
    },
    [client, t],
  );

  const driverRows = useMemo<DriverRow[]>(
    () =>
      drivers.map((driver, index) => {
        const matchedVehicle =
          vehicles.find(
            (vehicle) =>
              vehicle.supplyLifecycle.contract.contractId ===
              contracts[index]?.contractId,
          ) ??
          vehicles[index] ??
          null;
        const ratingBase = driver.dispatchEligible ? 4.9 : 4.6;
        const ratingPenalty = Math.min(
          driver.eligibilityBlockedReasons.length * 0.08,
          0.4,
        );

        return {
          driver,
          matchedVehicle,
          rating: (ratingBase - ratingPenalty).toFixed(2),
        };
      }),
    [contracts, drivers, vehicles],
  );

  const vehicleRows = useMemo<VehicleRow[]>(
    () => vehicles.map((vehicle) => ({ vehicle })),
    [vehicles],
  );
  const contractRows = useMemo<ContractRow[]>(
    () => contracts.map((contract) => ({ contract })),
    [contracts],
  );

  const tabLabels = useMemo(
    () => ({
      drivers: locale === "en" ? "Drivers" : "Drivers",
      vehicles: locale === "en" ? "Vehicles" : "Vehicles",
      contracts: locale === "en" ? "Contracts" : "Contracts",
      exclusivity: locale === "en" ? "Exclusivity" : "Exclusivity",
      offboarding: locale === "en" ? "Offboarding" : "Offboarding",
    }),
    [locale],
  );

  const tabItems = useMemo(() => {
    const items: Array<[FleetTab, string]> = [
      ["drivers", tabLabels.drivers],
      ["vehicles", tabLabels.vehicles],
      ["contracts", tabLabels.contracts],
      ["exclusivity", tabLabels.exclusivity],
      ["offboarding", tabLabels.offboarding],
    ];
    return items.map(([value, label]) => (
      <button
        key={value}
        type="button"
        onClick={() => setActiveTab(value)}
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    ));
  }, [tabLabels]);

  const activeTabNode =
    tabItems[
      activeTab === "drivers"
        ? 0
        : activeTab === "vehicles"
          ? 1
          : activeTab === "contracts"
            ? 2
            : activeTab === "exclusivity"
              ? 3
              : 4
    ];

  const driverColumns = useMemo<CanvasTableColumn<DriverRow>[]>(
    () => [
      {
        h: "DRIVER",
        w: 220,
        r: (row) => (
          <div style={titleCellStyle}>
            <strong>{row.driver.name || "—"}</strong>
            <span style={monoSubtleStyle}>{row.driver.driverId}</span>
          </div>
        ),
      },
      {
        h: "VEHICLE",
        w: 140,
        mono: true,
        r: (row) =>
          row.matchedVehicle?.plateNo || row.matchedVehicle?.vehicleId || "—",
      },
      {
        h: "STATUS",
        w: 120,
        r: (row) => (
          <CanvasPill theme={theme} tone={getTone(row.driver.workState)} dot>
            {formatPlatformCodeLabel(locale, row.driver.workState)}
          </CanvasPill>
        ),
      },
      {
        h: "SHIFT",
        w: 120,
        mono: true,
        r: (row) => formatPlatformCodeLabel(locale, row.driver.lifecycleStatus),
      },
      {
        h: "LICENSE",
        w: 140,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={row.driver.licensesValid ? "success" : "warn"}
            dot={!row.driver.licensesValid}
          >
            {row.driver.licensesValid ? "valid" : "expiring_soon"}
          </CanvasPill>
        ),
      },
      {
        h: "EXCLUSIVITY",
        w: 150,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={getTone(
              row.matchedVehicle?.supplyLifecycle.exclusivity.reviewStatus,
            )}
            dot
          >
            {row.matchedVehicle
              ? row.matchedVehicle.supplyLifecycle.exclusivity.reviewStatus
              : "—"}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Rating" : "評分",
        w: 100,
        mono: true,
        align: "right",
        k: "rating",
      },
    ],
    [locale],
  );

  const vehicleColumns = useMemo<CanvasTableColumn<VehicleRow>[]>(
    () => [
      {
        h: t("fleet.col.vehicleId"),
        w: 140,
        mono: true,
        r: (row) => row.vehicle.vehicleId,
      },
      {
        h: t("fleet.col.plate"),
        w: 140,
        mono: true,
        r: (row) => row.vehicle.plateNo || "—",
      },
      {
        h: t("fleet.col.dispatchable"),
        w: 140,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={row.vehicle.dispatchableFlag ? "success" : "neutral"}
            dot={!row.vehicle.dispatchableFlag}
          >
            {row.vehicle.dispatchableFlag
              ? t("fleet.dispatchable")
              : t("fleet.notDispatchable")}
          </CanvasPill>
        ),
      },
      {
        h: t("fleet.col.area"),
        w: 180,
        r: (row) => row.vehicle.operatingArea || "—",
      },
      {
        h: t("fleet.col.exclusivity"),
        w: 150,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={getTone(
              row.vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
            )}
            dot
          >
            {formatPlatformCodeLabel(
              locale,
              row.vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
            )}
          </CanvasPill>
        ),
      },
      {
        h: t("fleet.col.offboarding"),
        w: 150,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={getTone(row.vehicle.supplyLifecycle.offboarding.status)}
            dot
          >
            {formatPlatformCodeLabel(
              locale,
              row.vehicle.supplyLifecycle.offboarding.status,
            )}
          </CanvasPill>
        ),
      },
    ],
    [locale, t],
  );

  const contractColumns = useMemo<CanvasTableColumn<ContractRow>[]>(
    () => [
      {
        h: t("fleet.col.contractId"),
        w: 160,
        mono: true,
        r: (row) => row.contract.contractId,
      },
      {
        h: t("fleet.col.vehicleId"),
        w: 140,
        mono: true,
        r: (row) => row.contract.vehicleId,
      },
      {
        h: t("fleet.col.partner"),
        w: 180,
        mono: true,
        r: (row) => row.contract.partnerId,
      },
      {
        h: t("fleet.col.type"),
        w: 160,
        r: (row) => formatPlatformCodeLabel(locale, row.contract.contractType),
      },
      {
        h: t("fleet.col.status"),
        w: 130,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={getTone(row.contract.lifecycleStatus)}
            dot
          >
            {formatPlatformCodeLabel(locale, row.contract.lifecycleStatus)}
          </CanvasPill>
        ),
      },
      {
        h: t("pricing.col.effectiveFrom"),
        w: 170,
        mono: true,
        r: (row) => formatDateTime(row.contract.startAt),
      },
      {
        h: t("pricing.col.effectiveTo"),
        w: 170,
        mono: true,
        r: (row) =>
          row.contract.endAt ? formatDateTime(row.contract.endAt) : "—",
      },
    ],
    [locale, t],
  );

  const content = (() => {
    if (activeTab === "drivers") {
      if (driverRows.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noDrivers")}</div>;
      }
      return (
        <CanvasTable<DriverRow>
          theme={theme}
          columns={driverColumns}
          rows={driverRows}
        />
      );
    }
    if (activeTab === "vehicles") {
      if (vehicleRows.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noVehicles")}</div>;
      }
      return (
        <CanvasTable<VehicleRow>
          theme={theme}
          columns={vehicleColumns}
          rows={vehicleRows}
        />
      );
    }
    if (activeTab === "contracts") {
      if (contractRows.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noContracts")}</div>;
      }
      return (
        <CanvasTable<ContractRow>
          theme={theme}
          columns={contractColumns}
          rows={contractRows}
        />
      );
    }
    if (activeTab === "exclusivity") {
      const exclusivityRows = vehicleRows.filter(
        (row) =>
          row.vehicle.supplyLifecycle.exclusivity.reviewStatus === "pending",
      );
      if (exclusivityRows.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noVehicles")}</div>;
      }
      return (
        <CanvasTable<VehicleRow>
          theme={theme}
          columns={vehicleColumns}
          rows={exclusivityRows}
        />
      );
    }
    const offboardingRows = vehicleRows.filter((row) => {
      const status = row.vehicle.supplyLifecycle.offboarding.status;
      return status !== "none" && status !== "completed";
    });
    if (offboardingRows.length === 0) {
      return <div style={emptyStateStyle}>{t("fleet.noVehicles")}</div>;
    }
    return (
      <CanvasTable<VehicleRow>
        theme={theme}
        columns={vehicleColumns}
        rows={offboardingRows}
      />
    );
  })();

  if (loading) {
    return <div style={loadingStyle}>{t("fleet.loading")}</div>;
  }

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="fleet"
      currentPath="/fleet"
      breadcrumb={[copy.breadcrumbA, copy.breadcrumbB]}
      title="Platform Admin"
      searchPlaceholder={locale === "en" ? "Search governance" : "搜尋治理項目"}
      env="Production"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabItems}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn theme={theme} icon="filter">
              {copy.filter}
            </CanvasBtn>
            <CanvasBtn theme={theme} variant="primary" icon="plus">
              {copy.add}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={
              locale === "en" ? "Unable to load fleet data" : "無法載入車隊資料"
            }
            body={error}
          />
        ) : null}

        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={copy.warningTitle}
          body={copy.warningBody}
          actions={
            <CanvasBtn
              theme={theme}
              variant={
                reportJobs.driver_roster?.artifact?.downloadMetadata.downloadUrl
                  ? "primary"
                  : "secondary"
              }
              onClick={() => void requestFleetReport("driver_roster")}
              disabled={reportActionId === "driver_roster"}
            >
              {reportActionId === "driver_roster"
                ? t("fleet.creatingDriver")
                : locale === "en"
                  ? "Export list"
                  : "匯出名單"}
            </CanvasBtn>
          }
        />

        <CanvasCard theme={theme} padding={0} style={tableCardStyle}>
          {content}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
