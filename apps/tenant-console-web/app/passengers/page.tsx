import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const signalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const sitemapCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const sitemapTrailStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  color: th.textMuted,
  fontSize: 12,
};

const sitemapBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 26,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 1.35fr) repeat(3, minmax(150px, 0.78fr)) auto",
  gap: 12,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: th.textMuted,
  textTransform: "uppercase",
};

const fieldStyle: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "0 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const stackedLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const sideStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
  borderRadius: 22,
};

const detailCardStyle: CSSProperties = {
  position: "sticky",
  top: 24,
};

const heroCardStyle: CSSProperties = {
  borderRadius: 22,
};

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const subtleTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
};

const helperTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.24,
  color: th.textMuted,
  textTransform: "uppercase",
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const tableActionCellStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const quietButtonStyle: CSSProperties = {
  ...linkButtonStyle,
  background: "rgba(255,255,255,0.02)",
};

const actionChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: `linear-gradient(135deg, ${th.accent}22, ${th.bgRaised})`,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
};

const disabledActionStyle: CSSProperties = {
  ...actionChipStyle,
  background: th.bgRaised,
  opacity: 0.55,
  cursor: "not-allowed",
};

const actionsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const infoListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const heroSummaryStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const summaryStatGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const summaryStatStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  display: "grid",
  gap: 5,
};

const summaryStatValueStyle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
  color: th.text,
  fontWeight: 700,
};

const summaryStatLabelStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const directoryStateGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const stateMetricStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 4,
};

const stateMetricValueStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: th.text,
};

const railBlockStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const compactListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const compactListItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.02)",
};

const emptyStateWrapStyle: CSSProperties = {
  padding: 28,
  display: "grid",
  gap: 14,
  justifyItems: "start",
};

const emptyStateAccentStyle: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  background: `linear-gradient(135deg, ${th.accent}22, ${th.accentHi}33)`,
  border: `1px solid ${th.border}`,
  display: "grid",
  placeItems: "center",
  color: th.accentHi,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const rosterMetaBarStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: `1px solid ${th.border}`,
  display: "grid",
  gap: 10,
  background: "rgba(255,255,255,0.02)",
};

const detailHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const detailTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 700,
  fontSize: 18,
  lineHeight: 1.15,
};

const detailSubtitleStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.45,
};

const detailSectionStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const nameMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const deepLinkListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const deepLinkItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.02)",
};

type PassengerTabKey = "all" | "employee" | "visitor" | "disabled";

type RuntimePassengerRecord = TenantPassengerRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  metadata: PassengerMetadata;
};

type PassengerRow = RuntimePassengerRecord &
  Record<string, unknown> & {
    duplicateName: boolean;
    kindLabel: string;
    stateLabel: string;
    stateTone: CanvasTone;
  };

type PassengerPageData = {
  passengers: RuntimePassengerRecord[];
  errors: string[];
  fetchedAt: string;
  refreshMetadata: UiRefreshMetadata | null;
};

type PassengerFilters = {
  q: string;
  department: string;
  activeState: "all" | "active" | "inactive";
  selectedPassengerId: string;
  emptyReasonOverride: PassengerEmptyReason | null;
};

type PassengerEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyStateView = {
  title: string;
  body: string;
  accent: string;
  tone: CanvasTone;
  ctaLabel?: string;
  ctaHref?: string;
  usePrimaryAction?: boolean;
};

type PassengerTabDefinition = {
  key: PassengerTabKey;
  label: string;
};

type PassengerMetadata = Record<string, unknown> & {
  auditLink?: CrossAppResourceLink | null;
  availableActions?: ResourceActionDescriptor[];
  consentVersion?: string | null;
  crossAppLinks?: CrossAppResourceLink[];
  refreshMetadata?: UiRefreshMetadata;
};

type PassengerDeepLink = {
  href: string;
  label: string;
  newTab: boolean;
  tone: CanvasTone;
};

const PASSENGER_TABS: PassengerTabDefinition[] = [
  { key: "all", label: "全部" },
  { key: "employee", label: "員工" },
  { key: "visitor", label: "訪客" },
  { key: "disabled", label: "停用" },
];

const EMPTY_STATE_VIEWS: Record<PassengerEmptyReason, EmptyStateView> = {
  no_data: {
    title: "還沒有乘客資料",
    body: "這個租戶尚未建立常用乘客名冊。新增後即可在新建預訂流程直接帶入乘客資料。",
    accent: "ND",
    tone: "info",
    usePrimaryAction: true,
  },
  not_provisioned: {
    title: "乘客目錄尚未啟用",
    body: "租戶資料維護流程尚未完成佈署或初始化，暫時無法建立名冊。",
    accent: "NP",
    tone: "warn",
    ctaLabel: "前往設定",
    ctaHref: "/settings",
  },
  fetch_failed: {
    title: "乘客資料讀取失敗",
    body: "頁面已載入，但本次無法完成 passenger directory 讀取。請稍後重新整理或查看 API 狀態。",
    accent: "FF",
    tone: "danger",
  },
  permission_denied: {
    title: "目前角色無法管理乘客",
    body: "這個帳號缺少 passenger directory 存取權限。CTA 仍保留，但會以 disabled reason 呈現。",
    accent: "PD",
    tone: "neutral",
    usePrimaryAction: true,
  },
  external_unavailable: {
    title: "相依服務暫時不可用",
    body: "租戶目錄依賴的外部整合目前不可用，因此無法回傳 passenger directory。",
    accent: "EU",
    tone: "danger",
  },
  filtered_empty: {
    title: "目前篩選沒有結果",
    body: "放寬關鍵字、部門或切換 active/inactive 篩選後，即可回到完整乘客目錄。",
    accent: "FE",
    tone: "accent",
    ctaLabel: "清除篩選",
    ctaHref: "/passengers",
  },
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUpdated(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function isEmployeePassenger(passenger: TenantPassengerRecord) {
  if (passenger.roles?.includes("employee")) {
    return true;
  }
  return Boolean(passenger.employeeNo || passenger.departmentName);
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function getStateLabel(activeFlag: boolean) {
  return activeFlag ? "啟用中" : "已停用";
}

function getKindLabel(passenger: TenantPassengerRecord) {
  return isEmployeePassenger(passenger) ? "員工" : "訪客";
}

function comparePassengers(
  left: TenantPassengerRecord,
  right: TenantPassengerRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }

  const leftEmployee = isEmployeePassenger(left);
  const rightEmployee = isEmployeePassenger(right);
  if (leftEmployee !== rightEmployee) {
    return leftEmployee ? -1 : 1;
  }

  const leftUpdated = parseDate(left.updatedAt)?.getTime() ?? 0;
  const rightUpdated = parseDate(right.updatedAt)?.getTime() ?? 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }

  return left.fullName.localeCompare(right.fullName, "zh-Hant");
}

function matchesTab(passenger: TenantPassengerRecord, tab: PassengerTabKey) {
  if (tab === "all") return true;
  if (tab === "disabled") return !passenger.activeFlag;
  if (!passenger.activeFlag) return false;
  if (tab === "employee") return isEmployeePassenger(passenger);
  return !isEmployeePassenger(passenger);
}

function getSingleQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedTab(rawTab: string | undefined): PassengerTabKey {
  const matched = PASSENGER_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function getFilters(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const activeState = getSingleQueryValue(searchParams.state)?.trim();

  return {
    q: getSingleQueryValue(searchParams.q)?.trim() ?? "",
    department: getSingleQueryValue(searchParams.department)?.trim() ?? "",
    activeState:
      activeState === "active" || activeState === "inactive"
        ? activeState
        : "all",
    selectedPassengerId:
      getSingleQueryValue(searchParams.selected)?.trim() ?? "",
    emptyReasonOverride: normalizeEmptyReason(
      getSingleQueryValue(searchParams.emptyReason),
    ),
  } satisfies PassengerFilters;
}

function normalizeEmptyReason(
  value: string | undefined,
): PassengerEmptyReason | null {
  switch (value) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return value;
    default:
      return null;
  }
}

function buildPassengersHref(
  selectedTab: PassengerTabKey,
  filters: PassengerFilters,
  overrides: Partial<{
    q: string;
    department: string;
    activeState: PassengerFilters["activeState"];
    selectedPassengerId: string;
    emptyReasonOverride: PassengerEmptyReason | null;
  }> = {},
) {
  const params = new URLSearchParams();
  const q = overrides.q ?? filters.q;
  const department = overrides.department ?? filters.department;
  const activeState = overrides.activeState ?? filters.activeState;
  const selectedPassengerId =
    overrides.selectedPassengerId ?? filters.selectedPassengerId;
  const emptyReasonOverride =
    overrides.emptyReasonOverride ?? filters.emptyReasonOverride;

  if (selectedTab !== "all") {
    params.set("tab", selectedTab);
  }
  if (q) {
    params.set("q", q);
  }
  if (department) {
    params.set("department", department);
  }
  if (activeState !== "all") {
    params.set("state", activeState);
  }
  if (selectedPassengerId) {
    params.set("selected", selectedPassengerId);
  }
  if (emptyReasonOverride) {
    params.set("emptyReason", emptyReasonOverride);
  }

  const query = params.toString();
  return `/passengers${query ? `?${query}` : ""}`;
}

function getDisabledReasonLabel(code: string | undefined) {
  switch (code) {
    case "already_deactivated":
      return "已是停用狀態";
    case "requires_tenant_admin":
      return "僅 tenant admin 可執行";
    case "read_only_mode":
      return "目前資源為唯讀";
    case "not_wired_yet":
      return "後端 mutation flow 尚未接入";
    default:
      return code ? code.replaceAll("_", " ") : "目前不可用";
  }
}

function isCrossAppResourceLink(value: unknown): value is CrossAppResourceLink {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.targetApp === "string" &&
    typeof candidate.route === "string" &&
    typeof candidate.resourceType === "string" &&
    typeof candidate.resourceId === "string" &&
    typeof candidate.openMode === "string" &&
    typeof candidate.label === "string"
  );
}

function inferDefaultPassengerActions(
  passenger: TenantPassengerRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "edit",
      enabled: false,
      disabledReasonCode: "not_wired_yet",
      riskLevel: "medium",
    },
    passenger.activeFlag
      ? {
          action: "deactivate",
          enabled: false,
          disabledReasonCode: "not_wired_yet",
          requiresReason: true,
          riskLevel: "high",
        }
      : {
          action: "reactivate",
          enabled: false,
          disabledReasonCode: "not_wired_yet",
          riskLevel: "medium",
        },
  ];
}

function isActionDescriptor(value: unknown): value is ResourceActionDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.action === "string" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.riskLevel === "string"
  );
}

function getPassengerActions(
  passenger: RuntimePassengerRecord,
): ResourceActionDescriptor[] {
  const inlineActions = passenger.availableActions;
  if (Array.isArray(inlineActions) && inlineActions.every(isActionDescriptor)) {
    return inlineActions;
  }

  const metadataActions = passenger.metadata?.availableActions;
  if (
    Array.isArray(metadataActions) &&
    metadataActions.every(isActionDescriptor)
  ) {
    return metadataActions;
  }

  return inferDefaultPassengerActions(passenger);
}

function getPageActions(passengers: RuntimePassengerRecord[]) {
  const pageActionSource = passengers
    .map((passenger) => passenger.metadata?.availableActions)
    .find(
      (actions): actions is ResourceActionDescriptor[] =>
        Array.isArray(actions) && actions.every(isActionDescriptor),
    );

  if (pageActionSource) {
    const createActions = pageActionSource.filter(
      (action) => action.action === "create",
    );
    if (createActions.length > 0) {
      return createActions;
    }
  }

  const source = passengers[0];
  if (!source) {
    return [
      {
        action: "create",
        enabled: false,
        disabledReasonCode: "not_wired_yet",
        riskLevel: "medium",
      },
    ] satisfies ResourceActionDescriptor[];
  }

  const sourceActions = getPassengerActions(source);
  return [
    sourceActions.find((action) => action.action === "create") ?? {
      action: "create",
      enabled: false,
      disabledReasonCode: "not_wired_yet",
      riskLevel: "medium",
    },
  ];
}

function buildTabNodes(
  selectedTab: PassengerTabKey,
  filters: PassengerFilters,
  counts: Record<PassengerTabKey, number>,
) {
  const tabs = PASSENGER_TABS.map((tab) => {
    const params = new URLSearchParams();
    if (tab.key !== "all") {
      params.set("tab", tab.key);
    }
    if (filters.q) {
      params.set("q", filters.q);
    }
    if (filters.department) {
      params.set("department", filters.department);
    }
    if (filters.activeState !== "all") {
      params.set("state", filters.activeState);
    }
    if (filters.selectedPassengerId) {
      params.set("selected", filters.selectedPassengerId);
    }
    if (filters.emptyReasonOverride) {
      params.set("emptyReason", filters.emptyReasonOverride);
    }

    const href = `/passengers${params.toString() ? `?${params.toString()}` : ""}`;

    return (
      <Link key={tab.key} href={href} style={tabLinkStyle}>
        {tab.label} · {counts[tab.key]}
      </Link>
    );
  });

  const activeIndex = PASSENGER_TABS.findIndex(
    (tab) => tab.key === selectedTab,
  );

  return {
    tabs,
    activeTab: tabs[activeIndex] ?? tabs[0],
  };
}

function buildDepartmentOptions(passengers: TenantPassengerRecord[]) {
  return Array.from(
    new Set(
      passengers
        .map((passenger) => passenger.departmentName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

function findDuplicateNames(passengers: TenantPassengerRecord[]) {
  const counts = new Map<string, number>();
  for (const passenger of passengers) {
    const key = passenger.fullName.trim().toLocaleLowerCase("zh-Hant");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function matchesFilters(
  passenger: TenantPassengerRecord,
  filters: PassengerFilters,
  selectedTab: PassengerTabKey,
) {
  if (!matchesTab(passenger, selectedTab)) {
    return false;
  }

  if (
    filters.department &&
    (passenger.departmentName ?? "").trim() !== filters.department
  ) {
    return false;
  }

  if (filters.activeState === "active" && !passenger.activeFlag) {
    return false;
  }

  if (filters.activeState === "inactive" && passenger.activeFlag) {
    return false;
  }

  if (!filters.q) {
    return true;
  }

  const haystacks = [
    passenger.fullName,
    passenger.employeeNo ?? "",
    passenger.mobile ?? "",
  ].map((value) => value.toLocaleLowerCase("zh-Hant"));

  const needle = filters.q.toLocaleLowerCase("zh-Hant");
  return haystacks.some((value) => value.includes(needle));
}

async function loadPassengersData(): Promise<PassengerPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const fetchedAt = new Date().toISOString();
  const [passengersResult] = await Promise.allSettled([
    client.listPassengers() as Promise<RuntimePassengerRecord[]>,
  ]);

  const passengers =
    passengersResult.status === "fulfilled"
      ? [...passengersResult.value].sort(comparePassengers)
      : [];

  if (passengersResult.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(passengersResult.reason)}`);
  }

  return {
    passengers,
    errors,
    fetchedAt,
    refreshMetadata: getRefreshMetadata(passengers),
  };
}

function resolveEmptyReason(params: {
  errors: string[];
  hasAnyPassengers: boolean;
  hasFilteredRows: boolean;
  emptyReasonOverride: PassengerEmptyReason | null;
}) {
  if (params.emptyReasonOverride) {
    return params.emptyReasonOverride;
  }

  if (params.errors.length > 0) {
    const joined = params.errors.join(" ").toLowerCase();
    if (joined.includes("403") || joined.includes("forbidden")) {
      return "permission_denied" satisfies EmptyReason;
    }
    if (
      joined.includes("503") ||
      joined.includes("timeout") ||
      joined.includes("unavailable")
    ) {
      return "external_unavailable" satisfies EmptyReason;
    }
    return "fetch_failed" satisfies EmptyReason;
  }

  if (!params.hasAnyPassengers) {
    return "no_data" satisfies EmptyReason;
  }

  if (!params.hasFilteredRows) {
    return "filtered_empty" satisfies EmptyReason;
  }

  return null;
}

function toPassengerRow(
  passenger: RuntimePassengerRecord,
  duplicateNames: Set<string>,
): PassengerRow {
  return {
    ...passenger,
    duplicateName: duplicateNames.has(
      passenger.fullName.trim().toLocaleLowerCase("zh-Hant"),
    ),
    kindLabel: getKindLabel(passenger),
    stateLabel: getStateLabel(passenger.activeFlag),
    stateTone: getStateTone(passenger.activeFlag),
  };
}

function renderActionDescriptor(
  descriptor: ResourceActionDescriptor,
  label: string,
) {
  const helper = descriptor.requiresReason
    ? `${label} · 需要理由`
    : descriptor.riskLevel === "high"
      ? `${label} · high risk`
      : label;

  if (descriptor.enabled) {
    return (
      <span key={descriptor.action} style={actionChipStyle} title={helper}>
        {label}
      </span>
    );
  }

  return (
    <span
      key={descriptor.action}
      style={disabledActionStyle}
      title={getDisabledReasonLabel(descriptor.disabledReasonCode)}
    >
      {label}
    </span>
  );
}

function getActionLabel(action: string) {
  switch (action) {
    case "create":
      return "新增乘客";
    case "edit":
      return "編輯資料";
    case "deactivate":
      return "軟停用";
    case "reactivate":
      return "重新啟用";
    default:
      return action;
  }
}

function getActionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return action.riskLevel === "high" ? "danger" : "neutral";
  }

  switch (action.riskLevel) {
    case "high":
      return "danger";
    case "medium":
      return "accent";
    case "low":
    default:
      return "info";
  }
}

function getActionSummary(action: ResourceActionDescriptor) {
  if (!action.enabled) {
    return getDisabledReasonLabel(action.disabledReasonCode);
  }

  if (action.requiresReason) {
    return "需要填寫理由";
  }

  switch (action.riskLevel) {
    case "high":
      return "需高風險確認";
    case "medium":
      return "需一般確認";
    case "low":
    default:
      return "可直接執行";
  }
}

function renderHeaderAction(
  action: ResourceActionDescriptor,
  label: string,
  variant: "page" | "record" = "page",
) {
  const style =
    action.enabled && variant === "page"
      ? {
          ...linkButtonStyle,
          background: `linear-gradient(135deg, ${th.accent}, ${th.accentHi})`,
          borderColor: "transparent",
          color: "#06131a",
        }
      : action.enabled
        ? quietButtonStyle
        : {
            ...quietButtonStyle,
            opacity: 0.55,
            cursor: "not-allowed",
          };

  return (
    <span
      key={`${variant}-${action.action}`}
      style={style}
      title={getActionSummary(action)}
      aria-disabled={!action.enabled}
    >
      {label}
    </span>
  );
}

function renderEmptyState(
  reason: PassengerEmptyReason,
  primaryAction: ResourceActionDescriptor | null,
) {
  const view: EmptyStateView =
    EMPTY_STATE_VIEWS[reason] ?? EMPTY_STATE_VIEWS.fetch_failed!;

  return (
    <div style={emptyStateWrapStyle}>
      <div style={emptyStateAccentStyle}>{view.accent}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>
          {view.title}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: th.textMuted,
            maxWidth: 520,
          }}
        >
          {view.body}
        </div>
      </div>
      {view.ctaHref && view.ctaLabel ? (
        <Link href={view.ctaHref} style={linkButtonStyle}>
          {view.ctaLabel}
        </Link>
      ) : view.usePrimaryAction && primaryAction ? (
        renderHeaderAction(primaryAction, getActionLabel(primaryAction.action))
      ) : null}
      <CanvasPill theme={th} tone={view.tone}>
        emptyReason: {reason}
      </CanvasPill>
    </div>
  );
}

function isRefreshMetadata(value: unknown): value is UiRefreshMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.generatedAt === "string" &&
    typeof candidate.staleAfterMs === "number" &&
    typeof candidate.dataFreshness === "string" &&
    typeof candidate.source === "string"
  );
}

function getRefreshMetadata(
  passengers: RuntimePassengerRecord[],
): UiRefreshMetadata | null {
  const candidate = passengers
    .map((passenger) => passenger.metadata?.refreshMetadata)
    .find((value): value is UiRefreshMetadata => isRefreshMetadata(value));
  return candidate ?? null;
}

function getRefreshTone(
  refreshMetadata: UiRefreshMetadata | null,
  errors: string[],
): CanvasTone {
  if (errors.length > 0) {
    return "warn";
  }

  switch (refreshMetadata?.dataFreshness) {
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
      return "neutral";
    case "fresh":
    default:
      return "success";
  }
}

function getRefreshSummary(
  refreshMetadata: UiRefreshMetadata | null,
  fetchedAt: string,
) {
  if (!refreshMetadata) {
    return `30s tenant slow tier · fallback ${formatUpdated(fetchedAt)}`;
  }

  return `${refreshMetadata.dataFreshness} · ${formatUpdated(
    refreshMetadata.generatedAt,
  )} · ${refreshMetadata.source}`;
}

function getRefreshTierLabel(refreshMetadata: UiRefreshMetadata | null) {
  if (!refreshMetadata) {
    return "T5 · 30s fallback";
  }

  switch (refreshMetadata.source) {
    case "live":
      return "T5 · live snapshot";
    case "cache":
      return "T5 · cached snapshot";
    case "sandbox":
      return "T5 · sandbox snapshot";
    case "static":
    default:
      return "T5 · static snapshot";
  }
}

function getRefreshBannerCopy(refreshMetadata: UiRefreshMetadata | null) {
  if (!refreshMetadata || refreshMetadata.dataFreshness === "fresh") {
    return null;
  }

  switch (refreshMetadata.dataFreshness) {
    case "stale":
      return {
        tone: "warn" as const,
        title: "Passenger directory snapshot 已過新鮮期",
        body: `目前顯示的是 ${formatUpdated(refreshMetadata.generatedAt)} 產生的 ${refreshMetadata.source} snapshot；重新整理可拉回最新 T5 read model。`,
      };
    case "degraded":
      return {
        tone: "danger" as const,
        title: "Passenger directory 正處於 degraded refresh",
        body: `資料來源回報 degraded；目前以 ${refreshMetadata.source} snapshot 提供列表，請先避免依賴此頁進行時效敏感判斷。`,
      };
    case "unknown":
    default:
      return {
        tone: "info" as const,
        title: "Passenger directory refresh 狀態未知",
        body: "後端未提供可判定的新鮮度，頁面保留 T5 tier 與手動 refresh 供使用者重新取樣。",
      };
  }
}

function getRecordActions(passenger: RuntimePassengerRecord) {
  return getPassengerActions(passenger).filter(
    (action) => action.action !== "create",
  );
}

function getTargetAppLabel(targetApp: CrossAppResourceLink["targetApp"]) {
  switch (targetApp) {
    case "ops-console":
      return "Ops Console";
    case "platform-admin":
      return "Platform Admin";
    case "tenant-console":
    default:
      return "Tenant Console";
  }
}

function toPassengerDeepLinks(
  passenger: RuntimePassengerRecord,
  refreshHref: string,
): PassengerDeepLink[] {
  const deepLinks: PassengerDeepLink[] = [
    {
      href: `/bookings/new?passengerId=${encodeURIComponent(passenger.passengerId)}`,
      label: "前往新建預訂",
      newTab: false,
      tone: "accent",
    },
    {
      href: `/audit?resourceType=tenant_passenger&resourceId=${encodeURIComponent(passenger.passengerId)}`,
      label: "查看本租戶稽核",
      newTab: false,
      tone: "info",
    },
    {
      href: refreshHref,
      label: "重新整理目錄",
      newTab: false,
      tone: "neutral",
    },
  ];

  const metadataLinks = [
    passenger.metadata?.auditLink,
    ...(passenger.metadata?.crossAppLinks ?? []),
  ].filter((link): link is CrossAppResourceLink =>
    isCrossAppResourceLink(link),
  );

  for (const link of metadataLinks) {
    deepLinks.push({
      href: link.route,
      label: `${link.label} · ${getTargetAppLabel(link.targetApp)}`,
      newTab: link.openMode === "new_tab",
      tone: link.targetApp === "tenant-console" ? "info" : "accent",
    });
  }

  return deepLinks.filter(
    (link, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.href === link.href && candidate.label === link.label,
      ) === index,
  );
}

function getQualityIssueLabel(issue: TenantPassengerQualityIssue) {
  switch (issue) {
    case "duplicate_employee_no":
      return "工號重複";
    case "missing_contact":
      return "缺少聯絡方式";
    case "missing_employee_no":
    default:
      return "缺少工號";
  }
}

function getQualityIssueSummary(issue: TenantPassengerQualityIssue) {
  switch (issue) {
    case "duplicate_employee_no":
      return "工號在名冊內重複，建立新單前需再次確認乘客身分。";
    case "missing_contact":
      return "缺少手機或 email，可能影響預訂聯絡與通知。";
    case "missing_employee_no":
    default:
      return "缺少工號，建議補齊以避免同名混淆。";
  }
}

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(
    getSingleQueryValue(resolvedSearchParams.tab),
  );
  const filters = getFilters(resolvedSearchParams);
  const { passengers, errors, fetchedAt, refreshMetadata } =
    await loadPassengersData();
  const duplicateNames = findDuplicateNames(passengers);
  const filteredPassengers = passengers.filter((passenger) =>
    matchesFilters(passenger, filters, selectedTab),
  );
  const rows = filteredPassengers.map((passenger) =>
    toPassengerRow(passenger, duplicateNames),
  );
  const selectedPassenger =
    rows.find(
      (passenger) => passenger.passengerId === filters.selectedPassengerId,
    ) ??
    rows[0] ??
    null;
  const selectedActions = selectedPassenger
    ? getPassengerActions(selectedPassenger)
    : [];
  const pageActions = getPageActions(passengers);
  const primaryPageAction = pageActions[0] ?? null;
  const departmentOptions = buildDepartmentOptions(passengers);
  const counts = {
    all: passengers.filter((passenger) => matchesTab(passenger, "all")).length,
    employee: passengers.filter((passenger) =>
      matchesTab(passenger, "employee"),
    ).length,
    visitor: passengers.filter((passenger) => matchesTab(passenger, "visitor"))
      .length,
    disabled: passengers.filter((passenger) =>
      matchesTab(passenger, "disabled"),
    ).length,
  } satisfies Record<PassengerTabKey, number>;
  const { tabs, activeTab } = buildTabNodes(selectedTab, filters, counts);
  const activeCount = passengers.filter(
    (passenger) => passenger.activeFlag,
  ).length;
  const inactiveCount = passengers.length - activeCount;
  const employeeCount = passengers.filter((passenger) =>
    isEmployeePassenger(passenger),
  ).length;
  const emptyReason = resolveEmptyReason({
    errors,
    hasAnyPassengers: passengers.length > 0,
    hasFilteredRows: rows.length > 0,
    emptyReasonOverride: filters.emptyReasonOverride,
  });
  const refreshHref = buildPassengersHref(selectedTab, filters);
  const refreshTone = getRefreshTone(refreshMetadata, errors);
  const refreshSummary = getRefreshSummary(refreshMetadata, fetchedAt);
  const refreshTierLabel = getRefreshTierLabel(refreshMetadata);
  const refreshBanner = getRefreshBannerCopy(refreshMetadata);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "姓名",
      w: 190,
      r: (row) => (
        <div style={{ display: "grid", gap: 5 }}>
          <Link
            href={buildPassengersHref(selectedTab, filters, {
              selectedPassengerId: row.passengerId,
            })}
            style={{
              ...primaryCellStyle,
              textDecoration: "none",
            }}
          >
            {row.fullName}
          </Link>
          <div style={nameMetaStyle}>
            <CanvasPill theme={th} tone="info">
              {row.kindLabel}
            </CanvasPill>
            {row.duplicateName ? (
              <CanvasPill theme={th} tone="warn">
                同名
              </CanvasPill>
            ) : null}
            {(row.qualityIssues?.length ?? 0) > 0 ? (
              <CanvasPill theme={th} tone="neutral">
                quality {row.qualityIssues?.length}
              </CanvasPill>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      h: "工號",
      w: 110,
      mono: true,
      r: (row) => row.employeeNo ?? "—",
    },
    {
      h: "部門",
      w: 150,
      r: (row) => row.departmentName ?? "—",
    },
    {
      h: "手機",
      w: 140,
      mono: true,
      r: (row) => row.mobile ?? "—",
    },
    {
      h: "Email",
      mono: true,
      r: (row) => row.email ?? "—",
    },
    {
      h: "狀態",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "更新時間",
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
    {
      h: "動作",
      w: 220,
      r: (row) => (
        <div style={tableActionCellStyle}>
          <Link
            href={buildPassengersHref(selectedTab, filters, {
              selectedPassengerId: row.passengerId,
            })}
            style={linkButtonStyle}
          >
            檢視
          </Link>
          {getRecordActions(row).map((action) =>
            renderActionDescriptor(action, getActionLabel(action.action)),
          )}
        </div>
      ),
    },
  ];

  const selectedQualityIssues: TenantPassengerQualityIssue[] =
    selectedPassenger?.qualityIssues ?? [];
  const selectedDepartment = selectedPassenger?.departmentName ?? "—";
  const selectedEditableUntil = selectedPassenger?.editableUntil ?? null;
  const selectedConsentVersion =
    selectedPassenger?.metadata?.consentVersion ?? null;
  const selectedReadOnlyReason = selectedPassenger?.readOnlyReasonCode ?? null;
  const selectedPassengerDuplicate = selectedPassenger
    ? duplicateNames.has(
        selectedPassenger.fullName.trim().toLocaleLowerCase("zh-Hant"),
      )
    : false;
  const selectedDeepLinks = selectedPassenger
    ? toPassengerDeepLinks(selectedPassenger, refreshHref)
    : [];
  const selectedEnabledActions = selectedActions.filter(
    (action) => action.enabled,
  );
  const selectedDisabledActions = selectedActions.filter(
    (action) => !action.enabled,
  );
  const staleAfterSeconds = refreshMetadata
    ? Math.round(refreshMetadata.staleAfterMs / 1000)
    : 30;
  const visibleEmployeeCount = rows.filter(
    (passenger) => passenger.kindLabel === "員工",
  ).length;
  const visibleVisitorCount = rows.length - visibleEmployeeCount;
  const visibleDuplicateCount = rows.filter(
    (passenger) => passenger.duplicateName,
  ).length;
  const visibleQualityIssueCount = rows.filter(
    (passenger) => (passenger.qualityIssues?.length ?? 0) > 0,
  ).length;
  const qualityBannerBody =
    selectedQualityIssues.length > 0
      ? selectedQualityIssues
          .map((issue) => getQualityIssueSummary(issue))
          .join(" ")
      : "目前選取的 passenger record 沒有 backend quality issue。";
  const consentedCount = passengers.filter(
    (passenger) =>
      typeof passenger.metadata?.consentVersion === "string" &&
      passenger.metadata.consentVersion.trim().length > 0,
  ).length;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本 · 軟停用 only (Q-TEN06)"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <div style={actionsWrapStyle}>
            <span
              style={quietButtonStyle}
              title="CSV bulk onboarding flow 尚未接入"
            >
              CSV 匯入
            </span>
            <Link href={refreshHref} style={quietButtonStyle}>
              重新整理
            </Link>
            {pageActions.map((action) =>
              renderHeaderAction(action, getActionLabel(action.action)),
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分乘客資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {duplicateNames.size > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="偵測到重複姓名"
            body="backend duplicate-name warning 已落在 passenger rows；請優先使用 employee no 或 mobile 區分同名乘客。"
          />
        ) : null}

        {refreshBanner ? (
          <CanvasBanner
            theme={th}
            tone={refreshBanner.tone}
            icon="warn"
            title={refreshBanner.title}
            body={refreshBanner.body}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="總名冊"
            value={String(passengers.length)}
            sub={`${activeCount} 啟用 / ${inactiveCount} 停用`}
          />
          <CanvasKPI
            theme={th}
            label="員工比例"
            value={String(employeeCount)}
            sub={`${passengers.length - employeeCount} 位訪客`}
          />
          <CanvasKPI
            theme={th}
            label="刷新層級"
            value="T5"
            sub={`${refreshTierLabel} · ${refreshSummary}`}
          />
          <CanvasKPI
            theme={th}
            label="目前檢視"
            value={selectedPassenger ? "已選取" : "未選取"}
            sub={
              selectedPassenger
                ? selectedPassenger.fullName
                : "請從左側選取乘客"
            }
          />
        </div>

        <div style={signalGridStyle}>
          <CanvasCard
            theme={th}
            title="Sitemap / 入口出口"
            subtitle="入口來自 Sidebar；出口保留 passenger detail 與 `/bookings/new` 預填 deep link。"
            style={heroCardStyle}
          >
            <div style={sitemapCardStyle}>
              <div style={sitemapTrailStyle}>
                <span style={sitemapBadgeStyle}>Tenant Console</span>
                <span>/</span>
                <span style={sitemapBadgeStyle}>資料維護</span>
                <span>/</span>
                <span style={sitemapBadgeStyle}>乘客</span>
              </div>
              <div style={helperTextStyle}>
                右側 rail 聚合 passenger detail、availableActions、audit 與
                cross-app deep links；選取名冊列後可直接導向建單預填。
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="刷新與來源"
            subtitle="Tenant Console `/passengers` 依 packet §3.2 採 T5 Tenant slow；頁面會保留 freshness 與手動 refresh。"
            style={heroCardStyle}
          >
            <div style={railBlockStyle}>
              <div style={infoListStyle}>
                <CanvasPill theme={th} tone={refreshTone} dot>
                  {refreshMetadata?.dataFreshness ?? "fallback"}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  {refreshTierLabel}
                </CanvasPill>
              </div>
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  { k: "cadence", v: `${staleAfterSeconds}s`, mono: true },
                  { k: "snapshot", v: refreshSummary },
                  {
                    k: "manual refresh",
                    v: "保留 refresh CTA，讓使用者手動重新取樣",
                  },
                ]}
              />
              <div style={helperTextStyle}>
                當 snapshot stale 或 degraded 時，頁面會直接顯示警示，不會把
                tenant slow tier 假裝成即時資料。
              </div>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="目錄摘要"
          subtitle="Passenger directory 是 `/bookings/new` 的預填來源；停用後會從 picker 隱藏，但歷史訂單仍保留快照。"
          style={heroCardStyle}
        >
          <div style={heroSummaryStyle}>
            <div style={helperTextStyle}>
              這個畫面同時承接員工與訪客名冊。列表優先顯示啟用資料，若 backend
              回報 duplicate-name 或 quality issue，會在 row
              與詳情側欄同步標示。
            </div>
            <div style={summaryStatGridStyle}>
              <div style={summaryStatStyle}>
                <div style={summaryStatLabelStyle}>目前可見</div>
                <div style={summaryStatValueStyle}>{rows.length}</div>
                <div style={subtleTextStyle}>
                  {visibleEmployeeCount} 員工 / {visibleVisitorCount} 訪客
                </div>
              </div>
              <div style={summaryStatStyle}>
                <div style={summaryStatLabelStyle}>同名警示</div>
                <div style={summaryStatValueStyle}>{visibleDuplicateCount}</div>
                <div style={subtleTextStyle}>需搭配工號或手機辨識</div>
              </div>
              <div style={summaryStatStyle}>
                <div style={summaryStatLabelStyle}>資料品質</div>
                <div style={summaryStatValueStyle}>
                  {visibleQualityIssueCount}
                </div>
                <div style={subtleTextStyle}>backend flags 保留在 roster</div>
              </div>
              <div style={summaryStatStyle}>
                <div style={summaryStatLabelStyle}>同意書版本</div>
                <div style={summaryStatValueStyle}>{consentedCount}</div>
                <div style={subtleTextStyle}>metadata consentVersion</div>
              </div>
            </div>

            <div style={directoryStateGridStyle}>
              <div style={stateMetricStyle}>
                <div style={summaryStatLabelStyle}>全部</div>
                <div style={stateMetricValueStyle}>{counts.all}</div>
                <div style={subtleTextStyle}>完整名冊</div>
              </div>
              <div style={stateMetricStyle}>
                <div style={summaryStatLabelStyle}>員工</div>
                <div style={stateMetricValueStyle}>{counts.employee}</div>
                <div style={subtleTextStyle}>主要預訂對象</div>
              </div>
              <div style={stateMetricStyle}>
                <div style={summaryStatLabelStyle}>訪客</div>
                <div style={stateMetricValueStyle}>{counts.visitor}</div>
                <div style={subtleTextStyle}>臨時或外部訪客</div>
              </div>
              <div style={stateMetricStyle}>
                <div style={summaryStatLabelStyle}>已停用</div>
                <div style={stateMetricValueStyle}>{counts.disabled}</div>
                <div style={subtleTextStyle}>歷史可見、picker 隱藏</div>
              </div>
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="篩選與搜尋"
          subtitle="可依啟用狀態、部門與姓名 / 工號 / 手機搜尋；停用資料僅在對應 tab 或篩選中出現。"
        >
          <form action="/passengers" method="get" style={filterBarStyle}>
            {selectedTab !== "all" ? (
              <input name="tab" type="hidden" value={selectedTab} />
            ) : null}
            {filters.emptyReasonOverride ? (
              <input
                name="emptyReason"
                type="hidden"
                value={filters.emptyReasonOverride}
              />
            ) : null}
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>搜尋</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="姓名 / 工號 / 手機"
                style={fieldStyle}
              />
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>部門</span>
              <select
                defaultValue={filters.department}
                name="department"
                style={fieldStyle}
              >
                <option value="">全部部門</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>狀態</span>
              <select
                defaultValue={filters.activeState}
                name="state"
                style={fieldStyle}
              >
                <option value="all">全部狀態</option>
                <option value="active">僅啟用</option>
                <option value="inactive">僅停用</option>
              </select>
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>刷新層級</span>
              <div
                style={{
                  ...fieldStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{refreshTierLabel}</span>
                <CanvasPill theme={th} tone={refreshTone}>
                  {refreshMetadata?.dataFreshness ?? "fallback"}
                </CanvasPill>
              </div>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={fieldStyle} type="submit">
                套用條件
              </button>
              <Link href="/passengers" style={linkButtonStyle}>
                清除篩選
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={stackedLayoutStyle}>
          <CanvasCard
            theme={th}
            padding={0}
            style={cardStyle}
            title="乘客名冊"
            subtitle={`${rows.length} 筆目前可見資料 · 依 tab、狀態與部門篩選`}
          >
            <div style={rosterMetaBarStyle}>
              <div style={helperTextStyle}>
                依 packet §5，列表必須顯示姓名、工號、部門、手機、Email、active
                flag；同名與資料品質問題會直接標示在名冊內。
              </div>
              <div style={infoListStyle}>
                <CanvasPill theme={th} tone="info">
                  搜尋 {filters.q ? `"${filters.q}"` : "全部"}
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  部門 {filters.department || "全部"}
                </CanvasPill>
                <CanvasPill theme={th} tone={refreshTone}>
                  {refreshMetadata?.dataFreshness ?? "fallback"} snapshot
                </CanvasPill>
                {emptyReason ? (
                  <CanvasPill
                    theme={th}
                    tone={EMPTY_STATE_VIEWS[emptyReason].tone}
                  >
                    {emptyReason}
                  </CanvasPill>
                ) : null}
              </div>
            </div>

            {emptyReason ? (
              renderEmptyState(emptyReason, primaryPageAction)
            ) : (
              <CanvasTable<PassengerRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
            )}
          </CanvasCard>

          <div style={{ ...sideStackStyle, ...detailCardStyle }}>
            <CanvasCard
              theme={th}
              title="乘客詳情"
              subtitle={
                selectedPassenger
                  ? `${selectedPassenger.fullName} · ${selectedPassenger.activeFlag ? "啟用中" : "已停用"}`
                  : "選取左側任一乘客後，這裡會顯示聯絡資料、可用動作、deep links 與 quality issues。"
              }
            >
              {selectedPassenger ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={detailHeaderStyle}>
                    <div style={detailTitleStyle}>
                      {selectedPassenger.fullName}
                    </div>
                    <div style={detailSubtitleStyle}>
                      可直接檢視建單預填資料與 current action
                      contract；若該筆已停用，歷史訂單仍保留 snapshot。
                    </div>
                    <div style={infoListStyle}>
                      <CanvasPill
                        theme={th}
                        tone={
                          selectedPassenger.activeFlag ? "success" : "neutral"
                        }
                        dot
                      >
                        {selectedPassenger.activeFlag ? "啟用中" : "已停用"}
                      </CanvasPill>
                      <CanvasPill theme={th} tone="info">
                        {getKindLabel(selectedPassenger)}
                      </CanvasPill>
                      {selectedPassengerDuplicate ? (
                        <CanvasPill theme={th} tone="warn">
                          同名警示
                        </CanvasPill>
                      ) : null}
                    </div>
                  </div>

                  <CanvasDL
                    theme={th}
                    cols={1}
                    items={[
                      {
                        k: "乘客 ID",
                        v: selectedPassenger.passengerId,
                        mono: true,
                      },
                      {
                        k: "工號",
                        v: selectedPassenger.employeeNo ?? "—",
                        mono: true,
                      },
                      { k: "部門", v: selectedDepartment },
                      {
                        k: "手機",
                        v: selectedPassenger.mobile ?? "—",
                        mono: true,
                      },
                      {
                        k: "Email",
                        v: selectedPassenger.email ?? "—",
                        mono: true,
                      },
                      {
                        k: "可編輯至",
                        v: formatUpdated(selectedEditableUntil),
                        mono: true,
                      },
                      {
                        k: "同意書版本",
                        v: selectedConsentVersion ?? "—",
                      },
                      {
                        k: "唯讀原因",
                        v: selectedReadOnlyReason ?? "—",
                      },
                      {
                        k: "最近更新",
                        v: formatUpdated(selectedPassenger.updatedAt),
                        mono: true,
                      },
                    ]}
                  />
                </div>
              ) : (
                <div style={subtleTextStyle}>
                  目前沒有可用 passenger row。新租戶通常會落在 `no_data`；
                  若只是條件太窄，則會落在 `filtered_empty`。
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="可用動作"
              subtitle="所有 CTA 都以 `availableActions[]` 為準，不從 role 或 activeFlag 推論。"
            >
              {selectedPassenger ? (
                <div style={railBlockStyle}>
                  <div style={detailSectionStyle}>
                    <div style={sectionLabelStyle}>可立即執行</div>
                    <div style={{ ...actionsWrapStyle, marginTop: 8 }}>
                      {selectedEnabledActions.length > 0 ? (
                        selectedEnabledActions.map((action) =>
                          renderActionDescriptor(
                            action,
                            getActionLabel(action.action),
                          ),
                        )
                      ) : (
                        <CanvasPill theme={th} tone="neutral">
                          目前沒有可直接執行的 CTA
                        </CanvasPill>
                      )}
                    </div>
                  </div>

                  <div style={detailSectionStyle}>
                    <div style={sectionLabelStyle}>目前不可用</div>
                    <div style={{ ...actionsWrapStyle, marginTop: 8 }}>
                      {selectedDisabledActions.length > 0 ? (
                        selectedDisabledActions.map((action) =>
                          renderActionDescriptor(
                            action,
                            getActionLabel(action.action),
                          ),
                        )
                      ) : (
                        <CanvasPill theme={th} tone="success">
                          所有 exposed actions 皆可執行
                        </CanvasPill>
                      )}
                    </div>
                  </div>

                  <div style={compactListStyle}>
                    {selectedActions.map((action) => (
                      <div
                        key={`summary-${action.action}`}
                        style={compactListItemStyle}
                      >
                        <div style={infoListStyle}>
                          <CanvasPill theme={th} tone={getActionTone(action)}>
                            {getActionLabel(action.action)}
                          </CanvasPill>
                          <CanvasPill
                            theme={th}
                            tone={
                              action.riskLevel === "high"
                                ? "danger"
                                : action.riskLevel === "medium"
                                  ? "accent"
                                  : "info"
                            }
                          >
                            {action.riskLevel}
                          </CanvasPill>
                        </div>
                        <div style={helperTextStyle}>
                          {getActionSummary(action)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={helperTextStyle}>
                    Q-TEN06: passenger deactivation is soft-only。既有 bookings
                    保留 snapshot；停用後不再出現在 picker，但歷史明細仍可見。
                  </div>
                </div>
              ) : (
                <div style={subtleTextStyle}>
                  選取 passenger 後會顯示該筆 resource 的 action contract。
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="連動流程"
              subtitle="集中顯示建單預填入口、租戶內稽核，以及跨 app 的 deep links。"
            >
              {selectedPassenger ? (
                <div style={railBlockStyle}>
                  <div style={detailSectionStyle}>
                    <div style={sectionLabelStyle}>Deep links</div>
                    <div style={deepLinkListStyle}>
                      {selectedDeepLinks.map((link) => (
                        <div
                          key={`${link.href}:${link.label}`}
                          style={deepLinkItemStyle}
                        >
                          <div style={{ display: "grid", gap: 4 }}>
                            <span style={primaryCellStyle}>{link.label}</span>
                            <span style={subtleTextStyle}>
                              {link.newTab
                                ? "新分頁開啟"
                                : "Tenant Console 內頁導向"}
                            </span>
                          </div>
                          <Link
                            href={link.href}
                            style={linkButtonStyle}
                            target={link.newTab ? "_blank" : undefined}
                            rel={link.newTab ? "noreferrer" : undefined}
                          >
                            開啟
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={detailSectionStyle}>
                    <div style={sectionLabelStyle}>Quality issues</div>
                    {selectedQualityIssues.length > 0 ? (
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        <div style={infoListStyle}>
                          {selectedQualityIssues.map((issue) => (
                            <CanvasPill
                              key={issue}
                              theme={th}
                              tone={getQualityIssueTone(issue)}
                            >
                              {getQualityIssueLabel(issue)}
                            </CanvasPill>
                          ))}
                        </div>
                        <div style={helperTextStyle}>{qualityBannerBody}</div>
                      </div>
                    ) : (
                      <div style={{ ...subtleTextStyle, marginTop: 8 }}>
                        目前沒有資料品質警示。
                      </div>
                    )}
                  </div>

                  <div style={helperTextStyle}>
                    Cross-app deep links follow Q-X03。當目標落在 Ops Console 或
                    Platform Admin 時，會以新分頁開啟。
                  </div>
                </div>
              ) : (
                <div style={subtleTextStyle}>
                  沒有選取 passenger 時，僅保留 roster 與 empty state。
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function getQualityIssueTone(issue: TenantPassengerQualityIssue): CanvasTone {
  switch (issue) {
    case "duplicate_employee_no":
      return "warn";
    case "missing_contact":
    case "missing_employee_no":
    default:
      return "neutral";
  }
}
