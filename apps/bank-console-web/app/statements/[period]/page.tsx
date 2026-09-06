import { CanvasPill, DataTable, Td, Tr } from "@drts/ui-web";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { resolveLocale } from "@/lib/demo-tenants";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  bankConsoleHref,
  getBankConsoleSession,
  resolveBankPageSession,
} from "@/lib/session";
import { tenantDisplayText } from "@/lib/tenant-display";
import { type StatementStatus } from "@/lib/statements";
import { t, type Locale } from "@/lib/translations";

const statementStatusTone: Record<
  StatementStatus,
  "info" | "success" | "warn"
> = {
  published: "info",
  paid: "success",
  due: "warn",
};

const statementStatusLabelKey: Record<
  StatementStatus,
  | "statements.status.published"
  | "statements.status.paid"
  | "statements.status.due"
> = {
  published: "statements.status.published",
  paid: "statements.status.paid",
  due: "statements.status.due",
};

function formatPeriod(period: string) {
  return `${period.slice(0, 4)} / ${period.slice(5, 7)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatCurrency(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function StatementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { period } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  let cookieRole: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieRole =
      cookieStore.get(BANK_CONSOLE_SESSION_COOKIE)?.value ||
      cookieStore.get(BANK_CONSOLE_ROLE_COOKIE)?.value;
  } catch {
    // Fallback for test / non-HTTP contexts
  }
  const authenticated = resolveBankPageSession(
    cookieRole, resolvedSearchParams.bank, resolvedSearchParams.role,
  );
  if (!authenticated) notFound();
  if (!authenticated.canReadStatements) {
    return (
      <div className="page-shell bank-statements-page">
        <CalloutPanel
          title={t("statements.unauthorized.title", locale)}
          description={t("users.roleCard.bank_ops_viewer", locale)}
          tone="warning"
        />
      </div>
    );
  }
  const tenant = authenticated.bank;
  const session = getBankConsoleSession(tenant, locale, authenticated.role);
  const issuerBrand = tenant.template;
  const statementData = await loadBankStatementsData(tenant.tenantId, session.role);
  const statement =
    statementData.data.statements.find((item) => item.period === period) ?? null;

  if (!statement) {
    notFound();
  }

  return (
    <div
      className="page-shell bank-statements-page"
      style={
        {
          "--issuer-primary": issuerBrand.primary,
          "--issuer-primary-dark": issuerBrand.primaryDark,
          "--issuer-accent": issuerBrand.accent,
          "--issuer-soft": issuerBrand.tokens.dark.theme.accentSoft,
        } as CSSProperties
      }
    >
      <PageHero
        eyebrow={t("statements.detail.eyebrow", locale)}
        title={
          <span className="bank-title-block">
            {t("statements.detail.title", locale, {
              period: formatPeriod(statement.period),
            })}
            <span className="issuer-chip">
              {tenantDisplayText(statement.statementNo, tenant)}
            </span>
          </span>
        }
        description={t("statements.detail.purpose", locale)}
      />
      {session.role === "bank_ops_viewer" ? (
        <CalloutPanel
          title={t("statements.unauthorized.title", locale)}
          description={t("statements.unauthorized.description", locale)}
          tone="warning"
        />
      ) : null}
      {statementData.degradedMessage ? (
        <CalloutPanel
          title={t("common.apiDegraded", locale)}
          description={statementData.degradedMessage}
          tone="warning"
        />
      ) : null}

      <section className="statement-detail-topline">
        <a
          className="statement-back-link"
          href={bankConsoleHref("/statements", tenant, locale, session.role)}
        >
          {t("statements.detail.back", locale)}
        </a>
        <div style={{ display: "flex", gap: "12px" }}>
          {session.role === "bank_ops_viewer" ? (
            <>
              <span
                className="statement-link is-disabled"
                style={{ opacity: 0.5, pointerEvents: "none", cursor: "not-allowed" }}
              >
                {t("statements.actions.exportCsv", locale)}
              </span>
              <span
                className="statement-link is-disabled"
                style={{ opacity: 0.5, pointerEvents: "none", cursor: "not-allowed" }}
              >
                {t("statements.actions.downloadSigned", locale)}
              </span>
            </>
          ) : (
            <>
              <a
                className="statement-link"
                href={`/api/statements/${statement.period}/export?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
              >
                {t("statements.actions.exportCsv", locale)}
              </a>
              <a
                className="statement-link"
                href={`${statement.signedArtifactHref}?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
              >
                {t("statements.actions.downloadSigned", locale)}
              </a>
            </>
          )}
        </div>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={formatCurrency(statement.totalFareAmount, locale)}
          description={t("statements.detail.metrics.fare", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={formatCurrency(statement.totalSubsidisedAmount, locale)}
          description={t("statements.detail.metrics.subsidised", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={formatCurrency(statement.totalIssuerPayableAmount, locale)}
          description={t("statements.detail.metrics.issuerPayable", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={formatCurrency(statement.totalPaidAmount, locale)}
          description={t("statements.detail.metrics.paid", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={String(statement.totalTrips)}
          description={t("statements.detail.metrics.trips", locale)}
        />
      </section>

      <section className="statement-summary-card">
        <div className="statement-summary-grid">
          <div>
            <span className="audit-label">
              {t("statements.columns.status", locale)}
            </span>
            <CanvasPill tone={statementStatusTone[statement.status]} dot>
              {t(statementStatusLabelKey[statement.status], locale)}
            </CanvasPill>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.columns.issued", locale)}
            </span>
            <strong>{formatDate(statement.issuedAt)}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.columns.due", locale)}
            </span>
            <strong>{formatDate(statement.dueAt)}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.directionLabel", locale)}
            </span>
            <strong>{t("statements.direction", locale)}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.programLabel", locale)}
            </span>
            <strong>{tenantDisplayText(statement.programLabel, tenant)}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.artifactLabel", locale)}
            </span>
            <strong>
              {statement.artifactExpired
                ? t("statements.detail.artifactExpired", locale)
                : t("statements.detail.artifactReady", locale)}
            </strong>
          </div>
        </div>
      </section>

      <CalloutPanel
        title={t("statements.detail.callout.title", locale)}
        description={t("statements.detail.callout.body", locale)}
        tone={statement.artifactExpired ? "warning" : "default"}
      />

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.detail.table.kicker", locale)}
            </span>
            <h3>{t("statements.detail.table.title", locale)}</h3>
            <p>{t("statements.detail.table.description", locale)}</p>
          </div>
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1460}
          columns={[
            {
              label: t("statements.detail.columns.trip", locale),
              width: "150px",
            },
            {
              label: t("statements.detail.columns.route", locale),
              width: "190px",
            },
            {
              label: t("statements.detail.columns.fare", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.subsidised", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.paid", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.benefit", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.cardholder", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.card", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.direction", locale),
              width: "150px",
            },
            {
              label: t("statements.detail.columns.artifact", locale),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.dispute", locale),
              width: "150px",
            },
          ]}
        >
          {statement.trips.map((trip) => (
            <Tr key={trip.tripId}>
              <Td mono>
                <div className="cell-stack">
                  <strong>{trip.orderNo}</strong>
                  <span>{tenantDisplayText(trip.tripId, tenant)}</span>
                </div>
              </Td>
              <Td>
                <div className="cell-stack">
                  <strong>{trip.routeLabel}</strong>
                  <span>{formatDate(trip.tripDate)}</span>
                </div>
              </Td>
              <Td mono>{formatCurrency(trip.fareAmount, locale)}</Td>
              <Td mono>{formatCurrency(trip.subsidisedAmount, locale)}</Td>
              <Td mono>{formatCurrency(trip.paidAmount, locale)}</Td>
              <Td mono>{trip.benefitReferenceMasked}</Td>
              <Td mono>{trip.cardholderReferenceMasked}</Td>
              <Td mono>{trip.cardReferenceMasked}</Td>
              <Td>{t("statements.direction", locale)}</Td>
              <Td>
                {session.role === "bank_ops_viewer" ? (
                  <span
                    className="statement-link is-disabled"
                    style={{ opacity: 0.5, pointerEvents: "none", cursor: "not-allowed" }}
                  >
                    {t("statements.actions.download", locale)}
                  </span>
                ) : (
                  <a
                    className="statement-link"
                    href={`${trip.artifactDownloadHref}?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
                  >
                    {t("statements.actions.download", locale)}
                  </a>
                )}
              </Td>
              <Td>
                {trip.disputed ? (
                  <CanvasPill tone="warn" dot>
                    {t("statements.actions.disputed", locale)}
                  </CanvasPill>
                ) : (
                  <span
                    className="statement-link is-disabled"
                    style={{ opacity: 0.5, pointerEvents: "none", cursor: "not-allowed" }}
                  >
                    {t("statements.actions.reportDispute", locale)}
                  </span>
                )}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
