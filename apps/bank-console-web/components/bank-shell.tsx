"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  CanvasShell,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import { BankDemoControls } from "@/components/bank-demo-controls";
import {
  getLocaleTag,
  type BankDemoTenant,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import type { Locale } from "@/lib/translations";
import {
  BANK_CONSOLE_BRAND,
  BANK_CONSOLE_BRAND_SUB,
  BANK_CONSOLE_ENV,
  BANK_CONSOLE_VERSION,
  buildBankNavEntries,
  findNavItem,
} from "@/lib/navigation";
import { t } from "@/lib/translations";

// Chrome uses the `tenant` realm tokens (teal) per the SD / screen-requirements
// hand-off. The issuer (CTBC) appears only as tenant identity, never as a
// hand-picked palette.
const bankCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});
const SIGNED_OUT_COOKIE = "drts-bank-console-signed-out";

function hasSignedOutCookie() {
  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim() === `${SIGNED_OUT_COOKIE}=1`);
}

function writeSignedOutCookie() {
  document.cookie = `${SIGNED_OUT_COOKIE}=1; Path=/; Max-Age=3600; SameSite=Lax`;
}

function clearSignedOutCookie() {
  document.cookie = `${SIGNED_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function BankShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="bank-runtime-shell" />}>
      <BankShellContent>{children}</BankShellContent>
    </Suspense>
  );
}

function SignedOutBoundary({
  bank,
  locale,
}: {
  bank: BankDemoTenant;
  locale: Locale;
}) {
  const loginHref = `/login?bank=${bank.code}&locale=${locale}&signedOut=1`;

  return (
    <div className="page-shell login-page bank-auth-boundary">
      <section className="login-hero">
        <span className="eyebrow">{t("authBoundary.eyebrow", locale)}</span>
        <h1>{t("authBoundary.title", locale)}</h1>
        <p>{t("authBoundary.body", locale)}</p>
        <div className="callout-panel is-warning">
          <strong>{bank.name[locale]}</strong>
          <span>{t("authBoundary.noData", locale)}</span>
        </div>
        <a className="bank-auth-boundary-cta" href={loginHref}>
          {t("authBoundary.cta", locale)}
        </a>
      </section>
    </div>
  );
}

function BankShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const browserParams =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const locale = resolveLocale(
    searchParams.get("locale") ?? browserParams?.get("locale"),
  );
  const bank = resolveBankDemoTenant(
    searchParams.get("bank") ?? browserParams?.get("bank"),
  );
  const [cookieSignedOut, setCookieSignedOut] = useState(false);
  const signedOutQuery = searchParams.get("signedOut") === "1";
  const signedOut = signedOutQuery || cookieSignedOut;
  const navEntries = buildBankNavEntries(locale, search);
  const activeItem = findNavItem(pathname, navEntries);
  const activeKey = activeItem?.key;

  useEffect(() => {
    document.documentElement.lang = getLocaleTag(locale);
  }, [locale]);

  useEffect(() => {
    if (pathname === "/login") {
      if (signedOutQuery) {
        writeSignedOutCookie();
      } else {
        clearSignedOutCookie();
      }
      setCookieSignedOut(false);
      return;
    }

    function enforceSignedOutBoundary() {
      if (!signedOutQuery && !hasSignedOutCookie()) {
        setCookieSignedOut(false);
        return;
      }

      writeSignedOutCookie();
      setCookieSignedOut(true);
      const next = new URLSearchParams(search);
      next.set("bank", bank.code);
      next.set("locale", locale);
      next.set("signedOut", "1");
      router.replace(`/login?${next.toString()}`);
    }

    enforceSignedOutBoundary();
    window.addEventListener("pageshow", enforceSignedOutBoundary);
    return () =>
      window.removeEventListener("pageshow", enforceSignedOutBoundary);
  }, [bank.code, locale, pathname, router, search, signedOutQuery]);

  if (pathname === "/login" || signedOut) {
    return (
      <ManagementThemeProvider defaultDark defaultDensity="compact">
        <main className="bank-runtime-shell bank-auth-runtime">
          {signedOut && pathname !== "/login" ? (
            <SignedOutBoundary bank={bank} locale={locale} />
          ) : (
            children
          )}
        </main>
      </ManagementThemeProvider>
    );
  }

  return (
    <ManagementThemeProvider defaultDark defaultDensity="compact">
      <div className="bank-runtime-shell">
        <CanvasShell
          theme={bankCanvasTheme}
          nav={navEntries}
          brandLabel={BANK_CONSOLE_BRAND}
          brandSubLabel={BANK_CONSOLE_BRAND_SUB}
          brandMark="B"
          breadcrumb={[
            bank.context[locale],
            activeItem?.label ?? t("shell.breadcrumb.home", locale),
          ]}
          env={BANK_CONSOLE_ENV}
          versionLabel={BANK_CONSOLE_VERSION}
          searchPlaceholder={t("shell.search", locale)}
          searchWidth={260}
          avatarLabel={signedOut ? t("shell.guestAvatar", locale) : bank.avatar}
          topRight={
            <BankDemoControls
              bank={bank}
              locale={locale}
              pathname={pathname}
              searchParams={searchParams}
              signedOut={signedOut}
            />
          }
          style={{ height: "100%" }}
          {...(activeKey ? { active: activeKey } : {})}
        >
          {children}
        </CanvasShell>
      </div>
    </ManagementThemeProvider>
  );
}
