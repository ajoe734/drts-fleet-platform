import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/page-primitives";
import { loadBankProgramsData } from "@/lib/bank-dev-read-models";
import {
  getBankTenantName,
  getBankTenantShortName,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import { bankConsoleHref, getBankConsoleSession } from "@/lib/session";
import { t } from "@/lib/translations";
import {
  programIssuerStyle,
  ProgramSourceStatus,
  ProgramUsageDownload,
  ProgramUsageTable,
  QuotaBar,
} from "./program-ui";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  const tenant = resolveBankDemoTenant(params?.bank);
  const session = getBankConsoleSession(tenant, locale, params?.role);
  const result = await loadBankProgramsData(tenant.tenantId, session.role);
  const { usageAvailable } = result.data;
  const selectedProgramId = Array.isArray(params?.program)
    ? params.program[0]
    : params?.program;
  const programs = selectedProgramId
    ? result.data.programs.filter((program) => program.id === selectedProgramId)
    : result.data.programs;
  if (selectedProgramId && programs.length === 0 && !result.degradedMessage) {
    notFound();
  }

  return (
    <div
      className="page-shell programs-page"
      style={programIssuerStyle(tenant)}
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
      <ProgramSourceStatus result={result} locale={locale} />
      {programs.length === 0 && !result.degradedMessage ? (
        <p className="surface-card">{t("programs.empty", locale)}</p>
      ) : null}
      <section className="programs-card-grid">
        {programs.map((program) => (
          <article className="bank-card is-accent" key={program.id}>
            <div className="bank-card-head">
              <div>
                <h3>{program.name}</h3>
                <p className="mono-cell">{program.id}</p>
                {program.definition ? (
                  <p>
                    {t(
                      program.definition.active
                        ? "programs.status.active"
                        : "programs.status.inactive",
                      locale,
                    )}
                  </p>
                ) : null}
              </div>
              <Link
                className="table-action-button is-ghost"
                href={bankConsoleHref(
                  "/programs",
                  tenant,
                  locale,
                  session.role,
                  selectedProgramId ? undefined : { program: program.id },
                )}
              >
                {t(
                  selectedProgramId
                    ? "programs.action.back"
                    : "programs.action.drill",
                  locale,
                )}
              </Link>
            </div>
            <div className="bank-card-body">
              {program.usage.map((usage) => (
                <section key={`${usage.programCode}:${usage.period}`}>
                  <h4>
                    {usage.programCode} · {usage.period}
                  </h4>
                  <QuotaBar usage={usage} locale={locale} />
                  <p>
                    {t("programs.table.headers.served", locale)}:{" "}
                    {usage.cardholdersServed.toLocaleString(
                      locale === "zh" ? "zh-TW" : "en-US",
                    )}
                  </p>
                </section>
              ))}
              <div className="programs-card-actions">
                <ProgramUsageDownload
                  program={program}
                  usageAvailable={usageAvailable}
                  locale={locale}
                />
              </div>
            </div>
          </article>
        ))}
      </section>
      <section className="bank-card">
        <div className="bank-card-head">
          <div>
            <h3>
              {t(
                selectedProgramId
                  ? "programs.summary.selectedTitle"
                  : "programs.summary.title",
                locale,
              )}
            </h3>
            <p>{t("programs.summary.subtitle", locale)}</p>
          </div>
          {selectedProgramId && programs.length === 0 ? (
            <Link
              className="table-action-button is-ghost"
              href={bankConsoleHref("/programs", tenant, locale, session.role)}
            >
              {t("programs.action.back", locale)}
            </Link>
          ) : null}
        </div>
        <div className="bank-card-body">
          <ProgramUsageTable
            programs={programs}
            usageAvailable={usageAvailable}
            locale={locale}
          />
        </div>
      </section>
    </div>
  );
}
