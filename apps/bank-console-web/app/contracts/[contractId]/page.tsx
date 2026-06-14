import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@drts/ui-web";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
import {
  ContractHealthBadge,
  IssuerBrandPill,
  ReadOnlyPanel,
} from "@/components/contracts-ui";
import {
  formatDateTime,
  formatPercent,
  formatPeriod,
  formatSignedPercent,
  getContractRecord,
  metricDelta,
  metricValue,
} from "@/lib/contracts-data";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { bankScopedHref } from "@/lib/issuer-projection";
import { t } from "@/lib/translations";

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contractId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const contract = getContractRecord(contractId, tenant, locale);

  if (!contract) {
    notFound();
  }

  const contractRecord = contract;

  return (
    <div className="page-shell">
      <Link
        className="text-link"
        href={bankScopedHref("/contracts", tenant, locale)}
      >
        {t("contracts.detail.back")}
      </Link>

      <PageHero
        eyebrow={t("contracts.eyebrow")}
        title={
          <span className="pending-title">
            {contractRecord.displayName}
            <ContractHealthBadge health={contractRecord.health} />
            <IssuerBrandPill tenant={tenant} />
          </span>
        }
        description={contractRecord.attainmentSummary}
      />

      <ReadOnlyPanel
        title={t("contracts.detail.readOnlyTitle")}
        description={t("contracts.detail.readOnlyBody")}
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("contracts.detail.term")}
          title={formatPeriod(contractRecord.periodAttainment.period)}
          description={`${contractRecord.term.startsAt.slice(0, 10)} - ${contractRecord.term.endsAt?.slice(0, 10) ?? t("contracts.detail.ongoing")}`}
        />
        <SurfaceCard
          kicker={t("contracts.detail.evaluatedAt")}
          title={formatDateTime(contractRecord.periodAttainment.evaluatedAt)}
          description={t("contracts.readOnly")}
        />
        <SurfaceCard
          kicker={t("contracts.detail.completedTrips")}
          title={`${contractRecord.periodAttainment.completedTrips}`}
          description={`${t("contracts.detail.totalTrips")} ${contractRecord.periodAttainment.totalTrips}`}
        />
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("contracts.detail.targets")}</h2>
          <span className="status-chip">{t("contracts.readOnly")}</span>
        </div>
        <div className="contracts-table-scroll">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>{t("contracts.table.targets")}</th>
                <th>{t("contracts.detail.target")}</th>
                <th>{t("contracts.detail.current")}</th>
                <th>{t("contracts.detail.delta")}</th>
                <th>{t("contracts.detail.result")}</th>
              </tr>
            </thead>
            <tbody>
              {contractRecord.slaTargets.map((target) => {
                const current = metricValue(
                  contractRecord.periodAttainment,
                  target.metric,
                );
                const delta = metricDelta(contractRecord, target.metric);
                const passed = (delta ?? -1) >= 0;

                return (
                  <tr key={target.metric}>
                    <td>{t(`contracts.metric.${target.metric}`)}</td>
                    <td>{target.thresholdPercent}%</td>
                    <td>{formatPercent(current)}</td>
                    <td
                      className={
                        passed
                          ? "contracts-delta-positive"
                          : "contracts-delta-negative"
                      }
                    >
                      {formatSignedPercent(delta)}
                    </td>
                    <td>
                      <StatusChip
                        tone={passed ? "success" : "danger"}
                        label={
                          passed
                            ? t("contracts.summaryHealthy")
                            : t("contracts.summaryBreached")
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("contracts.detail.exceptions")}</h2>
          <span className="status-chip">{t("contracts.readOnly")}</span>
        </div>

        {contractRecord.exceptions.length === 0 ? (
          <p className="contracts-empty-note">
            {t("contracts.detail.emptyExceptions")}
          </p>
        ) : (
          <div className="contracts-table-scroll">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>{t("contracts.detail.orderId")}</th>
                  <th>{t("contracts.detail.occurredAt")}</th>
                  <th>{t("contracts.detail.reason")}</th>
                  <th>{t("contracts.detail.maskedRefs")}</th>
                  <th>{t("contracts.table.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contractRecord.exceptions.map((exception) => (
                  <tr key={exception.exceptionId}>
                    <td>{exception.orderId}</td>
                    <td>{formatDateTime(exception.occurredAt)}</td>
                    <td>
                      <div className="contracts-cell-stack">
                        <strong>{exception.reasonCode}</strong>
                        <span>{exception.summary}</span>
                      </div>
                    </td>
                    <td>
                      <div className="contracts-cell-stack">
                        <span>{exception.benefitReferenceMasked ?? "-"}</span>
                        <span>
                          {exception.issuerAuthorizationRefMasked ?? "-"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusChip
                        tone={
                          exception.status === "resolved"
                            ? "success"
                            : "warning"
                        }
                        label={t(`contracts.exception.${exception.status}`)}
                      />
                    </td>
                    <td>
                      <Link
                        className="inline-link-button"
                        href={bankScopedHref(
                          `/bookings/${exception.orderId}`,
                          tenant,
                          locale,
                        )}
                      >
                        {t("contracts.detail.bookingLink")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
