"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  CreateVehicleContractCommand,
  DispatchExclusivityRecord,
  DriverDeviceBindingSummary,
  DriverRegistryRecord,
  EmptyReason,
  InitiateVehicleOffboardingCommand,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  WorkflowDetailDrawer,
  WorkflowEmptyState,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type FleetTab =
  | "vehicles"
  | "drivers"
  | "contracts"
  | "device"
  | "exclusivity"
  | "offboard";

type PendingAction = {
  actionId: string;
  label: string;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  requiresReason: boolean;
  body: string;
  execute: (reason: string) => Promise<void>;
};

type DeviceBindingRow = {
  id: string;
  driverId: string;
  driverName: string;
  lifecycleStatus: DriverRegistryRecord["lifecycleStatus"];
  binding: DriverDeviceBindingSummary;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  osLabel: string;
  lastSeenLabel: string;
};

type ExclusivityRow = {
  id: string;
  vehicleId: string;
  operatingArea: string;
  dispatchableFlag: boolean;
  record: DispatchExclusivityRecord;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  scopeLabel: string;
  submittedAt: string | null;
  submitter: string;
};

type OffboardingRow = {
  id: string;
  vehicle: VehicleRegistryRecord;
  timeline: Array<{ label: string; reached: boolean; at?: string | null }>;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  actor: string;
  evidence: string;
};

type VehicleView = VehicleRegistryRecord & {
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  regulatoryProfile: string;
  currentBindingSummary: string;
  insuranceExpiresAt: string | null;
};

type DriverView = DriverRegistryRecord & {
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  licenseExpiresAt: string | null;
  currentVehicleLabel: string;
  contractStatusLabel: string;
};

type ContractView = VehicleContractRecord & {
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  revenueShareLabel: string;
};

type RuntimeResource<T> = T & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
};

type DriverCreateForm = {
  name: string;
  phone: string;
  email: string;
  licensesValid: boolean;
};

type ContractCreateForm = {
  vehicleId: string;
  partnerId: string;
  partnerType: string;
  contractType: string;
  serviceScope: string;
  startAt: string;
  endAt: string;
};

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_TIER_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: Number.POSITIVE_INFINITY,
};
const TAB_ORDER: FleetTab[] = [
  "vehicles",
  "drivers",
  "contracts",
  "device",
  "exclusivity",
  "offboard",
];
const EMPTY_REASON_VALUES: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const theme = buildCanvasTheme({
  surface: "platform",
  dark: false,
  density: "compact",
});

const pageStyle: CSSProperties = {
  minHeight: "100%",
  background:
    "linear-gradient(180deg, rgba(252, 250, 245, 0.96), rgba(244, 239, 231, 0.94))",
  color: theme.text,
  borderRadius: 14,
  overflow: "hidden",
  fontFamily: theme.fontFamily,
};

const bodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const summaryCardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  display: "grid",
  gap: 8,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: theme.textDim,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: theme.text,
  lineHeight: 1,
};

const summaryMetaStyle: CSSProperties = {
  fontSize: 12,
  color: theme.textMuted,
  lineHeight: 1.45,
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const tabButtonStyle = (selected: boolean): CSSProperties => ({
  padding: "10px 14px",
  borderRadius: 999,
  border: `1px solid ${selected ? theme.accent : theme.border}`,
  background: selected ? theme.accentBg : theme.bg,
  color: selected ? theme.text : theme.textMuted,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
});

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(300px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const metaBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const searchBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const tabMetaGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
  alignItems: "start",
};

const tabPanelStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  display: "grid",
  gap: 12,
};

const tabKpiGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
};

const tabKpiCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  display: "grid",
  gap: 6,
};

const searchInputStyle: CSSProperties = {
  minWidth: 220,
  flex: "1 1 260px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  padding: "9px 12px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 12,
  color: theme.textMuted,
  lineHeight: 1.45,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const compactActionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const inlineInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.74)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 50,
};

const modalStyle: CSSProperties = {
  width: "min(520px, 100%)",
  borderRadius: 18,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  padding: 18,
  display: "grid",
  gap: 14,
  boxShadow: "0 30px 80px rgba(2, 6, 23, 0.48)",
};

const emptyToneMap: Record<
  EmptyReason,
  { tone: "neutral" | "info" | "warning" | "danger"; icon: string }
> = {
  no_data: { tone: "neutral", icon: "0" },
  not_provisioned: { tone: "info", icon: "P" },
  fetch_failed: { tone: "danger", icon: "!" },
  permission_denied: { tone: "warning", icon: "L" },
  external_unavailable: { tone: "warning", icon: "X" },
  filtered_empty: { tone: "info", icon: "?" },
};

function createInitialDriverForm(): DriverCreateForm {
  return {
    name: "",
    phone: "",
    email: "",
    licensesValid: false,
  };
}

function createInitialContractForm(): ContractCreateForm {
  return {
    vehicleId: "",
    partnerId: "",
    partnerType: "fleet_partner",
    contractType: "lease",
    serviceScope: "standard_taxi",
    startAt: "",
    endAt: "",
  };
}

function createInitialOffboardingForm(): InitiateVehicleOffboardingCommand {
  return {
    reason: "",
    requestedBy: "",
    debrandingRequired: true,
    debrandingDueAt: "",
    debrandingTicketId: "",
    notes: "",
  };
}

function toneForRisk(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): CanvasTone {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
  return "accent";
}

function toneForLifecycle(code: string): CanvasTone {
  if (
    code === "active" ||
    code === "approved" ||
    code === "completed" ||
    code === "valid"
  ) {
    return "success";
  }
  if (
    code === "pending" ||
    code === "submitted" ||
    code === "scheduled" ||
    code === "debranding_required" ||
    code === "draft"
  ) {
    return "warn";
  }
  if (
    code === "suspended" ||
    code === "retired" ||
    code === "rejected" ||
    code === "terminated" ||
    code === "expired"
  ) {
    return "danger";
  }
  return "info";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  return formatDateTime(value);
}

function isEmptyReason(value: string | null): value is EmptyReason {
  return value ? EMPTY_REASON_VALUES.includes(value as EmptyReason) : false;
}

function matchesText(parts: Array<string | null | undefined>, query: string) {
  if (!query.trim()) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function currentOffboardingStep(vehicle: VehicleRegistryRecord) {
  const status = vehicle.supplyLifecycle.offboarding.status;
  if (status === "completed") return "completed";
  if (vehicle.supplyLifecycle.offboarding.debrandingStatus === "completed") {
    return "debranding_verified";
  }
  if (
    status === "debranding_required" ||
    vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
  ) {
    return "debranding_pending";
  }
  if (status === "scheduled" || status === "in_progress") {
    return "dispatch_disabled";
  }
  if (status !== "none") return "initiated";
  return "initiated";
}

function offboardingTimeline(vehicle: VehicleRegistryRecord) {
  const offboarding = vehicle.supplyLifecycle.offboarding;
  const status = offboarding.status;
  const debrandingPending =
    status === "debranding_required" ||
    offboarding.debrandingStatus === "pending";

  return [
    {
      label: "initiated",
      reached: status !== "none",
      at: offboarding.requestedAt,
    },
    {
      label: "dispatch_disabled",
      reached: !vehicle.dispatchableFlag,
      at: offboarding.effectiveAt,
    },
    {
      label: "debranding_pending",
      reached: debrandingPending,
      at: offboarding.debrandingDueAt,
    },
    {
      label: "debranding_verified",
      reached: offboarding.debrandingStatus === "completed",
      at: offboarding.debrandingCompletedAt,
    },
    {
      label: "completed",
      reached: status === "completed",
      at: offboarding.completedAt,
    },
  ];
}

function opsVehicleLink(
  locale: string,
  vehicleId: string,
  label?: string,
): CrossAppResourceLink {
  return {
    targetApp: "ops-console",
    route: `/vehicles/${encodeURIComponent(vehicleId)}`,
    resourceType: "vehicle",
    resourceId: vehicleId,
    openMode: "new_tab",
    label:
      label ?? (locale === "en" ? "Vehicle operational state" : "車輛營運狀態"),
  };
}

function opsDriverLink(
  locale: string,
  driverId: string,
  label?: string,
): CrossAppResourceLink {
  return {
    targetApp: "ops-console",
    route: `/drivers/${encodeURIComponent(driverId)}`,
    resourceType: "driver",
    resourceId: driverId,
    openMode: "new_tab",
    label:
      label ?? (locale === "en" ? "Driver operational state" : "司機營運狀態"),
  };
}

function disabledReasonLabel(
  disabledReasonCode: string | undefined,
  fallback: string,
  copy: ReturnType<typeof getFleetCopy>,
) {
  if (!disabledReasonCode) return fallback;
  return (
    copy.disabledReasons[
      disabledReasonCode as keyof typeof copy.disabledReasons
    ] ?? disabledReasonCode
  );
}

function normalizeActions(
  actions: ResourceActionDescriptor[] | undefined,
  fallback: ResourceActionDescriptor[],
) {
  return actions && actions.length > 0 ? actions : fallback;
}

function normalizeLinks(
  links: CrossAppResourceLink[] | undefined,
  fallback: CrossAppResourceLink[],
) {
  return links && links.length > 0 ? links : fallback;
}

function getFleetCopy(locale: string) {
  return locale === "en"
    ? {
        title: "Fleet & compliance",
        subtitle:
          "Multi-tab governance for vehicles, drivers, contracts, device binding, exclusivity, and offboarding.",
        summaryBlockedVehicles: "Blocked vehicles",
        summaryBlockedDrivers: "Blocked drivers",
        summaryPendingExclusivity: "Exclusivity backlog",
        summaryOffboarding: "Offboarding in flight",
        summaryTier: "Refresh tier",
        summaryTierMeta: "T4 admin medium-slow · 30s",
        refresh: "Refresh",
        refreshFresh: "Fresh snapshot",
        refreshStale: "Snapshot stale",
        refreshDegraded: "Dependency degraded",
        refreshUnknown: "Refresh pending",
        dataSource: "Source",
        live: "live",
        cache: "cache",
        searchPlaceholder: "Search current tab",
        viewOps: "Open ops-console",
        filterHint:
          "Actions are rendered from per-resource availableActions; disabled CTAs stay visible with a reason.",
        createDriver: "Create driver",
        createDriverHelp:
          "Driver creation is the only write action not tied to an existing row.",
        noSelection: "Select a row to inspect workflow details.",
        reasonLabel: "Reason",
        cancel: "Cancel",
        confirm: "Confirm",
        lowRisk: "Low risk",
        mediumRisk: "Medium risk",
        highRisk: "High risk",
        breadcrumbParent: "People & fleet",
        breadcrumbCurrent: "Fleet & compliance",
        sitemapTitle: "Page sitemap",
        deepLinkTitle: "Cross-app links",
        selected: "Selected",
        openLink: "Open",
        routeLabel: "Route",
        actionCountLabel: "Available CTAs",
        actionModelTitle: "Action model",
        actionModelBody:
          "Buttons remain visible even when disabled; backend `availableActions` decides enablement and risk treatment.",
        tab: {
          vehicles: "Vehicles",
          drivers: "Drivers",
          contracts: "Contracts",
          device: "Device Binding",
          exclusivity: "Exclusivity Reviews",
          offboard: "Offboarding",
        },
        tabDescription: {
          vehicles:
            "Vehicle registry, insurance, dispatch hold, and operational cross-checks.",
          drivers:
            "Driver lifecycle, license readiness, service buckets, and device posture.",
          contracts:
            "Contract ownership, active periods, and editability boundaries.",
          device:
            "Driver-device binding state, issuance timing, and revocation control.",
          exclusivity:
            "Governed review queue that blocks dispatch restoration until approved.",
          offboard:
            "State-machine workflow with actor, evidence, and timestamp accountability.",
        },
        empty: {
          no_data: {
            title: "No records yet",
            description:
              "This tab is provisioned correctly, but no records exist in the current dataset.",
          },
          not_provisioned: {
            title: "Not provisioned",
            description:
              "The workflow exists, but this tenant or fleet has not provisioned the required upstream record yet.",
          },
          fetch_failed: {
            title: "Fetch failed",
            description:
              "The last read failed. Retry or inspect the page-critical dependency banner before acting.",
          },
          permission_denied: {
            title: "Permission denied",
            description:
              "The current actor can read the page shell but cannot access this workflow segment.",
          },
          external_unavailable: {
            title: "External dependency unavailable",
            description:
              "This workflow depends on an upstream system that is currently degraded or unavailable.",
          },
          filtered_empty: {
            title: "No matches for the current filter",
            description:
              "Records exist on this tab, but the active search query filtered them all out.",
          },
        },
        actions: {
          enableDispatch: "Mark dispatchable",
          disableDispatch: "Place dispatch hold",
          activateDriver: "Activate driver",
          suspendDriver: "Suspend driver",
          retireDriver: "Retire driver",
          revokeBinding: "Revoke binding",
          createContract: "Create contract",
          editTerms: "Edit terms",
          submitReview: "Submit review",
          approveReview: "Approve review",
          rejectReview: "Reject review",
          initiateOffboarding: "Initiate offboarding",
          advanceDispatchDisabled: "Advance to dispatch disabled",
          completeDebranding: "Complete debranding",
        },
        disabledReasons: {
          backend_action_unavailable: "Backend command is not available yet.",
          already_dispatchable: "Vehicle is already dispatchable.",
          already_held: "Dispatch hold is already active.",
          exclusivity_not_approved:
            "Dispatch cannot resume until exclusivity is approved.",
          no_active_binding: "No active device binding is available to revoke.",
          review_not_pending:
            "Review must be pending before it can be decided.",
          offboarding_not_started: "Offboarding has not been initiated yet.",
          debranding_not_pending:
            "Debranding cannot complete until the record reaches a pending state.",
        },
        detail: {
          workflow: "Workflow detail",
          dispatchState: "Dispatch state",
          evidence: "Evidence",
          timeline: "Timeline",
          deepLinks: "Cross-app links",
          opsHint: "Operational state opens in a new tab by default.",
        },
      }
    : {
        title: "車隊與法遵",
        subtitle:
          "把車輛、司機、合約、裝置綁定、排他審查與下線流程收進同一個治理畫面。",
        summaryBlockedVehicles: "受阻車輛",
        summaryBlockedDrivers: "受阻司機",
        summaryPendingExclusivity: "排他審查待辦",
        summaryOffboarding: "下線進行中",
        summaryTier: "刷新層級",
        summaryTierMeta: "T4 管理中慢速 · 30 秒",
        refresh: "重新整理",
        refreshFresh: "資料新鮮",
        refreshStale: "資料已陳舊",
        refreshDegraded: "依賴服務降級",
        refreshUnknown: "等待首次刷新",
        dataSource: "來源",
        live: "即時",
        cache: "快取",
        searchPlaceholder: "搜尋目前分頁",
        viewOps: "開啟 ops-console",
        filterHint:
          "CTA 由每筆資源的 availableActions 驅動；被停用的動作仍保留並附原因。",
        createDriver: "建立司機",
        createDriverHelp: "建立司機是唯一不綁定既有列資料的寫入動作。",
        noSelection: "請選擇一列資料查看工作流細節。",
        reasonLabel: "原因",
        cancel: "取消",
        confirm: "確認",
        lowRisk: "低風險",
        mediumRisk: "中風險",
        highRisk: "高風險",
        breadcrumbParent: "人員與車隊",
        breadcrumbCurrent: "車隊與法遵",
        sitemapTitle: "頁面地圖",
        deepLinkTitle: "跨 app 連結",
        selected: "已選",
        openLink: "開啟",
        routeLabel: "路由",
        actionCountLabel: "可用 CTA",
        actionModelTitle: "動作模型",
        actionModelBody:
          "按鈕即使停用也要保留；是否可執行與風險等級都由後端 `availableActions` 決定。",
        tab: {
          vehicles: "車輛",
          drivers: "司機",
          contracts: "合約",
          device: "裝置綁定",
          exclusivity: "排他審查",
          offboard: "下線流程",
        },
        tabDescription: {
          vehicles: "車輛主檔、保險、派遣 hold 與營運交叉檢查。",
          drivers: "司機生命週期、證照狀態、服務類型與裝置風險姿態。",
          contracts: "合約歸屬、生效期間與可編輯邊界。",
          device: "司機與裝置的綁定狀態、簽發時間與撤銷治理。",
          exclusivity: "核准前會阻擋恢復派遣的治理審查佇列。",
          offboard: "帶有操作者、證據與時間戳責任的狀態機流程。",
        },
        empty: {
          no_data: {
            title: "目前沒有資料",
            description: "這個分頁已正常開通，但當前資料集尚未建立任何紀錄。",
          },
          not_provisioned: {
            title: "尚未 provision",
            description:
              "流程存在，但上游必要資料尚未為此 fleet / tenant 建立。",
          },
          fetch_failed: {
            title: "讀取失敗",
            description:
              "最後一次讀取失敗。請先重試，或查看頁面上方的依賴降級提示。",
          },
          permission_denied: {
            title: "沒有權限",
            description: "目前使用者可看到頁面框架，但無法讀取這個工作流區段。",
          },
          external_unavailable: {
            title: "外部依賴不可用",
            description: "這個流程依賴的外部系統目前降級或不可用。",
          },
          filtered_empty: {
            title: "篩選後沒有結果",
            description:
              "這個分頁原本有資料，但目前搜尋條件把結果全部過濾掉了。",
          },
        },
        actions: {
          enableDispatch: "標記可派遣",
          disableDispatch: "加上派遣 hold",
          activateDriver: "啟用司機",
          suspendDriver: "停用司機",
          retireDriver: "退休司機",
          revokeBinding: "撤銷綁定",
          createContract: "建立合約",
          editTerms: "編輯條款",
          submitReview: "送出審查",
          approveReview: "核准審查",
          rejectReview: "駁回審查",
          initiateOffboarding: "啟動下線",
          advanceDispatchDisabled: "推進到 dispatch disabled",
          completeDebranding: "完成去識別化",
        },
        disabledReasons: {
          backend_action_unavailable: "後端命令尚未提供。",
          already_dispatchable: "車輛已可派遣。",
          already_held: "派遣 hold 已存在。",
          exclusivity_not_approved: "排他審查核准前不可恢復派遣。",
          no_active_binding: "目前沒有可撤銷的有效裝置綁定。",
          review_not_pending: "審查必須先進入 pending 才能決定。",
          offboarding_not_started: "下線流程尚未啟動。",
          debranding_not_pending: "需先進入 pending 狀態後才能完成去識別化。",
        },
        detail: {
          workflow: "工作流細節",
          dispatchState: "派遣狀態",
          evidence: "證據",
          timeline: "時間線",
          deepLinks: "跨 app 連結",
          opsHint: "營運狀態預設在新分頁開啟。",
        },
      };
}

export default function FleetPage() {
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabFromQuery = searchParams.get("tab");
  const emptyOverride = searchParams.get("empty");
  const initialTab = TAB_ORDER.includes(tabFromQuery as FleetTab)
    ? (tabFromQuery as FleetTab)
    : "vehicles";

  const [activeTab, setActiveTab] = useState<FleetTab>(initialTab);
  const [vehicles, setVehicles] = useState<VehicleView[]>([]);
  const [drivers, setDrivers] = useState<DriverView[]>([]);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [exclusivities, setExclusivities] = useState<ExclusivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [searchText, setSearchText] = useState("");
  const [driverForm, setDriverForm] = useState<DriverCreateForm>(
    createInitialDriverForm(),
  );
  const [contractForm, setContractForm] = useState<ContractCreateForm>(
    createInitialContractForm(),
  );
  const [offboardingForm, setOffboardingForm] = useState(
    createInitialOffboardingForm(),
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(
    null,
  );
  const [selectedExclusivityId, setSelectedExclusivityId] = useState<
    string | null
  >(null);
  const [selectedOffboardingId, setSelectedOffboardingId] = useState<
    string | null
  >(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reasonDraft, setReasonDraft] = useState("");
  const copy = getFleetCopy(locale);
  const refreshCadenceMs = REFRESH_TIER_MS[REFRESH_TIER];

  function buildVehicleActions(
    vehicle: VehicleRegistryRecord,
  ): ResourceActionDescriptor[] {
    const blockedByExclusivity =
      vehicle.supplyLifecycle.exclusivity.reviewStatus !== "approved";
    return [
      {
        action: `vehicle.dispatch.enable:${vehicle.vehicleId}`,
        enabled: !vehicle.dispatchableFlag && !blockedByExclusivity,
        disabledReasonCode: vehicle.dispatchableFlag
          ? "already_dispatchable"
          : blockedByExclusivity
            ? "exclusivity_not_approved"
            : undefined,
        riskLevel: "medium",
      },
      {
        action: `vehicle.dispatch.disable:${vehicle.vehicleId}`,
        enabled: vehicle.dispatchableFlag,
        disabledReasonCode: vehicle.dispatchableFlag
          ? undefined
          : "already_held",
        riskLevel: "medium",
      },
    ];
  }

  function buildDriverActions(
    driver: DriverRegistryRecord,
  ): ResourceActionDescriptor[] {
    return [
      {
        action: `driver.lifecycle.activate:${driver.driverId}`,
        enabled: driver.lifecycleStatus !== "active",
        riskLevel: "medium",
      },
      {
        action: `driver.lifecycle.suspend:${driver.driverId}`,
        enabled: driver.lifecycleStatus !== "suspended",
        riskLevel: "high",
        requiresReason: true,
      },
      {
        action: `driver.lifecycle.retire:${driver.driverId}`,
        enabled: driver.lifecycleStatus !== "retired",
        riskLevel: "high",
        requiresReason: true,
      },
    ];
  }

  function buildExclusivityActions(
    vehicleId: string,
    reviewStatus: DispatchExclusivityRecord["reviewStatus"],
    declarationStatus: DispatchExclusivityRecord["declarationStatus"],
  ): ResourceActionDescriptor[] {
    return [
      {
        action: `exclusivity.submit:${vehicleId}`,
        enabled: reviewStatus === "draft" || declarationStatus === "missing",
        riskLevel: "medium",
      },
      {
        action: `exclusivity.approve:${vehicleId}`,
        enabled: reviewStatus === "pending",
        disabledReasonCode:
          reviewStatus === "pending" ? undefined : "review_not_pending",
        riskLevel: "high",
        requiresReason: true,
      },
      {
        action: `exclusivity.reject:${vehicleId}`,
        enabled: reviewStatus === "pending",
        disabledReasonCode:
          reviewStatus === "pending" ? undefined : "review_not_pending",
        riskLevel: "high",
        requiresReason: true,
      },
    ];
  }

  async function loadData(mode: "initial" | "refresh" = "refresh") {
    if (mode === "initial") {
      setLoading(true);
    }
    setError(null);
    try {
      const [vehicleRows, driverRows, contractRows, exclusivityRows] =
        await Promise.all([
          client.listVehicles(),
          client.listDrivers(),
          client.listContracts(),
          client.listExclusivities(),
        ]);

      const mappedVehicles: VehicleView[] = (
        (vehicleRows ?? []) as RuntimeResource<VehicleRegistryRecord>[]
      ).map((vehicle) => ({
        ...vehicle,
        availableActions: normalizeActions(
          vehicle.availableActions,
          buildVehicleActions(vehicle),
        ),
        crossAppLinks: normalizeLinks(vehicle.crossAppLinks, [
          opsVehicleLink(locale, vehicle.vehicleId),
        ]),
        regulatoryProfile: [
          vehicle.operatingArea,
          vehicle.supportedServiceBuckets.join("/"),
        ]
          .filter(Boolean)
          .join(" · "),
        currentBindingSummary: vehicle.dispatchableFlag
          ? locale === "en"
            ? "Dispatch path available"
            : "可進入派遣流程"
          : locale === "en"
            ? "Dispatch blocked"
            : "派遣受阻",
        insuranceExpiresAt: vehicle.supplyLifecycle.insurance.endAt ?? null,
      }));
      const mappedDrivers: DriverView[] = (
        (driverRows ?? []) as RuntimeResource<DriverRegistryRecord>[]
      ).map((driver) => ({
        ...driver,
        availableActions: normalizeActions(
          driver.availableActions,
          buildDriverActions(driver),
        ),
        crossAppLinks: normalizeLinks(driver.crossAppLinks, [
          opsDriverLink(locale, driver.driverId),
        ]),
        licenseExpiresAt: driver.licensesValid ? driver.updatedAt : null,
        currentVehicleLabel:
          driver.deviceBindings.find(
            (binding: DriverDeviceBindingSummary) =>
              binding.status === "active",
          )?.deviceLabel ??
          (locale === "en" ? "No active device" : "沒有有效裝置"),
        contractStatusLabel: driver.dispatchEligible
          ? locale === "en"
            ? "dispatch-eligible"
            : "可派遣"
          : locale === "en"
            ? "blocked"
            : "受阻",
      }));
      const mappedContracts: ContractView[] = (
        (contractRows ?? []) as RuntimeResource<VehicleContractRecord>[]
      ).map((contract) => ({
        ...contract,
        availableActions: normalizeActions(contract.availableActions, [
          {
            action: `contract.edit:${contract.contractId}`,
            enabled: false,
            disabledReasonCode: "backend_action_unavailable",
            riskLevel: "medium",
          },
        ]),
        crossAppLinks: normalizeLinks(contract.crossAppLinks, [
          opsVehicleLink(locale, contract.vehicleId),
        ]),
        revenueShareLabel:
          contract.contractType === "lease"
            ? "lease"
            : contract.contractType === "commission"
              ? "commission"
              : "mixed",
      }));
      const mappedExclusivities: ExclusivityRow[] = mappedVehicles.map(
        (vehicle) => {
          const record = (
            (exclusivityRows ??
              []) as RuntimeResource<DispatchExclusivityRecord>[]
          ).find((item) => item.vehicleId === vehicle.vehicleId) ?? {
            vehicleId: vehicle.vehicleId,
            declarationStatus:
              vehicle.supplyLifecycle.exclusivity.declarationStatus ??
              "missing",
            declarationFileId:
              vehicle.supplyLifecycle.exclusivity.declarationFileId ?? null,
            reviewStatus: vehicle.supplyLifecycle.exclusivity.reviewStatus,
            lifecycleStatus:
              vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
            reviewerId: null,
            reviewedAt: vehicle.supplyLifecycle.exclusivity.reviewedAt ?? null,
            exclusiveProviderName:
              vehicle.supplyLifecycle.exclusivity.providerName ?? null,
            effectiveStart:
              vehicle.supplyLifecycle.exclusivity.effectiveStart ?? null,
            effectiveEnd:
              vehicle.supplyLifecycle.exclusivity.effectiveEnd ?? null,
            terminationReason: null,
            updatedAt:
              vehicle.supplyLifecycle.exclusivity.updatedAt ??
              vehicle.updatedAt,
          };
          return {
            id: vehicle.vehicleId,
            vehicleId: vehicle.vehicleId,
            operatingArea: vehicle.operatingArea,
            dispatchableFlag: vehicle.dispatchableFlag,
            record,
            availableActions: normalizeActions(
              record.availableActions,
              buildExclusivityActions(
                vehicle.vehicleId,
                record.reviewStatus,
                record.declarationStatus,
              ),
            ),
            crossAppLinks: normalizeLinks(record.crossAppLinks, [
              opsVehicleLink(locale, vehicle.vehicleId),
            ]),
            scopeLabel: `vehicle:${vehicle.vehicleId}`,
            submittedAt: record.updatedAt,
            submitter: "fleet_admin",
          };
        },
      );

      setVehicles(mappedVehicles);
      setDrivers(mappedDrivers);
      setContracts(mappedContracts);
      setExclusivities(mappedExclusivities);
      setSelectedVehicleId(
        (current) => current ?? mappedVehicles[0]?.vehicleId ?? null,
      );
      setSelectedDriverId(
        (current) => current ?? mappedDrivers[0]?.driverId ?? null,
      );
      setSelectedContractId(
        (current) => current ?? mappedContracts[0]?.contractId ?? null,
      );
      setSelectedBindingId((current) => {
        if (current) return current;
        for (const driver of mappedDrivers) {
          const active = driver.deviceBindings.find(
            (binding: DriverDeviceBindingSummary) =>
              binding.status === "active",
          );
          if (active) return active.bindingId;
        }
        return null;
      });
      setSelectedExclusivityId(
        (current) =>
          current ??
          mappedExclusivities[0]?.vehicleId ??
          mappedVehicles[0]?.vehicleId ??
          null,
      );
      setSelectedOffboardingId(
        (current) => current ?? mappedVehicles[0]?.vehicleId ?? null,
      );
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: refreshCadenceMs,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: refreshCadenceMs,
        dataFreshness: "degraded",
        source: "live",
      });
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }

  useEffect(() => {
    void loadData("initial");
    const refreshInterval = Number.isFinite(refreshCadenceMs)
      ? window.setInterval(() => {
          void loadData();
        }, refreshCadenceMs)
      : null;
    const clockInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);
    return () => {
      if (refreshInterval !== null) {
        window.clearInterval(refreshInterval);
      }
      window.clearInterval(clockInterval);
    };
  }, [refreshCadenceMs]);

  useEffect(() => {
    const nextTab = TAB_ORDER.includes(tabFromQuery as FleetTab)
      ? (tabFromQuery as FleetTab)
      : "vehicles";
    setActiveTab(nextTab);
  }, [tabFromQuery]);

  function setTab(tab: FleetTab) {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`);
  }

  async function runAction(
    actionId: string,
    executor: (reason: string) => Promise<void>,
    reason = "",
  ) {
    setBusyActionId(actionId);
    setError(null);
    try {
      await executor(reason);
      await loadData();
      setPendingAction(null);
      setReasonDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyActionId(null);
    }
  }

  function queueAction(action: PendingAction) {
    setReasonDraft("");
    setPendingAction(action);
  }

  function presentAction(
    descriptor: ResourceActionDescriptor,
    label: string,
    body: string,
    execute: (reason: string) => Promise<void>,
  ) {
    return (
      <CanvasBtn
        key={`${label}:${descriptor.action}`}
        theme={theme}
        variant={descriptor.riskLevel === "low" ? "ghost" : "secondary"}
        danger={descriptor.riskLevel === "high"}
        disabled={!descriptor.enabled || busyActionId === descriptor.action}
        onClick={() => {
          if (!descriptor.enabled) {
            return;
          }
          if (descriptor.riskLevel === "low" && !descriptor.requiresReason) {
            void runAction(descriptor.action, execute);
            return;
          }
          queueAction({
            actionId: descriptor.action,
            label,
            body,
            riskLevel: descriptor.riskLevel,
            requiresReason: Boolean(descriptor.requiresReason),
            execute,
          });
        }}
        style={!descriptor.enabled ? { cursor: "not-allowed" } : {}}
      >
        <span
          title={disabledReasonLabel(
            descriptor.disabledReasonCode,
            label,
            copy,
          )}
        >
          {label}
        </span>
      </CanvasBtn>
    );
  }

  const deviceBindings: DeviceBindingRow[] = drivers.flatMap((driver) =>
    driver.deviceBindings.map((binding: DriverDeviceBindingSummary) => ({
      id: binding.bindingId,
      driverId: driver.driverId,
      driverName: driver.name,
      lifecycleStatus: driver.lifecycleStatus,
      binding,
      availableActions: normalizeActions(
        (binding as RuntimeResource<DriverDeviceBindingSummary>)
          .availableActions,
        [
          {
            action: `binding.revoke:${binding.bindingId}`,
            enabled: binding.status === "active",
            disabledReasonCode:
              binding.status === "active" ? undefined : "no_active_binding",
            requiresReason: true,
            riskLevel: "high",
          },
        ],
      ),
      crossAppLinks: normalizeLinks(
        (binding as RuntimeResource<DriverDeviceBindingSummary>).crossAppLinks,
        [opsDriverLink(locale, driver.driverId)],
      ),
      osLabel: binding.deviceId.startsWith("ios") ? "iOS" : "Android",
      lastSeenLabel: formatTimestamp(binding.refreshedAt),
    })),
  );

  const exclusivityRows = exclusivities;

  const offboardingRows: OffboardingRow[] = vehicles.map((vehicle) => ({
    id: vehicle.vehicleId,
    vehicle,
    timeline: offboardingTimeline(vehicle),
    availableActions: normalizeActions(
      (
        vehicle.supplyLifecycle.offboarding as RuntimeResource<
          VehicleRegistryRecord["supplyLifecycle"]["offboarding"]
        >
      ).availableActions,
      [
        {
          action: `offboarding.initiate:${vehicle.vehicleId}`,
          enabled: vehicle.supplyLifecycle.offboarding.status === "none",
          riskLevel: "high",
          requiresReason: true,
        },
        {
          action: `offboarding.advance:${vehicle.vehicleId}`,
          enabled:
            vehicle.supplyLifecycle.offboarding.status !== "none" &&
            vehicle.supplyLifecycle.offboarding.status !== "completed" &&
            vehicle.dispatchableFlag,
          disabledReasonCode:
            vehicle.supplyLifecycle.offboarding.status === "none"
              ? "offboarding_not_started"
              : vehicle.dispatchableFlag
                ? undefined
                : "already_held",
          riskLevel: "medium",
        },
        {
          action: `offboarding.complete:${vehicle.vehicleId}`,
          enabled:
            vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
          disabledReasonCode:
            vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
              ? undefined
              : "debranding_not_pending",
          riskLevel: "medium",
        },
      ],
    ),
    crossAppLinks: normalizeLinks(vehicle.crossAppLinks, [
      opsVehicleLink(locale, vehicle.vehicleId),
    ]),
    actor:
      vehicle.supplyLifecycle.offboarding.requestedBy ||
      (locale === "en" ? "Governance queue" : "治理佇列"),
    evidence:
      vehicle.supplyLifecycle.offboarding.debrandingTicketId ||
      vehicle.supplyLifecycle.offboarding.notes ||
      "—",
  }));

  const filteredVehicles = vehicles.filter((vehicle) =>
    matchesText(
      [
        vehicle.vehicleId,
        vehicle.plateNo,
        vehicle.operatingArea,
        vehicle.supportedServiceBuckets.join(" "),
      ],
      searchText,
    ),
  );
  const filteredDrivers = drivers.filter((driver) =>
    matchesText(
      [
        driver.driverId,
        driver.name,
        driver.lifecycleStatus,
        driver.supportedServiceBuckets.join(" "),
      ],
      searchText,
    ),
  );
  const filteredContracts = contracts.filter((contract) =>
    matchesText(
      [
        contract.contractId,
        contract.vehicleId,
        contract.partnerId,
        contract.contractType,
      ],
      searchText,
    ),
  );
  const filteredBindings = deviceBindings.filter((row) =>
    matchesText(
      [
        row.driverId,
        row.driverName,
        row.binding.bindingId,
        row.binding.deviceId,
      ],
      searchText,
    ),
  );
  const filteredExclusivities = exclusivityRows.filter((row) =>
    matchesText(
      [
        row.vehicleId,
        row.operatingArea,
        row.record.exclusiveProviderName,
        row.record.reviewStatus,
      ],
      searchText,
    ),
  );
  const filteredOffboarding = offboardingRows.filter((row) =>
    matchesText(
      [
        row.vehicle.vehicleId,
        row.vehicle.plateNo,
        row.vehicle.supplyLifecycle.offboarding.status,
        row.vehicle.supplyLifecycle.offboarding.reason,
      ],
      searchText,
    ),
  );

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId) ?? null;
  const selectedDriver =
    drivers.find((driver) => driver.driverId === selectedDriverId) ?? null;
  const selectedContract =
    contracts.find((contract) => contract.contractId === selectedContractId) ??
    null;
  const selectedBinding =
    deviceBindings.find((row) => row.binding.bindingId === selectedBindingId) ??
    null;
  const selectedExclusivity =
    exclusivityRows.find((row) => row.vehicleId === selectedExclusivityId) ??
    null;
  const selectedOffboarding =
    offboardingRows.find(
      (row) => row.vehicle.vehicleId === selectedOffboardingId,
    ) ?? null;

  const selectedRecord =
    activeTab === "vehicles"
      ? selectedVehicle
      : activeTab === "drivers"
        ? selectedDriver
        : activeTab === "contracts"
          ? selectedContract
          : activeTab === "device"
            ? selectedBinding
            : activeTab === "exclusivity"
              ? selectedExclusivity
              : selectedOffboarding;

  const copyEmpty = copy.empty as Record<
    EmptyReason,
    { title: string; description: string }
  >;

  const stale =
    refreshMeta &&
    now - Date.parse(refreshMeta.generatedAt) > refreshMeta.staleAfterMs;

  const blockedVehicleCount = vehicles.filter(
    (vehicle) =>
      !vehicle.dispatchableFlag ||
      vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
  ).length;
  const blockedDriverCount = drivers.filter(
    (driver) =>
      !driver.dispatchEligible || driver.eligibilityBlockedReasons.length > 0,
  ).length;
  const pendingExclusivityCount = exclusivityRows.filter(
    (row) => row.record.reviewStatus === "pending",
  ).length;
  const offboardingCount = offboardingRows.filter(
    (row) => row.vehicle.supplyLifecycle.offboarding.status !== "none",
  ).length;
  const licenseWarningCount = drivers.filter(
    (driver) => !driver.licensesValid,
  ).length;
  const actionCountByTab: Record<FleetTab, number> = {
    vehicles: vehicles.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
    drivers: drivers.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
    contracts: contracts.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
    device: deviceBindings.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
    exclusivity: exclusivityRows.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
    offboard: offboardingRows.reduce(
      (total, row) =>
        total +
        row.availableActions.filter(
          (action: ResourceActionDescriptor) => action.enabled,
        ).length,
      0,
    ),
  };
  const countsByTab: Record<FleetTab, number> = {
    vehicles: vehicles.length,
    drivers: drivers.length,
    contracts: contracts.length,
    device: deviceBindings.length,
    exclusivity: exclusivityRows.length,
    offboard: offboardingRows.length,
  };
  const tabRoutes: Record<FleetTab, string> = {
    vehicles: "/fleet?tab=vehicles",
    drivers: "/fleet?tab=drivers",
    contracts: "/fleet?tab=contracts",
    device: "/fleet?tab=device",
    exclusivity: "/fleet?tab=exclusivity",
    offboard: "/fleet?tab=offboard",
  };

  const vehicleColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: copy.tab.vehicles,
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <button
            type="button"
            onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
            style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}
          >
            <strong>{vehicle.vehicleId}</strong>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {vehicle.plateNo}
            </span>
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "Profile" : "法規檔案",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <div style={stackStyle}>
            <span>{vehicle.operatingArea || "—"}</span>
            <span style={secondaryTextStyle}>
              {vehicle.regulatoryProfile || "—"}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Type / binding" : "車種 / 綁定",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <div style={stackStyle}>
            <span>{vehicle.supportedServiceBuckets.join(", ") || "—"}</span>
            <span style={secondaryTextStyle}>
              {vehicle.currentBindingSummary}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Insurance" : "保險",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <div style={stackStyle}>
            <CanvasPill
              theme={theme}
              tone={toneForLifecycle(vehicle.insuranceStatus)}
              dot
            >
              {formatPlatformCodeLabel(locale, vehicle.insuranceStatus)}
            </CanvasPill>
            <span style={secondaryTextStyle}>
              {formatTimestamp(vehicle.insuranceExpiresAt)}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Dispatch" : "派遣",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <CanvasPill
            theme={theme}
            tone={vehicle.dispatchableFlag ? "success" : "warn"}
            dot
          >
            {vehicle.dispatchableFlag
              ? locale === "en"
                ? "dispatchable"
                : "可派遣"
              : locale === "en"
                ? "held"
                : "受阻"}
          </CanvasPill>
        );
      },
    },
    {
      h: locale === "en" ? "Compliance status" : "合規狀態",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <div style={stackStyle}>
            {vehicle.supplyLifecycle.dispatch.blockedReasons.length === 0 ? (
              <span style={secondaryTextStyle}>
                {locale === "en" ? "No blockers" : "無阻塞"}
              </span>
            ) : (
              vehicle.supplyLifecycle.dispatch.blockedReasons.map(
                (reason: string) => (
                  <span key={reason} style={secondaryTextStyle}>
                    {formatPlatformCodeLabel(locale, reason)}
                  </span>
                ),
              )
            )}
            <span style={secondaryTextStyle}>
              {formatPlatformCodeLabel(
                locale,
                vehicle.supplyLifecycle.exclusivity.reviewStatus,
              )}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const vehicle = filteredVehicles[index];
        return (
          <div style={compactActionRowStyle}>{vehicleActions(vehicle)}</div>
        );
      },
    },
  ];

  const driverColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: locale === "en" ? "Driver" : "司機",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return (
          <button
            type="button"
            onClick={() => setSelectedDriverId(driver.driverId)}
            style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}
          >
            <strong>{driver.name}</strong>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {driver.driverId}
            </span>
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "Lifecycle" : "生命週期",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return (
          <CanvasPill
            theme={theme}
            tone={toneForLifecycle(driver.lifecycleStatus)}
            dot
          >
            {formatPlatformCodeLabel(locale, driver.lifecycleStatus)}
          </CanvasPill>
        );
      },
    },
    {
      h: locale === "en" ? "License expiry" : "證照到期",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return (
          <div style={stackStyle}>
            <CanvasPill
              theme={theme}
              tone={driver.licensesValid ? "success" : "danger"}
              dot
            >
              {driver.licensesValid
                ? locale === "en"
                  ? "valid"
                  : "有效"
                : locale === "en"
                  ? "invalid"
                  : "失效"}
            </CanvasPill>
            <span style={secondaryTextStyle}>
              {formatTimestamp(driver.licenseExpiresAt)}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Service / binding" : "服務 / 綁定",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return (
          <div style={stackStyle}>
            <span>{driver.supportedServiceBuckets.join(", ") || "—"}</span>
            {driver.deviceBindings.length === 0 ? (
              <span style={secondaryTextStyle}>
                {locale === "en" ? "Not provisioned" : "尚未建立"}
              </span>
            ) : (
              driver.deviceBindings.map(
                (binding: DriverDeviceBindingSummary) => (
                  <span key={binding.bindingId} style={secondaryTextStyle}>
                    {binding.deviceId} ·{" "}
                    {formatPlatformCodeLabel(locale, binding.status)}
                  </span>
                ),
              )
            )}
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Contract / dispatch" : "合約 / 派遣",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return (
          <div style={stackStyle}>
            <CanvasPill
              theme={theme}
              tone={driver.dispatchEligible ? "success" : "warn"}
              dot
            >
              {driver.dispatchEligible
                ? locale === "en"
                  ? "eligible"
                  : "可派遣"
                : locale === "en"
                  ? "blocked"
                  : "受阻"}
            </CanvasPill>
            {driver.eligibilityBlockedReasons[0] ? (
              <span style={secondaryTextStyle}>
                {formatPlatformCodeLabel(
                  locale,
                  driver.eligibilityBlockedReasons[0],
                )}
              </span>
            ) : (
              <span style={secondaryTextStyle}>
                {driver.contractStatusLabel}
              </span>
            )}
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const driver = filteredDrivers[index];
        return <div style={compactActionRowStyle}>{driverActions(driver)}</div>;
      },
    },
  ];

  const contractColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: locale === "en" ? "Contract" : "合約",
      r: (_, index) => {
        const contract = filteredContracts[index];
        return (
          <button
            type="button"
            onClick={() => setSelectedContractId(contract.contractId)}
            style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}
          >
            <strong>{contract.contractType}</strong>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {contract.contractId}
            </span>
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "Vehicle" : "車輛",
      r: (_, index) => filteredContracts[index].vehicleId,
    },
    {
      h: locale === "en" ? "Parties" : "合約對象",
      r: (_, index) => {
        const contract = filteredContracts[index];
        return (
          <div style={stackStyle}>
            <span>{contract.partnerId}</span>
            <span style={secondaryTextStyle}>{contract.vehicleId}</span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Effective" : "期間",
      r: (_, index) => {
        const contract = filteredContracts[index];
        return (
          <div style={stackStyle}>
            <span>{formatTimestamp(contract.startAt)}</span>
            <span style={secondaryTextStyle}>
              {formatTimestamp(contract.endAt)}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Status" : "狀態",
      r: (_, index) => {
        const contract = filteredContracts[index];
        return (
          <CanvasPill
            theme={theme}
            tone={toneForLifecycle(contract.status)}
            dot
          >
            {formatPlatformCodeLabel(locale, contract.status)}
          </CanvasPill>
        );
      },
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const contract = filteredContracts[index];
        return (
          <div style={compactActionRowStyle}>{contractActions(contract)}</div>
        );
      },
    },
  ];

  const bindingColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: locale === "en" ? "Driver" : "司機",
      r: (_, index) => {
        const row = filteredBindings[index];
        if (!row) return null;
        return (
          <button
            type="button"
            onClick={() => setSelectedBindingId(row.binding.bindingId)}
            style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}
          >
            <strong>{row.driverName}</strong>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {row.driverId}
            </span>
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "Device" : "裝置",
      r: (_, index) => {
        const row = filteredBindings[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <span>{row.binding.deviceLabel || row.binding.deviceId}</span>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {row.binding.bindingId}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Binding status" : "綁定狀態",
      r: (_, index) => {
        const row = filteredBindings[index];
        if (!row) return null;
        return (
          <CanvasPill
            theme={theme}
            tone={toneForLifecycle(row.binding.status)}
            dot
          >
            {formatPlatformCodeLabel(locale, row.binding.status)}
          </CanvasPill>
        );
      },
    },
    {
      h: locale === "en" ? "OS / issued" : "系統 / 簽發",
      r: (_, index) => {
        const row = filteredBindings[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <span>{row.osLabel}</span>
            <span style={secondaryTextStyle}>
              {formatTimestamp(row.binding.issuedAt)}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Refreshed" : "更新",
      r: (_, index) =>
        formatTimestamp(filteredBindings[index]?.binding.refreshedAt),
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const row = filteredBindings[index];
        if (!row) return null;
        return <div style={compactActionRowStyle}>{bindingActions(row)}</div>;
      },
    },
  ];

  const exclusivityColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: locale === "en" ? "Vehicle" : "車輛",
      r: (_, index) => {
        const row = filteredExclusivities[index];
        if (!row) return null;
        return (
          <button
            type="button"
            onClick={() => setSelectedExclusivityId(row.vehicleId)}
            style={{ all: "unset", cursor: "pointer", color: theme.text }}
          >
            {row.vehicleId}
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "Scope / provider" : "範圍 / 供應商",
      r: (_, index) => {
        const row = filteredExclusivities[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <span>{row.scopeLabel}</span>
            <span style={secondaryTextStyle}>
              {row.record.exclusiveProviderName || "—"}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Declaration" : "聲明文件",
      r: (_, index) => {
        const row = filteredExclusivities[index];
        if (!row) return null;
        return (
          <CanvasPill
            theme={theme}
            tone={toneForLifecycle(row.record.declarationStatus)}
            dot
          >
            {formatPlatformCodeLabel(locale, row.record.declarationStatus)}
          </CanvasPill>
        );
      },
    },
    {
      h: locale === "en" ? "Submitter / review" : "提交者 / 審查",
      r: (_, index) => {
        const row = filteredExclusivities[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <span>{row.submitter}</span>
            <CanvasPill
              theme={theme}
              tone={toneForLifecycle(row.record.reviewStatus)}
              dot
            >
              {formatPlatformCodeLabel(locale, row.record.reviewStatus)}
            </CanvasPill>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Submitted" : "提交時間",
      r: (_, index) =>
        formatTimestamp(filteredExclusivities[index]?.submittedAt),
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const row = filteredExclusivities[index];
        if (!row) return null;
        return (
          <div style={compactActionRowStyle}>{exclusivityActions(row)}</div>
        );
      },
    },
  ];

  const offboardingColumns: CanvasTableColumn<Record<string, unknown>>[] = [
    {
      h: locale === "en" ? "Vehicle" : "車輛",
      r: (_, index) => {
        const row = filteredOffboarding[index];
        if (!row) return null;
        return (
          <button
            type="button"
            onClick={() => setSelectedOffboardingId(row.vehicle.vehicleId)}
            style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}
          >
            <strong>{row.vehicle.vehicleId}</strong>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {row.vehicle.plateNo}
            </span>
          </button>
        );
      },
    },
    {
      h: locale === "en" ? "State machine" : "狀態機",
      r: (_, index) => {
        const row = filteredOffboarding[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <CanvasPill
              theme={theme}
              tone={toneForLifecycle(
                row.vehicle.supplyLifecycle.offboarding.status,
              )}
              dot
            >
              {formatPlatformCodeLabel(
                locale,
                currentOffboardingStep(row.vehicle),
              )}
            </CanvasPill>
            <span style={secondaryTextStyle}>
              {formatPlatformCodeLabel(
                locale,
                row.vehicle.supplyLifecycle.offboarding.status,
              )}
            </span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Reason" : "原因",
      r: (_, index) =>
        filteredOffboarding[index]?.vehicle.supplyLifecycle.offboarding
          .reason || "—",
    },
    {
      h: locale === "en" ? "Evidence / actor" : "證據 / 操作者",
      r: (_, index) => {
        const row = filteredOffboarding[index];
        if (!row) return null;
        return (
          <div style={stackStyle}>
            <span>{row.evidence}</span>
            <span style={secondaryTextStyle}>{row.actor}</span>
          </div>
        );
      },
    },
    {
      h: locale === "en" ? "Effective" : "生效",
      r: (_, index) =>
        formatTimestamp(
          filteredOffboarding[index]?.vehicle.supplyLifecycle.offboarding
            .effectiveAt,
        ),
    },
    {
      h: locale === "en" ? "Actions" : "動作",
      r: (_, index) => {
        const row = filteredOffboarding[index];
        if (!row) return null;
        return (
          <div style={compactActionRowStyle}>{offboardingActions(row)}</div>
        );
      },
    },
  ];

  function renderCrossAppLinks(links: CrossAppResourceLink[]) {
    return links.map((link) => (
      <a
        key={`${link.targetApp}:${link.resourceType}:${link.resourceId}:${link.route}`}
        href={link.route}
        target={link.openMode === "new_tab" ? "_blank" : undefined}
        rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
      >
        <CanvasBtn theme={theme} variant="ghost">
          {link.label}
        </CanvasBtn>
      </a>
    ));
  }

  function vehicleActions(vehicle: VehicleView) {
    return [
      ...vehicle.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          descriptor.action.startsWith("vehicle.dispatch.enable")
            ? copy.actions.enableDispatch
            : copy.actions.disableDispatch,
          descriptor.action.startsWith("vehicle.dispatch.enable")
            ? locale === "en"
              ? "Dispatch can only be re-enabled after compliance blockers are cleared."
              : "只有在合規阻塞解除後，才可恢復派遣。"
            : locale === "en"
              ? "This applies a governance hold before ops dispatch can resume."
              : "這會先套用治理 hold，再由營運端恢復派遣。",
          async () => {
            await client.updateVehicleCompliance(vehicle.vehicleId, {
              dispatchableFlag: descriptor.action.startsWith(
                "vehicle.dispatch.enable",
              ),
            });
          },
        ),
      ),
      ...renderCrossAppLinks(vehicle.crossAppLinks),
    ];
  }

  function driverActions(driver: DriverView) {
    return [
      ...driver.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          descriptor.action.includes(".activate:")
            ? copy.actions.activateDriver
            : descriptor.action.includes(".suspend:")
              ? copy.actions.suspendDriver
              : copy.actions.retireDriver,
          descriptor.action.includes(".activate:")
            ? locale === "en"
              ? "Activation restores dispatch eligibility once other blockers are clear."
              : "啟用後，其他阻塞解除即可恢復派遣資格。"
            : descriptor.action.includes(".suspend:")
              ? locale === "en"
                ? "Suspending a driver is a high-risk governance action and requires an audit reason."
                : "停用司機屬高風險治理動作，必須留下稽核原因。"
              : locale === "en"
                ? "Retiring a driver closes the registry record for future dispatch."
                : "退休司機會把這筆主檔從未來派遣工作流中移出。",
          async (reason) => {
            await client.updateDriverMasterLifecycle(driver.driverId, {
              lifecycleStatus: descriptor.action.includes(".activate:")
                ? "active"
                : descriptor.action.includes(".suspend:")
                  ? "suspended"
                  : "retired",
              reason,
            });
          },
        ),
      ),
      ...renderCrossAppLinks(driver.crossAppLinks),
    ];
  }

  function contractActions(contract: ContractView) {
    return [
      ...contract.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          copy.actions.editTerms,
          disabledReasonLabel(
            descriptor.disabledReasonCode,
            copy.actions.editTerms,
            copy,
          ),
          async () => undefined,
        ),
      ),
      ...renderCrossAppLinks(contract.crossAppLinks),
    ];
  }

  function bindingActions(row: DeviceBindingRow) {
    return [
      ...row.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          copy.actions.revokeBinding,
          locale === "en"
            ? "Revoking a device binding immediately blocks the device from future auth refresh."
            : "撤銷綁定後，該裝置會立即失去後續授權更新能力。",
          async () => {
            await client.revokeDriverDeviceBinding({
              bindingId: row.binding.bindingId,
              deviceId: row.binding.deviceId,
            });
          },
        ),
      ),
      ...renderCrossAppLinks(row.crossAppLinks),
    ];
  }

  function exclusivityActions(row: ExclusivityRow) {
    return [
      ...row.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          descriptor.action.startsWith("exclusivity.submit")
            ? copy.actions.submitReview
            : descriptor.action.startsWith("exclusivity.approve")
              ? copy.actions.approveReview
              : copy.actions.rejectReview,
          descriptor.action.startsWith("exclusivity.submit")
            ? locale === "en"
              ? "Submitting moves the declaration into the governed review queue."
              : "送出後，聲明文件會進入受治理的審查佇列。"
            : descriptor.action.startsWith("exclusivity.approve")
              ? locale === "en"
                ? "Approval unblocks dispatch re-enablement for this exclusivity lane."
                : "核准後，這條排他治理線才可解除恢復派遣的阻塞。"
              : locale === "en"
                ? "Rejection keeps dispatch blocked until a corrected declaration is resubmitted."
                : "駁回後，需重新提交修正後的聲明文件才可解除派遣阻塞。",
          async (reason) => {
            if (descriptor.action.startsWith("exclusivity.submit")) {
              await client.submitExclusivityReview(row.vehicleId, {
                declarationFileId:
                  row.record.declarationFileId ??
                  `decl-${row.vehicleId.toLowerCase()}`,
                exclusiveProviderName:
                  row.record.exclusiveProviderName ?? "Exclusive provider",
                effectiveStart:
                  row.record.effectiveStart ?? new Date().toISOString(),
                effectiveEnd: row.record.effectiveEnd,
              });
              return;
            }
            if (descriptor.action.startsWith("exclusivity.approve")) {
              await client.approveExclusivity(row.vehicleId, {
                reviewerId: "platform-admin-web",
              });
              return;
            }
            await client.rejectExclusivity(row.vehicleId, {
              reviewerId: "platform-admin-web",
              reason,
            });
          },
        ),
      ),
      ...renderCrossAppLinks(row.crossAppLinks),
    ];
  }

  function offboardingActions(row: OffboardingRow) {
    return [
      ...row.availableActions.map((descriptor: ResourceActionDescriptor) =>
        presentAction(
          descriptor,
          descriptor.action.startsWith("offboarding.initiate")
            ? copy.actions.initiateOffboarding
            : descriptor.action.startsWith("offboarding.advance")
              ? copy.actions.advanceDispatchDisabled
              : copy.actions.completeDebranding,
          descriptor.action.startsWith("offboarding.initiate")
            ? locale === "en"
              ? "Initiating offboarding starts the governed state machine for this vehicle."
              : "啟動下線後，這台車會進入正式治理狀態機。"
            : descriptor.action.startsWith("offboarding.advance")
              ? locale === "en"
                ? "This advances the workflow by removing dispatchability ahead of debranding."
                : "這會先關閉派遣能力，再推進去識別化工作。"
              : locale === "en"
                ? "Debranding completion closes the evidence step for this offboarding record."
                : "完成去識別化會關閉此下線紀錄的證據步驟。",
          async (reason) => {
            if (descriptor.action.startsWith("offboarding.initiate")) {
              await client.initiateVehicleOffboarding(row.vehicle.vehicleId, {
                ...offboardingForm,
                reason: offboardingForm.reason.trim() || reason,
              });
              return;
            }
            if (descriptor.action.startsWith("offboarding.advance")) {
              await client.updateVehicleCompliance(row.vehicle.vehicleId, {
                dispatchableFlag: false,
              });
              return;
            }
            await client.completeVehicleDebranding(row.vehicle.vehicleId, {
              debrandingTicketId:
                offboardingForm.debrandingTicketId?.trim() || null,
              notes: offboardingForm.notes?.trim() || null,
            });
          },
        ),
      ),
      ...renderCrossAppLinks(row.crossAppLinks),
    ];
  }

  function emptyReason(
    totalCount: number,
    filteredCount: number,
    variant: "default" | "not_provisioned" | "permission_denied" | "external",
  ): EmptyReason | null {
    if (isEmptyReason(emptyOverride)) {
      return emptyOverride;
    }
    if (error && totalCount === 0) {
      return "fetch_failed";
    }
    if (searchText.trim() && filteredCount === 0 && totalCount > 0) {
      return "filtered_empty";
    }
    if (totalCount > 0) {
      return null;
    }
    if (variant === "not_provisioned") return "not_provisioned";
    if (variant === "permission_denied") return "permission_denied";
    if (variant === "external") return "external_unavailable";
    return "no_data";
  }

  function renderEmpty(reason: EmptyReason, retry?: boolean) {
    const visual = emptyToneMap[reason] ?? emptyToneMap.no_data!;
    const emptyCopy = copyEmpty[reason] ?? copyEmpty.no_data!;
    return (
      <WorkflowEmptyState
        tone={visual.tone}
        density="compact"
        title={emptyCopy.title}
        description={emptyCopy.description}
        icon={
          <span
            style={{
              width: 28,
              height: 28,
              display: "inline-grid",
              placeItems: "center",
              borderRadius: "50%",
              border: `1px solid ${theme.border}`,
              fontFamily: theme.monoFamily,
              fontSize: 12,
            }}
          >
            {visual.icon}
          </span>
        }
        actions={
          retry ? (
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => void loadData()}
            >
              {copy.refresh}
            </CanvasBtn>
          ) : undefined
        }
      />
    );
  }

  function renderTable(
    columns: CanvasTableColumn<Record<string, unknown>>[],
    rows: readonly Record<string, unknown>[],
    emptyState: ReactNode,
  ) {
    if (rows.length === 0) {
      return emptyState;
    }

    return (
      <div style={{ overflow: "hidden", borderRadius: 14 }}>
        <CanvasTable theme={theme} columns={columns} rows={rows} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...bodyStyle, minHeight: 240, placeItems: "center" }}>
          <WorkflowEmptyState
            tone="info"
            density="compact"
            title={
              locale === "en" ? "Loading fleet workflows" : "正在載入車隊工作流"
            }
            description={
              locale === "en"
                ? "Pulling T4 fleet governance snapshots."
                : "正在讀取 T4 車隊治理快照。"
            }
          />
        </div>
      </div>
    );
  }

  const refreshTone: CanvasTone =
    refreshMeta?.dataFreshness === "degraded"
      ? "warn"
      : stale
        ? "danger"
        : refreshMeta?.dataFreshness === "fresh"
          ? "success"
          : "info";

  const refreshBannerTone: Exclude<CanvasTone, "neutral"> =
    refreshTone === "danger"
      ? "danger"
      : refreshTone === "warn"
        ? "warn"
        : "info";

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn theme={theme} variant="ghost">
              {locale === "en" ? "Filter" : "篩選"}
            </CanvasBtn>
            {activeTab === "drivers" ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => {
                  document.getElementById("fleet-driver-form")?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                }}
              >
                {copy.createDriver}
              </CanvasBtn>
            ) : null}
            {activeTab === "contracts" ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => {
                  document
                    .getElementById("fleet-contract-form")
                    ?.scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    });
                }}
              >
                {copy.actions.createContract}
              </CanvasBtn>
            ) : null}
            {activeTab === "offboard" ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger
                onClick={() => {
                  document
                    .getElementById("fleet-offboarding-form")
                    ?.scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    });
                }}
              >
                {copy.actions.initiateOffboarding}
              </CanvasBtn>
            ) : null}
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => void loadData()}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        <div style={summaryGridStyle}>
          {[
            {
              label: copy.summaryBlockedVehicles,
              value: blockedVehicleCount,
              meta:
                locale === "en"
                  ? "Dispatch blockers across vehicle compliance"
                  : "車輛合規阻塞總數",
            },
            {
              label: copy.summaryBlockedDrivers,
              value: blockedDriverCount,
              meta:
                locale === "en"
                  ? "Eligibility or license blockers"
                  : "派遣資格或證照阻塞",
            },
            {
              label: copy.summaryPendingExclusivity,
              value: pendingExclusivityCount,
              meta:
                locale === "en"
                  ? "Submitted reviews needing governance decision"
                  : "已提交、待治理決策的審查",
            },
            {
              label: copy.summaryOffboarding,
              value: offboardingCount,
              meta:
                locale === "en"
                  ? "Vehicles inside the state machine"
                  : "仍在下線狀態機中的車輛",
            },
          ].map((item) => (
            <div key={item.label} style={summaryCardStyle}>
              <span style={summaryLabelStyle}>{item.label}</span>
              <span style={summaryValueStyle}>{item.value}</span>
              <span style={summaryMetaStyle}>{item.meta}</span>
            </div>
          ))}
        </div>

        <CanvasBanner
          theme={theme}
          tone={refreshBannerTone}
          title={`${copy.summaryTier} · ${copy.summaryTierMeta}`}
          body={
            <div style={{ display: "grid", gap: 6 }}>
              <div style={metaBarStyle}>
                <CanvasPill theme={theme} tone={refreshTone} dot>
                  {refreshMeta?.dataFreshness === "degraded"
                    ? copy.refreshDegraded
                    : stale
                      ? copy.refreshStale
                      : refreshMeta?.dataFreshness === "fresh"
                        ? copy.refreshFresh
                        : copy.refreshUnknown}
                </CanvasPill>
                <CanvasPill theme={theme} tone="info">
                  {copy.dataSource}:{" "}
                  {refreshMeta?.source === "cache" ? copy.cache : copy.live}
                </CanvasPill>
                <span style={secondaryTextStyle}>
                  {refreshMeta
                    ? `${locale === "en" ? "Generated" : "產生時間"} · ${formatTimestamp(
                        refreshMeta.generatedAt,
                      )}`
                    : copy.refreshUnknown}
                </span>
              </div>
              <span style={secondaryTextStyle}>{copy.filterHint}</span>
            </div>
          }
        />

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        <CanvasCard theme={theme}>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            <span style={summaryLabelStyle}>{copy.sitemapTitle}</span>
            <div style={metaBarStyle}>
              <CanvasPill theme={theme} tone="info">
                {copy.breadcrumbParent}
              </CanvasPill>
              <CanvasPill theme={theme} tone="accent">
                {copy.breadcrumbCurrent}
              </CanvasPill>
              {TAB_ORDER.map((tab) => (
                <CanvasPill
                  key={`sitemap-${tab}`}
                  theme={theme}
                  tone={activeTab === tab ? "accent" : "neutral"}
                >
                  {copy.tab[tab]}
                </CanvasPill>
              ))}
            </div>
          </div>
        </CanvasCard>

        <div style={tabMetaGridStyle}>
          <div style={tabPanelStyle}>
            <div style={{ ...metaBarStyle, justifyContent: "space-between" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <span style={summaryLabelStyle}>{copy.selected}</span>
                <strong style={{ fontSize: 20, color: theme.text }}>
                  {copy.tab[activeTab]}
                </strong>
              </div>
              <CanvasPill theme={theme} tone="accent">
                {countsByTab[activeTab]} {locale === "en" ? "rows" : "筆"}
              </CanvasPill>
            </div>
            <span style={secondaryTextStyle}>
              {copy.tabDescription[activeTab]}
            </span>
            <div style={tabKpiGridStyle}>
              <div style={tabKpiCardStyle}>
                <span style={summaryLabelStyle}>{copy.routeLabel}</span>
                <span style={{ ...secondaryTextStyle, ...monoStyle }}>
                  {tabRoutes[activeTab]}
                </span>
              </div>
              <div style={tabKpiCardStyle}>
                <span style={summaryLabelStyle}>{copy.actionCountLabel}</span>
                <span
                  style={{ fontSize: 22, fontWeight: 700, color: theme.text }}
                >
                  {actionCountByTab[activeTab]}
                </span>
              </div>
              <div style={tabKpiCardStyle}>
                <span style={summaryLabelStyle}>{copy.summaryTier}</span>
                <span
                  style={{ fontSize: 22, fontWeight: 700, color: theme.text }}
                >
                  T4
                </span>
                <span style={secondaryTextStyle}>{copy.summaryTierMeta}</span>
              </div>
            </div>
          </div>

          <CanvasBanner
            theme={theme}
            tone="info"
            title={copy.actionModelTitle}
            body={copy.actionModelBody}
          />
        </div>

        {activeTab === "drivers" && licenseWarningCount > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={
              locale === "en"
                ? `${licenseWarningCount} driver records need license follow-up`
                : `${licenseWarningCount} 筆司機證照需要追蹤`
            }
            body={
              locale === "en"
                ? "Driver governance and ops dispatch must stay aligned before re-activation."
                : "司機治理與 ops 派遣資格必須在重新啟用前對齊。"
            }
          />
        ) : null}

        {activeTab === "exclusivity" && pendingExclusivityCount > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            title="Exclusivity governance"
            body={
              locale === "en"
                ? "Vehicle dispatchability cannot return to true until exclusivity review is approved."
                : "排他審查核准前，車輛 dispatchable 不可回到 true。"
            }
          />
        ) : null}

        {activeTab === "offboard" && offboardingCount > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title="Offboarding state machine"
            body={
              locale === "en"
                ? "Each transition needs timestamp, actor, evidence, and audit context."
                : "每一步轉換都需要時間戳、操作者、證據與 audit context。"
            }
          />
        ) : null}

        {activeTab === "offboard" ? (
          <CanvasCard theme={theme}>
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <span style={summaryLabelStyle}>
                {locale === "en" ? "Workflow states" : "工作流狀態"}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  "initiated",
                  "dispatch_disabled",
                  "debranding_pending",
                  "debranding_verified",
                  "completed",
                ].map((step, index) => (
                  <CanvasPill
                    key={step}
                    theme={theme}
                    tone={index < 2 ? "success" : index === 2 ? "warn" : "info"}
                  >
                    {index + 1}. {formatPlatformCodeLabel(locale, step)}
                  </CanvasPill>
                ))}
              </div>
            </div>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={theme}>
          <div style={{ padding: 16, display: "grid", gap: 14 }}>
            <div style={tabBarStyle}>
              {TAB_ORDER.map((tab) => {
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTab(tab)}
                    style={tabButtonStyle(activeTab === tab)}
                  >
                    {copy.tab[tab]} ({countsByTab[tab]})
                  </button>
                );
              })}
            </div>

            <div style={searchBarStyle}>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={copy.searchPlaceholder}
                style={searchInputStyle}
              />
              <span style={secondaryTextStyle}>
                {locale === "en"
                  ? "Cross-app links open in a new tab."
                  : "跨 app 連結預設在新分頁開啟。"}
              </span>
            </div>
          </div>
        </CanvasCard>

        <div style={splitStyle}>
          <CanvasCard theme={theme}>
            <div style={{ padding: 14 }}>
              {activeTab === "vehicles" &&
                renderTable(
                  vehicleColumns,
                  filteredVehicles as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      vehicles.length,
                      filteredVehicles.length,
                      "default",
                    ) ?? "no_data",
                    true,
                  ),
                )}
              {activeTab === "drivers" &&
                renderTable(
                  driverColumns,
                  filteredDrivers as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      drivers.length,
                      filteredDrivers.length,
                      "default",
                    ) ?? "no_data",
                    true,
                  ),
                )}
              {activeTab === "contracts" &&
                renderTable(
                  contractColumns,
                  filteredContracts as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      contracts.length,
                      filteredContracts.length,
                      "permission_denied",
                    ) ?? "permission_denied",
                    true,
                  ),
                )}
              {activeTab === "device" &&
                renderTable(
                  bindingColumns,
                  filteredBindings as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      deviceBindings.length,
                      filteredBindings.length,
                      "not_provisioned",
                    ) ?? "not_provisioned",
                    true,
                  ),
                )}
              {activeTab === "exclusivity" &&
                renderTable(
                  exclusivityColumns,
                  filteredExclusivities as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      exclusivityRows.length,
                      filteredExclusivities.length,
                      "external",
                    ) ?? "external_unavailable",
                    true,
                  ),
                )}
              {activeTab === "offboard" &&
                renderTable(
                  offboardingColumns,
                  filteredOffboarding as unknown as Record<string, unknown>[],
                  renderEmpty(
                    emptyReason(
                      offboardingRows.length,
                      filteredOffboarding.length,
                      "default",
                    ) ?? "no_data",
                    true,
                  ),
                )}
            </div>
          </CanvasCard>

          <WorkflowDetailDrawer
            tone="neutral"
            density="compact"
            eyebrow={copy.detail.workflow}
            title={copy.tab[activeTab]}
            description={copy.detail.opsHint}
            meta={
              refreshMeta ? (
                <CanvasPill theme={theme} tone={refreshTone}>
                  {formatTimestamp(refreshMeta.generatedAt)}
                </CanvasPill>
              ) : undefined
            }
          >
            {activeTab === "vehicles" && selectedVehicle ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Vehicle ID" : "車輛 ID",
                      v: selectedVehicle.vehicleId,
                    },
                    {
                      k: locale === "en" ? "Plate" : "車牌",
                      v: selectedVehicle.plateNo || "—",
                    },
                    {
                      k: locale === "en" ? "Area" : "營運區域",
                      v: selectedVehicle.operatingArea || "—",
                    },
                    {
                      k: copy.detail.dispatchState,
                      v: selectedVehicle.supplyLifecycle.dispatch.blockedReasons
                        .length
                        ? selectedVehicle.supplyLifecycle.dispatch.blockedReasons
                            .map((reason: string) =>
                              formatPlatformCodeLabel(locale, reason),
                            )
                            .join(", ")
                        : locale === "en"
                          ? "No blockers"
                          : "無阻塞",
                    },
                    {
                      k: locale === "en" ? "Insurance expiry" : "保險到期",
                      v: formatTimestamp(selectedVehicle.insuranceExpiresAt),
                    },
                    {
                      k: locale === "en" ? "Exclusivity review" : "排他審查",
                      v: formatPlatformCodeLabel(
                        locale,
                        selectedVehicle.supplyLifecycle.exclusivity
                          .reviewStatus,
                      ),
                    },
                  ]}
                />
                <div style={actionRowStyle}>
                  {vehicleActions(selectedVehicle)}
                </div>
                <div style={stackStyle}>
                  <strong>{copy.detail.deepLinks}</strong>
                  <div style={actionRowStyle}>
                    {renderCrossAppLinks(selectedVehicle.crossAppLinks)}
                  </div>
                </div>
              </>
            ) : null}

            {activeTab === "drivers" && selectedDriver ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Driver ID" : "司機 ID",
                      v: selectedDriver.driverId,
                    },
                    {
                      k: locale === "en" ? "Name" : "姓名",
                      v: selectedDriver.name,
                    },
                    {
                      k: locale === "en" ? "Lifecycle" : "生命週期",
                      v: formatPlatformCodeLabel(
                        locale,
                        selectedDriver.lifecycleStatus,
                      ),
                    },
                    {
                      k: locale === "en" ? "Service buckets" : "服務類型",
                      v: selectedDriver.supportedServiceBuckets.join(", "),
                    },
                    {
                      k: locale === "en" ? "Bindings" : "綁定數",
                      v: String(selectedDriver.deviceBindings.length),
                    },
                    {
                      k:
                        locale === "en"
                          ? "Contract / eligibility"
                          : "合約 / 資格",
                      v: selectedDriver.contractStatusLabel,
                    },
                  ]}
                />
                <div style={actionRowStyle}>
                  {driverActions(selectedDriver)}
                </div>
                <div style={stackStyle}>
                  <strong>{copy.detail.deepLinks}</strong>
                  <div style={actionRowStyle}>
                    {renderCrossAppLinks(selectedDriver.crossAppLinks)}
                  </div>
                </div>
                <CanvasCard theme={theme}>
                  <div id="fleet-driver-form" />
                  <div style={{ padding: 14, display: "grid", gap: 12 }}>
                    <strong>{copy.createDriver}</strong>
                    <span style={secondaryTextStyle}>
                      {copy.createDriverHelp}
                    </span>
                    <CanvasField
                      theme={theme}
                      label={locale === "en" ? "Name" : "姓名"}
                    >
                      <input
                        value={driverForm.name}
                        onChange={(event) =>
                          setDriverForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={locale === "en" ? "Phone" : "電話"}
                    >
                      <input
                        value={driverForm.phone}
                        onChange={(event) =>
                          setDriverForm((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={theme} label="Email">
                      <input
                        value={driverForm.email}
                        onChange={(event) =>
                          setDriverForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                    <label
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="checkbox"
                        checked={driverForm.licensesValid}
                        onChange={(event) =>
                          setDriverForm((current) => ({
                            ...current,
                            licensesValid: event.target.checked,
                          }))
                        }
                      />
                      <span style={secondaryTextStyle}>
                        {locale === "en" ? "Licenses valid" : "證照有效"}
                      </span>
                    </label>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      disabled={
                        !driverForm.name.trim() ||
                        busyActionId === "driver:create"
                      }
                      onClick={() =>
                        void runAction("driver:create", async () => {
                          await client.createDriverMaster({
                            name: driverForm.name.trim(),
                            phone: driverForm.phone.trim() || null,
                            email: driverForm.email.trim() || null,
                            licensesValid: driverForm.licensesValid,
                            supportedServiceBuckets: ["standard_taxi"],
                          });
                          setDriverForm(createInitialDriverForm());
                        })
                      }
                    >
                      {copy.createDriver}
                    </CanvasBtn>
                  </div>
                </CanvasCard>
              </>
            ) : null}

            {activeTab === "contracts" && selectedContract ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Contract ID" : "合約 ID",
                      v: selectedContract.contractId,
                    },
                    {
                      k: locale === "en" ? "Vehicle" : "車輛",
                      v: selectedContract.vehicleId,
                    },
                    {
                      k: locale === "en" ? "Partner" : "合作夥伴",
                      v: selectedContract.partnerId,
                    },
                    {
                      k: locale === "en" ? "Type" : "類型",
                      v: selectedContract.contractType,
                    },
                    {
                      k: locale === "en" ? "From" : "開始",
                      v: formatTimestamp(selectedContract.startAt),
                    },
                    {
                      k: locale === "en" ? "To" : "結束",
                      v: formatTimestamp(selectedContract.endAt),
                    },
                    {
                      k: locale === "en" ? "Revenue share" : "分潤型態",
                      v: selectedContract.revenueShareLabel,
                    },
                  ]}
                />
                <div style={actionRowStyle}>
                  {contractActions(selectedContract)}
                </div>
                <div style={actionRowStyle}>
                  {renderCrossAppLinks(selectedContract.crossAppLinks)}
                </div>
              </>
            ) : null}

            {activeTab === "contracts" ? (
              <CanvasCard theme={theme}>
                <div id="fleet-contract-form" />
                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  <strong>{copy.actions.createContract}</strong>
                  <span style={secondaryTextStyle}>
                    {locale === "en"
                      ? "Draft contracts are created here, while row-level terms remain governed by availableActions."
                      : "草稿合約在這裡建立；既有合約的條款操作仍由各列的 availableActions 治理。"}
                  </span>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Vehicle ID" : "車輛 ID"}
                  >
                    <input
                      value={contractForm.vehicleId}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          vehicleId: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Partner ID" : "合作夥伴 ID"}
                  >
                    <input
                      value={contractForm.partnerId}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          partnerId: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Partner type" : "合作夥伴類型"}
                  >
                    <input
                      value={contractForm.partnerType}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          partnerType: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Contract type" : "合約類型"}
                  >
                    <input
                      value={contractForm.contractType}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          contractType: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Service scope" : "服務範圍"}
                  >
                    <input
                      value={contractForm.serviceScope}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          serviceScope: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Start at" : "開始時間"}
                  >
                    <input
                      value={contractForm.startAt}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          startAt: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "End at" : "結束時間"}
                  >
                    <input
                      value={contractForm.endAt}
                      onChange={(event) =>
                        setContractForm((current) => ({
                          ...current,
                          endAt: event.target.value,
                        }))
                      }
                      style={inlineInputStyle}
                    />
                  </CanvasField>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={
                      !contractForm.vehicleId.trim() ||
                      !contractForm.partnerId.trim() ||
                      !contractForm.partnerType.trim() ||
                      !contractForm.contractType.trim() ||
                      !contractForm.serviceScope.trim() ||
                      !contractForm.startAt.trim() ||
                      !contractForm.endAt.trim() ||
                      busyActionId === "contract:create"
                    }
                    onClick={() =>
                      void runAction("contract:create", async () => {
                        const command: CreateVehicleContractCommand = {
                          vehicleId: contractForm.vehicleId.trim(),
                          partnerId: contractForm.partnerId.trim(),
                          partnerType: contractForm.partnerType.trim(),
                          contractType: contractForm.contractType.trim(),
                          operatingAreaId: null,
                          serviceScope: contractForm.serviceScope.trim(),
                          startAt: contractForm.startAt.trim(),
                          endAt: contractForm.endAt.trim(),
                        };
                        await client.createContract(command);
                        setContractForm(createInitialContractForm());
                      })
                    }
                  >
                    {copy.actions.createContract}
                  </CanvasBtn>
                </div>
              </CanvasCard>
            ) : null}

            {activeTab === "device" && selectedBinding ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Binding ID" : "綁定 ID",
                      v: selectedBinding.binding.bindingId,
                    },
                    {
                      k: locale === "en" ? "Driver" : "司機",
                      v: `${selectedBinding.driverName} · ${selectedBinding.driverId}`,
                    },
                    {
                      k: locale === "en" ? "Device" : "裝置",
                      v: selectedBinding.binding.deviceId,
                    },
                    {
                      k: locale === "en" ? "Status" : "狀態",
                      v: formatPlatformCodeLabel(
                        locale,
                        selectedBinding.binding.status,
                      ),
                    },
                    {
                      k: locale === "en" ? "Issued" : "簽發",
                      v: formatTimestamp(selectedBinding.binding.issuedAt),
                    },
                    { k: "OS", v: selectedBinding.osLabel },
                    {
                      k: locale === "en" ? "Last seen" : "最近在線",
                      v: selectedBinding.lastSeenLabel,
                    },
                  ]}
                />
                <div style={actionRowStyle}>
                  {bindingActions(selectedBinding)}
                </div>
                <div style={actionRowStyle}>
                  {renderCrossAppLinks(selectedBinding.crossAppLinks)}
                </div>
              </>
            ) : null}

            {activeTab === "exclusivity" && selectedExclusivity ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Vehicle" : "車輛",
                      v: selectedExclusivity.vehicleId,
                    },
                    {
                      k: locale === "en" ? "Provider" : "供應商",
                      v:
                        selectedExclusivity.record.exclusiveProviderName || "—",
                    },
                    {
                      k: locale === "en" ? "Declaration file" : "聲明文件",
                      v: selectedExclusivity.record.declarationFileId || "—",
                    },
                    {
                      k: locale === "en" ? "Submitted state" : "送審狀態",
                      v: formatPlatformCodeLabel(
                        locale,
                        selectedExclusivity.record.reviewStatus,
                      ),
                    },
                    {
                      k: locale === "en" ? "Submitter" : "提交者",
                      v: selectedExclusivity.submitter,
                    },
                    {
                      k: locale === "en" ? "Submitted at" : "提交時間",
                      v: formatTimestamp(selectedExclusivity.submittedAt),
                    },
                    {
                      k: locale === "en" ? "Dispatchable now?" : "目前可派遣？",
                      v: selectedExclusivity.dispatchableFlag
                        ? locale === "en"
                          ? "Yes"
                          : "是"
                        : locale === "en"
                          ? "No"
                          : "否",
                    },
                  ]}
                />
                <div style={actionRowStyle}>
                  {exclusivityActions(selectedExclusivity)}
                </div>
                <div style={actionRowStyle}>
                  {renderCrossAppLinks(selectedExclusivity.crossAppLinks)}
                </div>
              </>
            ) : null}

            {activeTab === "offboard" && selectedOffboarding ? (
              <>
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      k: locale === "en" ? "Vehicle" : "車輛",
                      v: selectedOffboarding.vehicle.vehicleId,
                    },
                    {
                      k: locale === "en" ? "Current state" : "目前狀態",
                      v: formatPlatformCodeLabel(
                        locale,
                        selectedOffboarding.vehicle.supplyLifecycle.offboarding
                          .status,
                      ),
                    },
                    {
                      k: locale === "en" ? "Requested by" : "申請人",
                      v:
                        selectedOffboarding.vehicle.supplyLifecycle.offboarding
                          .requestedBy || "—",
                    },
                    {
                      k: locale === "en" ? "Evidence ticket" : "證據單號",
                      v: selectedOffboarding.evidence,
                    },
                    {
                      k: locale === "en" ? "Actor" : "操作者",
                      v: selectedOffboarding.actor,
                    },
                  ]}
                />
                <div style={stackStyle}>
                  <strong>{copy.detail.timeline}</strong>
                  {selectedOffboarding.timeline.map((step) => (
                    <div
                      key={step.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        background: step.reached
                          ? "rgba(20, 184, 166, 0.10)"
                          : "rgba(148, 163, 184, 0.08)",
                      }}
                    >
                      <span>{formatPlatformCodeLabel(locale, step.label)}</span>
                      <span style={secondaryTextStyle}>
                        {formatTimestamp(step.at)}
                      </span>
                    </div>
                  ))}
                </div>
                <CanvasCard theme={theme}>
                  <div style={{ padding: 14, display: "grid", gap: 10 }}>
                    <strong>{copy.detail.evidence}</strong>
                    <CanvasField
                      theme={theme}
                      label={locale === "en" ? "Reason" : "原因"}
                    >
                      <input
                        value={offboardingForm.reason}
                        onChange={(event) =>
                          setOffboardingForm(
                            (current: InitiateVehicleOffboardingCommand) => ({
                              ...current,
                              reason: event.target.value,
                            }),
                          )
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={locale === "en" ? "Requested by" : "申請人"}
                    >
                      <input
                        value={offboardingForm.requestedBy ?? ""}
                        onChange={(event) =>
                          setOffboardingForm(
                            (current: InitiateVehicleOffboardingCommand) => ({
                              ...current,
                              requestedBy: event.target.value,
                            }),
                          )
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={
                        locale === "en" ? "Debranding ticket" : "去識別化單號"
                      }
                    >
                      <input
                        value={offboardingForm.debrandingTicketId ?? ""}
                        onChange={(event) =>
                          setOffboardingForm(
                            (current: InitiateVehicleOffboardingCommand) => ({
                              ...current,
                              debrandingTicketId: event.target.value,
                            }),
                          )
                        }
                        style={inlineInputStyle}
                      />
                    </CanvasField>
                  </div>
                </CanvasCard>
                <div style={actionRowStyle}>
                  {offboardingActions(selectedOffboarding)}
                </div>
                <div style={actionRowStyle}>
                  {renderCrossAppLinks(selectedOffboarding.crossAppLinks)}
                </div>
              </>
            ) : null}

            {!selectedRecord ? (
              <WorkflowEmptyState
                density="compact"
                title={copy.noSelection}
                tone="neutral"
              />
            ) : null}
          </WorkflowDetailDrawer>
        </div>
      </div>

      {pendingAction ? (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <div style={stackStyle}>
              <CanvasPill
                theme={theme}
                tone={toneForRisk(pendingAction.riskLevel)}
              >
                {pendingAction.riskLevel === "high"
                  ? copy.highRisk
                  : pendingAction.riskLevel === "medium"
                    ? copy.mediumRisk
                    : copy.lowRisk}
              </CanvasPill>
              <strong style={{ fontSize: 18, color: theme.text }}>
                {pendingAction.label}
              </strong>
              <span style={secondaryTextStyle}>{pendingAction.body}</span>
            </div>
            {pendingAction.requiresReason ? (
              <CanvasField theme={theme} label={copy.reasonLabel}>
                <textarea
                  value={reasonDraft}
                  onChange={(event) => setReasonDraft(event.target.value)}
                  style={{
                    ...inlineInputStyle,
                    minHeight: 96,
                    resize: "vertical",
                  }}
                />
              </CanvasField>
            ) : null}
            <div style={{ ...actionRowStyle, justifyContent: "flex-end" }}>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  setPendingAction(null);
                  setReasonDraft("");
                }}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger={pendingAction.riskLevel === "high"}
                disabled={pendingAction.requiresReason && !reasonDraft.trim()}
                onClick={() =>
                  void runAction(
                    pendingAction.actionId,
                    pendingAction.execute,
                    reasonDraft.trim(),
                  )
                }
              >
                {copy.confirm}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
