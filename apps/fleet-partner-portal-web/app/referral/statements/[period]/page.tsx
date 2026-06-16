import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadReferralStatementDetail } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { ReferralTripLinesTable } from "@/components/referral-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function ReferralStatementDetailPage({
  params,
}: {
  params: Promise<{ period: string }>;
}) {
  const { period } = await params;
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const detail = await loadReferralStatementDetail(period);
  const statement = detail.statement;
  const statusTone =
    statement?.status === "paid"
      ? "success"
      : statement?.status === "published"
        ? "info"
        : "warn";

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={statement?.id ?? t("referral.statements.noStatement", locale)}
        subtitle={t("referral.statements.detailSubtitle", locale)}
        actions={
          statement ? (
            <>
              <CanvasBtn theme={theme}>
                {t("referral.statements.downloadArtifact", locale)}
              </CanvasBtn>
              <CanvasBtn theme={theme} variant="primary" icon="check">
                {t("referral.statements.confirmReceipt", locale)}
              </CanvasBtn>
            </>
          ) : undefined
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
        <DataSourceNotice
          theme={theme}
          source={detail.source}
          body={t("data.fixtureNotice", locale)}
        />
        {!statement ? (
          <CanvasCard theme={theme}>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="warn"
              body={t("referral.statements.noStatement", locale)}
            />
          </CanvasCard>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <CanvasCard
              theme={theme}
              title={t("referral.statements.tripLines", locale)}
              subtitle={t("referral.statements.tripLinesSub", locale)}
              padding={0}
            >
              <ReferralTripLinesTable rows={statement.lines} />
            </CanvasCard>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={t("referral.statements.periodTotals", locale)}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("table.period", locale),
                      v: statement.period,
                      mono: true,
                    },
                    {
                      k: t("referral.statements.activeUsers", locale),
                      v: statement.activeUsers,
                      mono: true,
                    },
                    {
                      k: t("table.trips", locale),
                      v: statement.trips,
                      mono: true,
                    },
                    {
                      k: t("referral.table.gmv", locale),
                      v: statement.gmv,
                      mono: true,
                    },
                    {
                      k: t("referral.statements.share", locale),
                      v: statement.share,
                      mono: true,
                    },
                    {
                      k: t("referral.statements.direction", locale),
                      v: t("referral.dashboard.kpi.shareDelta", locale),
                    },
                    {
                      k: t("table.status", locale),
                      v: (
                        <CanvasPill theme={theme} tone={statusTone} dot>
                          {t(
                            `referral.statement.status.${statement.status}`,
                            locale,
                          )}
                        </CanvasPill>
                      ),
                    },
                  ]}
                />
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title={t("referral.statements.artifact", locale)}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("referral.table.artifactId", locale),
                      v: statement.artifactId,
                      mono: true,
                    },
                    { k: "SHA-256", v: statement.artifactHash, mono: true },
                    {
                      k: t("table.issued", locale),
                      v: statement.issued,
                      mono: true,
                    },
                  ]}
                />
                <div style={{ marginTop: 12 }}>
                  <CanvasBanner
                    theme={theme}
                    tone="success"
                    icon="check"
                    body={t("referral.statements.artifactBody", locale)}
                  />
                </div>
              </CanvasCard>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
