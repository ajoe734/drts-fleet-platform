import type { CSSProperties, ReactNode } from "react";
import { PageHero } from "@/components/page-primitives";
import {
  getBankProgramSeedLabel,
  getBankTenantName,
  getBankTenantShortName,
  resolveBankDemoTenant,
  resolveLocale,
  type BankProgramSeed,
  type BankDemoTenant,
} from "@/lib/demo-tenants";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

type DemoProgram = {
  id: string;
  name: string;
  code: string;
  period: string;
  issuer: string;
  coverage: string;
  benefits: string;
  served: number;
  used: number;
  total: number;
  trendLabelKey: TranslationKey;
  exceptionCount: number;
  policyKey: TranslationKey;
};

const PROGRAM_BASE = [
  {
    id: "premium-q2",
    seed: "premium",
    codeSuffix: "WE",
    period: "2026 Q2",
    coverageKey: "programs.data.premiumQ2.coverage",
    benefitsKey: "programs.data.premiumQ2.benefits",
    served: 1240,
    used: 1820,
    total: 2400,
    trendLabelKey: "programs.trend.rising",
    exceptionCount: 12,
    policyKey: "programs.policy.worldElite",
  },
  {
    id: "business-q2",
    seed: "business",
    codeSuffix: "BIZ",
    period: "2026 Q2",
    coverageKey: "programs.data.businessQ2.coverage",
    benefitsKey: "programs.data.businessQ2.benefits",
    served: 860,
    used: 990,
    total: 1200,
    trendLabelKey: "programs.trend.watch",
    exceptionCount: 7,
    policyKey: "programs.policy.business",
  },
  {
    id: "starter-h1",
    seed: "starter",
    codeSuffix: "NEW",
    period: "2026 H1",
    coverageKey: "programs.data.starterH1.coverage",
    benefitsKey: "programs.data.starterH1.benefits",
    served: 430,
    used: 286,
    total: 900,
    trendLabelKey: "programs.trend.steady",
    exceptionCount: 3,
    policyKey: "programs.policy.newCard",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  seed: BankProgramSeed;
  codeSuffix: string;
  period: string;
  coverageKey: TranslationKey;
  benefitsKey: TranslationKey;
  served: number;
  used: number;
  total: number;
  trendLabelKey: TranslationKey;
  exceptionCount: number;
  policyKey: TranslationKey;
}>;

function buildPrograms(tenant: BankDemoTenant, locale: Locale): DemoProgram[] {
  return PROGRAM_BASE.map((program) => ({
    id: `${tenant.code}-${program.id}`,
    name: getBankProgramSeedLabel(tenant, program.seed, locale),
    code: `${tenant.issuerCode}-${program.codeSuffix}`,
    period: program.period,
    issuer: `${tenant.issuerCode} · ${getBankTenantName(tenant, locale)}`,
    coverage: t(program.coverageKey, locale),
    benefits: t(program.benefitsKey, locale),
    served: program.served,
    used: program.used,
    total: program.total,
    trendLabelKey: program.trendLabelKey,
    exceptionCount: program.exceptionCount,
    policyKey: program.policyKey,
  }));
}

function formatNumber(value: number, locale: Locale) {
  return value.toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

function formatTrips(value: number, locale: Locale) {
  return `${formatNumber(value, locale)} ${t("programs.unit.trip", locale)}`;
}

function formatPeople(value: number, locale: Locale) {
  return `${formatNumber(value, locale)} ${t("programs.unit.person", locale)}`;
}

function getUsageRate(used: number, total: number) {
  return total === 0 ? 0 : Math.round((used / total) * 100);
}

function QuotaBar({
  used,
  total,
  locale,
}: {
  used: number;
  total: number;
  locale: Locale;
}) {
  const pct = getUsageRate(used, total);
  const remaining = formatTrips(total - used, locale);
  return (
    <div className="quota-row">
      <span className="quota-label">
        {t("programs.card.quotaLabel", locale)}
      </span>
      <div className="quota-figures">
        <span className="quota-used">{formatTrips(used, locale)}</span>
        <span className="quota-total">
          {t("programs.kpi.ofTotal", locale, {
            total: formatTrips(total, locale),
          })}
        </span>
        <span className="quota-pct">
          {t("home.quota.used", locale, { pct })}
        </span>
      </div>
      <div className="quota-track">
        <div className="quota-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="quota-remaining">
        {t("programs.table.remainingValue", locale, { remaining })}
      </span>
    </div>
  );
}

function DlItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="dl-item">
      <span className="dl-key">{label}</span>
      <span className="dl-val">{value}</span>
    </div>
  );
}

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    bank?: string | string[];
    locale?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  const tenant = resolveBankDemoTenant(params?.bank);
  const issuerBrand = tenant.template.tokens.dark;
  const programs = buildPrograms(tenant, locale);

  const issuerVars = {
    "--issuer-primary": issuerBrand.primary,
    "--issuer-primary-dark": issuerBrand.primaryDark,
    "--issuer-accent": issuerBrand.accent,
    "--issuer-ink": issuerBrand.ink,
    "--issuer-surface": issuerBrand.surface.bg,
    "--issuer-border": issuerBrand.surface.border,
    "--issuer-panel-border": issuerBrand.theme.panelBorder,
    "--issuer-accent-soft": issuerBrand.theme.accentSoft,
    "--issuer-text-muted": issuerBrand.text.muted,
  } as CSSProperties;

  return (
    <div className="page-shell programs-page" style={issuerVars}>
      <PageHero
        eyebrow={t("programs.eyebrow", locale)}
        title={t("programs.title", locale)}
        description={t("programs.lead", locale)}
      />

      <section className="programs-banner">
        <div>
          <p className="programs-banner-label">
            {t("programs.banner.label", locale)}
          </p>
          <h2>
            {t("programs.banner.title", locale, {
              bank: getBankTenantShortName(tenant, locale),
            })}
          </h2>
          <p>{t("programs.banner.body", locale)}</p>
        </div>
        <dl className="programs-banner-meta">
          <div>
            <dt>{t("programs.banner.issuer", locale)}</dt>
            <dd>
              {tenant.issuerCode} · {getBankTenantName(tenant, locale)}
            </dd>
          </div>
          <div>
            <dt>{t("programs.banner.scope", locale)}</dt>
            <dd>{t("programs.banner.scopeValue", locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="programs-card-grid">
        {programs.map((program) => (
          <article className="bank-card is-accent" key={program.id}>
            <div className="bank-card-head">
              <div>
                <h3>{program.name}</h3>
                <p>
                  {program.code} · {program.period} · {program.issuer}
                </p>
              </div>
              <div className="bank-card-actions">
                <button className="table-action-button is-ghost" type="button">
                  {t("programs.action.drill", locale)}
                </button>
              </div>
            </div>
            <div className="bank-card-body">
              <QuotaBar
                used={program.used}
                total={program.total}
                locale={locale}
              />
              <div className="bank-dl cols-2">
                <DlItem
                  label={t("programs.table.headers.served", locale)}
                  value={formatPeople(program.served, locale)}
                />
                <DlItem
                  label={t("programs.table.headers.trend", locale)}
                  value={t(program.trendLabelKey, locale)}
                />
                <DlItem
                  label={t("programs.card.coverage", locale)}
                  value={program.coverage}
                />
                <DlItem
                  label={t("programs.card.benefits", locale)}
                  value={program.benefits}
                />
                <DlItem
                  label={t("programs.table.headers.exceptions", locale)}
                  value={`${program.exceptionCount} ${t("programs.unit.case", locale)}`}
                />
                <DlItem
                  label={t("programs.table.headers.policy", locale)}
                  value={t(program.policyKey, locale)}
                />
              </div>
              <div className="programs-card-actions">
                <button
                  className="table-action-button is-primary"
                  type="button"
                >
                  {t("programs.action.editPolicy", locale)}
                </button>
                <button className="table-action-button" type="button">
                  {t("programs.action.exportUsage", locale)}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="bank-card">
        <div className="bank-card-head">
          <div>
            <h3>{t("programs.summary.title", locale)}</h3>
            <p>{t("programs.summary.subtitle", locale)}</p>
          </div>
        </div>
        <div className="bank-card-body">
          <div className="bank-table-scroll">
            <table className="bank-table">
              <thead>
                <tr>
                  <th>{t("programs.summary.headers.program", locale)}</th>
                  <th>{t("programs.summary.headers.code", locale)}</th>
                  <th>{t("programs.summary.headers.served", locale)}</th>
                  <th>{t("programs.summary.headers.used", locale)}</th>
                  <th>{t("programs.summary.headers.total", locale)}</th>
                  <th>{t("programs.summary.headers.remaining", locale)}</th>
                  <th>{t("programs.summary.headers.rate", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((program) => {
                  const pct = getUsageRate(program.used, program.total);
                  return (
                    <tr key={program.id}>
                      <td>{program.name}</td>
                      <td className="mono-cell">{program.code}</td>
                      <td className="mono-cell">
                        {formatNumber(program.served, locale)}
                      </td>
                      <td className="mono-cell">
                        {formatNumber(program.used, locale)}
                      </td>
                      <td className="mono-cell">
                        {formatNumber(program.total, locale)}
                      </td>
                      <td className="mono-cell">
                        {formatNumber(program.total - program.used, locale)}
                      </td>
                      <td>
                        <div className="programs-quota-cell">
                          <div className="quota-track">
                            <div
                              className="quota-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="mono-cell">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
