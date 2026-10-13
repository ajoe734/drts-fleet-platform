import {
  CanvasBtn,
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
} from "@drts/ui-web";
import {
  FleetStatementActions,
  StatementDecisionNote,
} from "@/components/fleet-statement-actions";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadRevenue } from "@/lib/fleet-portal-data.server";
import { BiLabel } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { resolveStatementBannerState } from "./statement-banner";
import { trRevenue } from "./translations";

export const dynamic = "force-dynamic";

export default async function FleetRevenuePage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const s = await loadRevenue(params.period);
  const currentStatement = s.statement;
  const bannerState = resolveStatementBannerState(currentStatement);
  const periods = [...new Set([...s.availablePeriods, s.period])].sort((a, b) =>
    b.localeCompare(a),
  );
  const exportAvailable = s.source === "live" && currentStatement !== null;
  const exportUnavailableReason = trRevenue(
    s.error
      ? "revenue.exportUnavailable.readFailed"
      : "revenue.exportUnavailable.noStatement",
    locale,
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("revenue.title", locale)}
        subtitle={t("revenue.subtitle", locale)}
        actions={
          <>
            <form
              action="/revenue"
              method="get"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <label
                htmlFor="revenue-period"
                style={{ fontSize: 12, color: theme.textMuted }}
              >
                {t("revenue.period", locale)}
              </label>
              <select
                id="revenue-period"
                name="period"
                defaultValue={s.period}
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 7,
                  background: theme.bgRaised,
                  color: theme.text,
                  padding: "5px 8px",
                  fontFamily: theme.monoFamily,
                  fontSize: 12,
                }}
              >
                {periods.map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
              <CanvasBtn theme={theme} icon="filter" type="submit">
                {trRevenue("revenue.applyPeriod", locale)}
              </CanvasBtn>
            </form>
            {exportAvailable ? (
              <a
                href={`/statements/export?statementId=${encodeURIComponent(currentStatement.id)}`}
                download
                style={{ textDecoration: "none" }}
              >
                <CanvasBtn theme={theme} icon="export">
                  {t("revenue.exportLines", locale)}
                </CanvasBtn>
              </a>
            ) : (
              <span title={exportUnavailableReason}>
                <CanvasBtn theme={theme} icon="export" disabled>
                  {t("revenue.exportLines", locale)}
                </CanvasBtn>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  {exportUnavailableReason}
                </span>
              </span>
            )}
          </>
        }
      />
      {s.error ? (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={trRevenue("revenue.readFailed.title", locale)}
            body={trRevenue("revenue.readFailed.body", locale, {
              period: s.period,
            })}
            actions={
              <a
                href={`/revenue?period=${encodeURIComponent(s.period)}`}
                style={{ color: theme.accent }}
              >
                {trRevenue("revenue.retry", locale)}
              </a>
            }
          />
        </div>
      ) : null}
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
            {s.error ? (
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                {trRevenue("revenue.actionsUnavailable", locale)}
              </div>
            ) : bannerState === "no_statement" ? (
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
            ) : bannerState === "confirmed" || bannerState === "disputed" ? (
              <CanvasBanner
                theme={theme}
                tone={bannerState === "confirmed" ? "success" : "warn"}
                icon="notices"
                title={t(`statements.request.${bannerState}`, locale)}
                body={trRevenue(
                  `revenue.${bannerState}Statement.body`,
                  locale,
                  {
                    period: currentStatement!.period,
                  },
                )}
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
            {currentStatement && s.fleetPartnerId ? (
              <div style={{ marginTop: 12 }}>
                <FleetStatementActions
                  fleetPartnerId={s.fleetPartnerId}
                  statement={currentStatement}
                  available={s.source === "live"}
                  size="sm"
                />
                <StatementDecisionNote statement={currentStatement} />
              </div>
            ) : !s.error ? (
              <div
                style={{ marginTop: 12, fontSize: 12, color: theme.textDim }}
              >
                {t("actions.reason.noCurrentStatement", locale)}
              </div>
            ) : null}
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
