import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  FX_DASHBOARD_SUPPLY,
  FX_FLEET_TRIPS,
  type FleetTrip,
} from "@/lib/fleet-portal-fixtures";
import { SvcChip } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDashboardPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  const tripColumns: CanvasTableColumn<FleetTrip>[] = [
    { h: "ORDER", k: "id", w: 110, mono: true },
    { h: "SERVICE", w: 120, r: (r) => <SvcChip theme={theme} svc={r.svc} /> },
    { h: "DRIVER", k: "driver", w: 100 },
    { h: "TENANT", k: "tenant", w: 130, mono: true },
    { h: "FARE", k: "fare", w: 110, mono: true, align: "right" },
    { h: "車行分潤", k: "commission", w: 110, mono: true, align: "right" },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "completed"
              ? "success"
              : r.status === "cancelled"
                ? "danger"
                : "info"
          }
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>
            <CanvasBtn theme={theme} variant="primary" icon="users">
              {t("dashboard.recruit", locale)}
            </CanvasBtn>
          </>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="warn"
          body={t("data.fixtureNotice", locale)}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label="旗下司機數"
            value="128"
            sub="active 96 · offline 32"
          />
          <CanvasKPI
            theme={theme}
            label="可接單司機"
            value="96"
            delta="↑ 4"
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label="本月完成趟次"
            value="14,280"
            delta="↑ 8.8%"
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label="本月車行分潤"
            value="NT$ 642K"
            delta="待確認"
            deltaTone="neutral"
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label="缺件司機"
            value="7"
            delta="證照 / 保險"
            deltaTone="down"
          />
          <CanvasKPI
            theme={theme}
            label="事故 / 申訴"
            value="3"
            delta="需處理 1"
            deltaTone="down"
          />
          <CanvasKPI theme={theme} label="訓練完成率" value="92%" />
          <CanvasKPI
            theme={theme}
            label="本月總營收"
            value="NT$ 2.14M"
            sub="分潤前"
          />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}
        >
          <CanvasCard
            theme={theme}
            title={t("dashboard.attention", locale)}
            subtitle={t("dashboard.attentionSub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title="吳鎮宇 缺機場接送資格證 · airport_permit missing"
                body="缺件期間無法接機場接送任務。請協助補件。"
              />
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title="cmp_0908 · 司機行為申訴 · 車行責任 · SLA breached"
                body="黃文豪 言語不當申訴升級，責任歸屬車行。需於 24h 內回覆處理方案。"
              />
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title="保險代步流程訓練完成率 55%"
                body="22 / 40 司機完成。未完成者無法接保險代步任務。"
              />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("dashboard.supply", locale)}
            subtitle={t("dashboard.supplySub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FX_DASHBOARD_SUPPLY.map((r) => (
                <div
                  key={r.svc}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ width: 84 }}>
                    <SvcChip theme={theme} svc={r.svc} />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 7,
                      background: theme.surfaceLo,
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${r.pct}%`,
                        height: "100%",
                        background: theme.accent,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 12,
                      width: 34,
                      textAlign: "right",
                    }}
                  >
                    {r.n}
                  </span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={theme}
          title={t("dashboard.recentTrips", locale)}
          padding={0}
          actions={
            <CanvasBtn theme={theme} variant="ghost">
              {t("dashboard.gotoTrips", locale)}
            </CanvasBtn>
          }
        >
          <CanvasTable
            theme={theme}
            columns={tripColumns}
            rows={FX_FLEET_TRIPS.slice(0, 5)}
          />
        </CanvasCard>
      </div>
    </>
  );
}
