import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ApiListData,
  ApiSuccessEnvelope,
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const T5_REFRESH_MS = 30_000;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const metricsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.9fr) minmax(280px, 0.95fr)",
  gap: 16,
};

const sideStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const subtleMonoStyle: CSSProperties = {
  color: th.textMuted,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const filterCardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const filterRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1.2fr) minmax(160px, 220px) minmax(140px, 180px) auto",
  gap: 10,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  color: th.text,
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: "9px 11px",
  fontSize: 12.5,
  outline: "none",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const submitButtonStyle: CSSProperties = {
  height: 28,
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#fff",
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  justifyContent: "flex-end",
};

const warningListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const warningItemStyle: CSSProperties = {
  border: `1px solid ${th.warnBorder}`,
  background: th.warnBg,
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 6,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 10,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 700,
  fontSize: 15,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const emptyActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "center",
  flexWrap: "wrap",
};

const linkListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const linkItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  textDecoration: "none",
  fontSize: 12.5,
};

type PassengerTabKey = "all" | "employee" | "visitor" | "disabled";
type PassengerStatusFilter = "all" | "active" | "inactive";
type PassengerEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type PassengerActionLink = {
  key: string;
  label: string;
  href: string | undefined;
  disabled: boolean | undefined;
  disabledReasonCode?: string;
  variant: "primary" | "secondary" | "ghost" | undefined;
  danger: boolean | undefined;
  target?: "_blank";
  rel?: "noreferrer noopener";
};

const infoStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const reasonPanelStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  padding: 14,
  display: "grid",
  gap: 10,
};

const reasonMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "center",
};

type PassengerRowRecord = TenantPassengerRecord & {
  availableActions?: ResourceActionDescriptor[];
  supportLinks?: CrossAppResourceLink[];
  duplicateWarning?: string | null;
};

type PassengerRow = PassengerRowRecord &
  Record<string, unknown> & {
    stateLabel: string;
    stateTone: CanvasTone;
    categoryLabel: string;
    qualitySummary: string;
    actionsSummary: string;
  };

type PassengerDirectoryResponse = ApiListData<PassengerRowRecord> & {
  availableActions?: ResourceActionDescriptor[];
  emptyState?: {
    reason: EmptyReason;
    messageCode: string;
    nextAction?: ResourceActionDescriptor;
  };
  refresh?: UiRefreshMetadata;
  supportLinks?: CrossAppResourceLink[];
  duplicateWarnings?: Array<{
    key: string;
    label: string;
    passengerIds: string[];
  }>;
};

type PassengerPageData = {
  passengers: PassengerRowRecord[];
  pageActions: ResourceActionDescriptor[];
  emptyState?: PassengerDirectoryResponse["emptyState"];
  refresh: UiRefreshMetadata;
  supportLinks: CrossAppResourceLink[];
  duplicateWarnings: Array<{
    key: string;
    label: string;
    passengerIds: string[];
  }>;
  errors: string[];
};

type PassengerTabDefinition = {
  key: PassengerTabKey;
  label: string;
};

const PASSENGER_TABS: PassengerTabDefinition[] = [
  { key: "all", label: "全部" },
  { key: "employee", label: "員工" },
  { key: "visitor", label: "訪客" },
  { key: "disabled", label: "停用" },
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  return activeFlag ? "active" : "disabled";
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

function normalizeActions(
  actions: ResourceActionDescriptor[] | undefined,
  fallback: ResourceActionDescriptor[],
) {
  return actions && actions.length > 0 ? actions : fallback;
}

function normalizeEmptyReason(reason?: string | null): PassengerEmptyReason {
  switch (reason) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return reason;
    default:
      return "fetch_failed";
  }
}

function getFallbackPageActions(): ResourceActionDescriptor[] {
  return [
    {
      action: "create_passenger",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "import_passenger_csv",
      enabled: false,
      disabledReasonCode: "passenger_csv_import_not_published",
      riskLevel: "low",
    },
  ];
}

function getFallbackRowActions(
  passenger: TenantPassengerRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "edit_passenger",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: passenger.activeFlag
        ? "soft_deactivate_passenger"
        : "reactivate_passenger",
      enabled: true,
      requiresReason: passenger.activeFlag,
      riskLevel: passenger.activeFlag ? "high" : "medium",
    },
  ];
}

async function fetchPassengersEnvelope(): Promise<PassengerPageData> {
  const errors: string[] = [];

  try {
    const response = await fetch(`${API_URL}/api/tenant/passengers`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Tenant-Id": DEMO_TENANT_ID,
        "X-Actor-Id": DEMO_ACTOR_ID,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const envelope = (await response.json()) as ApiSuccessEnvelope<
      PassengerDirectoryResponse | ApiListData<PassengerRowRecord>
    >;
    const payload = envelope.data;
    const passengers = [...(payload.items ?? [])].sort(comparePassengers);
    const refresh =
      "refresh" in payload && payload.refresh
        ? payload.refresh
        : {
            generatedAt: envelope.meta.timestamp,
            staleAfterMs: T5_REFRESH_MS,
            dataFreshness: "unknown",
            source: "live",
          };

    const duplicateWarnings =
      "duplicateWarnings" in payload && Array.isArray(payload.duplicateWarnings)
        ? payload.duplicateWarnings
        : buildDuplicateWarnings(passengers);
    const supportLinks =
      "supportLinks" in payload && Array.isArray(payload.supportLinks)
        ? payload.supportLinks
        : [];
    const pageActions =
      "availableActions" in payload && Array.isArray(payload.availableActions)
        ? payload.availableActions
        : getFallbackPageActions();
    const emptyState = "emptyState" in payload ? payload.emptyState : undefined;

    return {
      passengers,
      pageActions,
      emptyState,
      refresh,
      supportLinks,
      duplicateWarnings,
      errors,
    };
  } catch (error) {
    errors.push(`乘客目錄: ${toErrorMessage(error)}`);
    return {
      passengers: [],
      pageActions: getFallbackPageActions(),
      emptyState: {
        reason: "fetch_failed",
        messageCode: "tenant_passenger_fetch_failed",
      },
      refresh: {
        generatedAt: new Date().toISOString(),
        staleAfterMs: T5_REFRESH_MS,
        dataFreshness: "degraded",
        source: "live",
      },
      supportLinks: [],
      duplicateWarnings: [],
      errors,
    };
  }
}

function buildDuplicateWarnings(passengers: TenantPassengerRecord[]) {
  const grouped = new Map<string, PassengerRowRecord[]>();

  passengers.forEach((passenger) => {
    const key = passenger.fullName.trim().toLocaleLowerCase("zh-Hant");
    if (!key) return;
    const bucket = grouped.get(key) ?? [];
    bucket.push(passenger);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({
      key,
      label: `${bucket[0]?.fullName ?? key} 重複 ${bucket.length} 筆`,
      passengerIds: bucket.map((item) => item.passengerId),
    }));
}

function toPassengerRow(passenger: PassengerRowRecord): PassengerRow {
  const qualitySummary = formatQualityIssues(passenger.qualityIssues);
  return {
    ...passenger,
    stateLabel: getStateLabel(passenger.activeFlag),
    stateTone: getStateTone(passenger.activeFlag),
    categoryLabel: isEmployeePassenger(passenger) ? "員工" : "訪客",
    qualitySummary,
    actionsSummary: normalizeActions(
      passenger.availableActions,
      getFallbackRowActions(passenger),
    )
      .map((action) => describeActionLabel(action.action))
      .join(" / "),
  };
}

function buildTabNodes(selectedTab: PassengerTabKey) {
  const tabs = PASSENGER_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={tab.key === "all" ? "/passengers" : `/passengers?tab=${tab.key}`}
      style={tabLinkStyle}
    >
      {tab.label}
    </Link>
  ));

  const activeIndex = PASSENGER_TABS.findIndex(
    (tab) => tab.key === selectedTab,
  );

  return {
    tabs,
    activeTab: tabs[activeIndex] ?? tabs[0],
  };
}

function getSelectedTab(rawTab: string | undefined): PassengerTabKey {
  const matched = PASSENGER_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function getSelectedStatus(
  rawStatus: string | undefined,
): PassengerStatusFilter {
  switch (rawStatus) {
    case "active":
    case "inactive":
      return rawStatus;
    default:
      return "all";
  }
}

function getSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatRefreshTime(value: string) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}

function formatRelativeStale(refresh: UiRefreshMetadata) {
  const generated = parseDate(refresh.generatedAt)?.getTime();
  if (!generated) return "unknown";

  const delta = Date.now() - generated;
  if (delta <= refresh.staleAfterMs) {
    return "fresh";
  }

  const overdue = Math.round((delta - refresh.staleAfterMs) / 1000);
  return overdue <= 0 ? "fresh" : `${overdue}s overdue`;
}

function describeActionLabel(action: string) {
  switch (action) {
    case "create_passenger":
      return "新增";
    case "import_passenger_csv":
      return "CSV 匯入";
    case "edit_passenger":
    case "update_passenger":
      return "編輯";
    case "soft_deactivate_passenger":
    case "deactivate_passenger":
      return "停用";
    case "reactivate_passenger":
      return "重新啟用";
    case "create_booking":
      return "建立訂單";
    case "view_audit":
      return "檢視稽核";
    default:
      return action.replaceAll("_", " ");
  }
}

function formatDisabledReason(code?: string) {
  switch (code) {
    case "passenger_csv_import_not_published":
      return "CSV 匯入 command 尚未對 tenant console 發布";
    case "passenger_deactivation_requires_reason":
      return "停用必須填寫原因";
    default:
      return code ? code.replaceAll("_", " ") : null;
  }
}

function formatQualityIssues(issues?: TenantPassengerQualityIssue[]) {
  if (!issues || issues.length === 0) {
    return "clean";
  }
  return issues
    .map((issue) => {
      switch (issue) {
        case "missing_contact":
          return "missing contact";
        case "missing_employee_no":
          return "missing emp id";
        case "duplicate_employee_no":
          return "duplicate emp id";
        default:
          return issue;
      }
    })
    .join(" / ");
}

function buildPageActionLinks(
  actions: ResourceActionDescriptor[],
): PassengerActionLink[] {
  return actions.map((action) => ({
    key: action.action,
    label: describeActionLabel(action.action),
    href:
      action.action === "create_passenger"
        ? "/passengers?action=create"
        : undefined,
    disabled: !action.enabled,
    disabledReasonCode: action.disabledReasonCode,
    variant: action.action === "create_passenger" ? "primary" : "secondary",
    danger: undefined,
  }));
}

function buildRowActionLinks(row: PassengerRowRecord): PassengerActionLink[] {
  const actions = normalizeActions(
    row.availableActions,
    getFallbackRowActions(row),
  );
  const links: PassengerActionLink[] = actions.map((action) => {
    const isDeactivate =
      action.action === "soft_deactivate_passenger" ||
      action.action === "deactivate_passenger";
    return {
      key: action.action,
      label: describeActionLabel(action.action),
      href:
        action.action === "create_booking"
          ? `/bookings/new?passengerId=${encodeURIComponent(row.passengerId)}`
          : action.action === "view_audit"
            ? `/audit?resourceId=${encodeURIComponent(row.passengerId)}`
            : action.action === "edit_passenger" ||
                action.action === "update_passenger"
              ? `/passengers?action=edit&passengerId=${encodeURIComponent(row.passengerId)}`
              : undefined,
      disabled: !action.enabled,
      disabledReasonCode: action.disabledReasonCode,
      danger: isDeactivate,
      variant:
        action.action === "create_booking"
          ? "primary"
          : isDeactivate
            ? "ghost"
            : "secondary",
    };
  });

  if (!row.availableActions) {
    links.push({
      key: `new-booking-${row.passengerId}`,
      label: "建立訂單",
      href: `/bookings/new?passengerId=${encodeURIComponent(row.passengerId)}`,
      variant: "primary",
      disabled: undefined,
      danger: undefined,
    });
  }

  return dedupeActionLinks(links);
}

function dedupeActionLinks(links: PassengerActionLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.label)) return false;
    seen.add(link.label);
    return true;
  });
}

function matchesStatusFilter(
  passenger: TenantPassengerRecord,
  statusFilter: PassengerStatusFilter,
) {
  if (statusFilter === "all") return true;
  return statusFilter === "active"
    ? passenger.activeFlag
    : !passenger.activeFlag;
}

function collectSupportLinks(
  pageLinks: CrossAppResourceLink[],
  passengers: PassengerRowRecord[],
) {
  const linkMap = new Map<string, CrossAppResourceLink>();

  [
    ...pageLinks,
    ...passengers.flatMap((passenger) => passenger.supportLinks ?? []),
  ].forEach((link) => {
    const key = [
      link.targetApp,
      link.route,
      link.resourceType,
      link.resourceId,
      link.openMode,
    ].join("::");
    if (!linkMap.has(key)) {
      linkMap.set(key, link);
    }
  });

  return Array.from(linkMap.values());
}

function resolveEmptyState(params: {
  hasErrors: boolean;
  rowsLength: number;
  passengerCount: number;
  activeFilters: boolean;
  previewReason: string | undefined;
  backendEmptyState: PassengerDirectoryResponse["emptyState"] | undefined;
}): PassengerDirectoryResponse["emptyState"] | undefined {
  if (params.previewReason) {
    return {
      reason: normalizeEmptyReason(params.previewReason),
      messageCode: `preview_${params.previewReason}`,
    };
  }

  if (params.rowsLength > 0) return undefined;
  if (params.backendEmptyState) return params.backendEmptyState;
  if (params.hasErrors) {
    return {
      reason: "fetch_failed",
      messageCode: "tenant_passenger_fetch_failed",
    };
  }
  if (params.activeFilters) {
    return {
      reason: "filtered_empty",
      messageCode: "tenant_passenger_filtered_empty",
    };
  }
  if (params.passengerCount === 0) {
    return {
      reason: "no_data",
      messageCode: "tenant_passenger_no_data",
    };
  }
  return undefined;
}

function renderActionButton(link: PassengerActionLink) {
  const variant = link.variant ?? "secondary";
  const danger = link.danger ?? false;
  const disabled = link.disabled ?? false;
  const icon =
    link.label === "CSV 匯入"
      ? "ext"
      : variant === "primary"
        ? "plus"
        : undefined;
  const button = (
    <CanvasBtn
      theme={th}
      size="sm"
      variant={variant}
      danger={danger}
      disabled={disabled}
      icon={icon}
    >
      {link.label}
    </CanvasBtn>
  );

  if (!link.href || disabled) {
    return (
      <span
        key={link.key}
        title={
          disabled ? (formatDisabledReason(link.disabledReasonCode) ?? "") : ""
        }
      >
        {button}
      </span>
    );
  }

  return (
    <Link
      key={link.key}
      href={link.href}
      target={link.target}
      rel={link.rel}
      style={{ textDecoration: "none" }}
    >
      {button}
    </Link>
  );
}

function renderEmptyState(
  emptyState: NonNullable<PassengerDirectoryResponse["emptyState"]>,
  activeFiltersHref: string,
  refreshHref: string,
) {
  const reason = normalizeEmptyReason(
    emptyState.reason,
  ) as PassengerEmptyReason;
  const nextAction =
    emptyState.nextAction ??
    (reason === "no_data"
      ? {
          action: "create_passenger",
          enabled: true,
          riskLevel: "medium" as const,
        }
      : undefined);

  const content: Record<
    PassengerEmptyReason,
    {
      title: string;
      body: string;
      tone: CanvasTone;
      badge: string;
      meta: string[];
    }
  > = {
    no_data: {
      title: "尚未建立任何乘客資料",
      body: "Passenger directory 目前為空。建立第一筆常用乘客後，/bookings/new 才能直接預填並重用名單。",
      tone: "info" as const,
      badge: "EMPTY DIRECTORY",
      meta: ["建立首筆 passenger", "之後可從 /bookings/new 預填"],
    },
    not_provisioned: {
      title: "租戶乘客名錄尚未啟用",
      body: "這個 tenant 尚未完成 passenger directory provisioning。請先完成租戶設定，避免用假資料填充列表。",
      tone: "warn" as const,
      badge: "PROVISIONING REQUIRED",
      meta: ["顯示 setup 阻塞", "不能假裝是空資料"],
    },
    fetch_failed: {
      title: "乘客資料暫時無法載入",
      body: "後端未提供可用 snapshot。此時要顯示錯誤狀態，而不是假裝沒有資料。",
      tone: "danger" as const,
      badge: "FETCH FAILED",
      meta: ["保留錯誤訊號", "允許使用者手動 refresh"],
    },
    permission_denied: {
      title: "目前角色沒有乘客目錄權限",
      body: "availableActions 與列表都被後端拒絕時，UI 必須明確顯示 permission_denied。",
      tone: "warn" as const,
      badge: "PERMISSION DENIED",
      meta: ["不要渲染假 CTA", "需要改由權限流程處理"],
    },
    external_unavailable: {
      title: "外部依賴暫時不可用",
      body: "名錄資料受外部系統影響時，要顯示 external_unavailable，而不是 generic fetch error。",
      tone: "warn" as const,
      badge: "EXTERNAL UNAVAILABLE",
      meta: ["等待上游恢復", "資料可能稍後自動回來"],
    },
    filtered_empty: {
      title: "目前篩選條件沒有符合的乘客",
      body: "放寬 active/inactive、department 或搜尋字詞後再試一次。",
      tone: "info" as const,
      badge: "FILTERED EMPTY",
      meta: ["先清除 filters", "再回到完整 passenger list"],
    },
  };
  const emptyContent = content[reason]!;

  return (
    <div style={emptyStateStyle}>
      <div style={reasonPanelStyle}>
        <div style={reasonMetaStyle}>
          <CanvasPill theme={th} tone={emptyContent.tone}>
            {reason}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {emptyContent.badge}
          </CanvasPill>
        </div>
        <div style={emptyTitleStyle}>{emptyContent.title}</div>
        <div style={emptyBodyStyle}>{emptyContent.body}</div>
        <div style={reasonMetaStyle}>
          {emptyContent.meta.map((item: string) => (
            <CanvasPill key={item} theme={th} tone="neutral">
              {item}
            </CanvasPill>
          ))}
        </div>
        <div style={emptyActionsStyle}>
          {nextAction
            ? renderActionButton(buildPageActionLinks([nextAction])[0]!)
            : null}
          {reason === "filtered_empty" ? (
            <Link href={activeFiltersHref} style={{ textDecoration: "none" }}>
              <CanvasBtn theme={th} size="sm" variant="secondary">
                清除篩選
              </CanvasBtn>
            </Link>
          ) : null}
          {reason === "fetch_failed" || reason === "external_unavailable" ? (
            <Link href={refreshHref} style={{ textDecoration: "none" }}>
              <CanvasBtn theme={th} size="sm" variant="secondary">
                重新整理
              </CanvasBtn>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(getSearchParam(resolvedSearchParams.tab));
  const selectedStatus = getSelectedStatus(
    getSearchParam(resolvedSearchParams.status),
  );
  const searchQuery = getSearchParam(resolvedSearchParams.q)?.trim() ?? "";
  const selectedDepartment =
    getSearchParam(resolvedSearchParams.department)?.trim() ?? "";
  const previewEmptyReason = getSearchParam(resolvedSearchParams.emptyReason);

  const {
    passengers,
    pageActions,
    emptyState: backendEmptyState,
    refresh,
    supportLinks,
    duplicateWarnings,
    errors,
  } = await fetchPassengersEnvelope();
  const { tabs, activeTab } = buildTabNodes(selectedTab);

  const departmentOptions = Array.from(
    new Set(
      passengers
        .map((passenger) => passenger.departmentName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));

  const rows = passengers
    .filter((passenger) => matchesTab(passenger, selectedTab))
    .filter((passenger) => matchesStatusFilter(passenger, selectedStatus))
    .filter((passenger) =>
      selectedDepartment
        ? passenger.departmentName?.trim() === selectedDepartment
        : true,
    )
    .filter((passenger) => {
      if (!searchQuery) return true;
      const haystack = [
        passenger.fullName,
        passenger.employeeNo,
        passenger.mobile,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("zh-Hant");
      return haystack.includes(searchQuery.toLocaleLowerCase("zh-Hant"));
    })
    .map(toPassengerRow);

  const filteredEmptyState = resolveEmptyState({
    hasErrors: errors.length > 0,
    rowsLength: rows.length,
    passengerCount: passengers.length,
    activeFilters: Boolean(
      searchQuery ||
      selectedDepartment ||
      selectedTab !== "all" ||
      selectedStatus !== "all",
    ),
    previewReason: previewEmptyReason,
    backendEmptyState,
  });

  const baseParams = buildSearchParams(selectedTab, selectedStatus);
  const clearFiltersHref = "/passengers";
  const refreshHref = baseParams.toString()
    ? `/passengers?${baseParams.toString()}`
    : "/passengers";
  const pageActionLinks = buildPageActionLinks(pageActions);
  const allSupportLinks = collectSupportLinks(supportLinks, passengers);
  const disabledActionLinks = [
    ...pageActionLinks,
    ...rows.flatMap(buildRowActionLinks),
  ].filter((link) => link.disabled);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      k: "fullName",
      w: 160,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryCellStyle}>{row.fullName}</span>
          <span style={subtleMonoStyle}>{row.categoryLabel}</span>
        </div>
      ),
    },
    {
      h: "EMP ID",
      w: 100,
      mono: true,
      r: (row) => row.employeeNo ?? "—",
    },
    {
      h: "DEPT",
      w: 140,
      r: (row) => row.departmentName ?? "—",
    },
    {
      h: "MOBILE",
      w: 130,
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
      w: 120,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <CanvasPill theme={th} tone={row.stateTone} dot>
            {row.stateLabel}
          </CanvasPill>
          <span style={subtleMonoStyle}>{row.qualitySummary}</span>
        </div>
      ),
    },
    {
      h: "ACTIONS",
      w: 280,
      r: (row) => (
        <div style={actionWrapStyle}>
          {buildRowActionLinks(row).map((link) => renderActionButton(link))}
        </div>
      ),
    },
  ];

  const activeCount = passengers.filter(
    (passenger) => passenger.activeFlag,
  ).length;
  const employeeCount = passengers.filter(isEmployeePassenger).length;
  const inactiveCount = passengers.length - activeCount;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 軟停用 only (Q-TEN06)"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={<>{pageActionLinks.map((link) => renderActionButton(link))}</>}
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

        <div style={metricsStyle}>
          <CanvasKPI
            theme={th}
            label="Passengers"
            value={String(passengers.length)}
            sub="directory rows"
          />
          <CanvasKPI
            theme={th}
            label="Active"
            value={String(activeCount)}
            sub="picker visible"
          />
          <CanvasKPI
            theme={th}
            label="Employees"
            value={String(employeeCount)}
            sub="employee profile"
          />
          <CanvasKPI
            theme={th}
            label="Inactive"
            value={String(inactiveCount)}
            sub="historical only"
          />
        </div>

        <CanvasCard
          theme={th}
          title="查詢與 freshness"
          subtitle="T5 refresh tier = 30s cadence"
          style={filterCardStyle}
        >
          <form method="get" style={filterRowStyle}>
            <label style={fieldStackStyle}>
              <span style={subtleMonoStyle}>SEARCH</span>
              <input
                type="search"
                name="q"
                defaultValue={searchQuery}
                placeholder="姓名 / 員編 / 手機"
                style={inputStyle}
              />
            </label>

            <label style={fieldStackStyle}>
              <span style={subtleMonoStyle}>DEPARTMENT</span>
              <select
                name="department"
                defaultValue={selectedDepartment}
                style={selectStyle}
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
              <span style={subtleMonoStyle}>STATUS</span>
              <select
                name="status"
                defaultValue={selectedStatus}
                style={selectStyle}
              >
                <option value="all">全部狀態</option>
                <option value="active">僅啟用</option>
                <option value="inactive">僅停用</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              {selectedTab !== "all" ? (
                <input type="hidden" name="tab" value={selectedTab} />
              ) : null}
              <button type="submit" style={submitButtonStyle}>
                套用
              </button>
              <Link href="/passengers" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th} variant="secondary" size="sm">
                  重設
                </CanvasBtn>
              </Link>
            </div>
          </form>

          <div style={helperRowStyle}>
            <div style={chipRowStyle}>
              <CanvasPill theme={th} tone="info">
                refresh tier T5
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                generated {formatRefreshTime(refresh.generatedAt)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {formatRelativeStale(refresh)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                source {refresh.source}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
              >
                {refresh.dataFreshness}
              </CanvasPill>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={subtleMonoStyle}>
                active / inactive、department、name / employee no / mobile
              </span>
              <Link href={refreshHref} style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th} variant="secondary" size="sm">
                  Refresh
                </CanvasBtn>
              </Link>
            </div>
          </div>
        </CanvasCard>

        <div style={contentGridStyle}>
          <CanvasCard theme={th} padding={0} style={cardStyle}>
            {filteredEmptyState ? (
              renderEmptyState(
                filteredEmptyState,
                clearFiltersHref,
                refreshHref,
              )
            ) : (
              <CanvasTable<PassengerRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
            )}
          </CanvasCard>

          <div style={sideStackStyle}>
            <CanvasCard
              theme={th}
              title="Directory notes"
              subtitle="spec-driven behavior"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "Refresh tier", v: "T5 / 30s", mono: true },
                  { k: "Soft deactivate", v: "reason required", mono: false },
                  { k: "Hard delete", v: "not in normal UI", mono: false },
                  { k: "Booking exit", v: "/bookings/new prefill", mono: true },
                ]}
              />

              <div style={{ height: 16 }} />

              <CanvasField
                theme={th}
                label="availableActions"
                hint="畫面上的 CTA 從 backend action descriptors 讀取；缺資料時才用 contract-safe fallback。"
              >
                <div style={chipRowStyle}>
                  {pageActions.map((action) => (
                    <CanvasPill
                      key={action.action}
                      theme={th}
                      tone={
                        !action.enabled
                          ? "neutral"
                          : action.riskLevel === "high"
                            ? "warn"
                            : action.riskLevel === "medium"
                              ? "accent"
                              : "info"
                      }
                    >
                      {describeActionLabel(action.action)}
                    </CanvasPill>
                  ))}
                </div>
              </CanvasField>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Sitemap"
              subtitle="entry / exits per packet §5.5"
            >
              <div style={infoStackStyle}>
                <Link href="/" style={linkItemStyle}>
                  <span>Tenant dashboard</span>
                  <span style={subtleMonoStyle}>entry</span>
                </Link>
                <Link href="/bookings/new" style={linkItemStyle}>
                  <span>New booking with prefill</span>
                  <span style={subtleMonoStyle}>exit</span>
                </Link>
                <Link href="/addresses" style={linkItemStyle}>
                  <span>Address book</span>
                  <span style={subtleMonoStyle}>adjacent</span>
                </Link>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Duplicate-name warning"
              subtitle="backend-detected or local fallback grouping"
            >
              {duplicateWarnings.length > 0 ? (
                <div style={warningListStyle}>
                  {duplicateWarnings.map((warning) => (
                    <div key={warning.key} style={warningItemStyle}>
                      <div style={{ color: th.text, fontWeight: 600 }}>
                        {warning.label}
                      </div>
                      <div style={subtleMonoStyle}>
                        {warning.passengerIds.join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyBodyStyle}>
                  目前未發現 duplicate-name warning。
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Deep links"
              subtitle="cross-app and support links"
            >
              {allSupportLinks.length > 0 ? (
                <div style={linkListStyle}>
                  {allSupportLinks.map((link) => (
                    <Link
                      key={`${link.targetApp}-${link.resourceId}-${link.route}`}
                      href={link.route}
                      target={
                        link.openMode === "new_tab" ? "_blank" : undefined
                      }
                      rel={
                        link.openMode === "new_tab"
                          ? "noreferrer noopener"
                          : undefined
                      }
                      style={linkItemStyle}
                    >
                      <span>{link.label}</span>
                      <span style={subtleMonoStyle}>{link.targetApp}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div style={emptyBodyStyle}>
                  目前 passenger directory 沒有 backend 發出的 cross-app deep
                  links。
                </div>
              )}
            </CanvasCard>

            {disabledActionLinks.length > 0 ? (
              <CanvasCard
                theme={th}
                title="Disabled actions"
                subtitle="descriptor reasons"
              >
                <div style={warningListStyle}>
                  {disabledActionLinks.map((link, index) => (
                    <div key={`${link.key}-${index}`} style={warningItemStyle}>
                      <div style={{ color: th.text, fontWeight: 600 }}>
                        {link.label}
                      </div>
                      <div style={emptyBodyStyle}>
                        {formatDisabledReason(link.disabledReasonCode) ??
                          "action currently disabled"}
                      </div>
                    </div>
                  ))}
                </div>
              </CanvasCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildSearchParams(
  selectedTab: PassengerTabKey,
  selectedStatus: PassengerStatusFilter,
) {
  const params = new URLSearchParams();
  if (selectedTab !== "all") {
    params.set("tab", selectedTab);
  }
  if (selectedStatus !== "all") {
    params.set("status", selectedStatus);
  }
  return params;
}
