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

const secondaryCellStyle: CSSProperties = {
  marginTop: 3,
  color: th.textMuted,
  fontSize: 11,
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const tabLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const tabCountStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 18,
  height: 18,
  padding: "0 6px",
  borderRadius: 999,
  background: th.surfaceHi,
  color: th.textMuted,
  fontSize: 10.5,
  fontFamily: th.monoFamily,
};

const cardBodyStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const supportingCopyStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: th.textMuted,
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${th.border}`,
  marginTop: 2,
};

const tableWrapStyle: CSSProperties = {
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

type PassengerStats = {
  total: number;
  active: number;
  disabled: number;
  employees: number;
  visitors: number;
  flagged: number;
  latestUpdatedAt: string | null;
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

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
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

function getPassengerStats(
  passengers: TenantPassengerRecord[],
): PassengerStats {
  return passengers.reduce<PassengerStats>(
    (stats, passenger) => {
      const updatedAt = parseDate(passenger.updatedAt)?.toISOString() ?? null;

      return {
        total: stats.total + 1,
        active: stats.active + (passenger.activeFlag ? 1 : 0),
        disabled: stats.disabled + (passenger.activeFlag ? 0 : 1),
        employees: stats.employees + (isEmployeePassenger(passenger) ? 1 : 0),
        visitors: stats.visitors + (isEmployeePassenger(passenger) ? 0 : 1),
        flagged: stats.flagged + (passenger.qualityIssues?.length ?? 0),
        latestUpdatedAt:
          !updatedAt ||
          (stats.latestUpdatedAt !== null && stats.latestUpdatedAt > updatedAt)
            ? stats.latestUpdatedAt
            : updatedAt,
      };
    },
    {
      total: 0,
      active: 0,
      disabled: 0,
      employees: 0,
      visitors: 0,
      flagged: 0,
      latestUpdatedAt: null,
    },
  );
}

function buildTabCounts(passengers: TenantPassengerRecord[]) {
  return PASSENGER_TABS.reduce<Record<PassengerTabKey, number>>(
    (counts, tab) => ({
      ...counts,
      [tab.key]: passengers.filter((passenger) =>
        matchesTab(passenger, tab.key),
      ).length,
    }),
    {
      all: 0,
      employee: 0,
      visitor: 0,
      disabled: 0,
    },
  );
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
      <span style={tabLabelStyle}>
        <span>{tab.label}</span>
        <span style={tabCountStyle}>{counts[tab.key]}</span>
      </span>
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
  const stats = getPassengerStats(passengers);
  const tabCounts = buildTabCounts(passengers);
  const rows = passengers
    .filter((passenger) => matchesTab(passenger, selectedTab))
    .map(toPassengerRow);
  const { tabs, activeTab } = buildTabNodes(selectedTab, tabCounts);
  const selectedTabLabel =
    PASSENGER_TABS.find((tab) => tab.key === selectedTab)?.label ?? "全部";

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: "NAME",
      k: "fullName",
      w: 160,
      r: (row) => (
        <div>
          <div style={primaryCellStyle}>{row.fullName}</div>
          <div style={secondaryCellStyle}>
            {row.roles && row.roles.length > 0
              ? row.roles.join(" · ")
              : "passenger"}
          </div>
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

        <CanvasCard
          theme={th}
          title="Passengers roster"
          subtitle={`${selectedTabLabel} · ${rows.length} / ${stats.total} records`}
          actions={
            stats.flagged > 0 ? (
              <CanvasPill theme={th} tone="warn" dot>
                {stats.flagged} quality flags
              </CanvasPill>
            ) : (
              <CanvasPill theme={th} tone="success" dot>
                directory healthy
              </CanvasPill>
            )
          }
        >
          <div style={cardBodyStyle}>
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label="Passengers"
                value={stats.total}
                sub={`${rows.length} in current tab`}
              />
              <CanvasKPI
                theme={th}
                label="Employees"
                value={stats.employees}
                sub={`${stats.visitors} visitor / guest`}
              />
              <CanvasKPI
                theme={th}
                label="Active"
                value={stats.active}
                sub={`${stats.disabled} disabled`}
              />
              <CanvasKPI
                theme={th}
                label="Last update"
                value={formatDateTime(stats.latestUpdatedAt)}
                sub="tenant passenger directory"
              />
            </div>

            <div style={detailGridStyle}>
              <div style={fieldStackStyle}>
                <CanvasField
                  theme={th}
                  label="Segment tabs"
                  hint="Canvas tabs are mapped to the published tenant passenger directory only."
                >
                  <div style={pillRowStyle}>
                    {PASSENGER_TABS.map((tab) => (
                      <CanvasPill
                        key={tab.key}
                        theme={th}
                        tone={selectedTab === tab.key ? "info" : "neutral"}
                      >
                        {tab.label} · {tabCounts[tab.key]}
                      </CanvasPill>
                    ))}
                  </div>
                </CanvasField>

                <CanvasField
                  theme={th}
                  label="CSV 匯入"
                  hint="保留 TN_Passengers action 位置，但不擴增未發布的 batch import contract。"
                >
                  <div style={supportingCopyStyle}>
                    目前頁面維持名冊檢視與既有 passenger API 對齊，匯入按鈕僅作
                    canvas parity。
                  </div>
                </CanvasField>
              </div>

              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "Current tab",
                    v: selectedTabLabel,
                  },
                  {
                    k: "Rows shown",
                    v: rows.length,
                    mono: true,
                  },
                  {
                    k: "Active / disabled",
                    v: `${stats.active} / ${stats.disabled}`,
                    mono: true,
                  },
                  {
                    k: "Quality flags",
                    v: stats.flagged,
                    mono: true,
                  },
                  {
                    k: "Latest update",
                    v: formatDateTime(stats.latestUpdatedAt),
                    mono: true,
                  },
                  {
                    k: "Data source",
                    v: "GET /tenant/passengers",
                    mono: true,
                  },
                ]}
              />
            </div>

            <div style={dividerStyle} />

            <div style={tableWrapStyle}>
              {rows.length > 0 ? (
                <CanvasTable<PassengerRow>
                  theme={th}
                  columns={columns}
                  rows={rows}
                />
              ) : (
                <div style={emptyStateStyle}>
                  目前沒有符合篩選條件的乘客資料。
                </div>
              )}
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
