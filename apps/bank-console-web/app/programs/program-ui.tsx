import type { CSSProperties } from "react";
import type { TenantProgramUsageRecord } from "@drts/contracts";
import type { BankProgram, BankProgramsData } from "@/lib/bank-dev-read-models";
import type { BankDemoTenant } from "@/lib/demo-tenants";
import { t, type Locale } from "@/lib/translations";

export function programIssuerStyle(tenant: BankDemoTenant): CSSProperties {
  const brand = tenant.template.tokens.dark;
  return {
    "--issuer-primary": brand.primary,
    "--issuer-primary-dark": brand.primaryDark,
    "--issuer-accent": brand.accent,
    "--issuer-ink": brand.ink,
    "--issuer-surface": brand.surface.bg,
    "--issuer-border": brand.surface.border,
    "--issuer-panel-border": brand.theme.panelBorder,
    "--issuer-accent-soft": brand.theme.accentSoft,
    "--issuer-text-muted": brand.text.muted,
  } as CSSProperties;
}

export function ProgramSourceStatus({
  result,
  locale,
}: {
  result: BankProgramsData;
  locale: Locale;
}) {
  return (
    <section
      className="surface-card"
      role={result.degradedMessage ? "alert" : "status"}
    >
      <strong>
        {t(
          result.degradedMessage
            ? "programs.source.partial"
            : "programs.source.live",
          locale,
        )}
      </strong>
      <p>
        {t("programs.source.definitions", locale)}:{" "}
        {t(
          result.data.programsAvailable
            ? "programs.source.connected"
            : "programs.source.unavailable",
          locale,
        )}
        {" · "}
        {t("programs.source.usage", locale)}:{" "}
        {t(
          result.data.usageAvailable
            ? "programs.source.connected"
            : "programs.source.unavailable",
          locale,
        )}
      </p>
    </section>
  );
}

function formatNumber(value: number | null, locale: Locale) {
  return value === null
    ? t("programs.notProvided", locale)
    : value.toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

function usageRate(usage: TenantProgramUsageRecord) {
  return usage.quotaTotal === null || usage.quotaTotal === 0
    ? null
    : Math.round((usage.tripsConsumed / usage.quotaTotal) * 100);
}

export function QuotaBar({
  usage,
  locale,
}: {
  usage: TenantProgramUsageRecord;
  locale: Locale;
}) {
  const pct = usageRate(usage);
  return (
    <div className="quota-row">
      <span className="quota-label">
        {t("programs.card.quotaLabel", locale)}
      </span>
      <div className="quota-figures">
        <span className="quota-used">
          {formatNumber(usage.tripsConsumed, locale)}{" "}
          {t("programs.unit.trip", locale)}
        </span>
        <span className="quota-total">
          {t("programs.kpi.ofTotal", locale, {
            total: formatNumber(usage.quotaTotal, locale),
          })}
        </span>
        {pct !== null ? <span className="quota-pct">{pct}%</span> : null}
      </div>
      {pct !== null ? (
        <div className="quota-track">
          <div
            className="quota-fill"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      ) : null}
      <span className="quota-remaining">
        {t("programs.table.remainingValue", locale, {
          remaining: formatNumber(usage.quotaRemaining, locale),
        })}
      </span>
    </div>
  );
}

function usageCsv(program: BankProgram) {
  const rows: Array<Array<string | number | null>> = [
    [
      "ProgramId",
      "ProgramName",
      "ProgramCode",
      "Period",
      "CardholdersServed",
      "TripsConsumed",
      "QuotaTotal",
      "QuotaRemaining",
    ],
    ...program.usage.map((usage) => [
      program.id,
      program.name,
      usage.programCode,
      usage.period,
      usage.cardholdersServed,
      usage.tripsConsumed,
      usage.quotaTotal,
      usage.quotaRemaining,
    ]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n")
  );
}

export function ProgramUsageDownload({
  program,
  usageAvailable,
  locale,
}: {
  program: BankProgram;
  usageAvailable: boolean;
  locale: Locale;
}) {
  if (!usageAvailable || program.usage.length === 0) {
    return (
      <p>
        {t(
          usageAvailable ? "programs.noUsage" : "programs.usageUnavailable",
          locale,
        )}
      </p>
    );
  }
  return (
    <a
      className="table-action-button"
      download={`program-${encodeURIComponent(program.id)}-usage.csv`}
      href={`data:text/csv;charset=utf-8,${encodeURIComponent(usageCsv(program))}`}
    >
      {t("programs.action.exportUsage", locale)}
    </a>
  );
}

export function ProgramUsageTable({
  programs,
  usageAvailable,
  locale,
}: {
  programs: BankProgram[];
  usageAvailable: boolean;
  locale: Locale;
}) {
  if (
    !usageAvailable ||
    !programs.some((program) => program.usage.length > 0)
  ) {
    return (
      <p>
        {t(
          usageAvailable ? "programs.noUsage" : "programs.usageUnavailable",
          locale,
        )}
      </p>
    );
  }
  return (
    <div className="bank-table-scroll">
      <table className="bank-table">
        <thead>
          <tr>
            <th>{t("programs.summary.headers.program", locale)}</th>
            <th>{t("programs.summary.headers.code", locale)}</th>
            <th>{t("programs.period", locale)}</th>
            <th>{t("programs.summary.headers.served", locale)}</th>
            <th>{t("programs.summary.headers.used", locale)}</th>
            <th>{t("programs.summary.headers.total", locale)}</th>
            <th>{t("programs.summary.headers.remaining", locale)}</th>
            <th>{t("programs.summary.headers.rate", locale)}</th>
          </tr>
        </thead>
        <tbody>
          {programs.flatMap((program) =>
            program.usage.map((usage) => {
              const pct = usageRate(usage);
              return (
                <tr key={`${program.id}:${usage.programCode}:${usage.period}`}>
                  <td>{program.name}</td>
                  <td className="mono-cell">{usage.programCode}</td>
                  <td>{usage.period}</td>
                  <td className="mono-cell">
                    {formatNumber(usage.cardholdersServed, locale)}
                  </td>
                  <td className="mono-cell">
                    {formatNumber(usage.tripsConsumed, locale)}
                  </td>
                  <td className="mono-cell">
                    {formatNumber(usage.quotaTotal, locale)}
                  </td>
                  <td className="mono-cell">
                    {formatNumber(usage.quotaRemaining, locale)}
                  </td>
                  <td className="mono-cell">
                    {pct === null ? "—" : `${pct}%`}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
