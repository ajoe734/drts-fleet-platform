import Link from "next/link";
import {
  BANK_DEMO_TENANTS,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import { t } from "@/lib/translations";

const ACCOUNT_PERSONAS = [
  {
    key: "programAdmin",
    role: "bank_program_admin",
    emailSuffix: "program-admin",
  },
  {
    key: "opsViewer",
    role: "bank_ops_viewer",
    emailSuffix: "ops-viewer",
  },
  {
    key: "finance",
    role: "bank_finance",
    emailSuffix: "finance",
  },
] as const;

function homeHref(bank: string, locale: string, role: string) {
  const params = new URLSearchParams({ bank, locale, role });
  return `/?${params.toString()}`;
}

function loginHref(bank: string, locale: string) {
  const params = new URLSearchParams({ bank, locale });
  return `/login?${params.toString()}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    bank?: string | string[];
    locale?: string | string[];
    signedOut?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params?.locale);
  const activeBank = resolveBankDemoTenant(params?.bank);
  const signedOut =
    (Array.isArray(params?.signedOut)
      ? params?.signedOut[0]
      : params?.signedOut) === "1";
  return (
    <div className="page-shell login-page">
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
                href={
                  signedOut
                    ? `/login?bank=${bank.code}&locale=${locale}&signedOut=1`
                    : loginHref(bank.code, locale)
                }
                key={bank.code}
              >
                <strong>{bank.name[locale]}</strong>
                <span>{bank.issuerCode}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {signedOut
              ? t("login.signedOutAccountHidden", locale)
              : t("login.chooseAccount", locale)}
          </span>
          {signedOut ? (
            <div className="callout-panel is-warning">
              <strong>{activeBank.name[locale]}</strong>
              <p>{t("login.signedOutAccountHiddenBody", locale)}</p>
              <Link
                className="login-account-card"
                href={loginHref(activeBank.code, locale)}
                prefetch={false}
              >
                <span>{activeBank.shortName[locale]}</span>
                <strong>{t("authBoundary.cta", locale)}</strong>
                <em>{t("login.signIn", locale)}</em>
              </Link>
            </div>
          ) : (
            <div className="login-account-grid">
              {ACCOUNT_PERSONAS.map((persona) => (
                <Link
                  className="login-account-card"
                  href={homeHref(activeBank.code, locale, persona.role)}
                  key={persona.key}
                >
                  <span>{activeBank.shortName[locale]}</span>
                  <strong>{t(`login.${persona.key}`, locale)}</strong>
                  <small>
                    {persona.emailSuffix}@{activeBank.issuerCode.toLowerCase()}
                    .demo
                  </small>
                  <em>{t("login.signIn", locale)}</em>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="callout-panel is-warning">
        <strong>{t("login.securityNoteTitle", locale)}</strong>
        <p>{t("login.securityNoteBody", locale)}</p>
      </section>
    </div>
  );
}
