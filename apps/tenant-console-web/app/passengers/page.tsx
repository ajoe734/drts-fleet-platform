import Link from "next/link";
import type { CSSProperties } from "react";
import type { TenantPassengerRecord } from "@drts/contracts";
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
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
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

async function loadPassengersData(): Promise<PassengerPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [passengersResult] = await Promise.allSettled([
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);

  const passengers =
    passengersResult.status === "fulfilled"
      ? [...passengersResult.value].sort(comparePassengers)
      : [];

  if (passengersResult.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(passengersResult.reason)}`);
  }

  return { passengers, errors };
}

function toPassengerRow(passenger: TenantPassengerRecord): PassengerRow {
  return {
    ...passenger,
    stateLabel: getStateLabel(passenger.activeFlag),
    stateTone: getStateTone(passenger.activeFlag),
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

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(resolvedSearchParams.tab);
  const { passengers, errors } = await loadPassengersData();
  const rows = passengers
    .filter((passenger) => matchesTab(passenger, selectedTab))
    .map(toPassengerRow);
  const { tabs, activeTab } = buildTabNodes(selectedTab);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      k: "fullName",
      w: 160,
      r: (row) => <span style={primaryCellStyle}>{row.fullName}</span>,
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
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本"
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              CSV 匯入
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
              新增
            </CanvasBtn>
          </>
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

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {rows.length > 0 ? (
            <CanvasTable<PassengerRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div style={emptyStateStyle}>目前沒有符合篩選條件的乘客資料。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
