import { CanvasPill, DataTable, Td, Tr } from "@drts/ui-web";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getBankTenantName, resolveLocale } from "@/lib/demo-tenants";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  bankConsoleHref,
  getBankConsoleSession,
  resolveBankPageSession,
} from "@/lib/session";
import { tenantDisplayText } from "@/lib/tenant-display";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";
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

function formatCurrency(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
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
  let cookieRole: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieRole =
      cookieStore.get(BANK_CONSOLE_SESSION_COOKIE)?.value ||
      cookieStore.get(BANK_CONSOLE_ROLE_COOKIE)?.value;
  } catch {
    // Missing HTTP cookie context stays unauthenticated.
  }
  const authenticated = resolveBankPageSession(
    cookieRole,
    resolvedSearchParams.bank,
    resolvedSearchParams.role,
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
  const statementData = await loadBankStatementsData(
    tenant.tenantId,
    session.role,
  );
  const issuerBrand = tenant.template;
  const baseQuery = {
    bank: tenant.code,
    locale,
    role: session.role,
  };
  const status = one(resolvedSearchParams.status) as
    | StatementStatus
    | undefined;
  const statements = statementData.data.statements.filter((item) =>
    status ? item.status === status : true,
  );
  const publishedCount = statementData.data.statements.filter(
    (item) => item.status === "published",
  ).length;
  const dueCount = statementData.data.statements.filter(
    (item) => item.status === "due",
  ).length;
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
        eyebrow={t("statements.eyebrow", locale)}
        title={
          <span className="bank-title-block">
            {t("statements.title", locale)}
            <span className="issuer-chip">
              {getBankTenantName(tenant, locale)} ·{" "}
              {t("statements.direction", locale)}
            </span>
          </span>
        }
        description={t("statements.purpose", locale)}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">
            {t("statements.strip.periods", locale)}
          </span>
          <strong>{String(statements.length)}</strong>
        </div>
        <div>
          <span className="eyebrow">
            {t("statements.strip.published", locale)}
          </span>
          <strong>{String(publishedCount)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("statements.strip.total", locale)}</span>
          <strong>{formatCurrency(totalIssuerPaid, locale)}</strong>
        </div>
      </section>

      {session.role === "bank_ops_viewer" ? (
        <CalloutPanel
          title={t("statements.unauthorized.title", locale)}
          description={t("statements.unauthorized.description", locale)}
          tone="warning"
        />
      ) : null}
      <CalloutPanel
        title={t("statements.callout.title", locale)}
        description={t("statements.callout.body", locale)}
        tone="warning"
      />
      {statementData.degradedMessage ? (
        <CalloutPanel
          title={t("common.apiDegraded", locale)}
          description={statementData.degradedMessage}
          tone="warning"
        />
      ) : null}

      <section className="surface-card bookings-filter-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.filters.kicker", locale)}
            </span>
            <h3>{t("statements.filters.title", locale)}</h3>
            <p>{t("statements.filters.description", locale)}</p>
          </div>
          <a
            className="filters-reset"
            href={bankConsoleHref("/statements", tenant, locale, session.role)}
          >
            {t("statements.filters.reset", locale)}
          </a>
        </div>

        <form className="statements-filter-form" method="get">
          <input name="bank" type="hidden" value={baseQuery.bank} />
          <input name="locale" type="hidden" value={baseQuery.locale} />
          <input name="role" type="hidden" value={baseQuery.role} />
          <label className="filter-field">
            <span>{t("statements.filters.status", locale)}</span>
            <select name="status" defaultValue={status ?? ""}>
              <option value="">{t("common.all", locale)}</option>
              <option value="published">
                {t(statementStatusLabelKey.published, locale)}
              </option>
              <option value="paid">
                {t(statementStatusLabelKey.paid, locale)}
              </option>
              <option value="due">
                {t(statementStatusLabelKey.due, locale)}
              </option>
            </select>
          </label>

          <button className="filters-submit" type="submit">
            {t("statements.filters.apply", locale)}
          </button>
        </form>
      </section>

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={String(statements.length)}
          description={t("statements.metrics.periods", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={String(dueCount)}
          description={t("statements.metrics.due", locale)}
        />
        <SurfaceCard
          kicker={t("statements.metrics.kicker", locale)}
          title={formatCurrency(totalIssuerPaid, locale)}
          description={t("statements.metrics.issuerPays", locale)}
        />
      </section>

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("statements.list.kicker", locale)}
            </span>
            <h3>{t("statements.list.title", locale)}</h3>
            <p>{t("statements.list.description", locale)}</p>
          </div>
          {session.role === "bank_ops_viewer" ? (
            <span
              className="filters-reset is-disabled"
              style={{
                opacity: 0.5,
                pointerEvents: "none",
                cursor: "not-allowed",
              }}
            >
              {t("statements.actions.exportAll", locale)}
            </span>
          ) : (
            <a
              className="filters-reset"
              href={`/api/statements/export?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
            >
              {t("statements.actions.exportAll", locale)}
            </a>
          )}
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1020}
          empty={t("statements.empty", locale)}
          columns={[
            { label: t("statements.columns.period", locale), width: "120px" },
            { label: t("statements.columns.total", locale), width: "140px" },
            { label: t("statements.columns.status", locale), width: "120px" },
            { label: t("statements.columns.issued", locale), width: "140px" },
            { label: t("statements.columns.due", locale), width: "140px" },
            {
              label: t("statements.columns.artifact", locale),
              width: "170px",
            },
            { label: t("statements.columns.detail", locale), width: "150px" },
          ]}
        >
          {statements.map((statement) => (
            <Tr key={statement.period}>
              <Td mono>
                <div className="cell-stack">
                  <strong>{formatPeriod(statement.period)}</strong>
                  <span>
                    {tenantDisplayText(statement.statementNo, tenant)}
                  </span>
                </div>
              </Td>
              <Td mono>
                {formatCurrency(statement.totalIssuerPayableAmount, locale)}
              </Td>
              <Td>
                <CanvasPill tone={statementStatusTone[statement.status]} dot>
                  {t(statementStatusLabelKey[statement.status], locale)}
                </CanvasPill>
              </Td>
              <Td mono>{formatDate(statement.issuedAt)}</Td>
              <Td mono>{formatDate(statement.dueAt)}</Td>
              <Td>
                {session.role === "bank_ops_viewer" ? (
                  <span
                    className="statement-link is-disabled"
                    style={{
                      opacity: 0.5,
                      pointerEvents: "none",
                      cursor: "not-allowed",
                    }}
                  >
                    {t("statements.actions.download", locale)}
                  </span>
                ) : (
                  <a
                    className="statement-link"
                    data-drt-operation="bank-statement-download"
                    href={`${statement.signedArtifactHref}?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
                  >
                    {t("statements.actions.download", locale)}
                  </a>
                )}
              </Td>
              <Td>
                <a
                  className="statement-link"
                  href={bankConsoleHref(
                    `/statements/${statement.period}`,
                    tenant,
                    locale,
                    session.role,
                  )}
                >
                  {t("statements.actions.viewDetail", locale)}
                </a>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
