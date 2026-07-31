import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  loadReferralDashboard,
  loadReferralRevenue,
} from "@/lib/channel-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import {
  formatReferralPortalEvidence,
  mergeReferralPortalEvidence,
} from "@/lib/referral-portal-evidence";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

function toNumber(value: string): number {
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function deltaOf(
  cur: number,
  prev: number,
): { text: string; tone: "up" | "down" | "neutral" } | null {
  if (!prev) {
    return null;
  }
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  if (pct === 0) {
    return { text: "0%", tone: "neutral" };
  }
  const arrow = pct > 0 ? "↑" : "↓";
  return {
    text: `${arrow} ${Math.abs(pct).toFixed(1)}%`,
    tone: pct > 0 ? "up" : "down",
  };
}

export default async function ReferralDashboardPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const [dashboard, revenue] = await Promise.all([
    loadReferralDashboard(),
    loadReferralRevenue(),
  ]);
  const combinedEvidence = mergeReferralPortalEvidence(
    {
      ...dashboard.evidence,
      sourceDetails: { dashboard: dashboard.source },
    },
    {
      ...revenue.evidence,
      sourceDetails: { revenue: revenue.source },
    },
  );
  const evidenceMarker = formatReferralPortalEvidence(combinedEvidence);
  const { summary, periods } = dashboard;
  const latestRevenue = revenue.rows[0] ?? null;
  const statementStatus =
    latestRevenue?.statementStatus ?? summary.statementStatus;
  const statementTone =
    statementStatus === "paid"
      ? "success"
      : statementStatus === "published"
        ? "info"
        : "warn";

  // periods arrive newest-first; the trend chart reads oldest → newest.
  const trend = [...periods]
    .slice(0, 5)
    .reverse()
    .map((p) => ({
      label: p.period.slice(-2),
      trips: toNumber(p.trips),
      users: toNumber(p.activeUsers),
    }));
  const maxTrips = Math.max(1, ...trend.map((d) => d.trips));
  const cur = periods[0];
  const prev = periods[1];
  const usersDelta =
    cur && prev
      ? deltaOf(toNumber(cur.activeUsers), toNumber(prev.activeUsers))
      : null;
  const tripsDelta =
    cur && prev ? deltaOf(toNumber(cur.trips), toNumber(prev.trips)) : null;
  const gmvDelta =
    cur && prev ? deltaOf(toNumber(cur.gmv), toNumber(prev.gmv)) : null;

  const headerActions = (
    <>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: "5px 10px",
          background: theme.surface,
          fontFamily: theme.monoFamily,
          fontSize: 12.5,
          fontWeight: 600,
          color: theme.text,
        }}
      >
        {summary.period}
        <CanvasIcon name="chevD" size={12} style={{ color: theme.textDim }} />
      </span>
      <CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>
    </>
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("referral.dashboard.title", locale)}
        subtitle={t("referral.dashboard.subtitle", locale)}
        actions={headerActions}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <span hidden>{evidenceMarker}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CanvasPill theme={theme} tone="info" dot>
            {t("referral.dashboard.flowPartner", locale)}
          </CanvasPill>
          <CanvasPill theme={theme} tone="accent">
            {t("referral.dashboard.kpi.shareDelta", locale)}
          </CanvasPill>
        </div>
        <DataSourceNotice
          theme={theme}
          source={combinedEvidence.source}
          body={t("data.fixtureNotice", locale)}
          evidenceMarker={evidenceMarker}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.activeUsers", locale)}
            value={summary.activeUsers}
            delta={usersDelta?.text}
            deltaTone={usersDelta?.tone ?? "neutral"}
            sub={t("referral.dashboard.kpi.activeUsersSub", locale)}
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.trips", locale)}
            value={summary.trips}
            delta={tripsDelta?.text}
            deltaTone={tripsDelta?.tone ?? "neutral"}
            sub={
              prev
                ? t("referral.dashboard.kpi.vsPrev", locale, {
                    value: prev.trips,
                  })
                : undefined
            }
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.gmv", locale)}
            value={summary.gmv}
            delta={gmvDelta?.text}
            deltaTone={gmvDelta?.tone ?? "neutral"}
          />
          <CanvasKPI
            theme={theme}
            label={t("referral.dashboard.kpi.share", locale)}
            value={summary.estimatedShare}
            delta={t("referral.dashboard.kpi.shareDelta", locale)}
            deltaTone="neutral"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
            gap: 16,
          }}
        >
          <CanvasCard
            theme={theme}
            title={t("referral.dashboard.trend", locale)}
            subtitle={t("referral.dashboard.trendSub", locale)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 18,
                height: 180,
                padding: "8px 4px 0",
              }}
            >
              {trend.map((d) => (
                <div
                  key={d.label}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "flex-end",
                      gap: 5,
                      height: 140,
                    }}
                  >
                    <div
                      title={`${t("referral.dashboard.kpi.trips", locale)} ${d.trips}`}
                      style={{
                        width: 18,
                        height: `${(d.trips / maxTrips) * 130}px`,
                        background: theme.accent,
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                    <div
                      title={`${t("referral.dashboard.kpi.activeUsers", locale)} ${d.users}`}
                      style={{
                        width: 18,
                        height: `${(d.users / maxTrips) * 130}px`,
                        background: theme.accentBg,
                        border: `1px solid ${theme.accentBorder}`,
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 11,
                      color: theme.textMuted,
                    }}
                  >
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${theme.border}`,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: theme.accent,
                  }}
                />
                {t("referral.dashboard.kpi.trips", locale)}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: theme.accentBg,
                    border: `1px solid ${theme.accentBorder}`,
                  }}
                />
                {t("referral.dashboard.kpi.activeUsers", locale)}
              </span>
            </div>
          </CanvasCard>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title={t("referral.dashboard.direction", locale)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  padding: "10px 0 14px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: theme.text }}
                  >
                    {t("referral.dashboard.flowPlatform", locale)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textDim }}>
                    {t("referral.dashboard.flowPlatformSub", locale)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    color: theme.accent,
                  }}
                >
                  <span
                    style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}
                  >
                    {t("referral.dashboard.flowReceivable", locale)}
                  </span>
                  <CanvasIcon name="arrow" size={20} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: theme.text }}
                  >
                    {t("referral.dashboard.flowPartner", locale)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textDim }}>
                    {t("referral.dashboard.flowPartnerSub", locale)}
                  </div>
                </div>
              </div>
              <CanvasBanner
                theme={theme}
                tone="info"
                icon={null}
                body={t("referral.dashboard.directionBody", locale)}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("referral.dashboard.currentStatement", locale)}
            >
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: t("table.period", locale),
                    v: summary.period,
                    mono: true,
                  },
                  {
                    k: t("referral.dashboard.status", locale),
                    v: (
                      <CanvasPill theme={theme} tone={statementTone} dot>
                        {t(
                          `referral.statement.status.${statementStatus}`,
                          locale,
                        )}
                      </CanvasPill>
                    ),
                  },
                  {
                    k: t("referral.dashboard.kpi.trips", locale),
                    v: summary.trips,
                    mono: true,
                  },
                  {
                    k: t("referral.statements.share", locale),
                    v: summary.estimatedShare,
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
