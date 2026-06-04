"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  CrossAppResourceLink,
  CreateDriverMasterCommand,
  CreateVehicleContractCommand,
  DispatchExclusivityRecord,
  DriverDeviceBindingSummary,
  DriverRegistryRecord,
  EmptyStateEnvelope,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UpdateDriverMasterLifecycleCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const REFRESH_TIER: RefreshTier = "medium_slow";
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

type FleetListEnvelope<T> = {
  items?: T[];
  emptyState?: EmptyStateEnvelope;
  refreshMetadata?: UiRefreshMetadata;
};

type FleetTabState<T> = {
  items: T[];
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata | null;
};

type Translator = (key: string, params?: Record<string, string | number>) => string;

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

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  vehicles: "fleet.tab.vehicles",
  drivers: "fleet.tab.drivers",
  contracts: "fleet.tab.contracts",
  device_binding: "fleet.tab.deviceBinding",
  exclusivity: "fleet.tab.exclusivity",
  offboarding: "fleet.tab.offboarding",
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  refresh_tab: "common.refresh",
  create_driver: "fleet.createDriver",
  create_contract: "fleet.createContract",
  update_vehicle_compliance: "fleet.updateCompliance",
  open_ops_vehicle: "fleet.openOpsConsole",
  activate_driver: "fleet.activateDriver",
  suspend_driver: "fleet.suspendDriver",
  retire_driver: "fleet.retireDriver",
  revoke_device_binding: "fleet.revokeDevice",
  approve_exclusivity: "fleet.approveExclusivity",
  reject_exclusivity: "fleet.rejectExclusivity",
  initiate_offboarding: "fleet.startOffboarding",
  advance_offboarding_step: "fleet.advanceOffboardingStep",
  complete_debranding: "fleet.completeDebranding",
  open_ops_driver: "fleet.openOpsConsole",
};

const WORKFLOW_LABEL_KEYS: Record<string, string> = {
  initiated: "fleet.workflow.initiated",
  dispatch_disabled: "fleet.workflow.dispatchDisabled",
  debranding_pending: "fleet.workflow.debrandingPending",
  debranding_verified: "fleet.workflow.debrandingVerified",
  completed: "fleet.workflow.completed",
  none: "fleet.workflow.none",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
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
  locale: Locale,
  t: Translator,
  lastFetchedAt: string | null,
  loading: boolean,
  refreshMetadata?: UiRefreshMetadata | null,
) {
  if (loading) {
    return t("fleet.refreshing");
  }
  if (refreshMetadata) {
    const prefix = t("fleet.snapshotGeneratedAt", {
      time: formatDateTime(refreshMetadata.generatedAt),
    });
    const suffix =
      refreshMetadata.source === "live"
        ? formatPlatformCodeLabel(locale, "live")
        : formatPlatformCodeLabel(locale, refreshMetadata.source);
    return `${prefix} · ${suffix} · ${formatPlatformCodeLabel(
      locale,
      refreshMetadata.dataFreshness,
    )}`;
  }
  if (!lastFetchedAt) {
    return t("fleet.awaitingFirstSnapshot");
  }
  return t("fleet.snapshotAt", { time: formatDateTime(lastFetchedAt) });
}

function actionLabel(t: Translator, action: string) {
  const key = ACTION_LABEL_KEYS[action];
  return key ? t(key) : action;
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

function normalizeFleetListEnvelope<T>(
  payload: T[] | FleetListEnvelope<T>,
): FleetTabState<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      emptyState: null,
      refreshMetadata: null,
    };
  }
  return {
    items: payload.items ?? [],
    emptyState: payload.emptyState ?? null,
    refreshMetadata: payload.refreshMetadata ?? null,
  };
}

function refreshTone(
  refreshMetadata: UiRefreshMetadata | null | undefined,
  loading: boolean,
): CanvasTone {
  if (loading) {
    return "warn";
  }
  switch (refreshMetadata?.dataFreshness) {
    case "degraded":
      return "warn";
    case "stale":
    case "unknown":
      return "neutral";
    case "fresh":
    default:
      return "success";
  }
}

function emptyStateConfig(t: Translator, reason: EmptyReason): EmptyConfig {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn",
        title: t("fleet.empty.notProvisioned.title"),
        description: t("fleet.empty.notProvisioned.description"),
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: t("fleet.empty.fetchFailed.title"),
        description: t("fleet.empty.fetchFailed.description"),
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: t("fleet.empty.permissionDenied.title"),
        description: t("fleet.empty.permissionDenied.description"),
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: t("fleet.empty.externalUnavailable.title"),
        description: t("fleet.empty.externalUnavailable.description"),
      };
    case "filtered_empty":
      return {
        tone: "info",
        title: t("fleet.empty.filteredEmpty.title"),
        description: t("fleet.empty.filteredEmpty.description"),
      };
    case "no_data":
    default:
      return {
        tone: "info",
        title: t("fleet.empty.noData.title"),
        description: t("fleet.empty.noData.description"),
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

function workflowLabel(t: Translator, state: string) {
  const key = WORKFLOW_LABEL_KEYS[state];
  return key ? t(key) : state;
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
  const { locale, t } = useTranslation();
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
  const [vehiclesEmptyState, setVehiclesEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [driversEmptyState, setDriversEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [contractsEmptyState, setContractsEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [exclusivitiesEmptyState, setExclusivitiesEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [vehiclesRefreshMetadata, setVehiclesRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [driversRefreshMetadata, setDriversRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [contractsRefreshMetadata, setContractsRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [exclusivitiesRefreshMetadata, setExclusivitiesRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);

  useEffect(() => {
    setActiveTab(queryTab);
  }, [queryTab]);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextVehicles, nextDrivers, nextContracts, nextExclusivities] =
        await Promise.all([
          client.get<
            GovernedVehicleRecord[] | FleetListEnvelope<GovernedVehicleRecord>
          >("/api/regulatory-registry/vehicles"),
          client.get<
            GovernedDriverRecord[] | FleetListEnvelope<GovernedDriverRecord>
          >("/api/regulatory-registry/drivers"),
          client.get<
            GovernedContractRecord[] | FleetListEnvelope<GovernedContractRecord>
          >("/api/regulatory-registry/contracts"),
          client.get<
            | GovernedExclusivityRecord[]
            | FleetListEnvelope<GovernedExclusivityRecord>
          >("/api/regulatory-registry/exclusivities"),
        ]);
      const vehicleState = normalizeFleetListEnvelope(nextVehicles);
      const driverState = normalizeFleetListEnvelope(nextDrivers);
      const contractState = normalizeFleetListEnvelope(nextContracts);
      const exclusivityState = normalizeFleetListEnvelope(nextExclusivities);
      setVehicles(vehicleState.items);
      setDrivers(driverState.items);
      setContracts(contractState.items);
      setExclusivities(exclusivityState.items);
      setVehiclesEmptyState(vehicleState.emptyState);
      setDriversEmptyState(driverState.emptyState);
      setContractsEmptyState(contractState.emptyState);
      setExclusivitiesEmptyState(exclusivityState.emptyState);
      setVehiclesRefreshMetadata(vehicleState.refreshMetadata);
      setDriversRefreshMetadata(driverState.refreshMetadata);
      setContractsRefreshMetadata(contractState.refreshMetadata);
      setExclusivitiesRefreshMetadata(exclusivityState.refreshMetadata);
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
          t("fleet.confirmAction", {
            action: actionLabel(t, descriptor.action),
          }),
        );
        if (!confirmed) {
          return;
        }
      }
      if (descriptor.requiresReason) {
        reason = window.prompt(t("fleet.reasonRequired"));
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
            const name = window.prompt(t("fleet.prompt.driverName"));
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
              t("fleet.prompt.vehicleId"),
              defaultVehicleId,
            );
            if (!vehicleId?.trim()) {
              return;
            }
            const partnerId = window.prompt(
              t("fleet.prompt.partnerId"),
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
            window.alert(t("fleet.actionNotWired"));
        }
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setBusyAction(null);
      }
    },
    [client, loadFleet, locale, t, vehicles],
  );

  const tabLabels: Record<TabKey, string> = useMemo(
    () =>
      Object.fromEntries(
        TAB_ORDER.map((tab) => [tab, t(TAB_LABEL_KEYS[tab])]),
      ) as Record<TabKey, string>,
    [t],
  );

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

  const activeRefreshMetadata = useMemo(() => {
    switch (activeTab) {
      case "vehicles":
      case "offboarding":
        return vehiclesRefreshMetadata;
      case "drivers":
      case "device_binding":
        return driversRefreshMetadata;
      case "contracts":
        return contractsRefreshMetadata;
      case "exclusivity":
        return exclusivitiesRefreshMetadata;
      default:
        return null;
    }
  }, [
    activeTab,
    contractsRefreshMetadata,
    driversRefreshMetadata,
    exclusivitiesRefreshMetadata,
    vehiclesRefreshMetadata,
  ]);

  const envelopeEmptyReason = useMemo<EmptyReason | null>(() => {
    switch (activeTab) {
      case "vehicles":
      case "offboarding":
        return vehiclesEmptyState?.reason ?? null;
      case "drivers":
      case "device_binding":
        return driversEmptyState?.reason ?? null;
      case "contracts":
        return contractsEmptyState?.reason ?? null;
      case "exclusivity":
        return exclusivitiesEmptyState?.reason ?? null;
      default:
        return null;
    }
  }, [
    activeTab,
    contractsEmptyState,
    driversEmptyState,
    exclusivitiesEmptyState,
    vehiclesEmptyState,
  ]);

  const activeEmptyReason =
    previewEmptyReason ||
    envelopeEmptyReason ||
    (error ? "fetch_failed" : tabCounts[activeTab] === 0 ? "no_data" : null);

  const activePageActions = pageActions[activeTab];
  const emptyConfig = activeEmptyReason
    ? emptyStateConfig(t, activeEmptyReason)
    : null;

  const renderActionButtons = useCallback(
    (actions: ResourceActionDescriptor[], context: ActionContext) => {
      if (actions.length === 0) {
        return (
          <CanvasPill theme={theme} tone="neutral">
            {t("fleet.readOnly")}
          </CanvasPill>
        );
      }
      return (
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
            const title = descriptor.enabled
              ? undefined
              : descriptor.disabledReasonCode
                ? formatPlatformCodeLabel(locale, descriptor.disabledReasonCode)
                : t("fleet.unavailable");
            return (
              <span key={`${descriptor.action}-${index}`} title={title}>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={resolved.variant}
                  {...(resolved.danger !== undefined
                    ? { danger: resolved.danger }
                    : {})}
                  disabled={!descriptor.enabled || busy}
                  onClick={() => void runAction(descriptor, context)}
                >
                  {busy ? t("fleet.working") : actionLabel(t, descriptor.action)}
                </CanvasBtn>
              </span>
            );
          })}
        </div>
      );
    },
    [busyAction, locale, runAction, t],
  );

  const vehicleColumns = useMemo<CanvasTableColumn<GovernedVehicleRecord>[]>(
    () => [
      {
        h: t("fleet.col.plate"),
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
        h: t("fleet.col.coverage"),
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.operatingArea,
            row.supportedServiceBuckets.join(" · "),
            row.supplyLifecycle.contract.contractId ?? "—",
          ),
      },
      {
        h: t("fleet.col.compliance"),
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
                ? t("fleet.vehicle.exclusivityApproved")
                : t("fleet.vehicle.exclusivityPending")}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: t("fleet.col.dispatchable"),
        w: 220,
        r: (row) =>
          renderStackedCell(
            <CanvasPill
              theme={theme}
              tone={row.dispatchableFlag ? "success" : "danger"}
              dot
            >
              {row.dispatchableFlag
                ? t("fleet.dispatchable")
                : t("fleet.vehicle.blocked")}
            </CanvasPill>,
            row.supplyLifecycle.dispatch.blockedReasons.length
              ? row.supplyLifecycle.dispatch.blockedReasons
                  .map((item: string) => formatPlatformCodeLabel(locale, item))
                  .join(" · ")
              : t("fleet.vehicle.noDispatchBlocks"),
            row.supplyLifecycle.insurance.endAt ?? "—",
          ),
      },
      {
        h: t("fleet.col.actions"),
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
    [locale, renderActionButtons, t],
  );

  const driverColumns = useMemo<CanvasTableColumn<GovernedDriverRecord>[]>(
    () => [
      {
        h: t("fleet.col.driver"),
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.name,
            row.driverId,
            row.deviceBindings[0]?.deviceId ?? "—",
          ),
      },
      {
        h: t("fleet.col.license"),
        w: 140,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={row.licensesValid ? "success" : "warn"}
            dot
          >
            {row.licensesValid
              ? t("fleet.licensesValid")
              : t("fleet.driver.licenseWarning")}
          </CanvasPill>
        ),
      },
      {
        h: t("fleet.col.dispatchReadiness"),
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
              : t("fleet.driver.dispatchReady"),
          ),
      },
      {
        h: t("fleet.col.binding"),
        w: 180,
        r: (row) =>
          renderStackedCell(
            row.deviceBindings[0]?.deviceLabel ??
              row.deviceBindings[0]?.deviceId ??
              "—",
            row.deviceBindings[0]
              ? formatPlatformCodeLabel(locale, row.deviceBindings[0].status)
              : t("fleet.driver.noActiveDevice"),
            row.updatedAt,
          ),
      },
      {
        h: t("fleet.col.actions"),
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
    [locale, renderActionButtons, t],
  );

  const contractColumns = useMemo<CanvasTableColumn<GovernedContractRecord>[]>(
    () => [
      {
        h: t("fleet.col.contract"),
        w: 140,
        r: (row) =>
          renderStackedCell(row.contractId, row.contractType, row.status),
      },
      {
        h: t("fleet.col.counterparty"),
        w: 220,
        r: (row) =>
          renderStackedCell(row.partnerId, row.partnerType, row.serviceScope),
      },
      {
        h: t("fleet.col.vehicle"),
        w: 120,
        k: "vehicleId",
        mono: true,
      },
      {
        h: t("fleet.col.term"),
        w: 220,
        r: (row) =>
          renderStackedCell(
            `${row.startAt} → ${row.endAt}`,
            row.lifecycleStatus,
          ),
      },
      {
        h: t("fleet.col.actions"),
        w: 140,
        r: (row) =>
          renderActionButtons(
            row.availableActions ?? [makeAction("refresh_tab", "low")],
            { kind: "contract", contract: row },
          ),
      },
    ],
    [renderActionButtons, t],
  );

  const bindingColumns = useMemo<CanvasTableColumn<DeviceBindingRow>[]>(
    () => [
      {
        h: t("fleet.col.driver"),
        w: 220,
        r: (row) =>
          renderStackedCell(
            row.driver.name,
            row.driver.driverId,
            row.driver.lifecycleStatus,
          ),
      },
      {
        h: t("fleet.col.device"),
        w: 240,
        r: (row) =>
          renderStackedCell(
            row.binding.deviceId,
            row.binding.deviceLabel ?? "—",
            row.binding.issuedAt,
          ),
      },
      {
        h: t("fleet.col.state"),
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
        h: t("fleet.col.lastSeen"),
        w: 150,
        r: (row) => formatDateTime(row.binding.refreshedAt),
      },
      {
        h: t("fleet.col.actions"),
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
    [locale, renderActionButtons, t],
  );

  const exclusivityColumns = useMemo<
    CanvasTableColumn<GovernedExclusivityRecord>[]
  >(
    () => [
      {
        h: t("fleet.col.review"),
        w: 130,
        r: (row) =>
          renderStackedCell(
            row.vehicleId,
            row.declarationStatus,
            row.updatedAt,
          ),
      },
      {
        h: t("fleet.col.provider"),
        w: 210,
        r: (row) =>
          renderStackedCell(
            row.exclusiveProviderName ?? "—",
            `${row.effectiveStart ?? "—"} → ${row.effectiveEnd ?? "—"}`,
            row.reviewerId ?? "—",
          ),
      },
      {
        h: t("fleet.col.state"),
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
        h: t("fleet.col.actions"),
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
    [locale, renderActionButtons, t],
  );

  const offboardingColumns = useMemo<
    CanvasTableColumn<GovernedVehicleRecord>[]
  >(
    () => [
      {
        h: t("fleet.col.vehicle"),
        w: 140,
        r: (row) =>
          renderStackedCell(row.plateNo, row.vehicleId, row.operatingArea),
      },
      {
        h: t("fleet.col.currentState"),
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
              {workflowLabel(t, state)}
            </CanvasPill>
          );
        },
      },
      {
        h: t("fleet.col.evidence"),
        w: 220,
        r: (row) =>
          renderStackedCell(
            row.supplyLifecycle.offboarding.debrandingTicketId ?? "—",
            row.supplyLifecycle.offboarding.reason ?? "—",
            row.supplyLifecycle.offboarding.debrandingDueAt ?? "—",
          ),
      },
      {
        h: t("fleet.col.timeline"),
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
        h: t("fleet.col.actions"),
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
    [renderActionButtons, t],
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
  const activeHeaderActions = activePageActions.filter(
    (descriptor) => descriptor.action !== "refresh_tab",
  );
  const activeFreshnessLabel = formatFreshness(
    locale,
    t,
    lastFetchedAt,
    loading,
    activeRefreshMetadata,
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("fleet.page.title")}
        subtitle={t("fleet.page.subtitle")}
        tabs={tabs}
        activeTab={tabs[TAB_ORDER.indexOf(activeTab)]}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() => window.alert(t("fleet.filterReserved"))}
            >
              {t("fleet.filter")}
            </CanvasBtn>
            {activeHeaderActions.length > 0
              ? renderActionButtons(activeHeaderActions, {
                  kind: "page",
                  tab: activeTab,
                })
              : null}
            <CanvasBtn theme={theme} onClick={() => void loadFleet()}>
              {t("common.refresh")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("fleet.refreshFailed")}
            body={error}
            actions={
              <CanvasBtn theme={theme} onClick={() => void loadFleet()}>
                {t("fleet.retry")}
              </CanvasBtn>
            }
          />
        ) : null}

        {!error &&
        activeRefreshMetadata &&
        activeRefreshMetadata.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={theme}
            tone={
              activeRefreshMetadata.dataFreshness === "degraded"
                ? "warn"
                : "info"
            }
            icon="info"
            title={t("fleet.snapshotNotFresh")}
            body={activeFreshnessLabel}
          />
        ) : null}

        {activeTab === "drivers" && blockedDrivers.length > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("fleet.driversNeedComplianceReview", {
              count: blockedDrivers.length,
            })}
            body={t("fleet.driverComplianceReviewBody")}
            actions={
              <CanvasBtn theme={theme} variant="secondary">
                {t("fleet.exportList")}
              </CanvasBtn>
            }
          />
        ) : null}

        {activeTab === "exclusivity" ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title={t("fleet.exclusivityGovernanceTitle")}
            body={t("fleet.exclusivityGovernanceBody")}
          />
        ) : null}

        {activeTab === "offboarding" ? (
          <CanvasCard
            theme={theme}
            title={t("fleet.offboardingCardTitle")}
            subtitle={t("fleet.offboardingCardSubtitle")}
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
                    {index + 1}. {workflowLabel(t, step)}
                  </div>
                  {index < all.length - 1 ? (
                    <div
                      style={{
                        flex: 1,
                        height: 2,
                        margin: "0 4px",
                        background: index < 2 ? theme.success : theme.border,
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
          subtitle={t("fleet.refreshTierSummary", {
            tier: REFRESH_TIER,
            freshness: activeFreshnessLabel,
          })}
        >
          {activeEmptyReason && emptyConfig ? (
            <div style={emptyPanelStyle(emptyConfig.tone)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                <CanvasPill
                  theme={theme}
                  tone={refreshTone(activeRefreshMetadata, loading)}
                  dot
                >
                  {activeRefreshMetadata?.dataFreshness ?? "fresh"}
                </CanvasPill>
                <CanvasBtn theme={theme} onClick={() => void loadFleet()}>
                  {t("common.refresh")}
                </CanvasBtn>
              </div>
            </div>
          ) : (
            renderActiveTable()
          )}
        </CanvasCard>
      </div>
    </>
  );
}
