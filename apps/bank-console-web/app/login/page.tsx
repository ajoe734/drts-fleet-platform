import Link from "next/link";
import {
  BANK_DEMO_TENANTS,
  getBankTenantName,
  getBankTenantShortName,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import { t } from "@/lib/translations";

const ACCOUNT_PERSONAS = [
  {
    key: "programAdmin",
    role: "bank_program_admin",
  },
  {
    key: "opsViewer",
    role: "bank_ops_viewer",
  },
  {
    key: "finance",
    role: "bank_finance",
  },
] as const;

function homeHref(bank: string, locale: string, role: string) {
  const params = new URLSearchParams({ bank, locale, role, signedOut: "0" });
  return `/?${params.toString()}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    bank?: string | string[];
    locale?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  const activeBank = resolveBankDemoTenant(params?.bank);

  return (
    <main className="page-shell login-page">
      <section className="login-hero">
        <span className="eyebrow">{t("login.eyebrow", locale)}</span>
        <h1>{t("login.title", locale)}</h1>
        <p>{t("login.lead", locale)}</p>
        <div className="callout-panel">
          <strong>{t("login.signedOutNotice", locale)}</strong>
        </div>
      </section>

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">
            {t("login.chooseBank", locale)}
          </span>
          <div className="login-bank-grid">
            {Object.values(BANK_DEMO_TENANTS).map((bank) => (
              <Link
                aria-current={
                  bank.code === activeBank.code ? "page" : undefined
                }
                className="login-bank-card"
                href={`/login?bank=${bank.code}&locale=${locale}`}
                key={bank.code}
              >
                <strong>{getBankTenantName(bank, locale)}</strong>
                <span>{bank.issuerCode}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("login.chooseAccount", locale)}
          </span>
          <div className="login-account-grid">
            {ACCOUNT_PERSONAS.map((persona) => (
              <a
                className="login-account-card"
                href={homeHref(activeBank.code, locale, persona.role)}
                key={persona.key}
              >
                <span>{getBankTenantShortName(activeBank, locale)}</span>
                <strong>{t(`login.${persona.key}`, locale)}</strong>
                <small>{t("login.demoPersona", locale)}</small>
                <em>{t("login.signIn", locale)}</em>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="callout-panel is-warning">
        <strong>{t("login.securityNoteTitle", locale)}</strong>
        <p>{t("login.securityNoteBody", locale)}</p>
      </section>
    </main>
  );
}
