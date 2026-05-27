"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
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
  EmptyStateEnvelope,
  EmptyReason,
  ResourceActionDescriptor,
  UpdateDriverMasterLifecycleCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

const REFRESH_INTERVAL_MS = 30_000;
const OPS_CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN?.replace(/\/$/, "") ?? "";

const tabButtonBaseStyle = {
  appearance: "none",
  borderRadius: 16,
  padding: "12px 14px",
  cursor: "pointer",
  textAlign: "left",
  display: "grid",
  gap: 4,
  minWidth: 140,
  transition: "all 0.18s ease",
} satisfies CSSProperties;

const cardGridStyle = {
  display: "grid",
  gap: 18,
} satisfies CSSProperties;

const topRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  gap: 18,
} satisfies CSSProperties;

const emptyStateStyle = {
  display: "grid",
  gap: 10,
  justifyItems: "start",
  padding: "28px 24px",
  borderRadius: 18,
  border: "1px dashed #cbd5e1",
  background:
    "linear-gradient(135deg, rgba(248,250,252,0.96), rgba(239,246,255,0.96))",
} satisfies CSSProperties;

const metaGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const metaCardStyle = {
  display: "grid",
  gap: 4,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
} satisfies CSSProperties;

const inlineActionsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const buttonStyle = {
  appearance: "none",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "8px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
} satisfies CSSProperties;

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

type EmptyStateConfig = {
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
};

type PageRuntimeState = {
  availableActions?: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope | null;
};

type GovernedVehicleRecord = VehicleRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
  offboardingAvailableActions?: ResourceActionDescriptor[];
  opsLink?: CrossAppResourceLink | null;
};

type GovernedDriverRecord = DriverRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
  opsLink?: CrossAppResourceLink | null;
};

type GovernedContractRecord = VehicleContractRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type GovernedExclusivityRecord = DispatchExclusivityRecord & {
  availableActions?: ResourceActionDescriptor[];
};

const TAB_ORDER: TabKey[] = [
  "vehicles",
  "drivers",
  "contracts",
  "device_binding",
  "exclusivity",
  "offboarding",
];

function formatFreshness(
  locale: string,
  lastFetchedAt: string | null,
  loading: boolean,
) {
  if (loading) {
    return locale === "en" ? "Refreshing…" : "更新中…";
  }
  if (!lastFetchedAt) {
    return locale === "en" ? "Awaiting first snapshot" : "等待首個快照";
  }
  return locale === "en"
    ? `Snapshot ${formatDateTime(lastFetchedAt)}`
    : `快照時間 ${formatDateTime(lastFetchedAt)}`;
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

function resolveActions(
  runtimeActions: ResourceActionDescriptor[] | undefined,
  fallbackActions: ResourceActionDescriptor[],
) {
  return runtimeActions ?? fallbackActions;
}

function buildActionKey(
  descriptor: ResourceActionDescriptor,
  context: ActionContext,
) {
  switch (context.kind) {
    case "page":
      return `${descriptor.action}:page:${context.tab}`;
    case "vehicle":
      return `${descriptor.action}:vehicle:${context.vehicle.vehicleId}`;
    case "driver":
      return `${descriptor.action}:driver:${context.driver.driverId}`;
    case "contract":
      return `${descriptor.action}:contract:${context.contract.contractId}`;
    case "binding":
      return `${descriptor.action}:binding:${context.binding.bindingId}`;
    case "exclusivity":
      return `${descriptor.action}:exclusivity:${context.exclusivity.vehicleId}`;
    case "offboarding":
      return `${descriptor.action}:offboarding:${context.vehicle.vehicleId}`;
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

function formatWorkflowState(locale: string, state: string) {
  const en: Record<string, string> = {
    none: "Not started",
    initiated: "Initiated",
    dispatch_disabled: "Dispatch disabled",
    debranding_pending: "Debranding pending",
    debranding_verified: "Debranding verified",
    completed: "Completed",
  };
  const zh: Record<string, string> = {
    none: "未開始",
    initiated: "已啟動",
    dispatch_disabled: "已停用派遣",
    debranding_pending: "等待除標識",
    debranding_verified: "除標識已驗證",
    completed: "已完成",
  };
  return (locale === "en" ? en : zh)[state] ?? state;
}

function emptyStateConfig(
  locale: string,
  reason: EmptyReason,
): EmptyStateConfig {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return {
          tone: "warning",
          title: "Governance lane not provisioned",
          description:
            "The tab exists in sitemap, but the backing data lane has not been provisioned yet.",
        };
      case "fetch_failed":
        return {
          tone: "danger",
          title: "Unable to load this tab",
          description:
            "The read failed. Refresh or inspect the upstream dependency before taking action.",
        };
      case "permission_denied":
        return {
          tone: "danger",
          title: "Permission denied",
          description:
            "The current actor may read the page shell but does not have authority for this tab's data.",
        };
      case "external_unavailable":
        return {
          tone: "warning",
          title: "External dependency unavailable",
          description:
            "This tab depends on an external or companion service that is currently unavailable.",
        };
      case "filtered_empty":
        return {
          tone: "info",
          title: "No rows match the current focus",
          description:
            "The underlying data exists, but the current tab or filter context narrows the list to zero rows.",
        };
      case "no_data":
      default:
        return {
          tone: "info",
          title: "Nothing has been recorded yet",
          description:
            "This governance tab is ready, but there are no rows to review at the moment.",
        };
    }
  }

  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warning",
        title: "治理資料線尚未 provision",
        description: "sitemap 已保留此 tab，但背後資料線目前尚未配置完成。",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: "此 tab 載入失敗",
        description: "讀取失敗，請重新整理或先檢查上游依賴後再動作。",
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: "目前身分沒有權限",
        description: "可看頁殼，但沒有這個 tab 的資料讀取權限。",
      };
    case "external_unavailable":
      return {
        tone: "warning",
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

function actionLabel(locale: string, action: string) {
  const en: Record<string, string> = {
    refresh_tab: "Refresh",
    create_driver: "Create driver",
    create_contract: "Create contract",
    update_vehicle_compliance: "Update compliance",
    open_ops_vehicle: "Open ops vehicle",
    activate_driver: "Activate",
    suspend_driver: "Suspend",
    retire_driver: "Retire",
    revoke_device_binding: "Revoke binding",
    edit_contract_terms: "Edit terms",
    activate_contract: "Activate contract",
    approve_exclusivity: "Approve",
    reject_exclusivity: "Reject",
    initiate_offboarding: "Initiate offboarding",
    advance_offboarding_step: "Advance step",
    complete_debranding: "Complete debranding",
    open_ops_driver: "Open ops driver",
  };
  const zh: Record<string, string> = {
    refresh_tab: "重新整理",
    create_driver: "建立司機",
    create_contract: "建立合約",
    update_vehicle_compliance: "更新合規",
    open_ops_vehicle: "前往 ops 車輛",
    activate_driver: "啟用",
    suspend_driver: "停權",
    retire_driver: "退役",
    revoke_device_binding: "撤銷綁定",
    edit_contract_terms: "編輯條款",
    activate_contract: "啟用合約",
    approve_exclusivity: "核准",
    reject_exclusivity: "退回",
    initiate_offboarding: "啟動退場",
    advance_offboarding_step: "推進步驟",
    complete_debranding: "完成除標識",
    open_ops_driver: "前往 ops 司機",
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
  return disabledReasonCode
    ? {
        action,
        riskLevel,
        enabled,
        requiresReason,
        disabledReasonCode,
      }
    : {
        action,
        riskLevel,
        enabled,
        requiresReason,
      };
}

export default function FleetPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const previewEmptyReason = searchParams.get(
    "emptyReason",
  ) as EmptyReason | null;
  const initialTab =
    requestedTab && TAB_ORDER.includes(requestedTab) ? requestedTab : "drivers";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
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
  const [pageRuntimeState] = useState<Record<TabKey, PageRuntimeState>>({
    vehicles: {},
    drivers: {},
    contracts: {},
    device_binding: {},
    exclusivity: {},
    offboarding: {},
  });

  useEffect(() => {
    if (requestedTab && TAB_ORDER.includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

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
      setVehicles(nextVehicles);
      setDrivers(nextDrivers);
      setContracts(nextContracts);
      setExclusivities(nextExclusivities);
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
      if (descriptor.requiresReason) {
        reason = window.prompt(
          locale === "en"
            ? "Reason is required for this action."
            : "此操作必須填寫原因。",
        );
        if (!reason?.trim()) {
          return;
        }
      }

      const actionKey = buildActionKey(descriptor, context);
      setBusyAction(actionKey);
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
            window.open(
              resolveCrossAppHref(
                context.vehicle.opsLink,
                `/vehicles/${context.vehicle.vehicleId}`,
              ),
              "_blank",
              "noopener,noreferrer",
            );
            break;
          case "open_ops_driver":
            if (context.kind !== "driver") {
              return;
            }
            window.open(
              resolveCrossAppHref(
                context.driver.opsLink,
                `/drivers/${context.driver.driverId}`,
              ),
              "_blank",
              "noopener,noreferrer",
            );
            break;
          default:
            window.alert(
              locale === "en"
                ? "This action is not yet wired to a mutation endpoint."
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

  const blockedVehicles = vehicles.filter(
    (vehicle) =>
      !vehicle.dispatchableFlag ||
      vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
  );
  const blockedDrivers = drivers.filter(
    (driver) =>
      !driver.dispatchEligible || driver.eligibilityBlockedReasons.length > 0,
  );
  const offboardingVehicles = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none",
  );
  const activeBindings = drivers.flatMap((driver) =>
    driver.deviceBindings.map((binding) => ({ driver, binding })),
  );

  const pageActions = {
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
    offboarding: [makeAction("refresh_tab", "low")],
  } satisfies Record<TabKey, ResourceActionDescriptor[]>;

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
          vehicles: "車輛",
          drivers: "司機",
          contracts: "合約",
          device_binding: "裝置綁定",
          exclusivity: "排他審核",
          offboarding: "退場流程",
        };

  const tabCounts: Record<TabKey, number> = {
    vehicles: vehicles.length,
    drivers: drivers.length,
    contracts: contracts.length,
    device_binding: activeBindings.length,
    exclusivity: exclusivities.length,
    offboarding: offboardingVehicles.length,
  };

  const activeEmptyReason =
    previewEmptyReason ||
    (error
      ? ("fetch_failed" as EmptyReason)
      : pageRuntimeState[activeTab].emptyState?.reason
        ? pageRuntimeState[activeTab].emptyState.reason
        : tabCounts[activeTab] === 0
          ? ("no_data" as EmptyReason)
          : null);

  function renderActionButtons(
    actions: ResourceActionDescriptor[],
    context: ActionContext,
  ) {
    return (
      <div style={inlineActionsStyle}>
        {actions.map((action) => {
          const key = buildActionKey(action, context);
          const disabled = busyAction === key || !action.enabled;
          return (
            <button
              key={action.action}
              type="button"
              disabled={disabled}
              onClick={() => void runAction(action, context)}
              title={
                action.enabled
                  ? undefined
                  : formatPlatformCodeLabel(locale, action.disabledReasonCode)
              }
              style={{
                ...buttonStyle,
                opacity: action.enabled ? 1 : 0.48,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {busyAction === key
                ? locale === "en"
                  ? "Working…"
                  : "處理中…"
                : actionLabel(locale, action.action)}
            </button>
          );
        })}
      </div>
    );
  }

  function renderEmptyState(reason: EmptyReason) {
    const config = emptyStateConfig(locale, reason);
    const nextAction =
      pageRuntimeState[activeTab].emptyState?.nextAction ??
      resolveActions(
        pageRuntimeState[activeTab].availableActions,
        pageActions[activeTab],
      )[0] ??
      makeAction("refresh_tab", "low");
    return (
      <div style={emptyStateStyle}>
        <StatusChip tone={config.tone} label={config.title} />
        <strong style={{ fontSize: 18, color: "#0f172a" }}>
          {config.title}
        </strong>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
          {config.description}
        </p>
        {renderActionButtons([nextAction], { kind: "page", tab: activeTab })}
      </div>
    );
  }

  return (
    <div style={cardGridStyle}>
      <PageHeader
        eyebrow="Fleet Governance"
        title={locale === "en" ? "Fleet & Compliance" : "車隊與合規"}
        subtitle={
          locale === "en"
            ? "vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding"
            : "vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding"
        }
        actions={
          <div style={inlineActionsStyle}>
            <StatusChip
              tone="platform"
              label={
                locale === "en" ? "Refresh T4 · 30s" : "Refresh T4 · 30 秒"
              }
            />
            <StatusChip
              tone={error ? "danger" : "info"}
              label={formatFreshness(locale, lastFetchedAt, loading)}
            />
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void loadFleet()}
              disabled={loading}
            >
              {locale === "en" ? "Refresh now" : "立即更新"}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={locale === "en" ? "Fleet read degraded" : "Fleet 讀取降級"}
          description={error}
        />
      ) : blockedVehicles.length > 0 || blockedDrivers.length > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? `${blockedVehicles.length} vehicles and ${blockedDrivers.length} drivers are currently blocked from clean dispatch posture`
              : `${blockedVehicles.length} 輛車與 ${blockedDrivers.length} 位司機目前不在乾淨可派遣姿態`
          }
          description={
            locale === "en"
              ? "Keep exclusivity, insurance, lifecycle, and offboarding blockers visible in one governance lane before opening cross-app ops views."
              : "先在同一條治理 lane 內處理排他、保險、生命週期與退場阻塞，再跨 app 打開 ops 狀態。"
          }
        />
      ) : null}

      <KpiRow minWidth="180px">
        <KpiCard
          label={locale === "en" ? "Blocked vehicles" : "受阻車輛"}
          value={blockedVehicles.length.toString()}
          detail={
            locale === "en"
              ? "dispatch hold or compliance block"
              : "人工停派或合規阻擋"
          }
          tone={blockedVehicles.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Blocked drivers" : "受阻司機"}
          value={blockedDrivers.length.toString()}
          detail={
            locale === "en"
              ? "eligibility review required"
              : "需重新檢查派遣資格"
          }
          tone={blockedDrivers.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Exclusivity queue" : "排他審核佇列"}
          value={exclusivities
            .filter((item) => item.reviewStatus !== "approved")
            .length.toString()}
          detail={
            locale === "en" ? "submitted or under review" : "已送出或審核中"
          }
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Offboarding in flight" : "退場進行中"}
          value={offboardingVehicles.length.toString()}
          detail={
            locale === "en"
              ? "requires auditable progression"
              : "每一步都需保留稽核軌跡"
          }
          tone={offboardingVehicles.length > 0 ? "danger" : "platform"}
        />
      </KpiRow>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                ...tabButtonBaseStyle,
                border: isActive ? "1px solid #1d4ed8" : "1px solid #dbe4ee",
                background: isActive
                  ? "linear-gradient(135deg, #eff6ff, #ffffff)"
                  : "#ffffff",
                boxShadow: isActive
                  ? "0 14px 28px rgba(29, 78, 216, 0.10)"
                  : "0 8px 18px rgba(15, 23, 42, 0.04)",
              }}
            >
              <strong style={{ color: "#0f172a", fontSize: 14 }}>
                {tabLabels[tab]}
              </strong>
              <span style={{ color: "#64748b", fontSize: 12.5 }}>
                {tabCounts[tab]} {locale === "en" ? "rows" : "列"}
              </span>
            </button>
          );
        })}
      </div>

      <div style={topRowStyle}>
        <DataViewCard
          title={tabLabels[activeTab]}
          subtitle={
            locale === "en"
              ? "CTAs are rendered from per-resource availableActions so role scope stays backend-owned."
              : "CTA 由各資源的 availableActions 驅動，角色權限不在前端硬編。"
          }
          actions={renderActionButtons(
            resolveActions(
              pageRuntimeState[activeTab].availableActions,
              pageActions[activeTab],
            ),
            {
              kind: "page",
              tab: activeTab,
            },
          )}
        >
          {activeEmptyReason ? (
            renderEmptyState(activeEmptyReason)
          ) : activeTab === "vehicles" ? (
            <DataTable
              minWidth={1120}
              columns={[
                { label: locale === "en" ? "Vehicle" : "車輛", width: "180px" },
                {
                  label: locale === "en" ? "Type / Scope" : "類型 / 服務範圍",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Insurance" : "保險",
                  width: "140px",
                },
                {
                  label: locale === "en" ? "Driver" : "目前司機",
                  width: "160px",
                },
                {
                  label: locale === "en" ? "Dispatch" : "可派遣狀態",
                  width: "220px",
                },
                {
                  label: locale === "en" ? "Offboarding" : "退場",
                  width: "160px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "260px" },
              ]}
            >
              {vehicles.map((vehicle) => {
                const currentDriver = drivers.find((driver) =>
                  driver.driverId.endsWith(vehicle.vehicleId.slice(-3)),
                );
                const rowActions = resolveActions(vehicle.availableActions, [
                  makeAction(
                    "update_vehicle_compliance",
                    "medium",
                    true,
                    false,
                  ),
                  makeAction("open_ops_vehicle", "low"),
                ]);
                return (
                  <Tr key={vehicle.vehicleId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{vehicle.plateNo}</strong>}
                        secondary={vehicle.vehicleId}
                        tertiary={formatPlatformCodeLabel(
                          locale,
                          vehicle.operatingArea,
                        )}
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={vehicle.supportedServiceBuckets.join(", ")}
                        secondary={[
                          formatPlatformCodeLabel(
                            locale,
                            vehicle.operatingArea,
                          ),
                          formatPlatformCodeLabel(
                            locale,
                            vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
                          ),
                        ].join(" · ")}
                      />
                    </Td>
                    <Td>
                      <StatusChip
                        tone={
                          vehicle.insuranceStatus === "valid"
                            ? "success"
                            : "warning"
                        }
                        label={formatPlatformCodeLabel(
                          locale,
                          vehicle.insuranceStatus,
                        )}
                      />
                    </Td>
                    <Td>
                      {currentDriver ? (
                        <DataCellStack
                          primary={currentDriver.name}
                          secondary={currentDriver.driverId}
                        />
                      ) : (
                        <span style={{ color: "#94a3b8" }}>
                          {locale === "en" ? "No binding" : "尚未綁定"}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div style={{ display: "grid", gap: 8 }}>
                        <StatusChip
                          tone={
                            vehicle.dispatchableFlag ? "success" : "warning"
                          }
                          label={
                            vehicle.dispatchableFlag
                              ? locale === "en"
                                ? "Dispatchable"
                                : "可派遣"
                              : locale === "en"
                                ? "Held"
                                : "阻擋中"
                          }
                        />
                        {vehicle.supplyLifecycle.dispatch.blockedReasons
                          .length > 0 ? (
                          <span style={{ color: "#64748b", fontSize: 12.5 }}>
                            {vehicle.supplyLifecycle.dispatch.blockedReasons
                              .map((reason) =>
                                formatPlatformCodeLabel(locale, reason),
                              )
                              .join(" · ")}
                          </span>
                        ) : (
                          <span style={{ color: "#64748b", fontSize: 12.5 }}>
                            {vehicle.exclusivityApproved
                              ? locale === "en"
                                ? "Compliance clear"
                                : "合規可派遣"
                              : locale === "en"
                                ? "Exclusivity approval pending"
                                : "等待排他核准"}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <StatusChip
                        tone={
                          vehicle.supplyLifecycle.offboarding.status === "none"
                            ? "neutral"
                            : "danger"
                        }
                        label={formatPlatformCodeLabel(
                          locale,
                          vehicle.supplyLifecycle.offboarding.status,
                        )}
                      />
                    </Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "vehicle",
                        vehicle,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : activeTab === "drivers" ? (
            <DataTable
              minWidth={1160}
              columns={[
                { label: locale === "en" ? "Driver" : "司機", width: "220px" },
                { label: locale === "en" ? "License" : "駕照", width: "120px" },
                {
                  label: locale === "en" ? "Buckets" : "服務範圍",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Lifecycle" : "生命週期",
                  width: "140px",
                },
                {
                  label: locale === "en" ? "Device binding" : "裝置綁定",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Contract posture" : "合約姿態",
                  width: "150px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "320px" },
              ]}
            >
              {drivers.map((driver) => {
                const rowActions = resolveActions(driver.availableActions, [
                  makeAction(
                    "activate_driver",
                    "medium",
                    driver.lifecycleStatus !== "active",
                  ),
                  makeAction(
                    "suspend_driver",
                    "high",
                    driver.lifecycleStatus === "active",
                    true,
                  ),
                  makeAction(
                    "revoke_device_binding",
                    "high",
                    driver.deviceBindings.length > 0,
                    true,
                    driver.deviceBindings.length === 0
                      ? "not_provisioned"
                      : undefined,
                  ),
                  makeAction("open_ops_driver", "low"),
                ]);
                return (
                  <Tr key={driver.driverId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{driver.name}</strong>}
                        secondary={driver.driverId}
                        tertiary={formatDateTime(driver.updatedAt)}
                      />
                    </Td>
                    <Td>
                      <StatusChip
                        tone={driver.licensesValid ? "success" : "warning"}
                        label={
                          driver.licensesValid
                            ? locale === "en"
                              ? "Valid"
                              : "有效"
                            : locale === "en"
                              ? "Invalid"
                              : "失效"
                        }
                      />
                    </Td>
                    <Td mono>{driver.supportedServiceBuckets.join(", ")}</Td>
                    <Td>
                      <div style={{ display: "grid", gap: 8 }}>
                        <StatusChip
                          tone={
                            driver.lifecycleStatus === "active"
                              ? "success"
                              : driver.lifecycleStatus === "suspended"
                                ? "warning"
                                : "neutral"
                          }
                          label={formatPlatformCodeLabel(
                            locale,
                            driver.lifecycleStatus,
                          )}
                        />
                        <span style={{ color: "#64748b", fontSize: 12.5 }}>
                          {formatPlatformCodeLabel(locale, driver.workState)}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      {driver.deviceBindings.length > 0 ? (
                        <DataCellStack
                          primary={driver.deviceBindings[0]!.deviceId}
                          secondary={driver.deviceBindings
                            .map((binding) =>
                              formatPlatformCodeLabel(locale, binding.status),
                            )
                            .join(" · ")}
                        />
                      ) : (
                        <span style={{ color: "#94a3b8" }}>
                          {locale === "en"
                            ? "No linked device"
                            : "尚未綁定裝置"}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <StatusChip
                        tone={driver.dispatchEligible ? "success" : "warning"}
                        label={
                          driver.dispatchEligible
                            ? locale === "en"
                              ? "Ready"
                              : "可派遣"
                            : locale === "en"
                              ? "Review required"
                              : "需人工檢查"
                        }
                      />
                    </Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "driver",
                        driver,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : activeTab === "contracts" ? (
            <DataTable
              minWidth={1080}
              columns={[
                {
                  label: locale === "en" ? "Contract" : "合約",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Parties" : "合作方",
                  width: "180px",
                },
                { label: locale === "en" ? "Type" : "類型", width: "140px" },
                { label: locale === "en" ? "Status" : "狀態", width: "140px" },
                {
                  label: locale === "en" ? "Window" : "生效期間",
                  width: "220px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "220px" },
              ]}
            >
              {contracts.map((contract) => {
                const rowActions = resolveActions(contract.availableActions, [
                  makeAction(
                    "edit_contract_terms",
                    "medium",
                    false,
                    false,
                    "not_provisioned",
                  ),
                ]);
                return (
                  <Tr key={contract.contractId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{contract.contractId}</strong>}
                        secondary={contract.vehicleId}
                        tertiary={formatDateTime(contract.updatedAt)}
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={contract.partnerId}
                        secondary={contract.partnerType}
                      />
                    </Td>
                    <Td mono>{contract.contractType}</Td>
                    <Td>
                      <StatusChip
                        tone={
                          contract.lifecycleStatus === "active"
                            ? "success"
                            : contract.lifecycleStatus === "draft"
                              ? "warning"
                              : "neutral"
                        }
                        label={formatPlatformCodeLabel(
                          locale,
                          contract.lifecycleStatus,
                        )}
                      />
                      <span style={{ color: "#64748b", fontSize: 12.5 }}>
                        {formatPlatformCodeLabel(locale, contract.status)}
                      </span>
                    </Td>
                    <Td mono>
                      {contract.startAt} → {contract.endAt}
                    </Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "contract",
                        contract,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : activeTab === "device_binding" ? (
            <DataTable
              minWidth={1020}
              columns={[
                { label: locale === "en" ? "Driver" : "司機", width: "220px" },
                {
                  label: locale === "en" ? "Binding ID" : "綁定編號",
                  width: "180px",
                },
                { label: locale === "en" ? "Device" : "裝置", width: "180px" },
                { label: locale === "en" ? "Status" : "狀態", width: "120px" },
                {
                  label: locale === "en" ? "Issued" : "發出時間",
                  width: "160px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "220px" },
              ]}
            >
              {activeBindings.map(({ driver, binding }) => {
                const rowActions = resolveActions(driver.availableActions, [
                  makeAction(
                    "revoke_device_binding",
                    "high",
                    binding.status === "active",
                    true,
                  ),
                ]);
                return (
                  <Tr key={binding.bindingId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{driver.name}</strong>}
                        secondary={driver.driverId}
                      />
                    </Td>
                    <Td mono>{binding.bindingId}</Td>
                    <Td>
                      <DataCellStack
                        primary={binding.deviceId}
                        secondary={binding.deviceLabel ?? "—"}
                      />
                    </Td>
                    <Td>
                      <StatusChip
                        tone={
                          binding.status === "active" ? "success" : "neutral"
                        }
                        label={formatPlatformCodeLabel(locale, binding.status)}
                      />
                    </Td>
                    <Td mono>{formatDateTime(binding.issuedAt)}</Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "binding",
                        driver,
                        binding,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : activeTab === "exclusivity" ? (
            <DataTable
              minWidth={1080}
              columns={[
                { label: locale === "en" ? "Vehicle" : "車輛", width: "160px" },
                {
                  label: locale === "en" ? "Provider" : "排他對象",
                  width: "180px",
                },
                { label: locale === "en" ? "State" : "狀態", width: "150px" },
                {
                  label: locale === "en" ? "Window" : "有效期間",
                  width: "220px",
                },
                {
                  label: locale === "en" ? "Reviewed" : "審核時間",
                  width: "180px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "240px" },
              ]}
            >
              {exclusivities.map((exclusivity) => {
                const rowActions = resolveActions(
                  exclusivity.availableActions,
                  [
                    makeAction(
                      "approve_exclusivity",
                      "high",
                      exclusivity.reviewStatus !== "approved",
                      true,
                    ),
                    makeAction(
                      "reject_exclusivity",
                      "high",
                      exclusivity.reviewStatus !== "rejected",
                      true,
                    ),
                  ],
                );
                return (
                  <Tr key={exclusivity.vehicleId}>
                    <Td mono>{exclusivity.vehicleId}</Td>
                    <Td>{exclusivity.exclusiveProviderName ?? "—"}</Td>
                    <Td>
                      <div style={{ display: "grid", gap: 8 }}>
                        <StatusChip
                          tone={
                            exclusivity.reviewStatus === "approved"
                              ? "success"
                              : exclusivity.reviewStatus === "rejected"
                                ? "danger"
                                : "warning"
                          }
                          label={formatPlatformCodeLabel(
                            locale,
                            exclusivity.reviewStatus,
                          )}
                        />
                        <span style={{ color: "#64748b", fontSize: 12.5 }}>
                          {formatPlatformCodeLabel(
                            locale,
                            exclusivity.lifecycleStatus,
                          )}
                        </span>
                      </div>
                    </Td>
                    <Td mono>
                      {(exclusivity.effectiveStart ?? "—") +
                        " → " +
                        (exclusivity.effectiveEnd ?? "—")}
                    </Td>
                    <Td mono>
                      {formatDateTime(
                        exclusivity.reviewedAt ?? exclusivity.updatedAt,
                      )}
                    </Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "exclusivity",
                        exclusivity,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          ) : (
            <DataTable
              minWidth={1120}
              columns={[
                { label: locale === "en" ? "Vehicle" : "車輛", width: "170px" },
                {
                  label: locale === "en" ? "Workflow state" : "流程狀態",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Requested by" : "發起人",
                  width: "180px",
                },
                {
                  label: locale === "en" ? "Evidence" : "證據 / 工單",
                  width: "220px",
                },
                {
                  label: locale === "en" ? "Timestamps" : "時間點",
                  width: "240px",
                },
                { label: locale === "en" ? "Actions" : "操作", width: "240px" },
              ]}
            >
              {offboardingVehicles.map((vehicle) => {
                const offboarding = vehicle.supplyLifecycle.offboarding;
                const rowActions = resolveActions(
                  vehicle.offboardingAvailableActions ??
                    vehicle.availableActions,
                  [
                    makeAction(
                      "initiate_offboarding",
                      "high",
                      offboarding.status === "none",
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
                      offboarding.debrandingStatus === "pending",
                      true,
                    ),
                  ],
                );
                const workflowState = deriveOffboardingWorkflowState(vehicle);
                return (
                  <Tr key={vehicle.vehicleId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{vehicle.plateNo}</strong>}
                        secondary={vehicle.vehicleId}
                      />
                    </Td>
                    <Td>
                      <div style={{ display: "grid", gap: 8 }}>
                        <StatusChip
                          tone={
                            workflowState === "completed" ? "success" : "danger"
                          }
                          label={formatWorkflowState(locale, workflowState)}
                        />
                        <span style={{ color: "#64748b", fontSize: 12.5 }}>
                          {[
                            formatPlatformCodeLabel(locale, offboarding.status),
                            formatPlatformCodeLabel(
                              locale,
                              offboarding.debrandingStatus,
                            ),
                          ].join(" · ")}
                        </span>
                      </div>
                    </Td>
                    <Td>{offboarding.requestedBy ?? "—"}</Td>
                    <Td>
                      <DataCellStack
                        primary={offboarding.debrandingTicketId ?? "—"}
                        secondary={offboarding.reason ?? "—"}
                        tertiary={
                          offboarding.debrandingDueAt
                            ? locale === "en"
                              ? `Due ${offboarding.debrandingDueAt}`
                              : `應完成 ${offboarding.debrandingDueAt}`
                            : undefined
                        }
                      />
                    </Td>
                    <Td mono>
                      {[
                        offboarding.requestedAt
                          ? `requested ${offboarding.requestedAt}`
                          : null,
                        offboarding.effectiveAt
                          ? `effective ${offboarding.effectiveAt}`
                          : null,
                        offboarding.completedAt
                          ? `completed ${offboarding.completedAt}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Td>
                    <Td>
                      {renderActionButtons(rowActions, {
                        kind: "offboarding",
                        vehicle,
                      })}
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          )}
        </DataViewCard>

        <div style={cardGridStyle}>
          <WorkflowPanel
            title={locale === "en" ? "Cross-app handoff" : "跨 app 交接"}
            description={
              locale === "en"
                ? "Packet Q-X03 makes ops-console deep links first-class: inspect runtime state in a new tab without collapsing platform governance context."
                : "packet Q-X03 要求把 ops-console deep link 視為一等公民；在不離開平台治理脈絡下，用新分頁檢查營運狀態。"
            }
            tone="info"
          >
            <div style={metaGridStyle}>
              <div style={metaCardStyle}>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  {locale === "en" ? "Vehicle route" : "車輛路由"}
                </span>
                <strong style={{ color: "#0f172a" }}>
                  {opsHref("/vehicles/[vehicleId]")}
                </strong>
              </div>
              <div style={metaCardStyle}>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  {locale === "en" ? "Driver route" : "司機路由"}
                </span>
                <strong style={{ color: "#0f172a" }}>
                  {opsHref("/drivers/[driverId]")}
                </strong>
              </div>
            </div>
          </WorkflowPanel>

          <WorkflowPanel
            title={locale === "en" ? "State coverage" : "狀態覆蓋"}
            description={
              locale === "en"
                ? "The page can render all six packet empty reasons via `?emptyReason=` preview while still mapping real load failures to `fetch_failed`."
                : "此頁可透過 `?emptyReason=` 預覽 packet 要求的六種 empty state，同時把真實載入失敗映射成 `fetch_failed`。"
            }
            tone="warning"
          >
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "no_data",
                "not_provisioned",
                "fetch_failed",
                "permission_denied",
                "external_unavailable",
                "filtered_empty",
              ].map((reason) => (
                <div key={reason} style={metaCardStyle}>
                  <strong style={{ color: "#0f172a" }}>{reason}</strong>
                  <span style={{ color: "#64748b", fontSize: 12.5 }}>
                    {emptyStateConfig(locale, reason as EmptyReason).title}
                  </span>
                </div>
              ))}
            </div>
          </WorkflowPanel>
        </div>
      </div>
    </div>
  );
}
