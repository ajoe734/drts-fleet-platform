// Earnings tab panel — three distinct, non-interchangeable states per
// host-screen-contract.md §3: `no_record` (no document for the queried
// period at all), `zero` (a real, calculated zero-activity period — not an
// error), and `reported` (real activity; fleetCommission/netEarnings may
// still be null under settlementStatus "pending_policy", rendered as
// "— (pending_policy)", never a fabricated 0 or percentage).

import Link from "next/link";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasPill,
  type CanvasTheme,
} from "@drts/ui-web";
import type { HostVehicleEarningsSummary } from "@drts/contracts";
import { formatHostMoney, formatHostMoneyOrNull } from "@/app/host/lib/host-format";

function shiftMonth(period: string, delta: number): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function MonthNav({
  theme,
  vehicleId,
  period,
}: {
  theme: CanvasTheme;
  vehicleId: string;
  period: string;
}) {
  const linkStyle = {
    fontSize: 11.5,
    fontWeight: 600,
    textDecoration: "none",
    color: theme.text,
    padding: "4px 9px",
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
  } as const;
  const basePath = `/host/vehicles/${encodeURIComponent(vehicleId)}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Link
        href={`${basePath}?tab=earnings&month=${shiftMonth(period, -1)}`}
        style={linkStyle}
      >
        ← 上月
      </Link>
      <span
        style={{
          fontSize: 12.5,
          fontFamily: theme.monoFamily,
          color: theme.text,
          minWidth: 64,
          textAlign: "center",
        }}
      >
        {period}
      </span>
      <Link
        href={`${basePath}?tab=earnings&month=${shiftMonth(period, 1)}`}
        style={linkStyle}
      >
        下月 →
      </Link>
    </div>
  );
}

export function HostEarningsPanel({
  theme,
  vehicleId,
  period,
  variant,
  earnings,
}: {
  theme: CanvasTheme;
  vehicleId: string;
  period: string;
  variant: "no_record" | "zero" | "reported";
  earnings: HostVehicleEarningsSummary | null;
}) {
  if (variant === "no_record" || !earnings) {
    return (
      <CanvasCard theme={theme} title="收益摘要 · Earnings" subtitle={`${period} · 依月結算`}>
        <MonthNav theme={theme} vehicleId={vehicleId} period={period} />
        <CanvasEmptyState
          theme={theme}
          tone="neutral"
          title="尚無收益紀錄"
          body="尚無此月份的收益紀錄。這是合法的空狀態（例如車輛剛掛靠），與「零營收」及「分潤未定」是三種不同情況，不可互相混用。"
        />
      </CanvasCard>
    );
  }

  const e = earnings;
  return (
    <CanvasCard
      theme={theme}
      title="收益摘要 · Earnings"
      subtitle={`${e.period} · 依月結算 · 資料源 ops.phase1_platform_earnings_ledger`}
    >
      <MonthNav theme={theme} vehicleId={vehicleId} period={period} />
      <CanvasDL
        theme={theme}
        cols={3}
        items={[
          { k: "GROSS REVENUE", v: formatHostMoney(e.grossRevenue), mono: true },
          { k: "PLATFORM FEE", v: formatHostMoney(e.platformFee), mono: true },
          {
            k: "FLEET COMMISSION",
            v: formatHostMoneyOrNull(e.fleetCommission) ?? (
              <span style={{ color: theme.textDim }}>— (pending_policy)</span>
            ),
            mono: true,
          },
          {
            k: "NET EARNINGS",
            v: formatHostMoneyOrNull(e.netEarnings) ?? (
              <span style={{ color: theme.textDim }}>— (pending_policy)</span>
            ),
            mono: true,
          },
          { k: "TRIPS COUNT", v: e.tripsCount, mono: true },
          { k: "OPERATING DAYS", v: e.operatingDays, mono: true },
          {
            k: "SETTLEMENT STATUS",
            v: (
              <CanvasPill
                theme={theme}
                tone={e.settlementStatus === "calculated" ? "success" : "warn"}
                dot
              >
                {e.settlementStatus}
              </CanvasPill>
            ),
          },
        ]}
      />
      {e.settlementStatus === "pending_policy" && variant !== "zero" ? (
        <div style={{ marginTop: 12 }}>
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="分潤比例尚未確定 · pending_policy"
            body="平台服務費已計入；惟車行分潤與車主淨收益的拆分比例尚未核定，系統不以假設公式推算或顯示為 0，待分潤政策確定後才會顯示金額。"
          />
        </div>
      ) : null}
      {variant === "zero" ? (
        <div style={{ marginTop: 12 }}>
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="check"
            title="本月零營收 · 合法的零值"
            body="本車本月尚無完成訂單，總車資與趟次皆為 0，這是真實結算結果，不是讀取失敗或無資料 — 與「尚無收益紀錄」是不同狀態。"
          />
        </div>
      ) : null}
    </CanvasCard>
  );
}
