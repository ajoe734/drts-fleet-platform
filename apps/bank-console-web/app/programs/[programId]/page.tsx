import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/page-primitives";
import { loadBankProgramsData } from "@/lib/bank-dev-read-models";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { bankConsoleHref, getBankConsoleSession } from "@/lib/session";
import { t, type TranslationKey } from "@/lib/translations";
import {
  programIssuerStyle,
  ProgramSourceStatus,
  ProgramUsageDownload,
  ProgramUsageTable,
} from "../program-ui";

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ programId }, query] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(query?.locale);
  const tenant = resolveBankDemoTenant(query?.bank);
  const session = getBankConsoleSession(tenant, locale, query?.role);
  const result = await loadBankProgramsData(tenant.tenantId, session.role);
  const program = result.data.programs.find((entry) => entry.id === programId);
  if (!program && !result.degradedMessage) notFound();
  const definition = program?.definition;
  const metadata: Array<[TranslationKey, string]> = definition
    ? [
        ["programs.detail.id", definition.programId],
        ["programs.detail.type", definition.programType],
        [
          "programs.detail.status",
          t(
            definition.active
              ? "programs.status.active"
              : "programs.status.inactive",
            locale,
          ),
        ],
        ["programs.detail.billing", definition.billingMode],
        [
          "programs.detail.products",
          definition.allowedServiceProducts.join(", ") ||
            t("programs.notProvided", locale),
        ],
        ["programs.detail.pricing", definition.pricingPlanId],
        [
          "programs.detail.eligibility",
          definition.eligibilityRuleId ?? t("programs.notProvided", locale),
        ],
        ["programs.detail.rules", definition.serviceRuleSetId],
      ]
    : [];

  return (
    <div
      className="page-shell programs-page"
      style={programIssuerStyle(tenant)}
    >
      <PageHero
        eyebrow={t("programs.eyebrow", locale)}
        title={program?.name ?? programId}
        description={t("programs.detail.lead", locale)}
      />
      <Link
        className="table-action-button is-ghost"
        href={bankConsoleHref("/programs", tenant, locale, session.role)}
      >
        {t("programs.action.back", locale)}
      </Link>
      <ProgramSourceStatus result={result} locale={locale} />
      {program ? (
        <>
          <section className="bank-card">
            <div className="bank-card-head">
              <h3>{t("programs.detail.title", locale)}</h3>
            </div>
            <div className="bank-card-body">
              {definition ? (
                <dl className="bank-dl cols-2">
                  {metadata.map(([label, value]) => (
                    <div className="dl-item" key={label}>
                      <dt className="dl-key">{t(label, locale)}</dt>
                      <dd className="dl-val">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>{t("programs.definitionUnavailable", locale)}</p>
              )}
            </div>
          </section>
          <section className="bank-card">
            <div className="bank-card-head">
              <h3>{t("programs.detail.usage", locale)}</h3>
              <ProgramUsageDownload
                program={program}
                usageAvailable={result.data.usageAvailable}
                locale={locale}
              />
            </div>
            <div className="bank-card-body">
              <ProgramUsageTable
                programs={[program]}
                usageAvailable={result.data.usageAvailable}
                locale={locale}
              />
            </div>
          </section>
        </>
      ) : (
        <p>{t("programs.detail.unavailable", locale)}</p>
      )}
    </div>
  );
}
