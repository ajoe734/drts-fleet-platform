import Link from "next/link";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
import { loadBankContractsData } from "@/lib/bank-dev-read-models";
import {
  ContractHealthBadge,
  IssuerBrandPill,
  ReadOnlyPanel,
} from "@/components/contracts-ui";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { bankConsoleHref, getBankConsoleSession } from "@/lib/session";
import { tenantDisplayText } from "@/lib/tenant-display";
import {
  countOpenExceptions,
  formatPercent,
  formatPeriod,
} from "@/lib/contracts-data";
import { t } from "@/lib/translations";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const session = getBankConsoleSession(
    tenant,
    locale,
    resolvedSearchParams.role,
  );
  const contractData = await loadBankContractsData(tenant.tenantId, session.role);
  const contracts = contractData.data.contracts;
  const healthyCount = contracts.filter(
    (record) => record.status === "active",
  ).length;
  const atRiskCount = contracts.filter(
    (record) => record.status === "at_risk",
  ).length;
  const breachedCount = contracts.filter(
    (record) => record.status === "breached",
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("contracts.eyebrow", locale)}
        title={
          <span className="pending-title">
            {t("contracts.title", locale)}
            <IssuerBrandPill locale={locale} tenant={tenant} />
          </span>
        }
        description={t("contracts.purpose", locale)}
      />

      <ReadOnlyPanel
        title={t("contracts.summaryTitle", locale)}
        description={t("contracts.summaryLead", locale)}
        locale={locale}
      />
      {contractData.degradedMessage ? (
        <section className="surface-card">
          <p>{contractData.degradedMessage}</p>
        </section>
      ) : null}

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("contracts.readOnly", locale)}
          title={t("contracts.summaryHealthy", locale)}
          description={`${healthyCount} / ${contracts.length}`}
        />
        <SurfaceCard
          kicker={t("contracts.readOnly", locale)}
          title={t("contracts.summaryAtRisk", locale)}
          description={`${atRiskCount} / ${contracts.length}`}
        />
        <SurfaceCard
          kicker={t("contracts.readOnly", locale)}
          title={t("contracts.summaryBreached", locale)}
          description={`${breachedCount} / ${contracts.length}`}
        />
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("contracts.summaryTitle", locale)}</h2>
          <span className="status-chip">{t("contracts.readOnly", locale)}</span>
        </div>

        <div className="contracts-table-scroll">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>{t("contracts.table.program", locale)}</th>
                <th>{t("contracts.table.period", locale)}</th>
                <th>{t("contracts.table.status", locale)}</th>
                <th>{t("contracts.table.targets", locale)}</th>
                <th>{t("contracts.table.attainment", locale)}</th>
                <th>{t("contracts.table.exceptions", locale)}</th>
                <th>{t("contracts.table.summary", locale)}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    {locale === "zh" ? "目前無合約資料" : "No contracts available"}
                  </td>
                </tr>
              ) : (
                contracts.map((record) => {
                  const openExceptions = countOpenExceptions(record.exceptions);

                  return (
                    <tr key={record.contractId}>
                      <td>
                        <div className="contracts-cell-stack">
                          <strong>
                            {tenantDisplayText(record.displayName, tenant)}
                          </strong>
                          <span>
                            {tenantDisplayText(record.programCode, tenant)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="contracts-cell-stack">
                          <strong>
                            {formatPeriod(record.periodAttainment?.period ?? "")}
                          </strong>
                          <span>
                            {record.term?.startsAt
                              ? record.term.startsAt.slice(0, 10)
                              : "—"}{" "}
                            -{" "}
                            {record.term?.endsAt
                              ? record.term.endsAt.slice(0, 10)
                              : t("contracts.detail.ongoing", locale)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <ContractHealthBadge
                          health={
                            record.status === "active"
                              ? "healthy"
                              : record.status === "at_risk"
                                ? "at_risk"
                                : "breached"
                          }
                          locale={locale}
                        />
                      </td>
                      <td>
                        <div className="contracts-cell-stack">
                          {(record.slaTargets ?? []).map((target) => (
                            <span key={target.metric}>
                              {t(`contracts.metric.${target.metric}`, locale)}{" "}
                              <strong>{target.thresholdPercent}%</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="contracts-cell-stack">
                          <span>
                            {t("contracts.metric.pickup_punctuality", locale)}{" "}
                            <strong>
                              {formatPercent(
                                record.periodAttainment?.pickupPunctualityPercent,
                              )}
                            </strong>
                          </span>
                          <span>
                            {t("contracts.metric.completion_rate", locale)}{" "}
                            <strong>
                              {formatPercent(
                                record.periodAttainment?.completionRatePercent,
                              )}
                            </strong>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="contracts-cell-stack">
                          <strong>{openExceptions}</strong>
                          <span>
                            {(record.exceptions ?? []).length}{" "}
                            {t("contracts.detail.total", locale)}
                          </span>
                        </div>
                      </td>
                      <td className="contracts-summary-cell">
                        {tenantDisplayText(
                          `${openExceptions} open exceptions · ${record.periodAttainment?.completedTrips ?? 0}/${record.periodAttainment?.totalTrips ?? 0} trips completed`,
                          tenant,
                        )}
                      </td>
                      <td>
                        <Link
                          className="inline-link-button"
                          href={bankConsoleHref(
                            `/contracts/${record.contractId}`,
                            tenant,
                            locale,
                            session.role,
                          )}
                        >
                          {t("contracts.table.view", locale)}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
