/**
 * Fleet & Devices Management Page
 * Canvas handoff for fleet governance with a driver-first roster.
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreateDriverMasterCommand,
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
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasInput,
  CanvasKPI,
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

type DriverTableRow = DriverRegistryRecord & Record<string, unknown>;
type VehicleTableRow = VehicleRegistryRecord & Record<string, unknown>;
type ContractTableRow = VehicleContractRecord & Record<string, unknown>;

type ExclusivityRow = Record<string, unknown> & {
  vehicleId: string;
  plateNo: string;
  declarationStatus: "missing" | "submitted";
  reviewStatus: "draft" | "pending" | "approved" | "rejected";
  providerName: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  updatedAt: string | null;
};

type OffboardingRow = Record<string, unknown> & {
  vehicleId: string;
  plateNo: string;
  status: string;
  reason: string | null;
  requestedBy: string | null;
  debrandingStatus: string;
  debrandingDueAt: string | null;
  updatedAt: string | null;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const loadingCardStyle = {
  padding: 28,
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
} satisfies CSSProperties;

const tabButtonStyle = {
  border: 0,
  background: "transparent",
  padding: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
} satisfies CSSProperties;

const cellStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const primaryCellTextStyle = {
  fontWeight: 600,
  color: theme.text,
} satisfies CSSProperties;

const monoCellTextStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const mutedCellTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
} satisfies CSSProperties;

const governanceGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 14,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  outline: "none",
} satisfies CSSProperties;

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  color: theme.text,
} satisfies CSSProperties;

const formActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 6,
} satisfies CSSProperties;

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 128,
  height: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.accent}`,
  background: theme.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

const emptyStateStyle = {
  padding: 32,
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
} satisfies CSSProperties;

const reportActionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14,
} satisfies CSSProperties;

const FLEET_REPORT_JOB_TYPES = [
  "vehicle_roster",
  "driver_roster",
  "contract_roster",
] as const satisfies ReportJobType[];

type FleetReportJobType = (typeof FLEET_REPORT_JOB_TYPES)[number];

function createInitialDriverForm(): CreateDriverMasterCommand {
  return {
    name: "",
    phone: "",
    email: "",
    licensesValid: false,
    supportedServiceBuckets: ["standard_taxi"],
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
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

function latestIso(values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) {
      return latest;
    }
    if (!latest) {
      return value;
    }
    return new Date(value).getTime() > new Date(latest).getTime()
      ? value
      : latest;
  }, null);
}

function summarizeServiceBuckets(
  locale: Locale,
  values: string[],
  emptyLabel: string,
) {
  if (values.length === 0) {
    return emptyLabel;
  }
  const [firstValue, ...restValues] = values;
  const firstLabel = formatPlatformCodeLabel(locale, firstValue);
  return restValues.length === 0
    ? firstLabel
    : `${firstLabel} +${restValues.length}`;
}

function formatWindow(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
) {
  if (!startAt && !endAt) {
    return "—";
  }
  return `${startAt ? formatDateTime(startAt) : "—"} -> ${
    endAt ? formatDateTime(endAt) : "—"
  }`;
}

function workStateTone(status: DriverRegistryRecord["workState"]): CanvasTone {
  switch (status) {
    case "available":
      return "success";
    case "paused":
      return "warn";
    case "on_trip":
    case "enroute":
    case "arrived":
      return "info";
    case "incident_hold":
    case "suspended":
      return "danger";
    case "offline":
    case "reserved":
    default:
      return "neutral";
  }
}

function yesNoTone(active: boolean, activeTone: CanvasTone): CanvasTone {
  return active ? activeTone : "warn";
}

function contractStatusTone(status: VehicleContractRecord["status"]): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "terminated":
      return "danger";
    case "draft":
    default:
      return "warn";
  }
}

function reviewTone(status: ExclusivityRow["reviewStatus"]): CanvasTone {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "info";
    case "rejected":
      return "danger";
    case "draft":
    default:
      return "warn";
  }
}

function offboardingTone(status: string): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
    case "requested":
      return "warn";
    case "cancelled":
      return "danger";
    case "none":
    default:
      return "neutral";
  }
}

function reportStatusLabel(
  locale: Locale,
  copy: {
    reportIdle: string;
    reportPending: string;
    reportReady: string;
  },
  detail: ReportJobDetailRecord | null | undefined,
) {
  if (!detail) {
    return copy.reportIdle;
  }
  if (detail.artifact?.downloadMetadata.downloadUrl) {
    return copy.reportReady;
  }
  if (detail.status === "running" || detail.status === "queued") {
    return copy.reportPending;
  }
  return formatPlatformCodeLabel(locale, detail.status);
}

function tabToReportJobType(tab: FleetTab): FleetReportJobType {
  if (tab === "drivers") {
    return "driver_roster";
  }
  if (tab === "contracts") {
    return "contract_roster";
  }
  return "vehicle_roster";
}

// The current fleet slice does not expose canonical driver-to-vehicle
// assignments to this page, so approximate the roster with compatible vehicles
// instead of adding new fetches outside the accepted handoff scope.
function buildDriverVehicleMap(
  drivers: DriverRegistryRecord[],
  vehicles: VehicleRegistryRecord[],
) {
  const remainingVehicles = [...vehicles];
  const matchedVehicles = new Map<string, VehicleRegistryRecord>();

  for (const driver of drivers) {
    const matchedIndex = remainingVehicles.findIndex((vehicle) =>
      vehicle.supportedServiceBuckets.some((bucket) =>
        driver.supportedServiceBuckets.includes(bucket),
      ),
    );
    if (matchedIndex === -1) {
      continue;
    }
    const [matchedVehicle] = remainingVehicles.splice(matchedIndex, 1);
    if (!matchedVehicle) {
      continue;
    }
    matchedVehicles.set(driver.driverId, matchedVehicle);
  }

  return matchedVehicles;
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
  const [showGovernancePanel, setShowGovernancePanel] = useState(false);
  const [showCreateDriver, setShowCreateDriver] = useState(false);
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [reportActionId, setReportActionId] =
    useState<FleetReportJobType | null>(null);
  const [driverForm, setDriverForm] = useState<CreateDriverMasterCommand>(
    createInitialDriverForm(),
  );

  const copy =
    locale === "en"
      ? {
          breadcrumbRoot: "Fleet & Compliance",
          pageTitle: "Fleet & compliance",
          pageSubtitle:
            "vehicles · drivers · contracts · device binding · exclusivity · offboarding",
          searchPlaceholder: "Search drivers, vehicles, contracts...",
          filterAction: "Filter",
          createAction: "Add driver",
          refreshAction: "Refresh",
          selectedLane: "Selected lane",
          visibleRows: "Visible rows",
          latestExport: "Latest export",
          latestUpdate: "Latest update",
          summaryTitle: "Governance snapshot",
          summarySubtitle:
            "Keep dispatch, contract, exclusivity, and offboarding evidence visible from one roster.",
          createTitle: "Create driver master",
          createSubtitle:
            "Provision the driver record before device binding and dispatch eligibility changes.",
          noExclusivity: "No exclusivity reviews.",
          noOffboarding: "No offboarding records.",
          unassignedVehicle: "Unassigned",
          noShift: "Open roster",
          profileLinked: "linked",
          profilePending: "pending",
          exportRoster: "Export roster",
          exportDrivers: "Export drivers",
          exportVehicles: "Export vehicles",
          exportContracts: "Export contracts",
          openExport: "Open signed download",
          reportIdle: "No governed artifact generated yet.",
          reportPending: "Preparing governed export...",
          reportReady: "Latest artifact ready",
          kpis: {
            activeDrivers: "Active drivers",
            blockedVehicles: "Blocked vehicles",
            pendingExclusivity: "Pending exclusivity",
            pendingOffboarding: "Pending offboarding",
          },
          licenseTitle: (count: number) =>
            count > 0
              ? `${count} drivers need license review`
              : "License review lane is clear",
          licenseBody:
            "dispatch.compliance.license_warn_30d is active and non-compliant dispatch stays blocked.",
        }
      : {
          breadcrumbRoot: "車隊與法遵",
          pageTitle: "車隊與合規",
          pageSubtitle:
            "vehicles · drivers · contracts · device binding · exclusivity · offboarding",
          searchPlaceholder: "搜尋司機、車輛、合約...",
          filterAction: "篩選",
          createAction: "新增司機",
          refreshAction: "重新整理",
          selectedLane: "目前治理 lane",
          visibleRows: "可見列數",
          latestExport: "最新匯出",
          latestUpdate: "最近更新",
          summaryTitle: "治理快照",
          summarySubtitle:
            "把 dispatch、contract、exclusivity 與 offboarding 證據維持在同一份 roster 視角。",
          createTitle: "建立司機主檔",
          createSubtitle:
            "先建立 driver record，再往下接 device binding 與 dispatch eligibility。",
          noExclusivity: "目前沒有排他審核資料。",
          noOffboarding: "目前沒有退場資料。",
          unassignedVehicle: "未指派",
          noShift: "待排班",
          profileLinked: "已串接",
          profilePending: "待補",
          exportRoster: "匯出名單",
          exportDrivers: "匯出司機",
          exportVehicles: "匯出車輛",
          exportContracts: "匯出合約",
          openExport: "開啟簽名下載",
          reportIdle: "尚未建立受治理 artifact。",
          reportPending: "正在準備受治理匯出...",
          reportReady: "最新 artifact 已就緒",
          kpis: {
            activeDrivers: "啟用司機",
            blockedVehicles: "受阻車輛",
            pendingExclusivity: "待審排他",
            pendingOffboarding: "待完成退場",
          },
          licenseTitle: (count: number) =>
            count > 0
              ? `${count} 位司機需要補齊 license 審查`
              : "License 審查 lane 目前已清空",
          licenseBody:
            "dispatch.compliance.license_warn_30d 已啟用，ops 端會持續擋下不合規派遣。",
        };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehicleResult, driverResult, contractResult, jobs] =
        await Promise.all([
          client.listVehicles(),
          client.listDrivers(),
          client.listContracts(),
          client.listReportJobs(),
        ]);

      setVehicles(vehicleResult ?? []);
      setDrivers(driverResult ?? []);
      setContracts(contractResult ?? []);

      const latestFleetJobs = await FLEET_REPORT_JOB_TYPES.reduce<
        Promise<Partial<Record<FleetReportJobType, ReportJobDetailRecord>>>
      >(async (accumulatorPromise, jobType) => {
        const accumulator = await accumulatorPromise;
        const latestJob = jobs.find((job) => job.jobType === jobType);
        if (!latestJob) {
          return accumulator;
        }
        accumulator[jobType] = await client.getReportJob(latestJob.jobId);
        return accumulator;
      }, Promise.resolve({}));

      setReportJobs(latestFleetJobs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

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
          if (detail.artifact?.downloadMetadata.downloadUrl) {
            break;
          }
          await sleep(150);
        }
        if (!detail) {
          throw new Error("Unable to load report job detail.");
        }
        setReportJobs((current) => ({
          ...current,
          [jobType]: detail,
        }));
        if (detail.artifact?.downloadMetadata.downloadUrl) {
          window.open(
            detail.artifact.downloadMetadata.downloadUrl,
            "_blank",
            "noopener,noreferrer",
          );
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReportActionId(null);
      }
    },
    [client],
  );

  const submitDriver = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreatingDriver(true);
      setError(null);
      try {
        await client.createDriverMaster({
          ...driverForm,
          name: driverForm.name.trim(),
          phone: driverForm.phone?.trim() || null,
          email: driverForm.email?.trim() || null,
        });
        setDriverForm(createInitialDriverForm());
        setShowCreateDriver(false);
        await loadData();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCreatingDriver(false);
      }
    },
    [client, driverForm, loadData],
  );

  const activeDrivers = drivers.filter(
    (driver) => driver.lifecycleStatus === "active",
  ).length;
  const blockedVehicles = vehicles.filter(
    (vehicle) =>
      !vehicle.dispatchableFlag ||
      vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
  ).length;
  const pendingExclusivity = vehicles.filter(
    (vehicle) =>
      vehicle.supplyLifecycle.exclusivity.reviewStatus === "pending" ||
      vehicle.supplyLifecycle.exclusivity.reviewStatus === "draft" ||
      vehicle.supplyLifecycle.exclusivity.declarationStatus === "missing",
  ).length;
  const pendingOffboarding = vehicles.filter((vehicle) => {
    const status = vehicle.supplyLifecycle.offboarding.status;
    return status !== "none" && status !== "completed";
  }).length;
  const licenseAttentionCount = drivers.filter(
    (driver) =>
      !driver.licensesValid ||
      driver.eligibilityBlockedReasons.includes("licenses_invalid"),
  ).length;
  const activeDeviceBindings = drivers.reduce((count, driver) => {
    return (
      count +
      driver.deviceBindings.filter((binding) => binding.status === "active")
        .length
    );
  }, 0);
  const latestUpdatedAt = latestIso([
    ...drivers.map((driver) => driver.updatedAt),
    ...vehicles.map((vehicle) => vehicle.updatedAt),
    ...contracts.map((contract) => contract.updatedAt),
  ]);
  const driverVehicleMap = buildDriverVehicleMap(drivers, vehicles);

  const exclusivityRows: ExclusivityRow[] = vehicles.map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    plateNo: vehicle.plateNo,
    declarationStatus:
      vehicle.supplyLifecycle.exclusivity.declarationStatus,
    reviewStatus: vehicle.supplyLifecycle.exclusivity.reviewStatus,
    providerName: vehicle.supplyLifecycle.exclusivity.providerName,
    effectiveStart: vehicle.supplyLifecycle.exclusivity.effectiveStart,
    effectiveEnd: vehicle.supplyLifecycle.exclusivity.effectiveEnd,
    updatedAt: vehicle.supplyLifecycle.exclusivity.updatedAt,
  }));

  const offboardingRows: OffboardingRow[] = vehicles
    .filter((vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none")
    .map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      plateNo: vehicle.plateNo,
      status: vehicle.supplyLifecycle.offboarding.status,
      reason: vehicle.supplyLifecycle.offboarding.reason,
      requestedBy: vehicle.supplyLifecycle.offboarding.requestedBy,
      debrandingStatus: vehicle.supplyLifecycle.offboarding.debrandingStatus,
      debrandingDueAt: vehicle.supplyLifecycle.offboarding.debrandingDueAt,
      updatedAt:
        vehicle.supplyLifecycle.offboarding.completedAt ??
        vehicle.supplyLifecycle.offboarding.requestedAt,
    }));

  const driverColumns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: "DRIVER",
      w: 180,
      r: (driver) => (
        <div style={cellStackStyle}>
          <span style={primaryCellTextStyle}>{driver.name}</span>
          <span style={monoCellTextStyle}>{driver.driverId}</span>
        </div>
      ),
    },
    {
      h: "VEHICLE",
      w: 140,
      r: (driver) => {
        const matchedVehicle = driverVehicleMap.get(driver.driverId);
        const activeBinding = driver.deviceBindings.find(
          (binding) => binding.status === "active",
        );

        return (
          <span style={monoCellTextStyle}>
            {matchedVehicle?.plateNo ??
              activeBinding?.deviceId ??
              copy.unassignedVehicle}
          </span>
        );
      },
    },
    {
      h: "STATUS",
      w: 110,
      r: (driver) => (
        <CanvasPill theme={theme} tone={workStateTone(driver.workState)} dot>
          {formatPlatformCodeLabel(locale, driver.workState)}
        </CanvasPill>
      ),
    },
    {
      h: "SHIFT",
      w: 130,
      mono: true,
      r: (driver) => (
        <span style={monoCellTextStyle}>
          {summarizeServiceBuckets(
            locale,
            driver.supportedServiceBuckets,
            copy.noShift,
          )}
        </span>
      ),
    },
    {
      h: "LICENSE",
      w: 130,
      r: (driver) => (
        <CanvasPill
          theme={theme}
          tone={yesNoTone(driver.licensesValid, "success")}
          dot={!driver.licensesValid}
        >
          {driver.licensesValid
            ? t("fleet.licensesValid")
            : t("fleet.licensesExpired")}
        </CanvasPill>
      ),
    },
    {
      h: "EXCLUSIVITY",
      w: 140,
      r: (driver) => {
        const matchedVehicle = driverVehicleMap.get(driver.driverId);

        return (
          <CanvasPill
            theme={theme}
            tone={
              matchedVehicle?.supplyLifecycle.exclusivity.declarationStatus ===
              "submitted"
                ? "success"
                : matchedVehicle
                  ? "warn"
                  : "neutral"
            }
            dot={Boolean(matchedVehicle)}
          >
            {matchedVehicle
              ? formatPlatformCodeLabel(
                  locale,
                  matchedVehicle.supplyLifecycle.exclusivity.declarationStatus,
                )
              : "—"}
          </CanvasPill>
        );
      },
    },
    {
      h: t("fleet.col.profile"),
      w: 120,
      align: "right",
      r: (driver) => (
        <span
          style={driver.profileUpdatedAt ? primaryCellTextStyle : mutedCellTextStyle}
        >
          {driver.profileUpdatedAt ? copy.profileLinked : copy.profilePending}
        </span>
      ),
    },
    {
      h: "",
      w: 28,
      r: () => <CanvasIcon name="more" size={14} stroke={1.6} />,
    },
  ];

  const vehicleColumns: CanvasTableColumn<VehicleTableRow>[] = [
    {
      h: "VEHICLE",
      w: 188,
      r: (vehicle) => (
        <div style={cellStackStyle}>
          <span style={primaryCellTextStyle}>{vehicle.plateNo}</span>
          <span style={monoCellTextStyle}>{vehicle.vehicleId}</span>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (vehicle) => (
        <CanvasPill
          theme={theme}
          tone={vehicle.dispatchableFlag ? "success" : "warn"}
          dot
        >
          {vehicle.dispatchableFlag
            ? t("fleet.dispatchable")
            : t("fleet.notDispatchable")}
        </CanvasPill>
      ),
    },
    {
      h: "AREA",
      k: "operatingArea",
      w: 130,
      mono: true,
    },
    {
      h: "CONTRACT",
      w: 150,
      r: (vehicle) => (
        <div style={cellStackStyle}>
          <span style={monoCellTextStyle}>
            {vehicle.supplyLifecycle.contract.contractId ?? "—"}
          </span>
          <span style={mutedCellTextStyle}>
            {formatPlatformCodeLabel(
              locale,
              vehicle.supplyLifecycle.contract.lifecycleStatus,
            )}
          </span>
        </div>
      ),
    },
    {
      h: "INSURANCE",
      w: 120,
      r: (vehicle) => (
        <CanvasPill
          theme={theme}
          tone={yesNoTone(vehicle.insuranceStatus === "valid", "success")}
          dot={vehicle.insuranceStatus !== "valid"}
        >
          {formatPlatformCodeLabel(locale, vehicle.insuranceStatus)}
        </CanvasPill>
      ),
    },
    {
      h: "EXCLUSIVITY",
      w: 136,
      r: (vehicle) => (
        <CanvasPill
          theme={theme}
          tone={reviewTone(vehicle.supplyLifecycle.exclusivity.reviewStatus)}
          dot
        >
          {formatPlatformCodeLabel(
            locale,
            vehicle.supplyLifecycle.exclusivity.reviewStatus,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "OFFBOARDING",
      w: 144,
      r: (vehicle) => (
        <CanvasPill
          theme={theme}
          tone={offboardingTone(vehicle.supplyLifecycle.offboarding.status)}
          dot
        >
          {formatPlatformCodeLabel(
            locale,
            vehicle.supplyLifecycle.offboarding.status,
          )}
        </CanvasPill>
      ),
    },
    {
      h: "UPDATED",
      w: 164,
      mono: true,
      r: (vehicle) => formatDateTime(vehicle.updatedAt),
    },
  ];

  const contractColumns: CanvasTableColumn<ContractTableRow>[] = [
    {
      h: "CONTRACT",
      w: 174,
      r: (contract) => (
        <div style={cellStackStyle}>
          <span style={primaryCellTextStyle}>{contract.contractId}</span>
          <span style={monoCellTextStyle}>{contract.vehicleId}</span>
        </div>
      ),
    },
    { h: "PARTNER", k: "partnerId", w: 148, mono: true },
    { h: "TYPE", k: "contractType", w: 144, mono: true },
    {
      h: "STATUS",
      w: 118,
      r: (contract) => (
        <CanvasPill theme={theme} tone={contractStatusTone(contract.status)} dot>
          {formatPlatformCodeLabel(locale, contract.status)}
        </CanvasPill>
      ),
    },
    { h: "SCOPE", k: "serviceScope", w: 160, mono: true },
    {
      h: "WINDOW",
      w: 220,
      r: (contract) => (
        <span style={monoCellTextStyle}>
          {formatWindow(contract.startAt, contract.endAt)}
        </span>
      ),
    },
    {
      h: "UPDATED",
      w: 164,
      mono: true,
      r: (contract) => formatDateTime(contract.updatedAt),
    },
  ];

  const exclusivityColumns: CanvasTableColumn<ExclusivityRow>[] = [
    {
      h: "VEHICLE",
      w: 180,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={primaryCellTextStyle}>{row.plateNo}</span>
          <span style={monoCellTextStyle}>{row.vehicleId}</span>
        </div>
      ),
    },
    {
      h: "DECLARATION",
      w: 130,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.declarationStatus === "submitted" ? "success" : "warn"}
          dot
        >
          {formatPlatformCodeLabel(locale, row.declarationStatus)}
        </CanvasPill>
      ),
    },
    {
      h: "REVIEW",
      w: 130,
      r: (row) => (
        <CanvasPill theme={theme} tone={reviewTone(row.reviewStatus)} dot>
          {formatPlatformCodeLabel(locale, row.reviewStatus)}
        </CanvasPill>
      ),
    },
    {
      h: "PROVIDER",
      w: 170,
      r: (row) => row.providerName ?? "—",
    },
    {
      h: "WINDOW",
      w: 220,
      r: (row) => (
        <span style={monoCellTextStyle}>
          {formatWindow(row.effectiveStart, row.effectiveEnd)}
        </span>
      ),
    },
    {
      h: "UPDATED",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt ?? ""),
    },
  ];

  const offboardingColumns: CanvasTableColumn<OffboardingRow>[] = [
    {
      h: "VEHICLE",
      w: 180,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={primaryCellTextStyle}>{row.plateNo}</span>
          <span style={monoCellTextStyle}>{row.vehicleId}</span>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <CanvasPill theme={theme} tone={offboardingTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "DEBRANDING",
      w: 144,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={offboardingTone(row.debrandingStatus)}
          dot
        >
          {formatPlatformCodeLabel(locale, row.debrandingStatus)}
        </CanvasPill>
      ),
    },
    {
      h: "REQUESTED BY",
      w: 144,
      r: (row) => row.requestedBy ?? "—",
    },
    {
      h: "REASON",
      w: 220,
      r: (row) => row.reason ?? "—",
    },
    {
      h: "DUE",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.debrandingDueAt ?? ""),
    },
    {
      h: "UPDATED",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt ?? ""),
    },
  ];

  const activeReportType = tabToReportJobType(activeTab);
  const activeReportJob = reportJobs[activeReportType];
  const reportStatusText = reportStatusLabel(locale, copy, activeReportJob);
  const activeTabLabel =
    activeTab === "drivers"
      ? t("fleet.tab.drivers")
      : activeTab === "vehicles"
        ? t("fleet.tab.vehicles")
        : activeTab === "contracts"
          ? t("fleet.tab.contracts")
          : activeTab === "exclusivity"
            ? t("fleet.col.exclusivity")
            : t("fleet.col.offboarding");

  const bannerExportLabel =
    activeTab === "drivers"
      ? copy.exportRoster
      : activeReportType === "contract_roster"
        ? copy.exportContracts
        : activeReportType === "driver_roster"
          ? copy.exportDrivers
          : copy.exportVehicles;

  const visibleRows =
    activeTab === "drivers"
      ? drivers.length
      : activeTab === "vehicles"
        ? vehicles.length
        : activeTab === "contracts"
          ? contracts.length
          : activeTab === "exclusivity"
            ? exclusivityRows.length
            : offboardingRows.length;

  const headerTabs = [
    {
      key: "drivers" as const,
      label: t("fleet.tab.drivers"),
    },
    {
      key: "vehicles" as const,
      label: t("fleet.tab.vehicles"),
    },
    {
      key: "contracts" as const,
      label: t("fleet.tab.contracts"),
    },
    {
      key: "exclusivity" as const,
      label: t("fleet.col.exclusivity"),
    },
    {
      key: "offboarding" as const,
      label: t("fleet.col.offboarding"),
    },
  ].map((tab) => ({
    key: tab.key,
    node: (
      <button
        key={tab.key}
        type="button"
        onClick={() => setActiveTab(tab.key)}
        style={tabButtonStyle}
      >
        {tab.label}
      </button>
    ),
  }));

  const activeHeaderTab =
    headerTabs.find((tab) => tab.key === activeTab)?.node ?? headerTabs[0]?.node;

  const governanceItems = [
    {
      k: copy.latestUpdate,
      v: latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "—",
      mono: true,
    },
    {
      k: copy.selectedLane,
      v: activeTabLabel,
    },
    {
      k: t("fleet.col.deviceBindings"),
      v: `${activeDeviceBindings}`,
      mono: true,
    },
    {
      k: copy.latestExport,
      v: reportStatusText,
    },
  ];

  const openLatestExport = () => {
    const downloadUrl = activeReportJob?.artifact?.downloadMetadata.downloadUrl;
    if (!downloadUrl) {
      return;
    }
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const renderTable = () => {
    if (loading) {
      return <div style={loadingCardStyle}>{t("fleet.loading")}</div>;
    }

    if (activeTab === "drivers") {
      if (drivers.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noDrivers")}</div>;
      }
      return (
        <CanvasTable<DriverTableRow>
          theme={theme}
          columns={driverColumns}
          rows={drivers as DriverTableRow[]}
        />
      );
    }

    if (activeTab === "vehicles") {
      if (vehicles.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noVehicles")}</div>;
      }
      return (
        <CanvasTable<VehicleTableRow>
          theme={theme}
          columns={vehicleColumns}
          rows={vehicles as VehicleTableRow[]}
        />
      );
    }

    if (activeTab === "contracts") {
      if (contracts.length === 0) {
        return <div style={emptyStateStyle}>{t("fleet.noContracts")}</div>;
      }
      return (
        <CanvasTable<ContractTableRow>
          theme={theme}
          columns={contractColumns}
          rows={contracts as ContractTableRow[]}
        />
      );
    }

    if (activeTab === "exclusivity") {
      if (exclusivityRows.length === 0) {
        return <div style={emptyStateStyle}>{copy.noExclusivity}</div>;
      }
      return (
        <CanvasTable<ExclusivityRow>
          theme={theme}
          columns={exclusivityColumns}
          rows={exclusivityRows}
        />
      );
    }

    if (offboardingRows.length === 0) {
      return <div style={emptyStateStyle}>{copy.noOffboarding}</div>;
    }
    return (
      <CanvasTable<OffboardingRow>
        theme={theme}
        columns={offboardingColumns}
        rows={offboardingRows}
      />
    );
  };

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="fleet"
      breadcrumb={[copy.breadcrumbRoot, copy.pageTitle]}
      searchPlaceholder={copy.searchPlaceholder}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        tabs={headerTabs.map((tab) => tab.node)}
        activeTab={activeHeaderTab}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() => setShowGovernancePanel((current) => !current)}
            >
              {copy.filterAction}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreateDriver((current) => !current)}
            >
              {copy.createAction}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        <CanvasBanner
          theme={theme}
          tone={licenseAttentionCount > 0 ? "warn" : "info"}
          icon="warn"
          title={copy.licenseTitle(licenseAttentionCount)}
          body={copy.licenseBody}
          actions={
            <CanvasBtn
              theme={theme}
              variant="secondary"
              disabled={reportActionId === activeReportType}
              onClick={() => void requestFleetReport(activeReportType)}
            >
              {bannerExportLabel}
            </CanvasBtn>
          }
        />

        {showGovernancePanel ? (
          <CanvasCard
            theme={theme}
            title={copy.summaryTitle}
            subtitle={copy.summarySubtitle}
          >
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={copy.kpis.activeDrivers}
                value={activeDrivers}
                sub={`${drivers.length} total`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpis.blockedVehicles}
                value={blockedVehicles}
                sub={`${vehicles.length} total`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpis.pendingExclusivity}
                value={pendingExclusivity}
                sub={`${vehicles.length} vehicles`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpis.pendingOffboarding}
                value={pendingOffboarding}
                sub={`${vehicles.length} vehicles`}
              />
            </div>

            <div style={governanceGridStyle}>
              <CanvasField theme={theme} label={copy.selectedLane}>
                <CanvasInput theme={theme} value={activeTabLabel} />
              </CanvasField>
              <CanvasField theme={theme} label={copy.visibleRows}>
                <CanvasInput theme={theme} value={String(visibleRows)} mono />
              </CanvasField>
              <CanvasField theme={theme} label={copy.latestExport}>
                <CanvasInput theme={theme} value={reportStatusText} />
              </CanvasField>
            </div>

            <CanvasDL theme={theme} cols={2} items={governanceItems} />

            <div style={reportActionsStyle}>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                icon="refresh"
                onClick={() => void loadData()}
              >
                {copy.refreshAction}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                disabled={reportActionId === "driver_roster"}
                onClick={() => void requestFleetReport("driver_roster")}
              >
                {copy.exportDrivers}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                disabled={reportActionId === "vehicle_roster"}
                onClick={() => void requestFleetReport("vehicle_roster")}
              >
                {copy.exportVehicles}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                disabled={reportActionId === "contract_roster"}
                onClick={() => void requestFleetReport("contract_roster")}
              >
                {copy.exportContracts}
              </CanvasBtn>
              {activeReportJob?.artifact?.downloadMetadata.downloadUrl ? (
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  icon="ext"
                  onClick={openLatestExport}
                >
                  {copy.openExport}
                </CanvasBtn>
              ) : null}
            </div>
          </CanvasCard>
        ) : null}

        {showCreateDriver ? (
          <CanvasCard
            theme={theme}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={(event) => void submitDriver(event)}>
              <div style={formGridStyle}>
                <CanvasField theme={theme} label={t("fleet.col.name")} required>
                  <input
                    value={driverForm.name}
                    onChange={(event) =>
                      setDriverForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={t("fleet.form.phone")}>
                  <input
                    value={driverForm.phone ?? ""}
                    onChange={(event) =>
                      setDriverForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={t("fleet.form.email")}>
                  <input
                    value={driverForm.email ?? ""}
                    onChange={(event) =>
                      setDriverForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={t("fleet.form.licensesValid")}>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={Boolean(driverForm.licensesValid)}
                      onChange={(event) =>
                        setDriverForm((current) => ({
                          ...current,
                          licensesValid: event.target.checked,
                        }))
                      }
                    />
                    <span>{t("fleet.form.licensesValid")}</span>
                  </label>
                </CanvasField>
              </div>

              <div style={formActionsStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowCreateDriver(false)}
                >
                  {locale === "en" ? "Close" : "關閉"}
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={creatingDriver || !driverForm.name.trim()}
                  style={submitButtonStyle(
                    creatingDriver || !driverForm.name.trim(),
                  )}
                >
                  {creatingDriver
                    ? t("fleet.creatingDriver")
                    : t("fleet.createDriver")}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {renderTable()}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
