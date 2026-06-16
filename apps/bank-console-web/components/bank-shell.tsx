"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
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

// Chrome uses the `bank` surface tokens — CTBC navy/gold — per the design
// canvas (mgmt-tokens.jsx `bank` accent + BK_GOLD). The implementation
// previously fell back to the `tenant` (teal) realm because no `bank` surface
// existed; that is the colour mismatch this restores.
const bankCanvasTheme = buildCanvasTheme({
  surface: "bank",
  dark: true,
  density: "compact",
});

// Design-canvas bank palette (mgmt-tokens.jsx `bank` + bank-data.jsx BK_GOLD).
const BANK_NAVY = "#84A9E8";
const BANK_NAVY_RGB = "132, 169, 232";
const BANK_NAVY_DARK = "#13478F";
const BANK_GOLD = "#A8771B";
const BANK_SURFACE = "#0F1E3C";
const BANK_BORDER = "#21376A";

// CSS variables consumed by globals.css; set once on the shell wrapper so the
// whole console (chrome + page bodies) renders CTBC navy with gold reserved for
// benefit/quota emphasis — matching the canvas.
const bankIssuerStyle = {
  "--issuer-accent": BANK_NAVY,
  "--issuer-accent-rgb": BANK_NAVY_RGB,
  "--issuer-primary": BANK_NAVY,
  "--issuer-primary-dark": BANK_NAVY_DARK,
  "--issuer-accent-soft": "rgba(132, 169, 232, 0.12)",
  "--issuer-border": BANK_BORDER,
  "--issuer-panel-border": BANK_BORDER,
  "--issuer-surface": BANK_SURFACE,
  "--bank-navy": BANK_NAVY,
  "--bank-navy-dark": BANK_NAVY_DARK,
  "--bank-navy-rgb": BANK_NAVY_RGB,
  "--bank-navy-soft": "rgba(132, 169, 232, 0.12)",
  "--bank-surface": BANK_SURFACE,
  "--bank-border": BANK_BORDER,
  "--bank-gold": BANK_GOLD,
  "--bank-gold-soft": "rgba(168, 119, 27, 0.14)",
} as CSSProperties;

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
      <div className="bank-runtime-shell" style={bankIssuerStyle}>
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
