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

// The dark canvas surface + `tenant` realm structure stay shared, but the
// chrome accent (brand mark, active nav, highlights) follows the resolved
// issuer brand so each bank — CTBC / Cathay / Taishin / DBS / Fubon — renders
// in its own colour rather than a single shared teal.
const BASE_BANK_THEME = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

function buildIssuerCanvasTheme(bank: BankDemoTenant) {
  const issuer = bank.template.tokens.dark;
  return {
    ...BASE_BANK_THEME,
    accent: issuer.primary,
    accentHi: issuer.accent,
    accentBg: issuer.theme.accentSoft,
    accentBorder: issuer.surface.border,
  };
}

function hexToRgbChannels(hex: string) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : value;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

// Per-issuer CSS variables, set once on the shell wrapper so every descendant
// (chrome + all page bodies) inherits the resolved bank's palette instead of a
// hard-coded teal. globals.css consumes these for accents, fills and borders.
function buildIssuerStyleVars(bank: BankDemoTenant): CSSProperties {
  const issuer = bank.template.tokens.dark;
  return {
    "--issuer-primary": issuer.primary,
    "--issuer-primary-dark": issuer.primaryDark,
    "--issuer-accent": issuer.accent,
    "--issuer-accent-rgb": hexToRgbChannels(issuer.accent),
    "--issuer-accent-soft": issuer.theme.accentSoft,
    "--issuer-accent-strong": issuer.primary,
    "--issuer-ink": issuer.ink,
    "--issuer-surface": issuer.surface.bg,
    "--issuer-border": issuer.surface.border,
    "--issuer-panel-border": issuer.theme.panelBorder,
    "--issuer-text-muted": issuer.text.muted,
  } as CSSProperties;
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
  const bankCanvasTheme = buildIssuerCanvasTheme(bank);
  const issuerStyle = buildIssuerStyleVars(bank);
  const signedOut = searchParams.get("signedOut") === "1";
  const navEntries = buildBankNavEntries(locale, searchParams.toString());
  const activeItem = findNavItem(pathname, navEntries);
  const activeKey = activeItem?.key;

  useEffect(() => {
    document.documentElement.lang = getLocaleTag(locale);
  }, [locale]);

  return (
    <ManagementThemeProvider defaultDark defaultDensity="compact">
      <div className="bank-runtime-shell" style={issuerStyle}>
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
