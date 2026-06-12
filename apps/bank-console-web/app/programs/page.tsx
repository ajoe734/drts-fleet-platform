import type { CSSProperties } from "react";
import { PageHero } from "@/components/page-primitives";
import {
  resolveBankDemoTenant,
  resolveLocale,
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
  trend: readonly number[];
  trendLabelKey: TranslationKey;
  exceptionCount: number;
  policyKey: TranslationKey;
  exceptions: Array<{
    typeKey: TranslationKey;
    reference: string;
  }>;
};

const PROGRAM_BASE = [
  {
    id: "premium-q2",
    seed: "premium",
    codeSuffix: "WE",
    period: "2026 Q2",
    coverage: {
      zh: "全球機場接或送 2 趟 / 季",
      en: "Global airport pickup or drop-off · 2 trips / quarter",
    },
    benefits: {
      zh: "VISA Infinite / 正附卡合併歸戶",
      en: "VISA Infinite / household-level entitlement",
    },
    served: 1240,
    used: 1820,
    total: 2400,
    trend: [60, 72, 74, 81, 88, 92],
    trendLabelKey: "programs.trend.rising",
    exceptionCount: 12,
    policyKey: "programs.policy.worldElite",
    exceptions: ["flightChange", "outOfWindow"],
  },
  {
    id: "business-q2",
    seed: "business",
    codeSuffix: "BIZ",
    period: "2026 Q2",
    coverage: {
      zh: "桃園 / 松山 / 高雄 接送",
      en: "Taoyuan / Songshan / Kaohsiung transfer",
    },
    benefits: {
      zh: "Mastercard World Elite / 年消費門檻",
      en: "Mastercard World Elite / annual spend gate",
    },
    served: 860,
    used: 990,
    total: 1200,
    trend: [52, 58, 63, 69, 76, 83],
    trendLabelKey: "programs.trend.watch",
    exceptionCount: 7,
    policyKey: "programs.policy.business",
    exceptions: ["manualReview", "duplicateUsage"],
  },
  {
    id: "starter-h1",
    seed: "starter",
    codeSuffix: "NEW",
    period: "2026 H1",
    coverage: {
      zh: "國內指定機場送機 1 趟 / 半年",
      en: "Domestic airport drop-off · 1 trip / half-year",
    },
    benefits: {
      zh: "新戶核卡 90 日內啟用",
      en: "New card activated within 90 days",
    },
    served: 430,
    used: 286,
    total: 900,
    trend: [18, 24, 29, 28, 31, 34],
    trendLabelKey: "programs.trend.steady",
    exceptionCount: 3,
    policyKey: "programs.policy.newCard",
    exceptions: ["expiredEligibility", "missingReceipt"],
  },
] as const;

const EXCEPTION_KEYS = {
  duplicateUsage: "programs.exception.duplicateUsage",
  expiredEligibility: "programs.exception.expiredEligibility",
  flightChange: "programs.exception.flightChange",
  manualReview: "programs.exception.manualReview",
  missingReceipt: "programs.exception.missingReceipt",
  outOfWindow: "programs.exception.outOfWindow",
} as const satisfies Record<string, TranslationKey>;

const EXCEPTION_REFERENCE_SUFFIXES = {
  duplicateUsage: ["320", "402"],
  expiredEligibility: ["087", "090"],
  flightChange: ["204", "771"],
  manualReview: ["451", "553"],
  missingReceipt: ["611", "264"],
  outOfWindow: ["992", "118"],
} as const;

function buildPrograms(tenant: BankDemoTenant, locale: Locale): DemoProgram[] {
  return PROGRAM_BASE.map((program) => {
    const programName = tenant.programSeed[program.seed][locale];
    const code = `${tenant.issuerCode}-${program.codeSuffix}`;

    return {
      id: `${tenant.code}-${program.id}`,
      name: programName,
      code,
      period: program.period,
      issuer: `${tenant.issuerCode} · ${tenant.name[locale]}`,
      coverage: program.coverage[locale],
      benefits: program.benefits[locale],
      served: program.served,
      used: program.used,
      total: program.total,
      trend: program.trend,
      trendLabelKey: program.trendLabelKey,
      exceptionCount: program.exceptionCount,
      policyKey: program.policyKey,
      exceptions: program.exceptions.map((exception) => {
        const [cardholder, benefit] = EXCEPTION_REFERENCE_SUFFIXES[exception];
        return {
          typeKey: EXCEPTION_KEYS[exception],
          reference:
            locale === "zh"
              ? `卡友 ${tenant.issuerCode}-CH***${cardholder} · 權益 BR***${benefit}`
              : `Cardholder ${tenant.issuerCode}-CH***${cardholder} · benefit BR***${benefit}`,
        };
      }),
    };
  });
}

function buildTopExceptions(locale: Locale) {
  return [
    {
      key: "programs.exception.outOfWindow",
      count: 9,
      detail:
        locale === "zh"
          ? "多發於凌晨航班改票後逾 24 小時重提"
          : "Often caused by re-submission more than 24h after red-eye flight changes.",
    },
    {
      key: "programs.exception.manualReview",
      count: 7,
      detail:
        locale === "zh"
          ? "高單價接送與跨區加價需人工覆核"
          : "High-value rides and cross-region surcharges require manual review.",
    },
    {
      key: "programs.exception.flightChange",
      count: 6,
      detail:
        locale === "zh"
          ? "航班異動後重派車產生 quota 回補延遲"
          : "Flight-change redispatch can delay quota backfill.",
    },
  ] as const satisfies ReadonlyArray<{
    key: TranslationKey;
    count: number;
    detail: string;
  }>;
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

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getUsageRate(used: number, total: number) {
  return total === 0 ? 0 : (used / total) * 100;
}

function getTrendPath(points: readonly number[]) {
  const width = 132;
  const height = 34;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function hexToRgbChannels(value: string) {
  const normalized = value.replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((segment) => `${segment}${segment}`)
          .join("")
      : normalized;

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
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
  const topExceptions = buildTopExceptions(locale);
  const periodSummary = {
    served: programs.reduce((sum, program) => sum + program.served, 0),
    used: programs.reduce((sum, program) => sum + program.used, 0),
    total: programs.reduce((sum, program) => sum + program.total, 0),
  };
  const remaining = periodSummary.total - periodSummary.used;
  const usageRate = getUsageRate(periodSummary.used, periodSummary.total);

  return (
    <div
      className="page-shell programs-page"
      style={
        {
          "--issuer-primary": issuerBrand.primary,
          "--issuer-primary-dark": issuerBrand.primaryDark,
          "--issuer-primary-rgb": hexToRgbChannels(issuerBrand.primary),
          "--issuer-accent": issuerBrand.accent,
          "--issuer-panel-border": issuerBrand.theme.panelBorder,
          "--issuer-accent-soft": issuerBrand.theme.accentSoft,
          "--issuer-text-muted": issuerBrand.text.muted,
        } as CSSProperties
      }
    >
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
              bank: tenant.shortName[locale],
            })}
          </h2>
          <p>{t("programs.banner.body", locale)}</p>
        </div>
        <dl className="programs-banner-meta">
          <div>
            <dt>{t("programs.banner.issuer", locale)}</dt>
            <dd>
              {tenant.issuerCode} · {tenant.name[locale]}
            </dd>
          </div>
          <div>
            <dt>{t("programs.banner.scope", locale)}</dt>
            <dd>{t("programs.banner.scopeValue", locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="surface-grid programs-kpi-grid">
        <article className="surface-card programs-kpi programs-kpi-primary">
          <span className="surface-kicker">
            {t("programs.kpi.primaryKicker", locale)}
          </span>
          <h3>{t("programs.kpi.quotaTitle", locale)}</h3>
          <p>{t("programs.kpi.quotaBody", locale)}</p>
          <div className="programs-kpi-value-row">
            <strong>{formatTrips(periodSummary.used, locale)}</strong>
            <span>
              {t("programs.kpi.ofTotal", locale, {
                total: formatTrips(periodSummary.total, locale),
              })}
            </span>
          </div>
          <div className="programs-meter" aria-hidden="true">
            <div
              className="programs-meter-fill"
              style={{ width: `${Math.min(usageRate, 100)}%` }}
            />
          </div>
          <div className="programs-kpi-split">
            <span>{t("programs.kpi.remaining", locale)}</span>
            <strong>{formatTrips(remaining, locale)}</strong>
          </div>
        </article>

        <article className="surface-card programs-kpi">
          <span className="surface-kicker">
            {t("programs.kpi.secondaryKicker", locale)}
          </span>
          <h3>{t("programs.kpi.servedTitle", locale)}</h3>
          <p>{t("programs.kpi.servedBody", locale)}</p>
          <div className="programs-kpi-value-row">
            <strong>{formatPeople(periodSummary.served, locale)}</strong>
            <span>{t("programs.kpi.periodValue", locale)}</span>
          </div>
        </article>

        <article className="surface-card programs-kpi">
          <span className="surface-kicker">
            {t("programs.kpi.secondaryKicker", locale)}
          </span>
          <h3>{t("programs.kpi.exceptionTitle", locale)}</h3>
          <p>{t("programs.kpi.exceptionBody", locale)}</p>
          <div className="programs-kpi-value-row">
            <strong>
              {topExceptions.reduce((sum, item) => sum + item.count, 0)}
            </strong>
            <span>{t("programs.kpi.exceptionValue", locale)}</span>
          </div>
        </article>
      </section>

      <section className="surface-card programs-table-card">
        <div className="programs-section-head">
          <div>
            <span className="surface-kicker">
              {t("programs.table.kicker", locale)}
            </span>
            <h3>{t("programs.table.title", locale)}</h3>
          </div>
          <p>{t("programs.table.description", locale)}</p>
        </div>

        <div className="programs-table">
          <div className="programs-table-header">
            <span>{t("programs.table.headers.program", locale)}</span>
            <span>{t("programs.table.headers.coverage", locale)}</span>
            <span>{t("programs.table.headers.served", locale)}</span>
            <span>{t("programs.table.headers.quota", locale)}</span>
            <span>{t("programs.table.headers.trend", locale)}</span>
            <span>{t("programs.table.headers.exceptions", locale)}</span>
            <span>{t("programs.table.headers.policy", locale)}</span>
          </div>

          {programs.map((program) => {
            const rate = getUsageRate(program.used, program.total);
            const remainingTrips = program.total - program.used;

            return (
              <article key={program.id} className="programs-table-row">
                <div className="programs-program-meta">
                  <strong>{program.name}</strong>
                  <span>
                    {program.code} · {program.period}
                  </span>
                  <span>{program.issuer}</span>
                </div>

                <div className="programs-coverage">
                  <strong>{program.coverage}</strong>
                  <span>{program.benefits}</span>
                </div>

                <div className="programs-served">
                  <strong>{formatPeople(program.served, locale)}</strong>
                  <span>{t("programs.table.servedLabel", locale)}</span>
                </div>

                <div className="programs-quota">
                  <div className="programs-quota-stats">
                    <strong>{formatTrips(program.used, locale)}</strong>
                    <span>
                      {t("programs.kpi.ofTotal", locale, {
                        total: formatTrips(program.total, locale),
                      })}
                    </span>
                  </div>
                  <div className="programs-meter" aria-hidden="true">
                    <div
                      className="programs-meter-fill"
                      style={{ width: `${Math.min(rate, 100)}%` }}
                    />
                  </div>
                  <span className="programs-remaining">
                    {t("programs.table.remainingValue", locale, {
                      remaining: formatTrips(remainingTrips, locale),
                    })}
                  </span>
                </div>

                <div className="programs-trend">
                  <svg
                    viewBox="0 0 132 34"
                    role="img"
                    aria-label={t(program.trendLabelKey, locale)}
                  >
                    <path d={getTrendPath(program.trend)} />
                  </svg>
                  <strong>{formatPercent(rate)}</strong>
                  <span>{t(program.trendLabelKey, locale)}</span>
                </div>

                <div className="programs-exceptions">
                  <strong>
                    {program.exceptionCount} {t("programs.unit.case", locale)}
                  </strong>
                  <ul>
                    {program.exceptions.map((exception) => (
                      <li key={`${program.id}-${exception.reference}`}>
                        <span>{t(exception.typeKey, locale)}</span>
                        <code>{exception.reference}</code>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="programs-policy">
                  <strong>{t("programs.table.policySummary", locale)}</strong>
                  <p>{t(program.policyKey, locale)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">
            {t("programs.exceptions.kicker", locale)}
          </span>
          <h3>{t("programs.exceptions.title", locale)}</h3>
          <p>{t("programs.exceptions.description", locale)}</p>
          <ul className="programs-summary-list">
            {topExceptions.map((item) => (
              <li key={item.key}>
                <strong>
                  {t(item.key, locale)} · {item.count}{" "}
                  {t("programs.unit.case", locale)}
                </strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("programs.policy.kicker", locale)}
          </span>
          <h3>{t("programs.policy.title", locale)}</h3>
          <p>{t("programs.policy.description", locale)}</p>
          <ul className="programs-summary-list">
            <li>
              <strong>{t("programs.policy.rule1Title", locale)}</strong>
              <span>{t("programs.policy.rule1Body", locale)}</span>
            </li>
            <li>
              <strong>{t("programs.policy.rule2Title", locale)}</strong>
              <span>{t("programs.policy.rule2Body", locale)}</span>
            </li>
            <li>
              <strong>{t("programs.policy.rule3Title", locale)}</strong>
              <span>{t("programs.policy.rule3Body", locale)}</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
