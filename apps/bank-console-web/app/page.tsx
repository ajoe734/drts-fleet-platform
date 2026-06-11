import type { CSSProperties, ReactNode } from "react";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import { t } from "@/lib/translations";
import {
  BANK_ACTORS,
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
  resolveRole,
  roleView,
  slaMet,
  type QuotaRow,
  type SlaMetric,
} from "@/lib/home-data";

// Issuer brand (中信/CTBC navy + gold) sourced from the @drts/ui-tokens token
// set — never a hand-picked hex (keeps scripts/check_ui_realm_tokens.py green).
// The window chrome stays on the tenant realm (teal) via BankShell; the issuer
// brand only accents the card-benefit data (screen-requirements §7 VQ-1).
const ctbc = BRAND_TEMPLATES.CTBC.tokens.dark;

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

function QuotaBar({ row, label }: { row: QuotaRow; label: string }) {
  const pct = quotaPct(row);
  const remaining = (row.total - row.used).toLocaleString();
  return (
    <div className="quota-row">
      <span className="quota-label">{label}</span>
      <div className="quota-figures">
        <span className="quota-used">{row.used.toLocaleString()}</span>
        <span className="quota-total">
          {t("home.quota.totalUnit", "zh", {
            total: row.total.toLocaleString(),
          })}
        </span>
        <span className="quota-pct">{t("home.quota.used", "zh", { pct })}</span>
      </div>
      <div className="quota-track">
        <div className="quota-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="quota-remaining">
        {t("home.quota.remaining", "zh", { remaining })}
      </span>
    </div>
  );
}

function SlaRow({ metric }: { metric: SlaMetric }) {
  const ok = slaMet(metric);
  return (
    <div className="sla-row">
      <span className="sla-label">{t(`home.sla.${metric.key}`)}</span>
      <div className="sla-values">
        <span className={ok ? "sla-value" : "sla-value is-breach"}>
          {metric.value}
          {metric.unit}
        </span>
        <span className="sla-target">
          {t("home.sla.target", "zh", {
            target: metric.target,
            unit: metric.unit,
          })}
        </span>
      </div>
      <span className={`pill dot tone-${ok ? "success" : "danger"}`}>
        {ok ? t("home.sla.met") : t("home.sla.breach")}
      </span>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  const params = await searchParams;
  const role = resolveRole(params.role);
  const actor = BANK_ACTORS[role];
  const view = roleView(role);
  const onTime = ON_TIME_SLA;

  const manualN = EXCEPTIONS.filter((e) => e.kind === "manual_review").length;
  const supplyN = EXCEPTIONS.filter((e) => e.kind === "no_supply").length;
  const slaN = EXCEPTIONS.filter((e) => e.kind === "sla_breach").length;

  // Finance-only viewers (no order scope) see just the SLA-linked exceptions.
  const exceptions =
    view.seeFinance && !view.seeOrders
      ? EXCEPTIONS.filter((e) => e.kind === "sla_breach")
      : EXCEPTIONS;

  const issuerVars = {
    "--issuer-primary": ctbc.primary,
    "--issuer-primary-dark": ctbc.primaryDark,
    "--issuer-accent": ctbc.accent,
    "--issuer-ink": ctbc.ink,
    "--issuer-surface": ctbc.surface.bg,
    "--issuer-border": ctbc.surface.border,
  } as CSSProperties;

  return (
    <div className="page-shell bank-home" style={issuerVars}>
      <header className="bank-home-head">
        <span className="eyebrow">{t("home.eyebrow")}</span>
        <h1 className="bank-home-greeting">
          {t("home.greeting", "zh", { name: actor.display })}
          <span className="issuer-badge">CTBC</span>
        </h1>
        <p className="bank-home-subtitle">
          {t("home.subtitle", "zh", { date: TODAY, period: PERIOD })}
        </p>
        <div className="bank-home-meta">
          <span className="pill tone-issuer">
            {t(`home.role.${actor.persona}`)}
          </span>
          <span className="bank-home-readonly">{t("home.readonly")}</span>
        </div>
      </header>

      <section className="bank-home-kpis">
        <Kpi
          label={t("home.kpi.orders")}
          value={ORDER_TALLIES.total.toLocaleString()}
          sub={t("home.kpi.orders.sub", "zh", {
            reserved: ORDER_TALLIES.reserved,
            live: ORDER_TALLIES.live,
            done: ORDER_TALLIES.completed,
            cancelled: ORDER_TALLIES.cancelled,
          })}
        />
        <Kpi
          label={t("home.kpi.quota")}
          value={`${quotaPct(QUOTA_ALL)}%`}
          sub={t("home.kpi.quota.sub", "zh", {
            used: QUOTA_ALL.used.toLocaleString(),
            total: QUOTA_ALL.total.toLocaleString(),
          })}
        />
        <Kpi
          label={t("home.kpi.onTime")}
          value={`${onTime.value}%`}
          delta={t("home.kpi.onTime.delta", "zh", { target: onTime.target })}
        />
        {view.seeFinance ? (
          <Kpi
            label={t("home.kpi.statement")}
            value={STATEMENT.totalCompact}
            delta={t("home.kpi.statement.delta", "zh", {
              period: STATEMENT.period,
              due: STATEMENT.due.slice(5),
            })}
          />
        ) : (
          <Kpi
            label={t("home.kpi.exceptions")}
            value={String(EXCEPTIONS.length)}
            delta={t("home.kpi.exceptions.delta", "zh", {
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
              title={t("home.upcoming.title")}
              subtitle={t("home.upcoming.subtitle", "zh", {
                n: UPCOMING_ORDERS.length,
              })}
              actions={
                <a className="card-link" href="/bookings">
                  {t("home.upcoming.cta")} →
                </a>
              }
            >
              <div className="bank-table-scroll">
                <table className="bank-table">
                  <thead>
                    <tr>
                      <th>{t("home.col.id")}</th>
                      <th>{t("home.col.direction")}</th>
                      <th>{t("home.col.flight")}</th>
                      <th>{t("home.col.window")}</th>
                      <th>{t("home.col.cardholder")}</th>
                      <th>{t("home.col.state")}</th>
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
                            {t(`home.direction.${o.direction}`)}
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
                            {t(`home.state.${o.state}`)}
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
              title={t("home.statement.title", "zh", {
                period: STATEMENT.period,
              })}
              subtitle={t("home.statement.subtitle")}
              actions={
                <a className="card-link" href="/statements">
                  {t("home.settlement.cta")} →
                </a>
              }
            >
              <div className="bank-dl cols-2">
                <DlItem
                  label={t("home.settlement.period")}
                  value={STATEMENT.period}
                  mono
                />
                <DlItem
                  label={t("home.settlement.status")}
                  value={
                    <span className="pill dot tone-warning">
                      {t("home.settlement.dueBadge")}
                    </span>
                  }
                />
                <DlItem
                  label={t("home.settlement.trips")}
                  value={t("home.settlement.tripsUnit", "zh", {
                    trips: STATEMENT.trips,
                  })}
                  mono
                />
                <DlItem
                  label={t("home.settlement.total")}
                  value={STATEMENT.totalFull}
                  mono
                />
                <DlItem
                  label={t("home.settlement.issued")}
                  value={STATEMENT.issued}
                  mono
                />
                <DlItem
                  label={t("home.settlement.due")}
                  value={STATEMENT.due}
                  mono
                />
              </div>
            </Card>
          ) : null}

          <Card
            title={t("home.exceptions.title")}
            subtitle={t("home.exceptions.subtitle")}
            actions={
              <span className="pill tone-warning">
                {t("home.exceptions.badge", "zh", { n: EXCEPTIONS.length })}
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
                      {t(`home.ex.${e.kind}.title`, "zh", { entity: e.entity })}
                    </strong>
                    <span className="exception-code">{e.kind}</span>
                  </div>
                  <p>
                    {t(`home.ex.${e.kind}.body`, "zh", { entity: e.entity })}
                  </p>
                  <a className="card-link" href="/bookings">
                    {e.entity} →
                  </a>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="bank-home-col">
          {view.seeQuota ? (
            <Card
              title={t("home.quota.title")}
              subtitle={t("home.quota.subtitle")}
              accent
            >
              <QuotaBar row={QUOTA_ALL} label={t("home.program.all")} />
              {QUOTA_PROGRAMS.map((r) => (
                <QuotaBar
                  key={r.program}
                  row={r}
                  label={t(`home.program.${r.program}`)}
                />
              ))}
            </Card>
          ) : null}

          {view.seeSla ? (
            <Card title={t("home.sla.title")} subtitle={t("home.sla.subtitle")}>
              {SLA_METRICS.map((m) => (
                <SlaRow key={m.key} metric={m} />
              ))}
              <p className="sla-note">{t("home.sla.note")}</p>
            </Card>
          ) : null}

          {view.seeFinance && view.seeOrders ? (
            <Card
              title={t("home.settlement.title")}
              subtitle={t("home.settlement.subtitle")}
            >
              <div className="bank-dl cols-2">
                <DlItem
                  label={t("home.settlement.period")}
                  value={STATEMENT.period}
                  mono
                />
                <DlItem
                  label={t("home.settlement.status")}
                  value={
                    <span className="pill dot tone-warning">
                      {t("home.settlement.dueBadge")}
                    </span>
                  }
                />
                <DlItem
                  label={t("home.settlement.total")}
                  value={STATEMENT.totalCompact}
                  mono
                />
                <DlItem
                  label={t("home.settlement.due")}
                  value={STATEMENT.due.slice(5)}
                  mono
                />
              </div>
            </Card>
          ) : null}

          {!view.seeFinance ? (
            <Card title={t("home.settlement.title")}>
              <div className="empty-state">
                <span className="lock-dot" aria-hidden="true" />
                <p>{t("home.settlement.denied")}</p>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
