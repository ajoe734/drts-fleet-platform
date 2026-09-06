import Link from "next/link";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadDashboard } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice, SvcChip } from "@/lib/fleet-portal-ui";
import { RecentTripsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetPortalIndex({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const dashboard = await loadDashboard(params.period);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
        actions={
          <>
            <a
              href={`/trips/export?type=summary${params.period ? `&period=${params.period}` : ""}`}
              download
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={theme} icon="export">
                {t("common.export", locale)}
              </CanvasBtn>
            </a>
            <Link href="/supply/drivers/new" style={{ textDecoration: "none" }}>
              <CanvasBtn theme={theme} variant="primary" icon="users">
                {t("dashboard.recruit", locale)}
              </CanvasBtn>
            </Link>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: theme.textMuted,
            fontFamily: theme.monoFamily,
          }}
        >
          <span>
            {t("revenue.period", locale)}: {dashboard.periodMonth}
          </span>
          <span>
            {t("shell.api.lastChecked", locale)}:{" "}
            {dashboard.dataTimestamp.slice(0, 19).replace("T", " ")}
          </span>
        </div>

        {dashboard.error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("shell.api.down", locale)}
            body={dashboard.error}
          />
        ) : null}

        {!dashboard.error && dashboard.source === "fallback" ? (
          <DataSourceNotice
            theme={theme}
            source={dashboard.source}
            body={t("data.fixtureNotice", locale)}
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.driverCount", locale)}
            value={dashboard.driverCount}
            sub={t("dashboard.driverSub", locale, {
              online: dashboard.driverStatusSummary.online,
              offline: dashboard.driverStatusSummary.offline,
            })}
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.dispatchable", locale)}
            value={dashboard.dispatchable}
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.completedTrips", locale)}
            value={dashboard.completedTrips}
            deltaTone="up"
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.share", locale)}
            value={dashboard.share}
            delta={t("dashboard.kpi.sharePending", locale)}
            deltaTone="neutral"
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.grossRevenue", locale)}
            value={dashboard.grossRevenue}
            sub={t("dashboard.kpi.grossRevenueSub", locale)}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.missingDocs", locale)}
            value={dashboard.supplemental.missingDocsDrivers}
            delta={t("dashboard.kpi.missingDocsDelta", locale)}
            deltaTone="down"
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.openCases", locale)}
            value={dashboard.supplemental.openCases}
            sub={t("case.status.pending", locale)}
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.trainingCompletion", locale)}
            value={dashboard.supplemental.trainingCompletion}
            sub={t("training.status.pending", locale)}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          <CanvasCard
            theme={theme}
            title={t("dashboard.attention", locale)}
            subtitle={t("dashboard.attentionSub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dashboard.attention.length > 0 ? (
                dashboard.attention.map((banner) => (
                  <CanvasBanner
                    key={banner.titleKey}
                    theme={theme}
                    tone={banner.tone}
                    icon="warn"
                    title={t(banner.titleKey, locale)}
                    body={t(banner.bodyKey, locale)}
                  />
                ))
              ) : (
                <div
                  style={{
                    padding: "16px 8px",
                    color: theme.textMuted,
                    fontSize: 12.5,
                  }}
                >
                  {t("supply.empty.none", locale)}
                </div>
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("dashboard.supply", locale)}
            subtitle={t("dashboard.supplySub", locale)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dashboard.supply.map((r) => (
                <div
                  key={r.svc}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ width: 84 }}>
                    <SvcChip theme={theme} locale={locale} svc={r.svc} />
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
            <Link href="/trips" style={{ textDecoration: "none" }}>
              <CanvasBtn theme={theme} variant="ghost">
                {t("dashboard.gotoTrips", locale)}
              </CanvasBtn>
            </Link>
          }
        >
          {dashboard.recentTrips.length > 0 ? (
            <RecentTripsTable rows={dashboard.recentTrips} />
          ) : (
            <div
              style={{
                padding: "36px 24px",
                textAlign: "center",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("supply.empty.none", locale)}
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
