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
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 1.4fr) repeat(3, minmax(160px, 0.8fr)) auto",
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
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const detailCardStyle: CSSProperties = {
  position: "sticky",
  top: 24,
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
  height: 24,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const actionChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
};

const disabledActionStyle: CSSProperties = {
  ...actionChipStyle,
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

const emptyStateWrapStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 14,
  justifyItems: "start",
};

const emptyStateAccentStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: `linear-gradient(135deg, ${th.accent}22, ${th.accentHi}33)`,
  border: `1px solid ${th.border}`,
  display: "grid",
  placeItems: "center",
  color: th.accentHi,
  fontWeight: 800,
  letterSpacing: 0.3,
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
  return activeFlag ? "active" : "deactivated";
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
      return "新增";
    case "edit":
      return "編輯";
    case "deactivate":
      return "軟停用";
    case "reactivate":
      return "重新啟用";
    default:
      return action;
  }
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
        renderActionDescriptor(
          primaryAction,
          getActionLabel(primaryAction.action),
        )
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
      return "duplicate employee no";
    case "missing_contact":
      return "missing contact";
    case "missing_employee_no":
    default:
      return "missing employee no";
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
      h: "NAME",
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
          <div style={infoListStyle}>
            <CanvasPill theme={th} tone="info">
              {row.kindLabel}
            </CanvasPill>
            {row.duplicateName ? (
              <CanvasPill theme={th} tone="warn">
                duplicate name
              </CanvasPill>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      h: "EMP ID",
      w: 110,
      mono: true,
      r: (row) => row.employeeNo ?? "—",
    },
    {
      h: "DEPT",
      w: 150,
      r: (row) => row.departmentName ?? "—",
    },
    {
      h: "MOBILE",
      w: 140,
      mono: true,
      r: (row) => row.mobile ?? "—",
    },
    {
      h: "EMAIL",
      mono: true,
      r: (row) => row.email ?? "—",
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "UPDATED",
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
    {
      h: "ACTIONS",
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

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本 · soft deactivate"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <div style={actionsWrapStyle}>
            <Link href={refreshHref} style={linkButtonStyle}>
              重新整理
            </Link>
            {pageActions.map((action) =>
              renderActionDescriptor(action, getActionLabel(action.action)),
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
            label="Passengers"
            value={String(passengers.length)}
            sub={`${activeCount} active / ${inactiveCount} inactive`}
          />
          <CanvasKPI
            theme={th}
            label="Employee"
            value={String(employeeCount)}
            sub={`${passengers.length - employeeCount} visitor`}
          />
          <CanvasKPI
            theme={th}
            label="Refresh"
            value="T5"
            sub={`${refreshTierLabel} · ${refreshSummary}`}
          />
          <CanvasKPI
            theme={th}
            label="Selected"
            value={selectedPassenger ? "ready" : "none"}
            sub={selectedPassenger ? selectedPassenger.fullName : "pick a row"}
          />
        </div>

        <CanvasCard
          theme={th}
          title="Directory filters"
          subtitle="Filter by active state, department, and search by name / employee no / mobile."
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
              <span style={fieldLabelStyle}>Search</span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="姓名 / 工號 / 手機"
                style={fieldStyle}
              />
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>Department</span>
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
              <span style={fieldLabelStyle}>State</span>
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
              <span style={fieldLabelStyle}>Refresh tier</span>
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
                套用
              </button>
              <Link href="/passengers" style={linkButtonStyle}>
                清除
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={stackedLayoutStyle}>
          <CanvasCard
            theme={th}
            padding={0}
            style={cardStyle}
            title="Passenger roster"
            subtitle={`${rows.length} visible row(s) · state ${filters.activeState}`}
          >
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

          <CanvasCard
            theme={th}
            title="Passenger detail"
            subtitle={
              selectedPassenger
                ? `${selectedPassenger.fullName} · ${selectedPassenger.activeFlag ? "active" : "deactivated"}`
                : "Select a row to inspect actions, deep links, and quality warnings."
            }
            style={detailCardStyle}
          >
            {selectedPassenger ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={infoListStyle}>
                  <CanvasPill
                    theme={th}
                    tone={selectedPassenger.activeFlag ? "success" : "neutral"}
                    dot
                  >
                    {selectedPassenger.activeFlag ? "active" : "deactivated"}
                  </CanvasPill>
                  <CanvasPill theme={th} tone="info">
                    {getKindLabel(selectedPassenger)}
                  </CanvasPill>
                  {selectedPassengerDuplicate ? (
                    <CanvasPill theme={th} tone="warn">
                      duplicate name
                    </CanvasPill>
                  ) : null}
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
                      k: "editableUntil",
                      v: formatUpdated(selectedEditableUntil),
                      mono: true,
                    },
                    {
                      k: "consentVersion",
                      v: selectedConsentVersion ?? "—",
                    },
                    {
                      k: "readOnlyReason",
                      v: selectedReadOnlyReason ?? "—",
                    },
                    {
                      k: "updatedAt",
                      v: formatUpdated(selectedPassenger.updatedAt),
                      mono: true,
                    },
                  ]}
                />

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    Available actions
                  </div>
                  <div style={actionsWrapStyle}>
                    {selectedActions.map((action) =>
                      renderActionDescriptor(
                        action,
                        getActionLabel(action.action),
                      ),
                    )}
                  </div>
                  <div style={subtleTextStyle}>
                    CTAs are driven from `availableActions` when present; this
                    page falls back to spec-safe disabled affordances until the
                    mutation route lands.
                  </div>
                  <div style={helperTextStyle}>
                    Q-TEN06: passenger deactivation is soft-only. Existing
                    bookings retain their snapshot; inactive records disappear
                    from pickers but stay visible in historical detail.
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    Deep links
                  </div>
                  <div style={actionsWrapStyle}>
                    {selectedDeepLinks.map((link) => (
                      <Link
                        key={`${link.href}:${link.label}`}
                        href={link.href}
                        style={linkButtonStyle}
                        target={link.newTab ? "_blank" : undefined}
                        rel={link.newTab ? "noreferrer" : undefined}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <div style={helperTextStyle}>
                    Cross-app deep links follow Q-X03 and open in a new tab when
                    the target lives in Ops Console or Platform Admin.
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    Quality issues
                  </div>
                  {selectedQualityIssues.length > 0 ? (
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
                  ) : (
                    <div style={subtleTextStyle}>
                      No current data-quality warning.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={subtleTextStyle}>
                目前沒有可用 passenger row。若是新租戶，這會對應 `no_data`；
                若是套了篩選，則會落在 `filtered_empty`。
              </div>
            )}
          </CanvasCard>
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
