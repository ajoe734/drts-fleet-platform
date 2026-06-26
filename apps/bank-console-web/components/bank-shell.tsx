"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type CSSProperties, type ReactNode } from "react";
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

const bankCanvasBaseTheme = buildCanvasTheme({
  surface: "bank",
  dark: true,
  density: "compact",
});

function hexToRgbChannels(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  if (normalized.length !== 6 || Number.isNaN(value)) {
    return "132, 169, 232";
  }

  return [value >> 16, (value >> 8) & 255, value & 255].join(", ");
}

function buildBankCanvasTheme(bank: BankDemoTenant) {
  const issuerTokens = bank.template.tokens.dark;

  return {
    ...bankCanvasBaseTheme,
    accent: issuerTokens.primary,
    accentHi: issuerTokens.primaryDark,
    accentBg: issuerTokens.theme.accentSoft,
    accentBorder: issuerTokens.surface.border,
    surfaceName: bank.issuerCode,
    surfaceTagline: bank.template.programName,
  };
}

function buildBankIssuerStyle(bank: BankDemoTenant) {
  const issuerTokens = bank.template.tokens.dark;

  return {
    "--issuer-accent": issuerTokens.accent,
    "--issuer-accent-rgb": hexToRgbChannels(issuerTokens.accent),
    "--issuer-primary": issuerTokens.primary,
    "--issuer-primary-dark": issuerTokens.primaryDark,
    "--issuer-accent-soft": issuerTokens.theme.accentSoft,
    "--issuer-border": issuerTokens.surface.border,
    "--issuer-panel-border": issuerTokens.theme.panelBorder,
    "--issuer-surface": issuerTokens.surface.bg,
    "--bank-navy": issuerTokens.primary,
    "--bank-navy-dark": issuerTokens.primaryDark,
    "--bank-navy-rgb": hexToRgbChannels(issuerTokens.primary),
    "--bank-navy-soft": issuerTokens.theme.accentSoft,
    "--bank-surface": issuerTokens.surface.bg,
    "--bank-border": issuerTokens.surface.border,
    "--bank-gold": issuerTokens.accent,
    "--bank-gold-soft": issuerTokens.theme.accentSoft,
    "--bank-shell-bg": issuerTokens.theme.pageBackground,
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
  const signedOut = searchParams.get("signedOut") === "1";
  const navEntries = buildBankNavEntries(locale, searchParams.toString());
  const activeItem = findNavItem(pathname, navEntries);
  const activeKey = activeItem?.key;
  const bankIssuerStyle = buildBankIssuerStyle(bank);
  const bankCanvasTheme = buildBankCanvasTheme(bank);

  useEffect(() => {
    document.documentElement.lang = getLocaleTag(locale);
  }, [locale]);

  if (pathname === "/login" || signedOut) {
    return (
      <div className="bank-runtime-shell" style={bankIssuerStyle}>
        {signedOut && pathname !== "/login" ? (
          <SignedOutBoundary bank={bank} locale={locale} />
        ) : (
          children
        )}
      </div>
    );
  }

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
          avatarLabel={bank.avatar}
          topRight={
            <BankDemoControls
              bank={bank}
              locale={locale}
              pathname={pathname}
              searchParams={searchParams}
              signedOut={false}
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
