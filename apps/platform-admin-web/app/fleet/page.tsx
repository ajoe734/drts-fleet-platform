"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  CreateDriverMasterCommand,
  CreateVehicleContractCommand,
  DispatchExclusivityRecord,
  DriverDeviceBindingSummary,
  DriverRegistryRecord,
  EmptyReason,
  ResourceActionDescriptor,
  UpdateDriverMasterLifecycleCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
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

const REFRESH_INTERVAL_MS = 30_000;
const OPS_CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN?.replace(/\/$/, "") ?? "";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

type TabKey =
  | "vehicles"
  | "drivers"
  | "contracts"
  | "device_binding"
  | "exclusivity"
  | "offboarding";

type ActionContext =
  | { kind: "page"; tab: TabKey }
  | { kind: "vehicle"; vehicle: GovernedVehicleRecord }
  | { kind: "driver"; driver: GovernedDriverRecord }
  | { kind: "contract"; contract: GovernedContractRecord }
  | {
      kind: "binding";
      driver: GovernedDriverRecord;
      binding: DriverDeviceBindingSummary;
    }
  | { kind: "exclusivity"; exclusivity: GovernedExclusivityRecord }
  | { kind: "offboarding"; vehicle: GovernedVehicleRecord };

type GovernedVehicleRecord = VehicleRegistryRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
    offboardingAvailableActions?: ResourceActionDescriptor[];
    opsLink?: CrossAppResourceLink | null;
  };

type GovernedDriverRecord = DriverRegistryRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
    opsLink?: CrossAppResourceLink | null;
  };

type GovernedContractRecord = VehicleContractRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
  };

type GovernedExclusivityRecord = DispatchExclusivityRecord &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
  };

type DeviceBindingRow = Record<string, unknown> & {
  driver: GovernedDriverRecord;
  binding: DriverDeviceBindingSummary;
};

type EmptyConfig = {
  tone: CanvasTone;
  title: string;
  description: string;
};

const TAB_ORDER: TabKey[] = [
  "vehicles",
  "drivers",
  "contracts",
  "device_binding",
  "exclusivity",
  "offboarding",
];

const TAB_QUERY_ALIAS: Record<string, TabKey> = {
  vehicles: "vehicles",
  drivers: "drivers",
  contracts: "contracts",
  device: "device_binding",
  device_binding: "device_binding",
  exclusivity: "exclusivity",
  offboard: "offboarding",
  offboarding: "offboarding",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(300px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const sideStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const primaryCellTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
};

const secondaryCellTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
  whiteSpace: "normal",
};

const mutedMonoTextStyle: CSSProperties = {
  ...secondaryCellTextStyle,
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const tabRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const tabButtonStyle = (selected: boolean): CSSProperties => ({
  appearance: "none",
  border: `1px solid ${selected ? theme.accentBorder : theme.border}`,
  background: selected ? theme.accentBg : theme.surface,
  color: selected ? theme.accent : theme.text,
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: selected ? 700 : 500,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
});

const emptyPanelStyle = (tone: CanvasTone): CSSProperties => {
  const map: Record<CanvasTone, { bg: string; border: string; fg: string }> = {
    accent: {
      bg: theme.accentBg,
      border: theme.accentBorder,
      fg: theme.accent,
    },
    danger: {
      bg: theme.dangerBg,
      border: theme.dangerBorder,
      fg: theme.danger,
    },
    info: { bg: theme.infoBg, border: theme.infoBorder, fg: theme.info },
    neutral: {
      bg: theme.neutralBg,
      border: theme.neutralBorder,
      fg: theme.textMuted,
    },
    success: {
      bg: theme.successBg,
      border: theme.successBorder,
      fg: theme.success,
    },
    warn: { bg: theme.warnBg, border: theme.warnBorder, fg: theme.warn },
  };
  const resolved = map[tone];
  return {
    borderRadius: 10,
    padding: 18,
    background: resolved.bg,
    border: `1px dashed ${resolved.border}`,
    display: "grid",
    gap: 10,
    color: resolved.fg,
  };
};

const stepperRowStyle: CSSProperties = {
  display: "flex",
  gap: 0,
  alignItems: "center",
  padding: "6px 0",
};

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
          pricingGov: "Platform & Commerce",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Ops & Risk",
          switchboard: "Public info & placards",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
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
          pricingGov: "平台與商務",
          pricing: "費率治理",
          payments: "結算治理",
          platformLayer: "平台維運",
          switchboard: "公開資訊與牌貼",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
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
  ];
}

function opsHref(route: string) {
  return OPS_CONSOLE_ORIGIN ? `${OPS_CONSOLE_ORIGIN}${route}` : route;
}

function resolveCrossAppHref(
  link: CrossAppResourceLink | null | undefined,
  fallbackRoute: string,
) {
  return link?.route?.trim() ? link.route : opsHref(fallbackRoute);
}

function formatFreshness(
  locale: string,
  lastFetchedAt: string | null,
  loading: boolean,
) {
  if (loading) {
    return locale === "en" ? "Refreshing..." : "更新中...";
  }
  if (!lastFetchedAt) {
    return locale === "en" ? "Awaiting first snapshot" : "等待首個快照";
  }
  return locale === "en"
    ? `Snapshot ${formatDateTime(lastFetchedAt)}`
    : `快照時間 ${formatDateTime(lastFetchedAt)}`;
}

function actionLabel(locale: string, action: string) {
  const en: Record<string, string> = {
    refresh_tab: "Refresh",
    create_driver: "Create driver",
    create_contract: "Create contract",
    update_vehicle_compliance: "Update compliance",
    open_ops_vehicle: "ops-console",
    activate_driver: "Activate",
    suspend_driver: "Suspend",
    retire_driver: "Retire",
    revoke_device_binding: "Revoke binding",
    approve_exclusivity: "Approve",
    reject_exclusivity: "Reject",
    initiate_offboarding: "Initiate",
    advance_offboarding_step: "Advance",
    complete_debranding: "Complete debranding",
    open_ops_driver: "ops-console",
  };
  const zh: Record<string, string> = {
    refresh_tab: "重新整理",
    create_driver: "新增司機",
    create_contract: "建立合約",
    update_vehicle_compliance: "更新合規",
    open_ops_vehicle: "ops 操作面",
    activate_driver: "啟用",
    suspend_driver: "暫停",
    retire_driver: "退役",
    revoke_device_binding: "撤銷綁定",
    approve_exclusivity: "核准",
    reject_exclusivity: "退回",
    initiate_offboarding: "啟動 offboarding",
    advance_offboarding_step: "推進",
    complete_debranding: "完成除標識",
    open_ops_driver: "ops 操作面",
  };
  return (locale === "en" ? en : zh)[action] ?? action;
}

function makeAction(
  action: string,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  enabled = true,
  requiresReason = false,
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    requiresReason,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

function emptyStateConfig(locale: string, reason: EmptyReason): EmptyConfig {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return {
          tone: "warn",
          title: "Governance lane not provisioned",
          description:
            "The tab exists in the sitemap, but the backing lane is not provisioned yet.",
        };
      case "fetch_failed":
        return {
          tone: "danger",
          title: "Unable to load this tab",
          description:
            "The read failed. Refresh or inspect the upstream dependency.",
        };
      case "permission_denied":
        return {
          tone: "danger",
          title: "Permission denied",
          description:
            "The current actor can see the shell but is not allowed to read this tab.",
        };
      case "external_unavailable":
        return {
          tone: "warn",
          title: "External dependency unavailable",
          description:
            "This tab depends on a companion service that is currently unavailable.",
        };
      case "filtered_empty":
        return {
          tone: "info",
          title: "No rows match the current focus",
          description:
            "Underlying data exists, but the current tab or focus narrows the result to zero rows.",
        };
      case "no_data":
      default:
        return {
          tone: "info",
          title: "Nothing has been recorded yet",
          description:
            "This governance lane is ready, but there are no rows to review.",
        };
    }
  }

  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn",
        title: "治理資料線尚未 provision",
        description: "sitemap 已保留此 tab，但背後資料線目前尚未配置完成。",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: "此 tab 載入失敗",
        description: "讀取失敗，請重新整理或先檢查上游依賴。",
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: "目前身分沒有權限",
        description: "可看頁殼，但沒有這個 tab 的資料讀取權限。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: "外部依賴暫時不可用",
        description: "這個 tab 依賴 companion service 或外部系統，目前不可用。",
      };
    case "filtered_empty":
      return {
        tone: "info",
        title: "目前焦點下沒有符合資料",
        description: "底層資料存在，但目前 tab 或篩選條件將結果收斂成 0 筆。",
      };
    case "no_data":
    default:
      return {
        tone: "info",
        title: "目前尚無資料",
        description: "治理工作面已就緒，但此刻還沒有需要處理的列。",
      };
  }
}

function deriveOffboardingWorkflowState(vehicle: VehicleRegistryRecord) {
  const offboarding = vehicle.supplyLifecycle.offboarding;
  if (offboarding.status === "none") {
    return "none";
  }
  if (offboarding.status === "completed") {
    return "completed";
  }
  if (offboarding.debrandingStatus === "completed") {
    return "debranding_verified";
  }
  if (offboarding.debrandingStatus === "pending") {
    return "debranding_pending";
  }
  if (!vehicle.dispatchableFlag) {
    return "dispatch_disabled";
  }
  return "initiated";
}

function workflowLabel(locale: string, state: string) {
  const en: Record<string, string> = {
    initiated: "initiated",
    dispatch_disabled: "dispatch_disabled",
    debranding_pending: "debranding_pending",
    debranding_verified: "debranding_verified",
    completed: "completed",
    none: "none",
  };
  const zh: Record<string, string> = {
    initiated: "已啟動",
    dispatch_disabled: "已停用派遣",
    debranding_pending: "等待除標識",
    debranding_verified: "除標識已驗證",
    completed: "已完成",
    none: "未開始",
  };
  return (locale === "en" ? en : zh)[state] ?? state;
}

function actionTone(descriptor: ResourceActionDescriptor): {
  variant: "primary" | "secondary" | "ghost";
  danger?: boolean;
} {
  if (
    descriptor.action.startsWith("reject") ||
    descriptor.action === "suspend_driver"
  ) {
    return { variant: "secondary", danger: true };
  }
  if (
    descriptor.riskLevel === "high" &&
    descriptor.enabled &&
    !descriptor.action.startsWith("open_ops")
  ) {
    return { variant: "primary" };
  }
  return { variant: "secondary" };
}

function renderStackedCell(
  primary: ReactNode,
  secondary?: ReactNode,
  tertiary?: ReactNode,
) {
  return (
    <div style={stackedCellStyle}>
      <div style={primaryCellTextStyle}>{primary}</div>
      {secondary ? <div style={secondaryCellTextStyle}>{secondary}</div> : null}
      {tertiary ? <div style={mutedMonoTextStyle}>{tertiary}</div> : null}
    </div>
  );
}

function openExternal(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

export default function FleetPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const queryTab = TAB_QUERY_ALIAS[searchParams.get("tab") ?? ""] ?? "vehicles";
  const previewEmptyReason = searchParams.get(
    "emptyReason",
  ) as EmptyReason | null;

  const [activeTab, setActiveTab] = useState<TabKey>(queryTab);
  const [vehicles, setVehicles] = useState<GovernedVehicleRecord[]>([]);
  const [drivers, setDrivers] = useState<GovernedDriverRecord[]>([]);
  const [contracts, setContracts] = useState<GovernedContractRecord[]>([]);
  const [exclusivities, setExclusivities] = useState<
    GovernedExclusivityRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(queryTab);
  }, [queryTab]);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextVehicles, nextDrivers, nextContracts, nextExclusivities] =
        await Promise.all([
          client.listVehicles(),
          client.listDrivers(),
          client.listContracts(),
          client.listExclusivities(),
        ]);
      setVehicles(nextVehicles as GovernedVehicleRecord[]);
      setDrivers(nextDrivers as GovernedDriverRecord[]);
      setContracts(nextContracts as GovernedContractRecord[]);
      setExclusivities(nextExclusivities as GovernedExclusivityRecord[]);
      setLastFetchedAt(new Date().toISOString());
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadFleet();
    const timer = window.setInterval(() => {
      void loadFleet();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadFleet]);

  const updateUrlForTab = useCallback((tab: TabKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set(
      "tab",
      tab === "device_binding"
        ? "device"
        : tab === "offboarding"
          ? "offboard"
          : tab,
    );
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", url);
  }, []);

  const runAction = useCallback(
    async (descriptor: ResourceActionDescriptor, context: ActionContext) => {
      if (!descriptor.enabled) {
        if (descriptor.disabledReasonCode) {
          window.alert(
            formatPlatformCodeLabel(locale, descriptor.disabledReasonCode),
          );
        }
        return;
      }

      let reason: string | null = null;
      if (descriptor.riskLevel !== "low") {
        const confirmed = window.confirm(
          locale === "en"
            ? `Confirm ${actionLabel(locale, descriptor.action)}?`
            : `確認執行「${actionLabel(locale, descriptor.action)}」？`,
        );
        if (!confirmed) {
          return;
        }
      }
      if (descriptor.requiresReason) {
        reason = window.prompt(
          locale === "en" ? "Reason is required." : "此操作必須填寫原因。",
        );
        if (!reason?.trim()) {
          return;
        }
      }

      const key =
        context.kind === "page"
          ? `${descriptor.action}:${context.tab}`
          : context.kind === "vehicle"
            ? `${descriptor.action}:${context.vehicle.vehicleId}`
            : context.kind === "driver"
              ? `${descriptor.action}:${context.driver.driverId}`
              : context.kind === "contract"
                ? `${descriptor.action}:${context.contract.contractId}`
                : context.kind === "binding"
                  ? `${descriptor.action}:${context.binding.bindingId}`
                  : context.kind === "exclusivity"
                    ? `${descriptor.action}:${context.exclusivity.vehicleId}`
                    : `${descriptor.action}:${context.vehicle.vehicleId}`;
      setBusyAction(key);
      setError(null);

      try {
        switch (descriptor.action) {
          case "refresh_tab":
            await loadFleet();
            break;
          case "create_driver": {
            const name = window.prompt(
              locale === "en" ? "Driver name" : "司機姓名",
            );
            if (!name?.trim()) {
              return;
            }
            const command: CreateDriverMasterCommand = {
              name: name.trim(),
              supportedServiceBuckets: ["standard_taxi"],
              licensesValid: true,
            };
            await client.createDriverMaster(command);
            await loadFleet();
            break;
          }
          case "create_contract": {
            const defaultVehicleId = vehicles[0]?.vehicleId ?? "";
            const vehicleId = window.prompt(
              locale === "en" ? "Vehicle ID" : "車輛編號",
              defaultVehicleId,
            );
            if (!vehicleId?.trim()) {
              return;
            }
            const partnerId = window.prompt(
              locale === "en" ? "Partner ID" : "合作方編號",
              "partner_demo",
            );
            if (!partnerId?.trim()) {
              return;
            }
            const today = new Date().toISOString().slice(0, 10);
            const command: CreateVehicleContractCommand = {
              vehicleId: vehicleId.trim(),
              partnerId: partnerId.trim(),
              partnerType: "fleet_partner",
              contractType: "standard",
              serviceScope: "standard_taxi",
              startAt: today,
              endAt: "2026-12-31",
            };
            await client.createContract(command);
            await loadFleet();
            break;
          }
          case "update_vehicle_compliance":
            if (context.kind !== "vehicle") {
              return;
            }
            await client.updateVehicleCompliance(context.vehicle.vehicleId, {
              dispatchableFlag: !context.vehicle.dispatchableFlag,
            });
            await loadFleet();
            break;
          case "activate_driver":
          case "suspend_driver":
          case "retire_driver":
            if (context.kind !== "driver") {
              return;
            }
            await client.updateDriverMasterLifecycle(context.driver.driverId, {
              lifecycleStatus:
                descriptor.action === "activate_driver"
                  ? "active"
                  : descriptor.action === "suspend_driver"
                    ? "suspended"
                    : "retired",
              reason,
            } satisfies UpdateDriverMasterLifecycleCommand);
            await loadFleet();
            break;
          case "revoke_device_binding":
            if (context.kind !== "binding") {
              return;
            }
            await client.revokeDriverDeviceBinding({
              bindingId: context.binding.bindingId,
              deviceId: context.binding.deviceId,
            });
            await loadFleet();
            break;
          case "approve_exclusivity":
            if (context.kind !== "exclusivity") {
              return;
            }
            await client.approveExclusivity(context.exclusivity.vehicleId, {
              reviewerId: "platform-admin-web",
            });
            await loadFleet();
            break;
          case "reject_exclusivity":
            if (context.kind !== "exclusivity") {
              return;
            }
            await client.rejectExclusivity(context.exclusivity.vehicleId, {
              reviewerId: "platform-admin-web",
              reason,
            });
            await loadFleet();
            break;
          case "initiate_offboarding":
            if (context.kind !== "offboarding") {
              return;
            }
            await client.initiateVehicleOffboarding(context.vehicle.vehicleId, {
              reason: reason ?? "governance_offboarding",
              requestedBy: "platform-admin-web",
              debrandingRequired: true,
              debrandingDueAt: new Date(Date.now() + 7 * 86400_000)
                .toISOString()
                .slice(0, 10),
            });
            await loadFleet();
            break;
          case "complete_debranding":
            if (context.kind !== "offboarding") {
              return;
            }
            await client.completeVehicleDebranding(context.vehicle.vehicleId, {
              debrandingTicketId:
                context.vehicle.supplyLifecycle.offboarding
                  .debrandingTicketId ?? "ticket-confirmed",
              notes: reason ?? null,
            });
            await loadFleet();
            break;
          case "open_ops_vehicle":
            if (context.kind !== "vehicle") {
              return;
            }
            openExternal(
              resolveCrossAppHref(
                context.vehicle.opsLink,
                `/vehicles/${context.vehicle.vehicleId}`,
              ),
            );
            break;
          case "open_ops_driver":
            if (context.kind !== "driver") {
              return;
            }
            openExternal(
              resolveCrossAppHref(
                context.driver.opsLink,
                `/drivers/${context.driver.driverId}`,
              ),
            );
            break;
          default:
            window.alert(
              locale === "en"
                ? "This action is not wired to a mutation endpoint yet."
                : "此操作尚未接到 mutation endpoint。",
            );
        }
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setBusyAction(null);
      }
    },
    [client, loadFleet, locale, vehicles],
  );

  const tabLabels: Record<TabKey, string> =
    locale === "en"
      ? {
          vehicles: "Vehicles",
          drivers: "Drivers",
          contracts: "Contracts",
          device_binding: "Device Binding",
          exclusivity: "Exclusivity Reviews",
          offboarding: "Offboarding",
        }
      : {
          vehicles: "Vehicles",
          drivers: "Drivers",
          contracts: "Contracts",
          device_binding: "Device Binding",
          exclusivity: "Exclusivity Reviews",
          offboarding: "Offboarding",
        };

  const activeBindings = useMemo<DeviceBindingRow[]>(
    () =>
      drivers.flatMap((driver) =>
        driver.deviceBindings.map((binding: DriverDeviceBindingSummary) => ({
          driver,
          binding,
        })),
      ),
    [drivers],
  );

  const offboardingVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none",
      ),
    [vehicles],
  );

  const blockedVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          !vehicle.dispatchableFlag ||
          vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
      ),
    [vehicles],
  );

  const blockedDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          !driver.dispatchEligible ||
          driver.eligibilityBlockedReasons.length > 0,
      ),
    [drivers],
  );

  const tabCounts: Record<TabKey, number> = {
    vehicles: vehicles.length,
    drivers: drivers.length,
    contracts: contracts.length,
    device_binding: activeBindings.length,
    exclusivity: exclusivities.length,
    offboarding: offboardingVehicles.length,
  };

  const pageActions = useMemo<Record<TabKey, ResourceActionDescriptor[]>>(
    () => ({
      vehicles: [makeAction("refresh_tab", "low")],
      drivers: [
        makeAction("create_driver", "medium"),
        makeAction("refresh_tab", "low"),
      ],
      contracts: [
        makeAction("create_contract", "medium"),
        makeAction("refresh_tab", "low"),
      ],
      device_binding: [makeAction("refresh_tab", "low")],
      exclusivity: [makeAction("refresh_tab", "low")],
      offboarding: [
        makeAction("initiate_offboarding", "high", true, true),
        makeAction(
          "advance_offboarding_step",
          "medium",
          false,
          false,
          "not_provisioned",
        ),
        makeAction("refresh_tab", "low"),
      ],
    }),
    [],
  );

  const activeEmptyReason =
    previewEmptyReason ||
    (error ? "fetch_failed" : tabCounts[activeTab] === 0 ? "no_data" : null);

  const activePageActions = pageActions[activeTab];
  const emptyConfig = activeEmptyReason
    ? emptyStateConfig(locale, activeEmptyReason)
    : null;

  const renderActionButtons = useCallback(
    (actions: ResourceActionDescriptor[], context: ActionContext) => (
      <div style={actionRowStyle}>
        {actions.map((descriptor, index) => {
          const resolved = actionTone(descriptor);
          const keyBase =
            context.kind === "page"
              ? context.tab
              : context.kind === "vehicle"
                ? context.vehicle.vehicleId
                : context.kind === "driver"
                  ? context.driver.driverId
                  : context.kind === "contract"
                    ? context.contract.contractId
                    : context.kind === "binding"
                      ? context.binding.bindingId
                      : context.kind === "exclusivity"
                        ? context.exclusivity.vehicleId
                        : context.vehicle.vehicleId;
          const busy = busyAction === `${descriptor.action}:${keyBase}`;
          return (
            <CanvasBtn
              key={`${descriptor.action}-${index}`}
              theme={theme}
              size="xs"
              variant={resolved.variant}
              {...(resolved.danger !== undefined
                ? { danger: resolved.danger }
                : {})}
              disabled={!descriptor.enabled || busy}
              onClick={() => void runAction(descriptor, context)}
            >
              {busy
                ? locale === "en"
                  ? "Working..."
                  : "處理中..."
                : actionLabel(locale, descriptor.action)}
            </CanvasBtn>
          );
        })}
      </div>
    ),
    [busyAction, locale, runAction],
  );

  const vehicleColumns = useMemo<CanvasTableColumn<GovernedVehicleRecord>[]>(
    () => [
      {
        h: locale === "en" ? "Plate" : "車牌",
        w: 124,
        r: (row) =>
          renderStackedCell(
            row.plateNo,
            row.vehicleId,
            row.supplyLifecycle.lastTrace?.occurredAt
              ? formatDateTime(row.supplyLifecycle.lastTrace.occurredAt)
              : row.updatedAt,
          ),
      },
      {
        h: locale === "en" ? "Coverage" : "營運範圍",
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.operatingArea,
            row.supportedServiceBuckets.join(" · "),
            row.supplyLifecycle.contract.contractId ?? "—",
          ),
      },
      {
        h: locale === "en" ? "Compliance" : "合規",
        w: 180,
        r: (row) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={theme}
              tone={row.insuranceStatus === "valid" ? "success" : "danger"}
              dot
            >
              {formatPlatformCodeLabel(locale, row.insuranceStatus)}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={row.exclusivityApproved ? "success" : "warn"}
              dot
            >
              {row.exclusivityApproved
                ? locale === "en"
                  ? "exclusivity approved"
                  : "排他已核准"
                : locale === "en"
                  ? "exclusivity pending"
                  : "排他待審"}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: locale === "en" ? "Dispatchable" : "派遣資格",
        w: 220,
        r: (row) =>
          renderStackedCell(
            <CanvasPill
              theme={theme}
              tone={row.dispatchableFlag ? "success" : "danger"}
              dot
            >
              {row.dispatchableFlag
                ? locale === "en"
                  ? "dispatchable"
                  : "可派遣"
                : locale === "en"
                  ? "blocked"
                  : "已阻擋"}
            </CanvasPill>,
            row.supplyLifecycle.dispatch.blockedReasons.length
              ? row.supplyLifecycle.dispatch.blockedReasons
                  .map((item: string) => formatPlatformCodeLabel(locale, item))
                  .join(" · ")
              : locale === "en"
                ? "No active dispatch blocks"
                : "目前沒有阻擋原因",
            row.supplyLifecycle.insurance.endAt ?? "—",
          ),
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 210,
        r: (row) =>
          renderActionButtons(
            row.availableActions ?? [
              makeAction("update_vehicle_compliance", "medium"),
              makeAction("open_ops_vehicle", "low"),
            ],
            { kind: "vehicle", vehicle: row },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const driverColumns = useMemo<CanvasTableColumn<GovernedDriverRecord>[]>(
    () => [
      {
        h: locale === "en" ? "Driver" : "司機",
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.name,
            row.driverId,
            row.deviceBindings[0]?.deviceId ?? "—",
          ),
      },
      {
        h: locale === "en" ? "License" : "執照",
        w: 140,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={row.licensesValid ? "success" : "warn"}
            dot
          >
            {row.licensesValid
              ? locale === "en"
                ? "valid"
                : "有效"
              : locale === "en"
                ? "warning"
                : "需處理"}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Dispatch readiness" : "派遣狀態",
        w: 220,
        r: (row) =>
          renderStackedCell(
            <CanvasPill
              theme={theme}
              tone={row.dispatchEligible ? "success" : "warn"}
              dot
            >
              {formatPlatformCodeLabel(locale, row.lifecycleStatus)}
            </CanvasPill>,
            row.supportedServiceBuckets.join(" · "),
            row.eligibilityBlockedReasons.length
              ? row.eligibilityBlockedReasons
                  .map((item: string) => formatPlatformCodeLabel(locale, item))
                  .join(" · ")
              : locale === "en"
                ? "Ready for dispatch"
                : "可派遣",
          ),
      },
      {
        h: locale === "en" ? "Binding" : "裝置綁定",
        w: 180,
        r: (row) =>
          renderStackedCell(
            row.deviceBindings[0]?.deviceLabel ??
              row.deviceBindings[0]?.deviceId ??
              "—",
            row.deviceBindings[0]
              ? formatPlatformCodeLabel(locale, row.deviceBindings[0].status)
              : locale === "en"
                ? "No active device"
                : "目前沒有裝置",
            row.updatedAt,
          ),
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 280,
        r: (row) =>
          renderActionButtons(
            row.availableActions ?? [
              makeAction(
                "activate_driver",
                "medium",
                row.lifecycleStatus !== "active",
              ),
              makeAction(
                "suspend_driver",
                "high",
                row.lifecycleStatus === "active",
                true,
              ),
              makeAction(
                "retire_driver",
                "high",
                row.lifecycleStatus !== "retired",
                true,
              ),
              makeAction("open_ops_driver", "low"),
            ],
            { kind: "driver", driver: row },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const contractColumns = useMemo<CanvasTableColumn<GovernedContractRecord>[]>(
    () => [
      {
        h: locale === "en" ? "Contract" : "合約",
        w: 140,
        r: (row) =>
          renderStackedCell(row.contractId, row.contractType, row.status),
      },
      {
        h: locale === "en" ? "Counterparty" : "合作方",
        w: 220,
        r: (row) =>
          renderStackedCell(row.partnerId, row.partnerType, row.serviceScope),
      },
      {
        h: locale === "en" ? "Vehicle" : "車輛",
        w: 120,
        k: "vehicleId",
        mono: true,
      },
      {
        h: locale === "en" ? "Term" : "有效期間",
        w: 220,
        r: (row) =>
          renderStackedCell(
            `${row.startAt} → ${row.endAt}`,
            row.lifecycleStatus,
          ),
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 140,
        r: (row) =>
          renderActionButtons(
            row.availableActions ?? [makeAction("refresh_tab", "low")],
            { kind: "contract", contract: row },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const bindingColumns = useMemo<CanvasTableColumn<DeviceBindingRow>[]>(
    () => [
      {
        h: locale === "en" ? "Driver" : "司機",
        w: 220,
        r: (row) =>
          renderStackedCell(
            row.driver.name,
            row.driver.driverId,
            row.driver.lifecycleStatus,
          ),
      },
      {
        h: locale === "en" ? "Device" : "裝置",
        w: 240,
        r: (row) =>
          renderStackedCell(
            row.binding.deviceId,
            row.binding.deviceLabel ?? "—",
            row.binding.issuedAt,
          ),
      },
      {
        h: locale === "en" ? "State" : "狀態",
        w: 120,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={row.binding.status === "active" ? "success" : "neutral"}
            dot
          >
            {formatPlatformCodeLabel(locale, row.binding.status)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Last seen" : "最後更新",
        w: 150,
        r: (row) => formatDateTime(row.binding.refreshedAt),
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 140,
        r: (row) =>
          renderActionButtons(
            [
              makeAction(
                "revoke_device_binding",
                "high",
                row.binding.status === "active",
                true,
              ),
            ],
            { kind: "binding", driver: row.driver, binding: row.binding },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const exclusivityColumns = useMemo<
    CanvasTableColumn<GovernedExclusivityRecord>[]
  >(
    () => [
      {
        h: locale === "en" ? "Review" : "審核",
        w: 130,
        r: (row) =>
          renderStackedCell(
            row.vehicleId,
            row.declarationStatus,
            row.updatedAt,
          ),
      },
      {
        h: locale === "en" ? "Provider" : "排他對象",
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.exclusiveProviderName ?? "—",
            `${row.effectiveStart ?? "—"} → ${row.effectiveEnd ?? "—"}`,
            row.reviewerId ?? "—",
          ),
      },
      {
        h: locale === "en" ? "State" : "狀態",
        w: 160,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={
              row.reviewStatus === "approved"
                ? "success"
                : row.reviewStatus === "rejected"
                  ? "danger"
                  : row.reviewStatus === "pending"
                    ? "warn"
                    : "info"
            }
            dot
          >
            {formatPlatformCodeLabel(locale, row.reviewStatus)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 220,
        r: (row) =>
          renderActionButtons(
            row.availableActions ?? [
              makeAction(
                "approve_exclusivity",
                "high",
                ["draft", "pending"].includes(row.reviewStatus),
                true,
              ),
              makeAction(
                "reject_exclusivity",
                "high",
                ["draft", "pending"].includes(row.reviewStatus),
                true,
              ),
            ],
            { kind: "exclusivity", exclusivity: row },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const offboardingColumns = useMemo<
    CanvasTableColumn<GovernedVehicleRecord>[]
  >(
    () => [
      {
        h: locale === "en" ? "Vehicle" : "車輛",
        w: 140,
        r: (row) =>
          renderStackedCell(row.plateNo, row.vehicleId, row.operatingArea),
      },
      {
        h: locale === "en" ? "Current state" : "目前狀態",
        w: 180,
        r: (row) => {
          const state = deriveOffboardingWorkflowState(row);
          return (
            <CanvasPill
              theme={theme}
              tone={
                state === "completed"
                  ? "success"
                  : state === "debranding_pending"
                    ? "warn"
                    : "info"
              }
              dot
            >
              {workflowLabel(locale, state)}
            </CanvasPill>
          );
        },
      },
      {
        h: locale === "en" ? "Evidence" : "證據 / 工單",
        w: 220,
        r: (row) =>
          renderStackedCell(
            row.supplyLifecycle.offboarding.debrandingTicketId ?? "—",
            row.supplyLifecycle.offboarding.reason ?? "—",
            row.supplyLifecycle.offboarding.debrandingDueAt ?? "—",
          ),
      },
      {
        h: locale === "en" ? "Timeline" : "時間點",
        w: 220,
        r: (row) => {
          const offboarding = row.supplyLifecycle.offboarding;
          return renderStackedCell(
            offboarding.requestedAt ?? "—",
            offboarding.effectiveAt ?? "—",
            offboarding.completedAt ?? offboarding.debrandingCompletedAt ?? "—",
          );
        },
      },
      {
        h: locale === "en" ? "Actions" : "操作",
        w: 240,
        r: (row) =>
          renderActionButtons(
            row.offboardingAvailableActions ??
              row.availableActions ?? [
                makeAction(
                  "initiate_offboarding",
                  "high",
                  row.supplyLifecycle.offboarding.status === "none",
                  true,
                ),
                makeAction(
                  "advance_offboarding_step",
                  "medium",
                  false,
                  false,
                  "not_provisioned",
                ),
                makeAction(
                  "complete_debranding",
                  "medium",
                  row.supplyLifecycle.offboarding.debrandingStatus ===
                    "pending",
                  true,
                ),
              ],
            { kind: "offboarding", vehicle: row },
          ),
      },
    ],
    [locale, renderActionButtons],
  );

  const renderActiveTable = () => {
    switch (activeTab) {
      case "vehicles":
        return (
          <CanvasTable theme={theme} columns={vehicleColumns} rows={vehicles} />
        );
      case "drivers":
        return (
          <CanvasTable theme={theme} columns={driverColumns} rows={drivers} />
        );
      case "contracts":
        return (
          <CanvasTable
            theme={theme}
            columns={contractColumns}
            rows={contracts}
          />
        );
      case "device_binding":
        return (
          <CanvasTable
            theme={theme}
            columns={bindingColumns}
            rows={activeBindings}
          />
        );
      case "exclusivity":
        return (
          <CanvasTable
            theme={theme}
            columns={exclusivityColumns}
            rows={exclusivities}
          />
        );
      case "offboarding":
        return (
          <CanvasTable
            theme={theme}
            columns={offboardingColumns}
            rows={offboardingVehicles}
          />
        );
      default:
        return null;
    }
  };

  const tabs = TAB_ORDER.map((tab) => (
    <button
      key={tab}
      type="button"
      style={tabButtonStyle(activeTab === tab)}
      onClick={() => {
        setActiveTab(tab);
        updateUrlForTab(tab);
      }}
    >
      <span>{tabLabels[tab]}</span>
      <CanvasPill
        theme={theme}
        tone={
          tab === "exclusivity" && tabCounts[tab] > 0
            ? "warn"
            : tab === "offboarding" && tabCounts[tab] > 0
              ? "accent"
              : "neutral"
        }
      >
        {tabCounts[tab]}
      </CanvasPill>
    </button>
  ));

  const activeTabLabel = tabLabels[activeTab];

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="fleet"
      currentPath="/fleet"
      breadcrumb={[
        locale === "en" ? "People & Fleet" : "人員與車隊",
        locale === "en" ? "Fleet & Compliance" : "車隊與法遵",
      ]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={
        locale === "en"
          ? "Search vehicles, drivers, audit..."
          : "搜尋車輛、司機、稽核..."
      }
      avatarLabel={locale === "en" ? "FG" : "法遵"}
      style={{ height: "100%" }}
    >
      <CanvasPageHeader
        theme={theme}
        title={
          locale === "en" ? "Fleet & compliance governance" : "車隊與合規治理"
        }
        subtitle={
          locale === "en"
            ? "vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding state machine"
            : "vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding state machine"
        }
        tabs={tabs}
        activeTab={tabs[TAB_ORDER.indexOf(activeTab)]}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() =>
                window.alert(
                  locale === "en"
                    ? "Canvas-aligned filter surface is reserved for the next iteration."
                    : "符合 canvas 的篩選面保留到下一輪整合。",
                )
              }
            >
              {locale === "en" ? "Filter" : "篩選"}
            </CanvasBtn>
            {renderActionButtons(activePageActions, {
              kind: "page",
              tab: activeTab,
            })}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={heroGridStyle}>
          <CanvasKPI
            theme={theme}
            label={
              locale === "en" ? "Dispatch blocked vehicles" : "阻擋派遣車輛"
            }
            value={blockedVehicles.length}
            sub={
              locale === "en"
                ? "Compliance or lifecycle gaps"
                : "合規或生命週期缺口"
            }
            deltaTone={blockedVehicles.length > 0 ? "down" : "neutral"}
          />
          <CanvasKPI
            theme={theme}
            label={locale === "en" ? "Driver attention" : "需處理司機"}
            value={blockedDrivers.length}
            sub={
              locale === "en"
                ? "License, lifecycle, work-state blockers"
                : "執照、生命週期、工作狀態"
            }
            deltaTone={blockedDrivers.length > 0 ? "down" : "neutral"}
          />
          <CanvasKPI
            theme={theme}
            label={locale === "en" ? "Exclusivity backlog" : "排他待審"}
            value={
              exclusivities.filter((row) =>
                ["draft", "pending"].includes(row.reviewStatus),
              ).length
            }
            sub={locale === "en" ? "Q-ADM08 queue" : "Q-ADM08 審核佇列"}
            deltaTone="down"
          />
          <CanvasKPI
            theme={theme}
            label={
              locale === "en" ? "Offboarding in flight" : "進行中 offboarding"
            }
            value={offboardingVehicles.length}
            sub={locale === "en" ? "Q-ADM09 workflow" : "Q-ADM09 狀態機"}
            deltaTone={offboardingVehicles.length > 0 ? "down" : "neutral"}
          />
        </div>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={
              locale === "en" ? "Fleet data refresh failed" : "車隊資料更新失敗"
            }
            body={error}
            actions={
              <CanvasBtn theme={theme} onClick={() => void loadFleet()}>
                {locale === "en" ? "Retry" : "重試"}
              </CanvasBtn>
            }
          />
        ) : null}

        {activeTab === "drivers" && blockedDrivers.length > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "en"
                ? `${blockedDrivers.length} drivers need compliance review`
                : `${blockedDrivers.length} 位司機需要合規處理`
            }
            body={
              locale === "en"
                ? "dispatch.compliance guardrails remain enforced in ops-console until these blockers are cleared."
                : "在阻擋原因解除前，ops-console 端仍會持續套用 dispatch.compliance guardrail。"
            }
          />
        ) : null}

        {activeTab === "exclusivity" ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title="Exclusivity governance · Q-ADM08"
            body={
              locale === "en"
                ? "Vehicle or driver dispatchable cannot become true until exclusivity is approved."
                : "vehicle / driver 的 dispatchable 不可能在 exclusivity 通過前變為 true。"
            }
          />
        ) : null}

        <div style={contentGridStyle}>
          <div style={{ minWidth: 0 }}>
            {activeTab === "offboarding" ? (
              <CanvasCard
                theme={theme}
                title="Offboarding state machine · Q-ADM09"
                subtitle={
                  locale === "en"
                    ? "Every transition needs timestamp · actor · evidence · audit"
                    : "每一步轉換需 timestamp · actor · evidence · audit"
                }
              >
                <div style={stepperRowStyle}>
                  {[
                    "initiated",
                    "dispatch_disabled",
                    "debranding_pending",
                    "debranding_verified",
                    "completed",
                  ].map((step, index, all) => (
                    <div
                      key={step}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flex: index === all.length - 1 ? "0 0 auto" : 1,
                      }}
                    >
                      <div
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: `1px solid ${
                            index < 2
                              ? theme.successBorder
                              : index === 2
                                ? theme.warnBorder
                                : theme.border
                          }`,
                          background:
                            index < 2
                              ? theme.successBg
                              : index === 2
                                ? theme.warnBg
                                : theme.surfaceLo,
                          color: index < 3 ? theme.text : theme.textMuted,
                          fontFamily: theme.monoFamily,
                          fontSize: 11.5,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {index + 1}. {step}
                      </div>
                      {index < all.length - 1 ? (
                        <div
                          style={{
                            flex: 1,
                            height: 2,
                            margin: "0 4px",
                            background:
                              index < 2 ? theme.success : theme.border,
                          }}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </CanvasCard>
            ) : null}

            <CanvasCard
              theme={theme}
              title={activeTabLabel}
              subtitle={
                locale === "en"
                  ? `Refresh tier T4 / 30s. ${formatFreshness(locale, lastFetchedAt, loading)}`
                  : `Refresh tier T4 / 30s。${formatFreshness(locale, lastFetchedAt, loading)}`
              }
            >
              {activeEmptyReason && emptyConfig ? (
                <div style={emptyPanelStyle(emptyConfig.tone)}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <CanvasIcon name="warn" />
                    <strong>{emptyConfig.title}</strong>
                  </div>
                  <div style={{ color: theme.text, lineHeight: 1.5 }}>
                    {emptyConfig.description}
                  </div>
                  <div style={actionRowStyle}>
                    <CanvasPill theme={theme} tone={emptyConfig.tone}>
                      {activeEmptyReason}
                    </CanvasPill>
                    <CanvasBtn theme={theme} onClick={() => void loadFleet()}>
                      {locale === "en" ? "Refresh tab" : "重新整理"}
                    </CanvasBtn>
                  </div>
                </div>
              ) : (
                renderActiveTable()
              )}
            </CanvasCard>
          </div>

          <div style={sideStackStyle}>
            <CanvasCard
              theme={theme}
              title={
                locale === "en" ? "Live governance context" : "治理即時脈絡"
              }
              subtitle={
                locale === "en"
                  ? "Packet §5 requires stale affordance, empty states, and cross-app exits on every fleet tab."
                  : "packet §5 要求每個 fleet tab 都具備 stale affordance、empty states 與 cross-app deep link。"
              }
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={tabRowStyle}>
                  <CanvasPill theme={theme} tone="accent">
                    T4 / 30s
                  </CanvasPill>
                  <CanvasPill
                    theme={theme}
                    tone={loading ? "warn" : "success"}
                    dot
                  >
                    {loading
                      ? locale === "en"
                        ? "refreshing"
                        : "更新中"
                      : locale === "en"
                        ? "fresh"
                        : "最新"}
                  </CanvasPill>
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {formatFreshness(locale, lastFetchedAt, loading)}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {locale === "en"
                    ? "Cross-app deep links open a new tab by default."
                    : "cross-app deep link 預設以新分頁開啟。"}
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={locale === "en" ? "Cross-app handoff" : "跨 app 交接"}
              subtitle={
                locale === "en"
                  ? "Operational inspection stays in ops-console while governance remains anchored here."
                  : "營運檢查留在 ops-console，治理上下文則保留在此頁。"
              }
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={renderRouteCardStyle()}>
                  <div style={secondaryCellTextStyle}>
                    {locale === "en" ? "Vehicle route" : "車輛路由"}
                  </div>
                  <div style={monoTextStyle}>
                    {opsHref("/vehicles/[vehicleId]")}
                  </div>
                </div>
                <div style={renderRouteCardStyle()}>
                  <div style={secondaryCellTextStyle}>
                    {locale === "en" ? "Driver route" : "司機路由"}
                  </div>
                  <div style={monoTextStyle}>
                    {opsHref("/drivers/[driverId]")}
                  </div>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                locale === "en" ? "Empty reason coverage" : "Empty reason 覆蓋"
              }
              subtitle={
                locale === "en"
                  ? "Preview any packet state with ?emptyReason=<reason>."
                  : "可用 ?emptyReason=<reason> 預覽 packet 要求的狀態。"
              }
            >
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  "no_data",
                  "not_provisioned",
                  "fetch_failed",
                  "permission_denied",
                  "external_unavailable",
                  "filtered_empty",
                ].map((reason) => {
                  const config = emptyStateConfig(
                    locale,
                    reason as EmptyReason,
                  );
                  return (
                    <div key={reason} style={renderRouteCardStyle()}>
                      <div style={actionRowStyle}>
                        <CanvasPill theme={theme} tone={config.tone}>
                          {reason}
                        </CanvasPill>
                      </div>
                      <div style={{ ...primaryCellTextStyle, marginTop: 6 }}>
                        {config.title}
                      </div>
                      <div style={secondaryCellTextStyle}>
                        {config.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}

function renderRouteCardStyle(): CSSProperties {
  return {
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    borderRadius: 10,
    padding: 12,
  };
}
