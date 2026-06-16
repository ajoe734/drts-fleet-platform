"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import {
  CanvasShell,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import { BankDemoControls } from "@/components/bank-demo-controls";
import {
  getBankTenantContext,
  getBankTenantName,
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

// Chrome uses the `tenant` realm tokens (teal) per the design canvas / SD
// hand-off (VQ-1). The issuer appears only as tenant identity + screen-local
// benefit/quota emphasis, never as a hand-picked per-issuer chrome palette.
const bankCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

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
          <strong>{getBankTenantName(bank, locale)}</strong>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get("locale"));
  const bank = resolveBankDemoTenant(searchParams.get("bank"));
  const signedOut = searchParams.get("signedOut") === "1";
  const navEntries = buildBankNavEntries(locale, searchParams.toString());
  const activeItem = findNavItem(pathname, navEntries);
  const activeKey = activeItem?.key;

  useEffect(() => {
    document.documentElement.lang = getLocaleTag(locale);
  }, [locale]);

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
            getBankTenantContext(bank, locale),
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
          {signedOut && pathname !== "/login" ? (
            <SignedOutBoundary bank={bank} locale={locale} />
          ) : (
            children
          )}
        </CanvasShell>
      </div>
    </ManagementThemeProvider>
  );
}
