import { CanvasPill, DataTable, Td, Tr } from "@drts/ui-web";
import type { CSSProperties } from "react";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  filterStatements,
  getSettlementStatements,
  type StatementStatus,
} from "@/lib/statements";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { bankScopedHref } from "@/lib/issuer-projection";
import { t } from "@/lib/translations";

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

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function StatementsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const issuerBrand = tenant.template;
  const status = one(resolvedSearchParams.status) as
    | StatementStatus
    | undefined;
  const allStatements = getSettlementStatements(tenant, locale);
  const statements = filterStatements(
    { ...(status ? { status } : {}) },
    tenant,
    locale,
  );
  const publishedCount = allStatements.filter(
    (item) => item.status === "published",
  ).length;
  const dueCount = allStatements.filter((item) => item.status === "due").length;
  const totalIssuerPaid = statements.reduce(
    (sum, item) => sum + item.totalIssuerPayableAmount,
    0,
  );

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
        eyebrow={t("statements.eyebrow")}
        title={
          <span className="bank-title-block">
            {t("statements.title")}
            <span className="issuer-chip">
              {issuerBrand.bankName} · {t("statements.direction")}
            </span>
          </span>
        }
        description={t("statements.purpose")}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">{t("statements.strip.periods")}</span>
          <strong>{String(statements.length)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("statements.strip.published")}</span>
          <strong>{String(publishedCount)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("statements.strip.total")}</span>
          <strong>{formatCurrency(totalIssuerPaid)}</strong>
        </div>
      </section>

      <CalloutPanel
        title={t("statements.callout.title")}
        description={t("statements.callout.body")}
        tone="warning"
      />

      <section className="surface-card bookings-filter-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.filters.kicker")}
            </span>
            <h3>{t("statements.filters.title")}</h3>
            <p>{t("statements.filters.description")}</p>
          </div>
          <a
            className="filters-reset"
            href={bankScopedHref("/statements", tenant, locale)}
          >
            {t("statements.filters.reset")}
          </a>
        </div>

        <form className="statements-filter-form" method="get">
          <input name="bank" type="hidden" value={tenant.code} />
          <input name="locale" type="hidden" value={locale} />
          <label className="filter-field">
            <span>{t("statements.filters.status")}</span>
            <select name="status" defaultValue={status ?? ""}>
              <option value="">{t("common.all")}</option>
              <option value="published">
                {t(statementStatusLabelKey.published)}
              </option>
              <option value="paid">{t(statementStatusLabelKey.paid)}</option>
              <option value="due">{t(statementStatusLabelKey.due)}</option>
            </select>
          </label>

          <button className="filters-submit" type="submit">
            {t("statements.filters.apply")}
          </button>
        </form>
      </section>

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={String(statements.length)}
          description={t("statements.metrics.periods")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={String(dueCount)}
          description={t("statements.metrics.due")}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker")}
          title={formatCurrency(totalIssuerPaid)}
          description={t("statements.metrics.issuerPays")}
        />
      </section>

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.list.kicker")}
            </span>
            <h3>{t("statements.list.title")}</h3>
            <p>{t("statements.list.description")}</p>
          </div>
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1020}
          empty={t("statements.empty")}
          columns={[
            { label: t("statements.columns.period"), width: "120px" },
            { label: t("statements.columns.total"), width: "140px" },
            { label: t("statements.columns.status"), width: "120px" },
            { label: t("statements.columns.issued"), width: "140px" },
            { label: t("statements.columns.due"), width: "140px" },
            { label: t("statements.columns.artifact"), width: "170px" },
            { label: t("statements.columns.detail"), width: "150px" },
          ]}
        >
          {statements.map((statement) => (
            <Tr key={statement.period}>
              <Td mono>
                <div className="cell-stack">
                  <strong>{formatPeriod(statement.period)}</strong>
                  <span>{statement.statementNo}</span>
                </div>
              </Td>
              <Td mono>{formatCurrency(statement.totalIssuerPayableAmount)}</Td>
              <Td>
                <CanvasPill tone={statementStatusTone[statement.status]} dot>
                  {t(statementStatusLabelKey[statement.status])}
                </CanvasPill>
              </Td>
              <Td mono>{formatDate(statement.issuedAt)}</Td>
              <Td mono>{formatDate(statement.dueAt)}</Td>
              <Td>
                <a
                  className="statement-link"
                  href={statement.signedArtifactHref}
                >
                  {t("statements.actions.download")}
                </a>
              </Td>
              <Td>
                <a
                  className="statement-link"
                  href={bankScopedHref(
                    `/statements/${statement.period}`,
                    tenant,
                    locale,
                  )}
                >
                  {t("statements.actions.viewDetail")}
                </a>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
