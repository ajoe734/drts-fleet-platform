import type { CSSProperties } from "react";
import { PageHero } from "@/components/page-primitives";
import { t } from "@/lib/translations";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";

const issuerBrand = BRAND_TEMPLATES.CTBC.tokens.dark;

const PROGRAMS = [
  {
    id: "WE-Q2",
    name: "鼎極卡機場接送",
    code: "CTBC-WE",
    period: "2026 Q2",
    issuer: "CTBC · 中信銀行",
    coverage: "全球機場接或送 2 趟 / 季",
    benefits: "VISA Infinite / 正附卡合併歸戶",
    served: 1240,
    used: 1820,
    total: 2400,
    trend: [60, 72, 74, 81, 88, 92],
    trendLabelKey: "programs.trend.rising",
    exceptionCount: 12,
    policyKey: "programs.policy.worldElite",
    exceptions: [
      {
        typeKey: "programs.exception.flightChange",
        reference: "卡友 CTBC-CH***204 · 權益 BR***771",
      },
      {
        typeKey: "programs.exception.outOfWindow",
        reference: "卡友 CTBC-CH***992 · 權益 BR***118",
      },
    ],
  },
  {
    id: "PRIV-Q2",
    name: "商旅御璽卡禮遇",
    code: "CTBC-BIZ",
    period: "2026 Q2",
    issuer: "CTBC · 中信銀行",
    coverage: "桃園 / 松山 / 高雄 接送",
    benefits: "Mastercard World Elite / 年消費門檻",
    served: 860,
    used: 990,
    total: 1200,
    trend: [52, 58, 63, 69, 76, 83],
    trendLabelKey: "programs.trend.watch",
    exceptionCount: 7,
    policyKey: "programs.policy.business",
    exceptions: [
      {
        typeKey: "programs.exception.manualReview",
        reference: "卡友 CTBC-CH***451 · 權益 BR***553",
      },
      {
        typeKey: "programs.exception.duplicateUsage",
        reference: "卡友 CTBC-CH***320 · 權益 BR***402",
      },
    ],
  },
  {
    id: "PREM-H1",
    name: "晶緻卡新戶禮遇",
    code: "CTBC-NEW",
    period: "2026 H1",
    issuer: "CTBC · 中信銀行",
    coverage: "國內指定機場送機 1 趟 / 半年",
    benefits: "新戶核卡 90 日內啟用",
    served: 430,
    used: 286,
    total: 900,
    trend: [18, 24, 29, 28, 31, 34],
    trendLabelKey: "programs.trend.steady",
    exceptionCount: 3,
    policyKey: "programs.policy.newCard",
    exceptions: [
      {
        typeKey: "programs.exception.expiredEligibility",
        reference: "卡友 CTBC-CH***087 · 權益 BR***090",
      },
      {
        typeKey: "programs.exception.missingReceipt",
        reference: "卡友 CTBC-CH***611 · 權益 BR***264",
      },
    ],
  },
] as const;

const PERIOD_SUMMARY = {
  served: PROGRAMS.reduce((sum, program) => sum + program.served, 0),
  used: PROGRAMS.reduce((sum, program) => sum + program.used, 0),
  total: PROGRAMS.reduce((sum, program) => sum + program.total, 0),
};

const TOP_EXCEPTIONS = [
  {
    key: "programs.exception.outOfWindow",
    count: 9,
    detail: "多發於凌晨航班改票後逾 24 小時重提",
  },
  {
    key: "programs.exception.manualReview",
    count: 7,
    detail: "高單價接送與跨區加價需人工覆核",
  },
  {
    key: "programs.exception.flightChange",
    count: 6,
    detail: "航班異動後重派車產生 quota 回補延遲",
  },
] as const;

function formatTrips(value: number) {
  return `${value.toLocaleString("zh-TW")} ${t("programs.unit.trip")}`;
}

function formatPeople(value: number) {
  return `${value.toLocaleString("zh-TW")} ${t("programs.unit.person")}`;
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

export default function ProgramsPage() {
  const remaining = PERIOD_SUMMARY.total - PERIOD_SUMMARY.used;
  const usageRate = getUsageRate(PERIOD_SUMMARY.used, PERIOD_SUMMARY.total);

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
        eyebrow={t("programs.eyebrow")}
        title={t("programs.title")}
        description={t("programs.lead")}
      />

      <section className="programs-banner">
        <div>
          <p className="programs-banner-label">{t("programs.banner.label")}</p>
          <h2>{t("programs.banner.title")}</h2>
          <p>{t("programs.banner.body")}</p>
        </div>
        <dl className="programs-banner-meta">
          <div>
            <dt>{t("programs.banner.issuer")}</dt>
            <dd>CTBC · 中信銀行</dd>
          </div>
          <div>
            <dt>{t("programs.banner.scope")}</dt>
            <dd>{t("programs.banner.scopeValue")}</dd>
          </div>
        </dl>
      </section>

      <section className="surface-grid programs-kpi-grid">
        <article className="surface-card programs-kpi programs-kpi-primary">
          <span className="surface-kicker">
            {t("programs.kpi.primaryKicker")}
          </span>
          <h3>{t("programs.kpi.quotaTitle")}</h3>
          <p>{t("programs.kpi.quotaBody")}</p>
          <div className="programs-kpi-value-row">
            <strong>{formatTrips(PERIOD_SUMMARY.used)}</strong>
            <span>
              {t("programs.kpi.ofTotal", undefined, {
                total: formatTrips(PERIOD_SUMMARY.total),
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
            <span>{t("programs.kpi.remaining")}</span>
            <strong>{formatTrips(remaining)}</strong>
          </div>
        </article>

        <article className="surface-card programs-kpi">
          <span className="surface-kicker">
            {t("programs.kpi.secondaryKicker")}
          </span>
          <h3>{t("programs.kpi.servedTitle")}</h3>
          <p>{t("programs.kpi.servedBody")}</p>
          <div className="programs-kpi-value-row">
            <strong>{formatPeople(PERIOD_SUMMARY.served)}</strong>
            <span>{t("programs.kpi.periodValue")}</span>
          </div>
        </article>

        <article className="surface-card programs-kpi">
          <span className="surface-kicker">
            {t("programs.kpi.secondaryKicker")}
          </span>
          <h3>{t("programs.kpi.exceptionTitle")}</h3>
          <p>{t("programs.kpi.exceptionBody")}</p>
          <div className="programs-kpi-value-row">
            <strong>
              {TOP_EXCEPTIONS.reduce((sum, item) => sum + item.count, 0)}
            </strong>
            <span>{t("programs.kpi.exceptionValue")}</span>
          </div>
        </article>
      </section>

      <section className="surface-card programs-table-card">
        <div className="programs-section-head">
          <div>
            <span className="surface-kicker">{t("programs.table.kicker")}</span>
            <h3>{t("programs.table.title")}</h3>
          </div>
          <p>{t("programs.table.description")}</p>
        </div>

        <div className="programs-table">
          <div className="programs-table-header">
            <span>{t("programs.table.headers.program")}</span>
            <span>{t("programs.table.headers.coverage")}</span>
            <span>{t("programs.table.headers.served")}</span>
            <span>{t("programs.table.headers.quota")}</span>
            <span>{t("programs.table.headers.trend")}</span>
            <span>{t("programs.table.headers.exceptions")}</span>
            <span>{t("programs.table.headers.policy")}</span>
          </div>

          {PROGRAMS.map((program) => {
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
                  <strong>{formatPeople(program.served)}</strong>
                  <span>{t("programs.table.servedLabel")}</span>
                </div>

                <div className="programs-quota">
                  <div className="programs-quota-stats">
                    <strong>{formatTrips(program.used)}</strong>
                    <span>
                      {t("programs.kpi.ofTotal", undefined, {
                        total: formatTrips(program.total),
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
                    {t("programs.table.remainingValue", undefined, {
                      remaining: formatTrips(remainingTrips),
                    })}
                  </span>
                </div>

                <div className="programs-trend">
                  <svg
                    viewBox="0 0 132 34"
                    role="img"
                    aria-label={t(program.trendLabelKey)}
                  >
                    <path d={getTrendPath(program.trend)} />
                  </svg>
                  <strong>{formatPercent(rate)}</strong>
                  <span>{t(program.trendLabelKey)}</span>
                </div>

                <div className="programs-exceptions">
                  <strong>
                    {program.exceptionCount} {t("programs.unit.case")}
                  </strong>
                  <ul>
                    {program.exceptions.map((exception) => (
                      <li key={`${program.id}-${exception.reference}`}>
                        <span>{t(exception.typeKey)}</span>
                        <code>{exception.reference}</code>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="programs-policy">
                  <strong>{t("programs.table.policySummary")}</strong>
                  <p>{t(program.policyKey)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">
            {t("programs.exceptions.kicker")}
          </span>
          <h3>{t("programs.exceptions.title")}</h3>
          <p>{t("programs.exceptions.description")}</p>
          <ul className="programs-summary-list">
            {TOP_EXCEPTIONS.map((item) => (
              <li key={item.key}>
                <strong>
                  {t(item.key)} · {item.count} {t("programs.unit.case")}
                </strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">{t("programs.policy.kicker")}</span>
          <h3>{t("programs.policy.title")}</h3>
          <p>{t("programs.policy.description")}</p>
          <ul className="programs-summary-list">
            <li>
              <strong>{t("programs.policy.rule1Title")}</strong>
              <span>{t("programs.policy.rule1Body")}</span>
            </li>
            <li>
              <strong>{t("programs.policy.rule2Title")}</strong>
              <span>{t("programs.policy.rule2Body")}</span>
            </li>
            <li>
              <strong>{t("programs.policy.rule3Title")}</strong>
              <span>{t("programs.policy.rule3Body")}</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
