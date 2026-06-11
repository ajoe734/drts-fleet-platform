import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import { CanvasPill, DataTable, Td, Tr } from "@drts/ui-web";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getStatementByPeriod, type StatementStatus } from "@/lib/statements";
import { t } from "@/lib/translations";

const issuerBrand = BRAND_TEMPLATES.CTBC;

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ period: string }>;
}) {
  const { period } = await params;
  const statement = getStatementByPeriod(period);

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
        eyebrow={t("statements.detail.eyebrow")}
        title={
          <span className="bank-title-block">
            {t("statements.detail.title", undefined, {
              period: formatPeriod(statement.period),
            })}
            <span className="issuer-chip">{statement.statementNo}</span>
          </span>
        }
        description={t("statements.detail.purpose")}
      />

      <section className="statement-detail-topline">
        <a className="statement-back-link" href="/statements">
          {t("statements.detail.back")}
        </a>
        <a className="statement-link" href={statement.signedArtifactHref}>
          {t("statements.actions.downloadSigned")}
        </a>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={formatCurrency(statement.totalFareAmount)}
          description={t("statements.detail.metrics.fare")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={formatCurrency(statement.totalSubsidisedAmount)}
          description={t("statements.detail.metrics.subsidised")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={formatCurrency(statement.totalIssuerPayableAmount)}
          description={t("statements.detail.metrics.issuerPayable")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={formatCurrency(statement.totalPaidAmount)}
          description={t("statements.detail.metrics.paid")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={String(statement.totalTrips)}
          description={t("statements.detail.metrics.trips")}
        />
      </section>

      <section className="statement-summary-card">
        <div className="statement-summary-grid">
          <div>
            <span className="audit-label">
              {t("statements.columns.status")}
            </span>
            <CanvasPill tone={statementStatusTone[statement.status]} dot>
              {t(statementStatusLabelKey[statement.status])}
            </CanvasPill>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.columns.issued")}
            </span>
            <strong>{formatDate(statement.issuedAt)}</strong>
          </div>
          <div>
            <span className="audit-label">{t("statements.columns.due")}</span>
            <strong>{formatDate(statement.dueAt)}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.directionLabel")}
            </span>
            <strong>{t("statements.direction")}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.programLabel")}
            </span>
            <strong>{statement.programLabel}</strong>
          </div>
          <div>
            <span className="audit-label">
              {t("statements.detail.artifactLabel")}
            </span>
            <strong>
              {statement.artifactExpired
                ? t("statements.detail.artifactExpired")
                : t("statements.detail.artifactReady")}
            </strong>
          </div>
        </div>
      </section>

      <CalloutPanel
        title={t("statements.detail.callout.title")}
        description={t("statements.detail.callout.body")}
        tone={statement.artifactExpired ? "warning" : "default"}
      />

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.detail.table.kicker")}
            </span>
            <h3>{t("statements.detail.table.title")}</h3>
            <p>{t("statements.detail.table.description")}</p>
          </div>
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1460}
          columns={[
            { label: t("statements.detail.columns.trip"), width: "150px" },
            { label: t("statements.detail.columns.route"), width: "190px" },
            { label: t("statements.detail.columns.fare"), width: "120px" },
            {
              label: t("statements.detail.columns.subsidised"),
              width: "120px",
            },
            {
              label: t("statements.detail.columns.paid"),
              width: "120px",
            },
            { label: t("statements.detail.columns.benefit"), width: "120px" },
            {
              label: t("statements.detail.columns.cardholder"),
              width: "120px",
            },
            { label: t("statements.detail.columns.card"), width: "120px" },
            { label: t("statements.detail.columns.direction"), width: "150px" },
            { label: t("statements.detail.columns.artifact"), width: "120px" },
            { label: t("statements.detail.columns.dispute"), width: "150px" },
          ]}
        >
          {statement.trips.map((trip) => (
            <Tr key={trip.tripId}>
              <Td mono>
                <div className="cell-stack">
                  <strong>{trip.orderNo}</strong>
                  <span>{trip.tripId}</span>
                </div>
              </Td>
              <Td>
                <div className="cell-stack">
                  <strong>{trip.routeLabel}</strong>
                  <span>{formatDate(trip.tripDate)}</span>
                </div>
              </Td>
              <Td mono>{formatCurrency(trip.fareAmount)}</Td>
              <Td mono>{formatCurrency(trip.subsidisedAmount)}</Td>
              <Td mono>{formatCurrency(trip.paidAmount)}</Td>
              <Td mono>{trip.benefitReferenceMasked}</Td>
              <Td mono>{trip.cardholderReferenceMasked}</Td>
              <Td mono>{trip.cardReferenceMasked}</Td>
              <Td>{t("statements.direction")}</Td>
              <Td>
                <a className="statement-link" href={trip.artifactDownloadHref}>
                  {t("statements.actions.download")}
                </a>
              </Td>
              <Td>
                <a className="statement-link" href={trip.disputeHref}>
                  {trip.disputed
                    ? t("statements.actions.disputed")
                    : t("statements.actions.reportDispute")}
                </a>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
