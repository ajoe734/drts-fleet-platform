import {
  CanvasBtn,
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
} from "@drts/ui-web";
import { FleetStatementActions, StatementDecisionNote } from "@/components/fleet-statement-actions";
import { getServerFleetPartnerClient } from "@/lib/api-client.server";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadRevenue, loadStatements } from "@/lib/fleet-portal-data.server";
import { BiLabel, DataSourceNotice } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { resolveStatementBannerState } from "./statement-banner";
import { trRevenue } from "./translations";

export const dynamic = "force-dynamic";

export default async function FleetRevenuePage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const [s, statementsView, { fleetPartnerId }] = await Promise.all([
    loadRevenue(),
    loadStatements(),
    getServerFleetPartnerClient(),
  ]);
  const currentStatement =
    statementsView.rows.find((row) => row.period === s.period) ??
    statementsView.rows[0] ??
    null;
  const bannerState = resolveStatementBannerState(currentStatement);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("revenue.title", locale)}
        subtitle={t("revenue.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme} icon="filter">
              {t("revenue.period", locale)}
            </CanvasBtn>
            <CanvasBtn theme={theme}>
              {t("revenue.exportLines", locale)}
            </CanvasBtn>
          </>
        }
      />
      {s.source === "fallback" && (
        <div style={{ padding: "16px 24px 0" }}>
          <DataSourceNotice
            theme={theme}
            source={s.source}
            body={t("data.fixtureNotice", locale)}
          />
        </div>
      )}
      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <CanvasCard
          theme={theme}
          title={t("revenue.currentPeriod", locale, { period: s.period })}
          subtitle={t("revenue.breakdownSubtitle", locale)}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {s.lines.map((l) => (
              <div
                key={l.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "11px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: 13,
                }}
              >
                <div>
                  <BiLabel
                    theme={theme}
                    locale={locale}
                    zh={t(`revenue.line.${l.key}`, "zh")}
                    en={t(`revenue.line.${l.key}`, "en")}
                  />
                  {l.reimbursement && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: theme.textDim,
                      }}
                    >
                      {t("revenue.lineNote.reimbursement", locale, {
                        amount: l.reimbursement,
                      })}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: theme.monoFamily,
                    fontWeight: 600,
                    color: l.sign === "−" ? theme.danger : theme.text,
                  }}
                >
                  {l.sign === "−" ? "− " : "+ "}
                  {l.v}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 0 2px",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {t("revenue.payable", locale)}
              </span>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontWeight: 700,
                  fontSize: 20,
                  color: theme.accent,
                }}
              >
                {s.payable}
              </span>
            </div>
          </div>
        </CanvasCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CanvasCard theme={theme} title={t("revenue.rules", locale)}>
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                {
                  k: t("revenue.rule.perTripSplit", locale),
                  v: t("revenue.rule.perTripSplitValue", locale),
                  mono: true,
                },
                {
                  k: t("revenue.rule.airportBonus", locale),
                  v: t("revenue.rule.airportBonusValue", locale),
                  mono: true,
                },
                {
                  k: t("revenue.rule.managementFee", locale),
                  v: t("revenue.rule.managementFeeValue", locale),
                  mono: true,
                },
                {
                  k: t("revenue.rule.recruitmentBonus", locale),
                  v: t("revenue.rule.recruitmentBonusValue", locale),
                  mono: true,
                },
                {
                  k: t("revenue.rule.penaltyTrigger", locale),
                  v: t("revenue.rule.penaltyTriggerValue", locale),
                  mono: true,
                },
                {
                  k: t("revenue.rule.version", locale),
                  v: t("revenue.rule.versionValue", locale),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
          <CanvasCard theme={theme} title={t("revenue.actions", locale)}>
            {/* Banner is driven by the same statement record the actions
                panel below uses, so it can never claim "generated, please
                confirm" while also saying "no actionable statement" — the
                exact self-contradiction reported in R13. */}
            {bannerState === "no_statement" ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="notices"
                title={trRevenue("revenue.noStatement.title", locale)}
                body={trRevenue("revenue.noStatement.body", locale, {
                  period: s.period,
                })}
              />
            ) : bannerState === "paid" ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="ok"
                title={trRevenue("revenue.paidStatement.title", locale)}
                body={trRevenue("revenue.paidStatement.body", locale, {
                  period: currentStatement!.period,
                  payable: currentStatement!.payable,
                })}
              />
            ) : (
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title={t("revenue.pendingTitle", locale)}
                body={t("revenue.pendingBody", locale, {
                  period: currentStatement!.period,
                })}
              />
            )}
            {currentStatement ? (
              <div style={{ marginTop: 12 }}>
                <FleetStatementActions
                  fleetPartnerId={fleetPartnerId}
                  statement={currentStatement}
                  size="sm"
                />
                <StatementDecisionNote
                  fleetPartnerId={fleetPartnerId}
                  statementId={currentStatement.id}
                />
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12, color: theme.textDim }}>
                {t("actions.reason.noCurrentStatement", locale)}
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
