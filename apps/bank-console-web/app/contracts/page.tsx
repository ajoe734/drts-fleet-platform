import Link from "next/link";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
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
  listContractRecords,
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
  const contracts = listContractRecords();
  const healthyCount = contracts.filter(
    (record) => record.health === "healthy",
  ).length;
  const atRiskCount = contracts.filter(
    (record) => record.health === "at_risk",
  ).length;
  const breachedCount = contracts.filter(
    (record) => record.health === "breached",
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
              {contracts.map((record) => {
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
                          {formatPeriod(record.periodAttainment.period)}
                        </strong>
                        <span>
                          {record.term.startsAt.slice(0, 10)} -{" "}
                          {record.term.endsAt?.slice(0, 10) ??
                            t("contracts.detail.ongoing", locale)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <ContractHealthBadge
                        health={record.health}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <div className="contracts-cell-stack">
                        {record.slaTargets.map((target) => (
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
                              record.periodAttainment.pickupPunctualityPercent,
                            )}
                          </strong>
                        </span>
                        <span>
                          {t("contracts.metric.completion_rate", locale)}{" "}
                          <strong>
                            {formatPercent(
                              record.periodAttainment.completionRatePercent,
                            )}
                          </strong>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="contracts-cell-stack">
                        <strong>{openExceptions}</strong>
                        <span>
                          {record.exceptions.length}{" "}
                          {t("contracts.detail.total", locale)}
                        </span>
                      </div>
                    </td>
                    <td className="contracts-summary-cell">
                      {tenantDisplayText(record.attainmentSummary, tenant)}
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
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
