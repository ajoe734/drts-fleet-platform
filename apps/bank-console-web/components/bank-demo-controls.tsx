"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@drts/tenant-auth/constants";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  BANK_DEMO_TENANTS,
  getBankTenantName,
  getBankTenantShortName,
  type BankDemoTenant,
  type BankDemoTenantCode,
} from "@/lib/demo-tenants";
import { getBankConsoleSession } from "@/lib/session";
import { t, type Locale } from "@/lib/translations";
import { userManagementText } from "../app/users/translations";

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
  const session = getBankConsoleSession(bank, locale, searchParams.get("role"));
  const [pending, setPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function endSession(switchAccount: boolean) {
    setPending(true);
    setLogoutError("");
    try {
      const entry = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith(`${TENANT_CSRF_COOKIE_NAME}=`));
      const csrf = entry
        ? decodeURIComponent(entry.slice(TENANT_CSRF_COOKIE_NAME.length + 1))
        : "";
      if (csrf) {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { [TENANT_CSRF_HEADER_NAME]: csrf },
        });
        if (!response.ok)
          throw new Error(userManagementText("signOutFailure", locale));
      }
      const target = switchAccount
        ? csrf
          ? `/api/auth/tenant/login?return_url=${encodeURIComponent(userManagementHref(searchParams, bank, locale))}`
          : loginHref(searchParams, bank, locale)
        : hrefFor(pathname, searchParams, {
            bank: bank.code,
            locale,
            signedOut: "1",
          });
      window.location.assign(target);
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : userManagementText("signOutFailure", locale),
      );
    } finally {
      setPending(false);
    }
  }

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
          <strong>{getBankTenantShortName(bank, locale)}</strong>
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
              <span>{getBankTenantName(tenant, locale)}</span>
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
            {signedOut ? t("shell.signedOut", locale) : session.actorName}
          </span>
          <span className="bank-account-role">
            {signedOut ? t("shell.loginRequired", locale) : session.roleLabel}
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
                  email: session.actorEmail,
                })}
              </p>
              <dl>
                <div>
                  <dt>{t("shell.role", locale)}</dt>
                  <dd>{session.roleLabel}</dd>
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
              <button
                className="bank-account-action"
                type="button"
                disabled={pending}
                onClick={() => void endSession(true)}
              >
                {t("shell.switchAccount", locale)}
              </button>
              <button
                className="bank-account-action is-danger"
                type="button"
                disabled={pending}
                onClick={() => void endSession(false)}
              >
                {t("shell.logout", locale)}
              </button>
              {logoutError && <p role="alert">{logoutError}</p>}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
