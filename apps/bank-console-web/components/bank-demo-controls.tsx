"use client";

import Link from "next/link";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  BANK_DEMO_TENANTS,
  type BankDemoTenant,
  type BankDemoTenantCode,
} from "@/lib/demo-tenants";
import { t, type Locale } from "@/lib/translations";

type QueryUpdate = {
  bank?: BankDemoTenantCode;
  locale?: Locale;
  signedOut?: "1" | null;
};

function hrefFor(
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  update: QueryUpdate,
) {
  const next = new URLSearchParams(searchParams.toString());

  if (update.bank) {
    next.set("bank", update.bank);
  }
  if (update.locale) {
    next.set("locale", update.locale);
  }
  if (update.signedOut === null) {
    next.delete("signedOut");
  } else if (update.signedOut) {
    next.set("signedOut", update.signedOut);
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function loginHref(
  searchParams: ReadonlyURLSearchParams,
  bank: BankDemoTenant,
  locale: Locale,
) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("bank", bank.code);
  next.set("locale", locale);
  next.set("signedOut", "1");
  return `/login?${next.toString()}`;
}

function userManagementHref(
  searchParams: ReadonlyURLSearchParams,
  bank: BankDemoTenant,
  locale: Locale,
) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("bank", bank.code);
  next.set("locale", locale);
  next.delete("signedOut");
  return `/users?${next.toString()}`;
}

export function BankDemoControls({
  bank,
  locale,
  pathname,
  searchParams,
  signedOut,
}: {
  bank: BankDemoTenant;
  locale: Locale;
  pathname: string;
  searchParams: ReadonlyURLSearchParams;
  signedOut: boolean;
}) {
  return (
    <div
      className="bank-demo-controls"
      aria-label={t("shell.demoControls", locale)}
    >
      <details className="bank-demo-menu">
        <summary>
          <span className="bank-demo-menu-kicker">
            {t("shell.demoBank", locale)}
          </span>
          <strong>{bank.shortName[locale]}</strong>
        </summary>
        <div className="bank-demo-popover">
          <p>{t("shell.demoBankHint", locale)}</p>
          {Object.values(BANK_DEMO_TENANTS).map((tenant) => (
            <Link
              aria-current={tenant.code === bank.code ? "true" : undefined}
              className="bank-demo-option"
              href={hrefFor(pathname, searchParams, {
                bank: tenant.code,
                signedOut: null,
              })}
              key={tenant.code}
            >
              <span>{tenant.name[locale]}</span>
              <small>{tenant.issuerCode}</small>
            </Link>
          ))}
        </div>
      </details>

      <div
        className="bank-locale-switch"
        aria-label={t("shell.locale", locale)}
      >
        {(["zh", "en"] as const).map((nextLocale) => (
          <Link
            aria-current={nextLocale === locale ? "true" : undefined}
            className="bank-locale-link"
            href={hrefFor(pathname, searchParams, { locale: nextLocale })}
            key={nextLocale}
          >
            {t(`shell.locale.${nextLocale}`, locale)}
          </Link>
        ))}
      </div>

      <details className="bank-account-menu">
        <summary>
          <span className="bank-account-name">
            {signedOut ? t("shell.signedOut", locale) : bank.actorName}
          </span>
          <span className="bank-account-role">
            {signedOut
              ? t("shell.loginRequired", locale)
              : bank.roleLabel[locale]}
          </span>
        </summary>
        <div className="bank-account-popover">
          {signedOut ? (
            <>
              <p>{t("shell.signedOutHint", locale)}</p>
              <Link
                className="bank-account-action is-primary"
                href={loginHref(searchParams, bank, locale)}
              >
                {t("shell.login", locale)}
              </Link>
            </>
          ) : (
            <>
              <p>
                {t("shell.signedInAs", locale, {
                  email: bank.actorEmail,
                })}
              </p>
              <dl>
                <div>
                  <dt>{t("shell.role", locale)}</dt>
                  <dd>{bank.roleLabel[locale]}</dd>
                </div>
                <div>
                  <dt>{t("shell.tenant", locale)}</dt>
                  <dd>{bank.tenantId}</dd>
                </div>
              </dl>
              <Link
                className="bank-account-action"
                href={userManagementHref(searchParams, bank, locale)}
              >
                {t("shell.accountManagement", locale)}
              </Link>
              <Link
                className="bank-account-action"
                href={`/login?bank=${bank.code}&locale=${locale}`}
              >
                {t("shell.switchAccount", locale)}
              </Link>
              <Link
                className="bank-account-action is-danger"
                href={hrefFor(pathname, searchParams, { signedOut: "1" })}
              >
                {t("shell.logout", locale)}
              </Link>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
