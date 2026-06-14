import type { ReactNode } from "react";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { getBankConsoleSession, toHomeRole } from "@/lib/session";
import { tenantDisplayText, tenantIssuerVars } from "@/lib/tenant-display";
import { t, type Locale } from "@/lib/translations";
import {
  EXCEPTIONS,
  ON_TIME_SLA,
  ORDER_TALLIES,
  PERIOD,
  QUOTA_ALL,
  QUOTA_PROGRAMS,
  SLA_METRICS,
  STATEMENT,
  TODAY,
  UPCOMING_ORDERS,
  orderStateTone,
  quotaPct,
  roleView,
  slaMet,
  type QuotaRow,
  type SlaMetric,
} from "@/lib/home-data";

function Card({
  title,
  subtitle,
  actions,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`bank-card${accent ? " is-accent" : ""}`}>
      <div className="bank-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="bank-card-actions">{actions}</div> : null}
      </div>
      <div className="bank-card-body">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
}) {
  return (
    <article className="bank-kpi">
      <span className="bank-kpi-label">{label}</span>
      <span className="bank-kpi-value">{value}</span>
      {sub ? <span className="bank-kpi-sub">{sub}</span> : null}
      {delta ? <span className="bank-kpi-delta">{delta}</span> : null}
    </article>
  );
}

function DlItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="dl-item">
      <span className="dl-key">{label}</span>
      <span className={mono ? "dl-val mono-cell" : "dl-val"}>{value}</span>
    </div>
  );
}

function QuotaBar({
  row,
  label,
  locale,
}: {
  row: QuotaRow;
  label: string;
  locale: Locale;
}) {
  const pct = quotaPct(row);
  const remaining = (row.total - row.used).toLocaleString();
  return (
    <div className="quota-row">
      <span className="quota-label">{label}</span>
      <div className="quota-figures">
        <span className="quota-used">{row.used.toLocaleString()}</span>
        <span className="quota-total">
          {t("home.quota.totalUnit", locale, {
            total: row.total.toLocaleString(),
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
        {t("home.quota.remaining", locale, { remaining })}
      </span>
    </div>
  );
}

function SlaRow({ metric, locale }: { metric: SlaMetric; locale: Locale }) {
  const ok = slaMet(metric);
  return (
    <div className="sla-row">
      <span className="sla-label">{t(`home.sla.${metric.key}`, locale)}</span>
      <div className="sla-values">
        <span className={ok ? "sla-value" : "sla-value is-breach"}>
          {metric.value}
          {metric.unit}
        </span>
        <span className="sla-target">
          {t("home.sla.target", locale, {
            target: metric.target,
            unit: metric.unit,
          })}
        </span>
      </div>
      <span className={`pill dot tone-${ok ? "success" : "danger"}`}>
        {ok ? t("home.sla.met", locale) : t("home.sla.breach", locale)}
      </span>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    bank?: string | string[];
    locale?: string | string[];
    role?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
  const tenant = resolveBankDemoTenant(params.bank);
  const session = getBankConsoleSession(tenant, locale, params.role);
  const view = roleView(toHomeRole(session.role));
  const onTime = ON_TIME_SLA;
  const bankQuery = `bank=${tenant.code}&locale=${locale}&role=${session.role}`;

  const manualN = EXCEPTIONS.filter((e) => e.kind === "manual_review").length;
  const supplyN = EXCEPTIONS.filter((e) => e.kind === "no_supply").length;
  const slaN = EXCEPTIONS.filter((e) => e.kind === "sla_breach").length;

  // Finance-only viewers (no order scope) see just the SLA-linked exceptions.
  const exceptions =
    view.seeFinance && !view.seeOrders
      ? EXCEPTIONS.filter((e) => e.kind === "sla_breach")
      : EXCEPTIONS;

  return (
    <div className="page-shell bank-home" style={tenantIssuerVars(tenant)}>
      <header className="bank-home-head">
        <span className="eyebrow">{t("home.eyebrow", locale)}</span>
        <h1 className="bank-home-greeting">
          {t("home.greeting", locale, { name: session.actorName })}
          <span className="issuer-badge">{tenant.issuerCode}</span>
        </h1>
        <p className="bank-home-subtitle">
          {t("home.subtitle", locale, { date: TODAY, period: PERIOD })}
        </p>
        <div className="bank-home-meta">
          <span className="pill tone-issuer">{session.roleLabel}</span>
          <span className="bank-home-readonly">
            {t("home.readonly", locale)}
          </span>
        </div>
      </header>

      <section className="bank-home-kpis">
        <Kpi
          label={t("home.kpi.orders", locale)}
          value={ORDER_TALLIES.total.toLocaleString()}
          sub={t("home.kpi.orders.sub", locale, {
            reserved: ORDER_TALLIES.reserved,
            live: ORDER_TALLIES.live,
            done: ORDER_TALLIES.completed,
            cancelled: ORDER_TALLIES.cancelled,
          })}
        />
        <Kpi
          label={t("home.kpi.quota", locale)}
          value={`${quotaPct(QUOTA_ALL)}%`}
          sub={t("home.kpi.quota.sub", locale, {
            used: QUOTA_ALL.used.toLocaleString(),
            total: QUOTA_ALL.total.toLocaleString(),
          })}
        />
        <Kpi
          label={t("home.kpi.onTime", locale)}
          value={`${onTime.value}%`}
          delta={t("home.kpi.onTime.delta", locale, { target: onTime.target })}
        />
        {view.seeFinance ? (
          <Kpi
            label={t("home.kpi.statement", locale)}
            value={STATEMENT.totalCompact}
            delta={t("home.kpi.statement.delta", locale, {
              period: STATEMENT.period,
              due: STATEMENT.due.slice(5),
            })}
          />
        ) : (
          <Kpi
            label={t("home.kpi.exceptions", locale)}
            value={String(EXCEPTIONS.length)}
            delta={t("home.kpi.exceptions.delta", locale, {
              manual: manualN,
              supply: supplyN,
              sla: slaN,
            })}
          />
        )}
      </section>

      <div className="bank-home-grid">
        <div className="bank-home-col">
          {view.seeOrders ? (
            <Card
              title={t("home.upcoming.title", locale)}
              subtitle={t("home.upcoming.subtitle", locale, {
                n: UPCOMING_ORDERS.length,
              })}
              actions={
                <a className="card-link" href={`/bookings?${bankQuery}`}>
                  {t("home.upcoming.cta", locale)} →
                </a>
              }
            >
              <div className="bank-table-scroll">
                <table className="bank-table">
                  <thead>
                    <tr>
                      <th>{t("home.col.id", locale)}</th>
                      <th>{t("home.col.direction", locale)}</th>
                      <th>{t("home.col.flight", locale)}</th>
                      <th>{t("home.col.window", locale)}</th>
                      <th>{t("home.col.cardholder", locale)}</th>
                      <th>{t("home.col.state", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {UPCOMING_ORDERS.map((o) => (
                      <tr key={o.id}>
                        <td className="bank-id">{o.id}</td>
                        <td>
                          <span
                            className={`pill tone-${
                              o.direction === "outbound" ? "info" : "neutral"
                            }`}
                          >
                            {t(`home.direction.${o.direction}`, locale)}
                          </span>
                        </td>
                        <td className="mono-cell">
                          {o.flight} · {o.terminal}
                        </td>
                        <td className="mono-cell">{o.window}</td>
                        <td className="mono-cell muted">{o.cardholderRef}</td>
                        <td>
                          <span
                            className={`pill dot tone-${orderStateTone(o.state)}`}
                          >
                            {t(`home.state.${o.state}`, locale)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {!view.seeOrders && view.seeFinance ? (
            <Card
              title={t("home.statement.title", locale, {
                period: STATEMENT.period,
              })}
              subtitle={t("home.statement.subtitle", locale)}
              actions={
                <a className="card-link" href={`/statements?${bankQuery}`}>
                  {t("home.settlement.cta", locale)} →
                </a>
              }
            >
              <div className="bank-dl cols-2">
                <DlItem
                  label={t("home.settlement.period", locale)}
                  value={STATEMENT.period}
                  mono
                />
                <DlItem
                  label={t("home.settlement.status", locale)}
                  value={
                    <span className="pill dot tone-warning">
                      {t("home.settlement.dueBadge", locale)}
                    </span>
                  }
                />
                <DlItem
                  label={t("home.settlement.trips", locale)}
                  value={t("home.settlement.tripsUnit", locale, {
                    trips: STATEMENT.trips,
                  })}
                  mono
                />
                <DlItem
                  label={t("home.settlement.total", locale)}
                  value={STATEMENT.totalFull}
                  mono
                />
                <DlItem
                  label={t("home.settlement.issued", locale)}
                  value={STATEMENT.issued}
                  mono
                />
                <DlItem
                  label={t("home.settlement.due", locale)}
                  value={STATEMENT.due}
                  mono
                />
              </div>
            </Card>
          ) : null}

          <Card
            title={t("home.exceptions.title", locale)}
            subtitle={t("home.exceptions.subtitle", locale)}
            actions={
              <span className="pill tone-warning">
                {t("home.exceptions.badge", locale, { n: EXCEPTIONS.length })}
              </span>
            }
          >
            <div className="exception-list">
              {exceptions.map((e, i) => (
                <div
                  key={`${e.entity}-${i}`}
                  className={`exception is-${e.tone}`}
                >
                  <div className="exception-head">
                    <strong>
                      {t(`home.ex.${e.kind}.title`, locale, {
                        entity: tenantDisplayText(e.entity, tenant),
                      })}
                    </strong>
                    <span className="exception-code">{e.kind}</span>
                  </div>
                  <p>
                    {t(`home.ex.${e.kind}.body`, locale, {
                      entity: tenantDisplayText(e.entity, tenant),
                    })}
                  </p>
                  <a className="card-link" href={`/bookings?${bankQuery}`}>
                    {tenantDisplayText(e.entity, tenant)} →
                  </a>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="bank-home-col">
          {view.seeQuota ? (
            <Card
              title={t("home.quota.title", locale)}
              subtitle={t("home.quota.subtitle", locale)}
              accent
            >
              <QuotaBar
                row={QUOTA_ALL}
                label={t("home.program.all", locale)}
                locale={locale}
              />
              {QUOTA_PROGRAMS.map((r) => (
                <QuotaBar
                  key={r.program}
                  row={r}
                  label={t(`home.program.${r.program}`, locale)}
                  locale={locale}
                />
              ))}
            </Card>
          ) : null}

          {view.seeSla ? (
            <Card
              title={t("home.sla.title", locale)}
              subtitle={t("home.sla.subtitle", locale)}
            >
              {SLA_METRICS.map((m) => (
                <SlaRow key={m.key} metric={m} locale={locale} />
              ))}
              <p className="sla-note">{t("home.sla.note", locale)}</p>
            </Card>
          ) : null}

          {view.seeFinance && view.seeOrders ? (
            <Card
              title={t("home.settlement.title", locale)}
              subtitle={t("home.settlement.subtitle", locale)}
            >
              <div className="bank-dl cols-2">
                <DlItem
                  label={t("home.settlement.period", locale)}
                  value={STATEMENT.period}
                  mono
                />
                <DlItem
                  label={t("home.settlement.status", locale)}
                  value={
                    <span className="pill dot tone-warning">
                      {t("home.settlement.dueBadge", locale)}
                    </span>
                  }
                />
                <DlItem
                  label={t("home.settlement.total", locale)}
                  value={STATEMENT.totalCompact}
                  mono
                />
                <DlItem
                  label={t("home.settlement.due", locale)}
                  value={STATEMENT.due.slice(5)}
                  mono
                />
              </div>
            </Card>
          ) : null}

          {!view.seeFinance ? (
            <Card title={t("home.settlement.title", locale)}>
              <div className="empty-state">
                <span className="lock-dot" aria-hidden="true" />
                <p>{t("home.settlement.denied", locale)}</p>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
