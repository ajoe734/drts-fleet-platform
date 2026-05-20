import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { TenantPassengerRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
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

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: 16,
};

const tableCardStyle: CSSProperties = {
  flex: "1.6 1 760px",
  minWidth: 0,
  overflow: "hidden",
};

const sideRailStyle: CSSProperties = {
  flex: "0.95 1 320px",
  minWidth: 0,
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

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: "0 0 14px",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: "grid",
  gap: 6,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.45,
};

const monoMutedStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.textDim,
  fontSize: 11,
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

const numberFormatter = new Intl.NumberFormat("en");
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatUpdated(value: string | null | undefined) {
  const parsed = parseDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : "—";
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
  const passengersResult = await Promise.allSettled([
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);
  const result = passengersResult[0];

  const passengers =
    result.status === "fulfilled"
      ? [...result.value].sort(comparePassengers)
      : [];

  if (result.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(result.reason)}`);
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
  const filteredRows = passengers
    .filter((passenger) => matchesTab(passenger, selectedTab))
    .map(toPassengerRow);
  const employeeCount = passengers.filter(isEmployeePassenger).length;
  const visitorCount = passengers.length - employeeCount;
  const activeCount = passengers.filter(
    (passenger) => passenger.activeFlag,
  ).length;
  const disabledCount = passengers.length - activeCount;
  const latestUpdated = passengers.reduce<string | null>(
    (latest, passenger) => {
      const candidateTime = parseDate(passenger.updatedAt)?.getTime() ?? 0;
      const latestTime = parseDate(latest)?.getTime() ?? 0;
      return candidateTime > latestTime ? passenger.updatedAt : latest;
    },
    null,
  );
  const selectedTabLabel =
    PASSENGER_TABS.find((tab) => tab.key === selectedTab)?.label ?? "全部";
  const { tabs, activeTab } = buildTabNodes(selectedTab);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      k: "fullName",
      w: 180,
      r: (row) => <span style={primaryCellStyle}>{row.fullName}</span>,
    },
    {
      h: "EMP ID",
      w: 104,
      mono: true,
      r: (row) => row.employeeNo ?? "—",
    },
    {
      h: "DEPT",
      w: 148,
      r: (row) => row.departmentName ?? "—",
    },
    {
      h: "MOBILE",
      w: 132,
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
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="乘客"
        subtitle="Tabs · CSV 匯入 · Passengers Table"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            <CanvasBtn theme={th} icon="upload">
              CSV 匯入
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" icon="plus">
              新增乘客
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

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="Passengers Table"
            subtitle={`目前分頁：${selectedTabLabel} · 最後同步 ${formatUpdated(latestUpdated)}`}
            style={tableCardStyle}
            padding={16}
          >
            <div style={pillRowStyle}>
              <CanvasPill theme={th} tone="accent">
                全部 {formatCount(passengers.length)}
              </CanvasPill>
              <CanvasPill theme={th} tone="info">
                員工 {formatCount(employeeCount)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                訪客 {formatCount(visitorCount)}
              </CanvasPill>
              <CanvasPill theme={th} tone="warn">
                停用 {formatCount(disabledCount)}
              </CanvasPill>
              <CanvasPill theme={th} tone="success">
                啟用 {formatCount(activeCount)}
              </CanvasPill>
            </div>

            {filteredRows.length > 0 ? (
              <CanvasTable<PassengerRow>
                theme={th}
                columns={columns}
                rows={filteredRows}
              />
            ) : (
              <div style={emptyStateStyle}>
                目前沒有符合篩選條件的乘客資料。
              </div>
            )}
          </CanvasCard>

          <div style={sideRailStyle}>
            <CanvasCard
              theme={th}
              title="CSV 匯入"
              subtitle="批次建立或更新乘客名錄"
            >
              <CanvasField
                theme={th}
                label="匯入模板"
                hint="欄位對齊畫板：fullName、employeeNo、departmentName、mobile、email、activeFlag。"
              >
                <div style={helperTextStyle}>
                  建議以 `employeeNo` 或 `email` 當作 match
                  key，方便員工與訪客分批維護。
                </div>
              </CanvasField>

              <CanvasField
                theme={th}
                label="上傳前檢查"
                hint="停用清單與訪客資料建議分批匯入，便於 tab 驗證。"
              >
                <ul style={listStyle}>
                  <li>員工主檔優先補齊員編與部門。</li>
                  <li>停用資料請明確帶入 `activeFlag=false`。</li>
                  <li>缺少手機或 email 的列會在表格中顯示為 `—`。</li>
                </ul>
              </CanvasField>

              <div style={monoMutedStyle}>
                action reserved: CSV import wiring remains follow-up work
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="名錄摘要"
              subtitle="對齊 TN_Passengers 的掃描資訊"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "全部", v: formatCount(passengers.length), mono: true },
                  { k: "員工", v: formatCount(employeeCount), mono: true },
                  { k: "訪客", v: formatCount(visitorCount), mono: true },
                  { k: "停用", v: formatCount(disabledCount), mono: true },
                  { k: "啟用", v: formatCount(activeCount), mono: true },
                  {
                    k: "更新時間",
                    v: formatUpdated(latestUpdated),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
