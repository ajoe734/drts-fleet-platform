import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ActionRiskLevel,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
// `CanvasIconName` is only surfaced on the canvas-primitives subpath (the main
// barrel re-exports the `CanvasIcon` component but not its icon-name union), so
// pull the type from the declared public subpath rather than widening another
// lane's ui-web barrel.
import type { CanvasIconName } from "@drts/ui-web/canvas-primitives";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// ─────────────────────────────────────────────────────────────────────────────
// Refresh tier (packet §3.2 / Q-X01-02). `/passengers` is T5 "Tenant slow"
// (30s cadence). RefreshTier enum names the cadence; "slow" === 30s.
// ─────────────────────────────────────────────────────────────────────────────
const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};
const REFRESH_TIER_BADGE = "T5";

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const refreshBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 14px",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 9,
};

const refreshMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  fontSize: 11.5,
  color: th.textMuted,
};

const filterFormStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const filterControlStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const filterLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: th.textDim,
  textTransform: "uppercase",
};

const fieldBoxStyle: CSSProperties = {
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  minWidth: 150,
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "40px 24px",
  textAlign: "center",
};

const emptyIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 13.5,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 420,
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter + tab model (packet §5.5: filter by active/inactive + department;
// search by name / employee no / mobile). Canvas tabs stay the primary visual.
// ─────────────────────────────────────────────────────────────────────────────
type PassengerTabKey = "all" | "employee" | "visitor" | "disabled";

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

type PassengerFilters = {
  tab: PassengerTabKey;
  search: string;
  department: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// EmptyReason copy (packet §3.6 — 6 tenant-relevant reasons rendered
// distinctly; `driver_not_eligible` is driver-app-only).
// ─────────────────────────────────────────────────────────────────────────────
type PassengerEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyReasonCopy = {
  icon: CanvasIconName;
  tone: CanvasTone;
  title: string;
  body: string;
};

const EMPTY_REASON_COPY: Record<PassengerEmptyReason, EmptyReasonCopy> = {
  no_data: {
    icon: "passengers",
    tone: "neutral",
    title: "尚無乘客資料",
    body: "此租戶目前沒有任何乘客紀錄。新增常用乘客即可在建立預約時快速帶入。",
  },
  filtered_empty: {
    icon: "filter",
    tone: "info",
    title: "沒有符合篩選條件的乘客",
    body: "目前的分頁、部門或搜尋條件沒有對應的乘客。請調整或清除篩選條件。",
  },
  not_provisioned: {
    icon: "warn",
    tone: "warn",
    title: "乘客目錄尚未開通",
    body: "此租戶的乘客主檔模組尚未設定。請聯絡管理員完成租戶開通後再試。",
  },
  permission_denied: {
    icon: "x",
    tone: "warn",
    title: "沒有檢視權限",
    body: "您目前的角色無法檢視乘客目錄。如需存取，請向租戶管理員申請權限。",
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    title: "乘客資料載入失敗",
    body: "讀取乘客目錄時發生錯誤。請使用上方的重新整理再試一次；若持續發生請通報維運。",
  },
  external_unavailable: {
    icon: "warn",
    tone: "danger",
    title: "後端暫時無法服務",
    body: "乘客目錄服務暫時無法回應（上游或相依服務異常）。稍候再以重新整理重試。",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Quality-issue copy (packet §5.5 state variant: duplicate-name / data-quality
// warnings when the backend detects them).
// ─────────────────────────────────────────────────────────────────────────────
const QUALITY_ISSUE_COPY: Record<TenantPassengerQualityIssue, string> = {
  missing_contact: "缺少聯絡方式",
  missing_employee_no: "缺少員工編號",
  duplicate_employee_no: "員工編號重複",
};

// ─────────────────────────────────────────────────────────────────────────────
// availableActions → CTA mapping (packet §3.5 / Q-X13). CTAs are driven by
// `ResourceActionDescriptor[]`, never hard-coded by role. Risk level drives the
// confirmation semantics (§3.4): low = direct, medium = confirm, high =
// confirm + required reason.
// ─────────────────────────────────────────────────────────────────────────────
type PassengerActionCode =
  | "create_passenger"
  | "import_csv"
  | "edit_passenger"
  | "create_booking"
  | "view_bookings"
  | "deactivate_passenger"
  | "reactivate_passenger";

type ActionPresentation = {
  label: string;
  icon: CanvasIconName;
  /** Same-app inter-page deep link (packet §4.2 / §5.5 exits), if navigational. */
  href?: (passengerId: string) => string;
};

const ACTION_PRESENTATION: Record<PassengerActionCode, ActionPresentation> = {
  create_passenger: { label: "新增", icon: "plus" },
  import_csv: { label: "CSV 匯入", icon: "ext" },
  edit_passenger: { label: "編輯", icon: "more" },
  create_booking: {
    label: "建立預約",
    icon: "car",
    href: (id) => `/bookings/new?passengerId=${encodeURIComponent(id)}`,
  },
  view_bookings: {
    label: "訂單",
    icon: "bookings",
    href: (id) => `/bookings?passengerId=${encodeURIComponent(id)}`,
  },
  deactivate_passenger: { label: "停用", icon: "x" },
  reactivate_passenger: { label: "啟用", icon: "check" },
};

const RISK_BADGE: Record<ActionRiskLevel, string> = {
  low: "直接執行",
  medium: "需確認",
  high: "需確認 · 填寫原因",
};

function isKnownAction(action: string): action is PassengerActionCode {
  return action in ACTION_PRESENTATION;
}

/**
 * Fallback CTA set when the backend does not (yet) populate
 * `passenger.availableActions`. Derived from `activeFlag` per Q-TEN06 (soft
 * deactivate; deactivated records are hidden from pickers so no create-booking
 * affordance). This is the documented fallback — backend-supplied descriptors
 * always win.
 */
function defaultRowActions(
  passenger: TenantPassengerRecord,
): ResourceActionDescriptor[] {
  if (passenger.activeFlag) {
    return [
      { action: "edit_passenger", enabled: true, riskLevel: "medium" },
      { action: "create_booking", enabled: true, riskLevel: "medium" },
      { action: "view_bookings", enabled: true, riskLevel: "low" },
      {
        action: "deactivate_passenger",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
    ];
  }
  return [
    { action: "view_bookings", enabled: true, riskLevel: "low" },
    { action: "reactivate_passenger", enabled: true, riskLevel: "medium" },
  ];
}

const COLLECTION_ACTIONS: ResourceActionDescriptor[] = [
  { action: "import_csv", enabled: true, riskLevel: "low" },
  { action: "create_passenger", enabled: true, riskLevel: "medium" },
];

function getRowActions(
  passenger: TenantPassengerRecord,
): ResourceActionDescriptor[] {
  const fromBackend = passenger.availableActions;
  if (fromBackend && fromBackend.length > 0) {
    return fromBackend;
  }
  return defaultRowActions(passenger);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading + EmptyReason classification
// ─────────────────────────────────────────────────────────────────────────────
type PassengerPageData = {
  passengers: TenantPassengerRecord[];
  /** Non-null when the fetch itself failed, classified per packet §3.6. */
  fetchReason: PassengerEmptyReason | null;
  generatedAt: string;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

/**
 * Map a thrown API error onto an EmptyReason. The typed client surfaces HTTP
 * failures as `Error("API error <status>: …")`, so the status code is the
 * honest signal for which empty state to render (vs. inventing an envelope the
 * backend does not emit).
 */
function classifyFetchError(error: unknown): PassengerEmptyReason {
  const message = toErrorMessage(error);
  const matched = message.match(/API error (\d{3})/);
  const status = matched ? Number(matched[1]) : 0;
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404 || status === 501) return "not_provisioned";
  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

async function loadPassengersData(): Promise<PassengerPageData> {
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();
  try {
    const passengers =
      (await client.listPassengers()) as TenantPassengerRecord[];
    return {
      passengers: [...passengers].sort(comparePassengers),
      fetchReason: null,
      generatedAt,
    };
  } catch (error) {
    return {
      passengers: [],
      fetchReason: classifyFetchError(error),
      generatedAt,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Passenger derivations
// ─────────────────────────────────────────────────────────────────────────────
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

function matchesSearch(passenger: TenantPassengerRecord, search: string) {
  if (!search) return true;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [passenger.fullName, passenger.employeeNo, passenger.mobile]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function matchesDepartment(
  passenger: TenantPassengerRecord,
  department: string,
) {
  if (!department) return true;
  return passenger.departmentName === department;
}

function getSelectedTab(rawTab: string | undefined): PassengerTabKey {
  const matched = PASSENGER_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function listDepartments(passengers: TenantPassengerRecord[]): string[] {
  const seen = new Set<string>();
  for (const passenger of passengers) {
    if (passenger.departmentName) {
      seen.add(passenger.departmentName);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Query-string helpers (preserve filters across tabs / refresh)
// ─────────────────────────────────────────────────────────────────────────────
function buildQuery(filters: Partial<PassengerFilters>): string {
  const params = new URLSearchParams();
  if (filters.tab && filters.tab !== "all") params.set("tab", filters.tab);
  if (filters.search) params.set("q", filters.search);
  if (filters.department) params.set("dept", filters.department);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function passengersHref(filters: Partial<PassengerFilters>): string {
  return `/passengers${buildQuery(filters)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentational sub-components (server-rendered — no handlers)
// ─────────────────────────────────────────────────────────────────────────────
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "medium",
});

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCadence(tier: RefreshTier): string {
  const ms = REFRESH_TIER_CADENCE_MS[tier];
  return ms === null ? "手動" : `${Math.round(ms / 1000)} 秒`;
}

function RefreshBar({
  generatedAt,
  refreshHref,
  degraded,
}: {
  generatedAt: string;
  refreshHref: string;
  degraded: boolean;
}) {
  return (
    <div style={refreshBarStyle}>
      <div style={refreshMetaStyle}>
        <CanvasPill theme={th} tone="info">
          {REFRESH_TIER_BADGE} · {REFRESH_TIER}
        </CanvasPill>
        <span>輪詢節奏 {formatCadence(REFRESH_TIER)}</span>
        <span style={{ color: th.textDim }}>·</span>
        <CanvasIcon
          name="clock"
          size={12}
          style={{ color: degraded ? th.warn : th.textDim }}
        />
        <span>
          {degraded ? "資料可能不完整" : "快照時間"}{" "}
          {formatTimestamp(generatedAt)}
        </span>
      </div>
      <Link href={refreshHref} style={tabLinkStyle} prefetch={false}>
        <CanvasBtn theme={th} icon="clock" size="sm">
          重新整理
        </CanvasBtn>
      </Link>
    </div>
  );
}

function ActionCta({
  descriptor,
  passengerId,
}: {
  descriptor: ResourceActionDescriptor;
  passengerId?: string;
}) {
  if (!isKnownAction(descriptor.action)) {
    return null;
  }
  const presentation = ACTION_PRESENTATION[descriptor.action];
  const reasonNote = descriptor.requiresReason ? " · 需填寫原因" : "";
  const title = descriptor.enabled
    ? `${presentation.label}（${RISK_BADGE[descriptor.riskLevel]}${
        descriptor.requiresReason ? "" : reasonNote
      }）`
    : `${presentation.label}（無法操作${
        descriptor.disabledReasonCode
          ? ` · ${descriptor.disabledReasonCode}`
          : ""
      }）`;

  const button = (
    <CanvasBtn
      theme={th}
      icon={presentation.icon}
      size="xs"
      variant={descriptor.riskLevel === "medium" ? "primary" : "secondary"}
      danger={descriptor.riskLevel === "high"}
      disabled={!descriptor.enabled}
      style={{ textDecoration: "none" }}
    >
      {presentation.label}
    </CanvasBtn>
  );

  // Navigational actions become real same-app deep links (packet §4.2 / §5.5).
  if (presentation.href && passengerId && descriptor.enabled) {
    return (
      <Link
        href={presentation.href(passengerId)}
        style={tabLinkStyle}
        title={title}
        prefetch={false}
      >
        {button}
      </Link>
    );
  }

  return <span title={title}>{button}</span>;
}

function PassengerEmptyState({
  reason,
  resetHref,
}: {
  reason: PassengerEmptyReason;
  resetHref?: string;
}) {
  const copy = EMPTY_REASON_COPY[reason];
  return (
    <div style={emptyStateStyle} data-empty-reason={reason}>
      <span
        style={{
          ...emptyIconWrapStyle,
          color:
            copy.tone === "danger"
              ? th.danger
              : copy.tone === "warn"
                ? th.warn
                : th.textMuted,
        }}
      >
        <CanvasIcon name={copy.icon} size={20} />
      </span>
      <span style={emptyTitleStyle}>{copy.title}</span>
      <span style={emptyBodyStyle}>{copy.body}</span>
      <CanvasPill theme={th} tone={copy.tone}>
        {reason}
      </CanvasPill>
      {reason === "filtered_empty" && resetHref ? (
        <Link href={resetHref} style={tabLinkStyle} prefetch={false}>
          <CanvasBtn theme={th} icon="x" size="sm">
            清除篩選
          </CanvasBtn>
        </Link>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
type PassengerRow = TenantPassengerRecord & Record<string, unknown>;

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; q?: string; dept?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const filters: PassengerFilters = {
    tab: getSelectedTab(resolved.tab),
    search: (resolved.q ?? "").trim(),
    department: (resolved.dept ?? "").trim(),
  };

  const { passengers, fetchReason, generatedAt } = await loadPassengersData();
  const departments = listDepartments(passengers);

  const filteredRows = passengers
    .filter((passenger) => matchesTab(passenger, filters.tab))
    .filter((passenger) => matchesSearch(passenger, filters.search))
    .filter((passenger) =>
      matchesDepartment(passenger, filters.department),
    ) as PassengerRow[];

  const hasActiveFilter = Boolean(
    filters.tab !== "all" || filters.search || filters.department,
  );

  // EmptyReason resolution (packet §3.6): fetch failures already classified;
  // otherwise distinguish "no records at all" from "filtered to nothing".
  const tableEmptyReason: PassengerEmptyReason | null = fetchReason
    ? fetchReason
    : passengers.length === 0
      ? "no_data"
      : filteredRows.length === 0
        ? "filtered_empty"
        : null;

  const qualityFlagged = filteredRows.filter(
    (row) => (row.qualityIssues?.length ?? 0) > 0,
  ).length;

  const tabs = PASSENGER_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={passengersHref({
        tab: tab.key,
        search: filters.search,
        department: filters.department,
      })}
      style={tabLinkStyle}
      prefetch={false}
    >
      {tab.label}
    </Link>
  ));
  const activeIndex = PASSENGER_TABS.findIndex(
    (tab) => tab.key === filters.tab,
  );
  const activeTab = tabs[activeIndex] ?? tabs[0];

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      w: 180,
      r: (row) => (
        <span style={nameCellStyle}>
          <span style={primaryCellStyle}>{row.fullName}</span>
          {(row.qualityIssues ?? []).map((issue) => (
            <CanvasPill key={issue} theme={th} tone="warn">
              {QUALITY_ISSUE_COPY[issue]}
            </CanvasPill>
          ))}
        </span>
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
      w: 130,
      r: (row) => row.departmentName ?? "—",
    },
    {
      h: "MOBILE",
      w: 120,
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
      w: 96,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.activeFlag)} dot>
          {getStateLabel(row.activeFlag)}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 280,
      r: (row) => (
        <span style={rowActionsStyle}>
          {getRowActions(row).map((descriptor) => (
            <ActionCta
              key={descriptor.action}
              descriptor={descriptor}
              passengerId={row.passengerId}
            />
          ))}
        </span>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            {COLLECTION_ACTIONS.map((descriptor) => (
              <ActionCta key={descriptor.action} descriptor={descriptor} />
            ))}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <RefreshBar
          generatedAt={generatedAt}
          refreshHref={passengersHref(filters)}
          degraded={fetchReason !== null}
        />

        {fetchReason ? (
          <CanvasBanner
            theme={th}
            tone={fetchReason === "permission_denied" ? "warn" : "danger"}
            icon="warn"
            title={EMPTY_REASON_COPY[fetchReason].title}
            body={EMPTY_REASON_COPY[fetchReason].body}
          />
        ) : null}

        {!fetchReason && qualityFlagged > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分乘客資料需要檢查"
            body={`有 ${qualityFlagged} 筆乘客被後端標記為資料品質問題（如員工編號重複或缺少聯絡方式），請逐筆確認。`}
          />
        ) : null}

        {/* packet §5.5 — filter by department, search by name / employee no /
            mobile. Native GET form: no client JS, filters survive in the URL. */}
        <CanvasCard theme={th}>
          <form method="get" style={filterFormStyle}>
            <input type="hidden" name="tab" value={filters.tab} />
            <label style={filterControlStyle}>
              <span style={filterLabelStyle}>搜尋</span>
              <input
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="姓名 / 員工編號 / 手機"
                style={{ ...fieldBoxStyle, minWidth: 220 }}
              />
            </label>
            <label style={filterControlStyle}>
              <span style={filterLabelStyle}>部門</span>
              <select
                name="dept"
                defaultValue={filters.department}
                style={fieldBoxStyle}
              >
                <option value="">全部部門</option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <CanvasBtn theme={th} variant="primary" icon="search" size="sm">
              套用
            </CanvasBtn>
            {hasActiveFilter ? (
              <Link href="/passengers" style={tabLinkStyle} prefetch={false}>
                <CanvasBtn theme={th} icon="x" size="sm">
                  清除
                </CanvasBtn>
              </Link>
            ) : null}
          </form>
        </CanvasCard>

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {tableEmptyReason ? (
            <PassengerEmptyState
              reason={tableEmptyReason}
              resetHref={passengersHref({ tab: "all" })}
            />
          ) : (
            <CanvasTable<PassengerRow>
              theme={th}
              columns={columns}
              rows={filteredRows}
            />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
