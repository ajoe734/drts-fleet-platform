import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

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

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const tabBadgeStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: th.textMuted,
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 999,
  padding: "0 6px",
  lineHeight: "16px",
  minWidth: 16,
  textAlign: "center",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const bookLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 24,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 500,
  textDecoration: "none",
  lineHeight: 1,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "40px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 14,
  fontWeight: 600,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  maxWidth: 460,
  lineHeight: 1.5,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

type PassengerTabKey = "all" | "employee" | "visitor" | "disabled";

type PassengerRow = TenantPassengerRecord &
  Record<string, unknown> & {
    stateLabel: string;
    stateTone: CanvasTone;
  };

type PassengerPageData = {
  passengers: TenantPassengerRecord[];
  errors: string[];
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
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

// Tenant-console surfaces 6 empty reasons (packet §3.6). `driver_not_eligible`
// is driver-app-specific and intentionally excluded here.
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Route-level CTAs come from descriptors, never hard-coded by role (packet §3.5,
// Q-X13). The deactivate / reactivate mutations themselves stay backend-owned
// per Q-TEN06 (soft deactivate, reason required) and are surfaced per row.
const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "import_passengers", enabled: true, riskLevel: "low" },
  { action: "create_passenger", enabled: true, riskLevel: "medium" },
] as const;

const QUALITY_ISSUE_LABELS: Record<TenantPassengerQualityIssue, string> = {
  missing_contact: "缺少聯絡方式",
  missing_employee_no: "缺少員工編號",
  duplicate_employee_no: "重複員工編號",
};

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
  return activeFlag ? "active" : "deactivated";
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

function countTab(passengers: TenantPassengerRecord[], tab: PassengerTabKey) {
  return passengers.reduce(
    (total, passenger) => (matchesTab(passenger, tab) ? total + 1 : total),
    0,
  );
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function classifyErrorReason(errors: string[]): EmptyReason {
  const joined = errors.join(" ").toLowerCase();
  if (/(permission|forbidden|unauthor|403|401)/.test(joined)) {
    return "permission_denied";
  }
  if (/(unavailable|timeout|502|503|504|upstream|gateway)/.test(joined)) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function inferEmptyReason(data: {
  passengers: TenantPassengerRecord[];
  errors: string[];
  hasFilteredTab: boolean;
}): EmptyReason | null {
  if (data.errors.length > 0 && data.passengers.length === 0) {
    return classifyErrorReason(data.errors);
  }
  if (data.passengers.length === 0) {
    return "no_data";
  }
  if (data.hasFilteredTab) {
    return "filtered_empty";
  }
  return null;
}

function getEmptyStateTone(reason: EmptyReason | null): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "not_provisioned":
      return "accent";
    case "filtered_empty":
      return "neutral";
    case "no_data":
    default:
      return "info";
  }
}

function getEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "乘客目錄尚未啟用",
        body: "此租戶尚未開通乘客主檔。完成租戶設定後即可開始維護常用乘客資料。",
      };
    case "fetch_failed":
      return {
        title: "乘客資料載入失敗",
        body: "路由仍可用，但乘客清單讀取失敗。待後端依賴恢復後重試，請勿以假資料填補。",
      };
    case "permission_denied":
      return {
        title: "沒有檢視乘客目錄的權限",
        body: "路由可見，但目前的操作者沒有讀取或維護此租戶乘客資料的權限。",
      };
    case "external_unavailable":
      return {
        title: "相依服務暫時無法使用",
        body: "乘客主檔所需的上游服務目前無法使用或僅回傳過期資料，乘客維護暫時降級。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的乘客",
        body: "此租戶有乘客資料，但目前的分頁沒有符合項目。清除篩選或切換到其他分頁。",
      };
    case "no_data":
    default:
      return {
        title: "尚無乘客資料",
        body: "此租戶的乘客通訊錄是空的。新增第一筆常用乘客，加速後續訂單建立。",
      };
  }
}

function findAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

function getRowActions(
  passenger: TenantPassengerRecord,
): [ResourceActionDescriptor, ResourceActionDescriptor] {
  const editAction: ResourceActionDescriptor = {
    action: "edit_passenger",
    enabled: true,
    riskLevel: "medium",
  };
  const lifecycleAction: ResourceActionDescriptor = passenger.activeFlag
    ? {
        action: "deactivate_passenger",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      }
    : {
        action: "reactivate_passenger",
        enabled: true,
        riskLevel: "medium",
      };
  return [editAction, lifecycleAction];
}

async function loadPassengersData(): Promise<PassengerPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [passengersResult] = await Promise.allSettled([
    client.listPassengers(),
  ]);

  const passengers =
    passengersResult.status === "fulfilled"
      ? [...passengersResult.value].sort(comparePassengers)
      : [];

  if (passengersResult.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(passengersResult.reason)}`);
  }

  const generatedAt =
    passengers
      .map((passenger) => passenger.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ??
    new Date().toISOString();

  return {
    passengers,
    errors,
    generatedAt,
    refreshTier: "slow",
    availableActions: [...ROUTE_ACTIONS],
  };
}

function toPassengerRow(passenger: TenantPassengerRecord): PassengerRow {
  return {
    ...passenger,
    stateLabel: getStateLabel(passenger.activeFlag),
    stateTone: getStateTone(passenger.activeFlag),
  };
}

function buildTabNodes(
  selectedTab: PassengerTabKey,
  counts: Record<PassengerTabKey, number>,
) {
  const tabs = PASSENGER_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={tab.key === "all" ? "/passengers" : `/passengers?tab=${tab.key}`}
      style={tabLinkStyle}
    >
      <span>{tab.label}</span>
      <span style={tabBadgeStyle}>{counts[tab.key]}</span>
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

function renderRowAction(descriptor: ResourceActionDescriptor, label: string) {
  const button = (
    <CanvasBtn
      theme={th}
      size="xs"
      danger={descriptor.riskLevel === "high"}
      disabled={!descriptor.enabled}
    >
      {label}
    </CanvasBtn>
  );

  if (!descriptor.enabled && descriptor.disabledReasonCode) {
    return <span title={descriptor.disabledReasonCode}>{button}</span>;
  }
  return button;
}

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; emptyReason?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(resolvedSearchParams.tab);
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams.emptyReason,
  );

  const { passengers, errors, generatedAt, refreshTier, availableActions } =
    await loadPassengersData();

  const filteredPassengers = passengers.filter((passenger) =>
    matchesTab(passenger, selectedTab),
  );
  const hasFilteredTab =
    passengers.length > 0 && filteredPassengers.length === 0;

  const emptyReason =
    emptyReasonOverride ??
    inferEmptyReason({ passengers, errors, hasFilteredTab });

  const rows = filteredPassengers.map(toPassengerRow);

  const counts: Record<PassengerTabKey, number> = {
    all: countTab(passengers, "all"),
    employee: countTab(passengers, "employee"),
    visitor: countTab(passengers, "visitor"),
    disabled: countTab(passengers, "disabled"),
  };

  const { tabs, activeTab } = buildTabNodes(selectedTab, counts);

  const importAction = findAction(availableActions, "import_passengers");
  const createAction = findAction(availableActions, "create_passenger");

  const qualityFlaggedCount = passengers.filter(
    (passenger) =>
      passenger.activeFlag && (passenger.qualityIssues?.length ?? 0) > 0,
  ).length;

  const emptyStateCopy = getEmptyStateCopy(emptyReason);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      k: "fullName",
      w: 200,
      r: (row) => (
        <div style={nameCellStyle}>
          <span style={primaryCellStyle}>{row.fullName}</span>
          {row.qualityIssues && row.qualityIssues.length > 0
            ? row.qualityIssues.map((issue) => (
                <CanvasPill key={issue} theme={th} tone="warn">
                  {QUALITY_ISSUE_LABELS[issue]}
                </CanvasPill>
              ))
            : null}
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
      w: 100,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => {
        const [editAction, lifecycleAction] = getRowActions(row);
        return (
          <div style={rowActionsStyle}>
            {row.activeFlag ? (
              <Link
                href={`/bookings/new?passengerId=${encodeURIComponent(row.passengerId)}`}
                style={bookLinkStyle}
              >
                預約
              </Link>
            ) : null}
            {renderRowAction(editAction, "編輯")}
            {renderRowAction(
              lifecycleAction,
              row.activeFlag ? "軟停用" : "啟用",
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本 · 軟停用 only (Q-TEN06)"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="ext"
              size="sm"
              disabled={importAction?.enabled === false}
            >
              CSV 匯入
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              disabled={createAction?.enabled === false}
            >
              新增
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title="更新頻率 T5 · 租戶慢速（每 30 秒）"
          body={`此頁採 tenant-slow ${refreshTier} 節奏更新；快照載入時間 ${formatDateTime(generatedAt)}。`}
        />

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分乘客資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {qualityFlaggedCount > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={`偵測到 ${qualityFlaggedCount} 筆乘客資料品質問題`}
            body="後端標記的重複員工編號或缺漏聯絡方式會逐列顯示於 QUALITY 欄，請於建立訂單前修正。"
          />
        ) : null}

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {rows.length > 0 ? (
            <CanvasTable<PassengerRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div style={emptyStateWrapStyle}>
              <CanvasPill theme={th} tone={getEmptyStateTone(emptyReason)} dot>
                {emptyReason ?? "no_data"}
              </CanvasPill>
              <div style={emptyTitleStyle}>{emptyStateCopy.title}</div>
              <div style={emptyBodyStyle}>{emptyStateCopy.body}</div>
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
