import type { ReactNode } from "react";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { loadBankHomeSnapshot } from "@/lib/bank-dev-read-models";
import { bankConsoleHref, getBankConsoleSession, toHomeRole } from "@/lib/session";
import { tenantIssuerVars } from "@/lib/tenant-display";
import { t, type Locale } from "@/lib/translations";
import {
  quotaPct,
  roleView,
  type ExceptionKind,
  type ExceptionTone,
  type QuotaRow,
} from "@/lib/home-data";
import type { IssuerContractStatusRecord, TenantProgramUsageRecord } from "@drts/contracts";

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
          {pct !== null ? t("home.quota.used", locale, { pct }) : "—"}
        </span>
      </div>
      <div className="quota-track">
        <div
          className="quota-fill"
          style={{ width: pct !== null ? `${pct}%` : "0%" }}
        />
      </div>
      <span className="quota-remaining">
        {row.total > 0
          ? t("home.quota.remaining", locale, { remaining })
          : "—"}
      </span>
    </div>
  );
}

function SlaRow({
  labelKey,
  value,
  target,
  unit,
  locale,
}: {
  labelKey: "onTime" | "completion" | "response";
  value: number | null;
  target: number | null;
  unit: "%" | "s";
  locale: Locale;
}) {
  if (value === null || target === null) {
    return (
      <div className="sla-row">
        <span className="sla-label">{t(`home.sla.${labelKey}`, locale)}</span>
        <div className="sla-values">
          <span className="sla-value">N/A</span>
          <span className="sla-target">API</span>
        </div>
        <span className="pill dot tone-neutral">N/A</span>
      </div>
    );
  }

  const ok = unit === "s" ? value <= target : value >= target;
  return (
    <div className="sla-row">
      <span className="sla-label">{t(`home.sla.${labelKey}`, locale)}</span>
      <div className="sla-values">
        <span className={ok ? "sla-value" : "sla-value is-breach"}>
          {value}
          {unit}
        </span>
        <span className="sla-target">
          {t("home.sla.target", locale, {
            target,
            unit,
          })}
        </span>
      </div>
      <span className={`pill dot tone-${ok ? "success" : "danger"}`}>
        {ok ? t("home.sla.met", locale) : t("home.sla.breach", locale)}
      </span>
    </div>
  );
}

function formatDateLabel(value?: string) {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !match[1] || !match[2] || !match[3]) return value;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return `${datePart} (${weekdays[utcDate.getUTCDay()]})`;
}

function formatCompactMoney(amount: number, locale: Locale) {
  if (amount >= 1_000_000) {
    const compact = (amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 2);
    return locale === "zh" ? `NT$ ${compact}M` : `NT$ ${compact}M`;
  }
  return formatMoney(amount, locale);
}

function formatMoney(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function toneForException(kind: ExceptionKind): ExceptionTone {
  return kind === "no_supply" ? "danger" : "warning";
}

function mapExceptionKind(reasonCode: string): ExceptionKind {
  const normalized = (reasonCode ?? "").toLowerCase();
  if (normalized.includes("supply")) return "no_supply";
  if (normalized.includes("manual") || normalized.includes("review")) {
    return "manual_review";
  }
  return "sla_breach";
}

function buildHomeExceptions(contracts: IssuerContractStatusRecord[] = []) {
  const exceptions = (contracts ?? []).flatMap((contract) => {
    const openExceptions = (contract.exceptions ?? [])
      .filter((item) => item.status === "open")
      .map((item) => {
        const kind = mapExceptionKind(item.reasonCode ?? "");
        const entity = kind === "sla_breach" ? contract.contractId : item.orderId;
        const href =
          kind === "sla_breach"
            ? `/contracts/${contract.contractId}`
            : `/bookings/${item.orderId}`;

        return {
          kind,
          tone: toneForException(kind),
          entity,
          href,
        };
      });

    if (openExceptions.length > 0) {
      return openExceptions;
    }

    if (
      contract.status === "at_risk" ||
      contract.status === "breached" ||
      (contract.periodAttainment?.breachedTargets &&
        contract.periodAttainment.breachedTargets.length > 0)
    ) {
      return [
        {
          kind: "sla_breach" as const,
          tone: "warning" as const,
          entity: contract.contractId,
          href: `/contracts/${contract.contractId}`,
        },
      ];
    }

    return [];
  });

  return exceptions.slice(0, 3);
}

function buildQuotaRows(usage: TenantProgramUsageRecord[] = []): QuotaRow[] {
  return (usage ?? []).map((record) => ({
    program:
      record.programCode?.toLowerCase().includes("we")
        ? "worldElite"
        : "signature",
    used: record.tripsConsumed ?? 0,
    total: record.quotaTotal ?? 0,
  }));
}

function buildOverallQuota(rows: QuotaRow[]): QuotaRow {
  return {
    program: "all",
    used: rows.reduce((sum, row) => sum + row.used, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}

function buildSlaSummary(contracts: IssuerContractStatusRecord[] = []) {
  const attained = (contracts ?? [])
    .map((contract) => contract.periodAttainment)
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
  const completedTrips = attained.reduce(
    (sum, record) => sum + (record.completedTrips ?? 0),
    0,
  );
  const totalTrips = attained.reduce(
    (sum, record) => sum + (record.totalTrips ?? 0),
    0,
  );
  const onTimeWeighted = attained.reduce(
    (sum, record) =>
      sum + (record.pickupPunctualityPercent ?? 0) * (record.completedTrips ?? 0),
    0,
  );
  const completionWeighted = attained.reduce(
    (sum, record) =>
      sum + (record.completionRatePercent ?? 0) * (record.totalTrips ?? 0),
    0,
  );

  return {
    onTimeValue:
      completedTrips > 0
        ? Number((onTimeWeighted / completedTrips).toFixed(1))
        : null,
    completionValue:
      totalTrips > 0
        ? Number((completionWeighted / totalTrips).toFixed(1))
        : null,
  };
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
  const bankQuery = bankConsoleHref("/", tenant, locale, session.role).split("?")[1];
  const snapshot = await loadBankHomeSnapshot(tenant.tenantId, session.role);
  const quotaPrograms = buildQuotaRows(snapshot.data.usage);
  const quotaAll = buildOverallQuota(quotaPrograms);
  const exceptions = buildHomeExceptions(snapshot.data.contracts);
  const currentStatement =
    snapshot.data.statements && snapshot.data.statements.length > 0
      ? [...snapshot.data.statements].sort((left, right) =>
          (right.period ?? "").localeCompare(left.period ?? ""),
        )[0]
      : undefined;
  const sla = buildSlaSummary(snapshot.data.contracts);
  const upcomingOrders = (snapshot.data.orders ?? [])
    .filter((order) => order.state === "assigned" || order.state === "en_route")
    .slice(0, 6);

  const manualN = exceptions.filter((e) => e.kind === "manual_review").length;
  const supplyN = exceptions.filter((e) => e.kind === "no_supply").length;
  const slaN = exceptions.filter((e) => e.kind === "sla_breach").length;
  const exceptionRows =
    view.seeFinance && !view.seeOrders
      ? exceptions.filter((e) => e.kind === "sla_breach")
      : exceptions;

  return (
    <div className="page-shell bank-home" style={tenantIssuerVars(tenant)}>
      <header className="bank-home-head">
        <span className="eyebrow">{t("home.eyebrow", locale)}</span>
        <h1 className="bank-home-greeting">
          {t("home.greeting", locale, { name: session.actorName })}
          <span className="issuer-badge">{tenant.issuerCode}</span>
        </h1>
        <p className="bank-home-subtitle">
          {t("home.subtitle", locale, {
            date: formatDateLabel(snapshot.data.todayLabel),
            period: snapshot.data.period,
          })}
        </p>
        <div className="bank-home-meta">
          <span className="pill tone-issuer">{session.roleLabel}</span>
          <span className="bank-home-readonly">
            {t("home.readonly", locale)}
          </span>
        </div>
      </header>

      {snapshot.degradedMessage ? (
        <section className="bank-card">
          <div className="bank-card-body">{snapshot.degradedMessage}</div>
        </section>
      ) : null}

      <section className="bank-home-kpis">
        <Kpi
          label={t("home.kpi.orders", locale)}
          value={(snapshot.data.tallies?.total ?? 0).toLocaleString()}
          sub={t("home.kpi.orders.sub", locale, {
            reserved: snapshot.data.tallies?.reserved ?? 0,
            live: snapshot.data.tallies?.live ?? 0,
            done: snapshot.data.tallies?.completed ?? 0,
            cancelled: snapshot.data.tallies?.cancelled ?? 0,
          })}
        />
        <Kpi
          label={t("home.kpi.quota", locale)}
          value={quotaPct(quotaAll) !== null ? `${quotaPct(quotaAll)}%` : "—"}
          sub={
            quotaAll.total > 0
              ? t("home.kpi.quota.sub", locale, {
                  used: quotaAll.used.toLocaleString(),
                  total: quotaAll.total.toLocaleString(),
                })
              : locale === "zh"
                ? "無配額資料"
                : "No quota data"
          }
        />
        <Kpi
          label={t("home.kpi.onTime", locale)}
          value={sla.onTimeValue !== null ? `${sla.onTimeValue}%` : "—"}
          delta={
            sla.onTimeValue !== null
              ? t("home.kpi.onTime.delta", locale, { target: 95 })
              : locale === "zh"
                ? "無當期趟次"
                : "No trips in period"
          }
        />
        {view.seeFinance ? (
          <Kpi
            label={t("home.kpi.statement", locale)}
            value={
              currentStatement
                ? formatCompactMoney(
                    currentStatement.totalIssuerPayableAmount ?? 0,
                    locale,
                  )
                : "—"
            }
            {...(currentStatement
              ? {
                  delta: t("home.kpi.statement.delta", locale, {
                    period: currentStatement.period,
                    due: currentStatement.dueAt
                      ? currentStatement.dueAt.slice(5, 10)
                      : "—",
                  }),
                }
              : {
                  delta: locale === "zh" ? "無當期帳單" : "No statement",
                })}
          />
        ) : (
          <Kpi
            label={t("home.kpi.exceptions", locale)}
            value={String(exceptions.length)}
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
                n: upcomingOrders.length,
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
                    {upcomingOrders.map((order) => (
                      <tr key={order.orderId}>
                        <td className="bank-id">{order.orderNo}</td>
                        <td>
                          <span
                            className={`pill tone-${
                              order.direction === "outbound" ? "info" : "neutral"
                            }`}
                          >
                            {t(`home.direction.${order.direction}`, locale)}
                          </span>
                        </td>
                        <td className="mono-cell">
                          {order.flightNo} · {order.terminal}
                        </td>
                        <td className="mono-cell">
                          {order.scheduledAt
                            ? order.scheduledAt.slice(5, 16).replace("T", " ")
                            : "—"}
                        </td>
                        <td className="mono-cell muted">
                          {order.cardholderRefMasked}
                        </td>
                        <td>
                          <span className="pill dot tone-accent">
                            {order.state === "en_route"
                              ? t("home.state.live", locale)
                              : t("home.state.reserved", locale)}
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
            currentStatement ? (
              <Card
                title={t("home.statement.title", locale, {
                  period: currentStatement.period,
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
                    value={currentStatement.period}
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
                      trips: currentStatement.totalTrips,
                    })}
                    mono
                  />
                  <DlItem
                    label={t("home.settlement.total", locale)}
                    value={formatMoney(currentStatement.totalIssuerPayableAmount, locale)}
                    mono
                  />
                  <DlItem
                    label={t("home.settlement.issued", locale)}
                    value={
                      currentStatement.issuedAt
                        ? currentStatement.issuedAt.slice(0, 10)
                        : "—"
                    }
                    mono
                  />
                  <DlItem
                    label={t("home.settlement.due", locale)}
                    value={
                      currentStatement.dueAt
                        ? currentStatement.dueAt.slice(0, 10)
                        : "—"
                    }
                    mono
                  />
                </div>
              </Card>
            ) : (
              <Card
                title={t("home.settlement.title", locale)}
                subtitle={t("home.settlement.subtitle", locale)}
                actions={
                  <a className="card-link" href={`/statements?${bankQuery}`}>
                    {t("home.settlement.cta", locale)} →
                  </a>
                }
              >
                <div className="empty-state">
                  <p>{locale === "zh" ? "尚無可顯示之對帳單" : "No settlement statement available"}</p>
                </div>
              </Card>
            )
          ) : null}

          <Card
            title={t("home.exceptions.title", locale)}
            subtitle={t("home.exceptions.subtitle", locale)}
            actions={
              <span className="pill tone-warning">
                {t("home.exceptions.badge", locale, { n: exceptions.length })}
              </span>
            }
          >
            <div className="exception-list">
              {exceptionRows.map((exception, index) => (
                <div
                  key={`${exception.entity}-${index}`}
                  className={`exception is-${exception.tone}`}
                >
                  <div className="exception-head">
                    <strong>
                      {t(`home.ex.${exception.kind}.title`, locale, {
                        entity: exception.entity,
                      })}
                    </strong>
                    <span className="exception-code">{exception.kind}</span>
                  </div>
                  <p>
                    {t(`home.ex.${exception.kind}.body`, locale, {
                      entity: exception.entity,
                    })}
                  </p>
                  <a
                    className="card-link"
                    href={`${exception.href}?bank=${tenant.code}&locale=${locale}&role=${session.role}`}
                  >
                    {exception.entity} →
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
                row={quotaAll}
                label={t("home.program.all", locale)}
                locale={locale}
              />
              {quotaPrograms.map((row) => (
                <QuotaBar
                  key={`${row.program}-${row.total}`}
                  row={row}
                  label={t(`home.program.${row.program}`, locale)}
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
              <SlaRow
                labelKey="onTime"
                value={sla.onTimeValue}
                target={95}
                unit="%"
                locale={locale}
              />
              <SlaRow
                labelKey="completion"
                value={sla.completionValue}
                target={99}
                unit="%"
                locale={locale}
              />
              <SlaRow
                labelKey="response"
                value={null}
                target={null}
                unit="s"
                locale={locale}
              />
              <p className="sla-note">{t("home.sla.note", locale)}</p>
            </Card>
          ) : null}

          {view.seeFinance && view.seeOrders ? (
            currentStatement ? (
              <Card
                title={t("home.settlement.title", locale)}
                subtitle={t("home.settlement.subtitle", locale)}
              >
                <div className="bank-dl cols-2">
                  <DlItem
                    label={t("home.settlement.period", locale)}
                    value={currentStatement.period}
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
                    value={formatCompactMoney(
                      currentStatement.totalIssuerPayableAmount,
                      locale,
                    )}
                    mono
                  />
                  <DlItem
                    label={t("home.settlement.due", locale)}
                    value={
                      currentStatement.dueAt
                        ? currentStatement.dueAt.slice(5, 10)
                        : "—"
                    }
                    mono
                  />
                </div>
              </Card>
            ) : (
              <Card
                title={t("home.settlement.title", locale)}
                subtitle={t("home.settlement.subtitle", locale)}
              >
                <div className="empty-state">
                  <p>{locale === "zh" ? "尚無可顯示之對帳單" : "No settlement statement available"}</p>
                </div>
              </Card>
            )
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
