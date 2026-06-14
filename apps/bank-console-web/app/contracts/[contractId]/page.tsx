import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@drts/ui-web";
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
  formatDateTime,
  formatPercent,
  formatPeriod,
  formatSignedPercent,
  getContractRecord,
  metricDelta,
  metricValue,
} from "@/lib/contracts-data";
import { t } from "@/lib/translations";

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contractId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const session = getBankConsoleSession(
    tenant,
    locale,
    resolvedSearchParams.role,
  );
  const contract = getContractRecord(contractId);

  if (!contract) {
    notFound();
  }

  const contractRecord = contract;

  return (
    <div className="page-shell">
      <Link
        className="text-link"
        href={bankConsoleHref("/contracts", tenant, locale, session.role)}
      >
        {t("contracts.detail.back", locale)}
      </Link>

      <PageHero
        eyebrow={t("contracts.eyebrow", locale)}
        title={
          <span className="pending-title">
            {tenantDisplayText(contractRecord.displayName, tenant)}
            <ContractHealthBadge
              health={contractRecord.health}
              locale={locale}
            />
            <IssuerBrandPill locale={locale} tenant={tenant} />
          </span>
        }
        description={tenantDisplayText(
          contractRecord.attainmentSummary,
          tenant,
        )}
      />

      <ReadOnlyPanel
        title={t("contracts.detail.readOnlyTitle", locale)}
        description={t("contracts.detail.readOnlyBody", locale)}
        locale={locale}
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("contracts.detail.term", locale)}
          title={formatPeriod(contractRecord.periodAttainment.period)}
          description={`${contractRecord.term.startsAt.slice(0, 10)} - ${contractRecord.term.endsAt?.slice(0, 10) ?? t("contracts.detail.ongoing", locale)}`}
        />
        <SurfaceCard
          kicker={t("contracts.detail.evaluatedAt", locale)}
          title={formatDateTime(contractRecord.periodAttainment.evaluatedAt)}
          description={t("contracts.readOnly", locale)}
        />
        <SurfaceCard
          kicker={t("contracts.detail.completedTrips", locale)}
          title={`${contractRecord.periodAttainment.completedTrips}`}
          description={`${t("contracts.detail.totalTrips", locale)} ${contractRecord.periodAttainment.totalTrips}`}
        />
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("contracts.detail.targets", locale)}</h2>
          <span className="status-chip">{t("contracts.readOnly", locale)}</span>
        </div>
        <div className="contracts-table-scroll">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>{t("contracts.table.targets", locale)}</th>
                <th>{t("contracts.detail.target", locale)}</th>
                <th>{t("contracts.detail.current", locale)}</th>
                <th>{t("contracts.detail.delta", locale)}</th>
                <th>{t("contracts.detail.result", locale)}</th>
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
                    <td>{t(`contracts.metric.${target.metric}`, locale)}</td>
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
                            ? t("contracts.summaryHealthy", locale)
                            : t("contracts.summaryBreached", locale)
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
          <h2>{t("contracts.detail.exceptions", locale)}</h2>
          <span className="status-chip">{t("contracts.readOnly", locale)}</span>
        </div>

        {contractRecord.exceptions.length === 0 ? (
          <p className="contracts-empty-note">
            {t("contracts.detail.emptyExceptions", locale)}
          </p>
        ) : (
          <div className="contracts-table-scroll">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>{t("contracts.detail.orderId", locale)}</th>
                  <th>{t("contracts.detail.occurredAt", locale)}</th>
                  <th>{t("contracts.detail.reason", locale)}</th>
                  <th>{t("contracts.detail.maskedRefs", locale)}</th>
                  <th>{t("contracts.table.status", locale)}</th>
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
                        <span>
                          {tenantDisplayText(exception.summary, tenant)}
                        </span>
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
                        label={t(
                          `contracts.exception.${exception.status}`,
                          locale,
                        )}
                      />
                    </td>
                    <td>
                      <Link
                        className="inline-link-button"
                        href={bankConsoleHref(
                          `/bookings/${exception.orderId}`,
                          tenant,
                          locale,
                          session.role,
                        )}
                      >
                        {t("contracts.detail.bookingLink", locale)}
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
