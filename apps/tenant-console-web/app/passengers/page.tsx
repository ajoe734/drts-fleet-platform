import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { TenantPassengerRecord } from "@drts/contracts";
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
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const rosterCardStyle: CSSProperties = {
  flex: "1.55 1 760px",
  minWidth: 0,
};

const sideRailStyle: CSSProperties = {
  flex: "1 1 320px",
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

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const tableCardStyle: CSSProperties = {
  overflow: "hidden",
};

const inlineListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.45,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
};

const monoMutedStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.textDim,
  fontSize: 11,
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
  const { tabs, activeTab } = buildTabNodes(selectedTab);
  const employeeCount = passengers.filter(isEmployeePassenger).length;
  const visitorCount = passengers.length - employeeCount;
  const activeCount = passengers.filter(
    (passenger) => passenger.activeFlag,
  ).length;
  const disabledCount = passengers.length - activeCount;
  const consentTrackedCount = passengers.filter(
    (passenger) => typeof passenger.metadata?.consentVersion === "string",
  ).length;
  const dataIssueCount = passengers.filter(
    (passenger) => (passenger.qualityIssues?.length ?? 0) > 0,
  ).length;
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
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={th}
        title="乘客通訊錄"
        subtitle="員工 · 訪客 · 啟用狀態 · 同意書版本"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext">
              CSV 匯入
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" icon="plus">
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

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Passengers"
            value={formatCount(passengers.length)}
            sub={`${selectedTabLabel} ${formatCount(filteredRows.length)} 筆`}
          />
          <CanvasKPI
            theme={th}
            label="Employees"
            value={formatCount(employeeCount)}
            sub={`${formatCount(visitorCount)} visitors`}
          />
          <CanvasKPI
            theme={th}
            label="Active"
            value={formatCount(activeCount)}
            sub={
              disabledCount > 0
                ? `${formatCount(disabledCount)} disabled`
                : "directory online"
            }
          />
          <CanvasKPI
            theme={th}
            label="Consent"
            value={formatCount(consentTrackedCount)}
            sub={
              dataIssueCount > 0
                ? `${formatCount(dataIssueCount)} issues flagged`
                : "metadata tracked"
            }
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="Passengers Table"
            subtitle={`目前分頁：${selectedTabLabel} · 最後同步 ${formatUpdated(latestUpdated)}`}
            padding={0}
            style={{ ...tableCardStyle, ...rosterCardStyle }}
          >
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
              subtitle="批次建立或更新乘客主檔"
            >
              <CanvasField
                theme={th}
                label="匯入模板"
                hint="建議欄位：fullName、employeeNo、departmentName、mobile、email、roles、activeFlag。"
              >
                <div style={helperTextStyle}>
                  以員編或 email 當作 match key，未提供值時保留既有欄位。
                </div>
              </CanvasField>

              <CanvasField
                theme={th}
                label="前置檢查"
                hint="匯入前先確認停用名單與 consent metadata 是否一併補齊。"
              >
                <ul style={inlineListStyle}>
                  <li>員工與訪客請分批上傳，便於 tab 驗證。</li>
                  <li>停用乘客請顯式帶入 `activeFlag=false`。</li>
                  <li>若有同意書版本，寫入 `metadata.consentVersion`。</li>
                </ul>
              </CanvasField>

              <div style={monoMutedStyle}>
                action: CSV import button reserved for follow-up wiring
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="資料摘要"
              subtitle="對齊畫板中的名錄狀態資訊"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "全部", v: formatCount(passengers.length), mono: true },
                  { k: "員工", v: formatCount(employeeCount), mono: true },
                  { k: "訪客", v: formatCount(visitorCount), mono: true },
                  { k: "停用", v: formatCount(disabledCount), mono: true },
                  {
                    k: "Consent",
                    v: `${formatCount(consentTrackedCount)} tracked`,
                    mono: true,
                  },
                  {
                    k: "Issues",
                    v: `${formatCount(dataIssueCount)} flagged`,
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
