import Link from "next/link";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
import {
  ContractHealthBadge,
  IssuerBrandPill,
  ReadOnlyPanel,
} from "@/components/contracts-ui";
import {
  countOpenExceptions,
  formatPercent,
  formatPeriod,
  listContractRecords,
} from "@/lib/contracts-data";
import { t } from "@/lib/translations";

export default function ContractsPage() {
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
        eyebrow={t("contracts.eyebrow")}
        title={
          <span className="pending-title">
            {t("contracts.title")}
            <IssuerBrandPill />
          </span>
        }
        description={t("contracts.purpose")}
      />

      <ReadOnlyPanel
        title={t("contracts.summaryTitle")}
        description={t("contracts.summaryLead")}
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("contracts.readOnly")}
          title={t("contracts.summaryHealthy")}
          description={`${healthyCount} / ${contracts.length}`}
        />
        <SurfaceCard
          kicker={t("contracts.readOnly")}
          title={t("contracts.summaryAtRisk")}
          description={`${atRiskCount} / ${contracts.length}`}
        />
        <SurfaceCard
          kicker={t("contracts.readOnly")}
          title={t("contracts.summaryBreached")}
          description={`${breachedCount} / ${contracts.length}`}
        />
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("contracts.summaryTitle")}</h2>
          <span className="status-chip">{t("contracts.readOnly")}</span>
        </div>

        <div className="contracts-table-scroll">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>{t("contracts.table.program")}</th>
                <th>{t("contracts.table.period")}</th>
                <th>{t("contracts.table.status")}</th>
                <th>{t("contracts.table.targets")}</th>
                <th>{t("contracts.table.attainment")}</th>
                <th>{t("contracts.table.exceptions")}</th>
                <th>{t("contracts.table.summary")}</th>
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
                        <strong>{record.displayName}</strong>
                        <span>{record.programCode}</span>
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
                            t("contracts.detail.ongoing")}
                        </span>
                      </div>
                    </td>
                    <td>
                      <ContractHealthBadge health={record.health} />
                    </td>
                    <td>
                      <div className="contracts-cell-stack">
                        {record.slaTargets.map((target) => (
                          <span key={target.metric}>
                            {t(`contracts.metric.${target.metric}`)}{" "}
                            <strong>{target.thresholdPercent}%</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="contracts-cell-stack">
                        <span>
                          {t("contracts.metric.pickup_punctuality")}{" "}
                          <strong>
                            {formatPercent(
                              record.periodAttainment.pickupPunctualityPercent,
                            )}
                          </strong>
                        </span>
                        <span>
                          {t("contracts.metric.completion_rate")}{" "}
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
                          {t("contracts.detail.total")}
                        </span>
                      </div>
                    </td>
                    <td className="contracts-summary-cell">
                      {record.attainmentSummary}
                    </td>
                    <td>
                      <Link
                        className="inline-link-button"
                        href={`/contracts/${record.contractId}`}
                      >
                        {t("contracts.table.view")}
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
