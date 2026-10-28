"use client";

import type { ReactNode } from "react";
import { Badge } from "@drts/ui-web";

import { useTranslation } from "@/lib/i18n";
import { getAgencyNav } from "@/lib/navigation";
import type { Locale } from "@/lib/translations";
import { LanguageSwitch } from "./language-switch";
import { LogoutButton } from "./logout-button";
import { PrgMask } from "./prg-mask";

/** Every page states read-only, PII masked and that the query is access-logged. */
export function PortalShell({
  children,
  agencyName,
  locale: explicitLocale,
}: {
  children: ReactNode;
  agencyName?: string | null;
  locale?: Locale;
}) {
  const { locale, t } = useTranslation(explicitLocale);
  const navItems = getAgencyNav(locale);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 24px",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <strong>{t("shell.title")}</strong>
          {agencyName ? <span>· {agencyName}</span> : null}
          <Badge variant="blue">{t("shell.readOnly")}</Badge>
          <PrgMask labelKey="shell.masked" locale={locale} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LanguageSwitch locale={locale} />
          <LogoutButton locale={locale} />
        </div>
      </header>
      <nav
        aria-label={t("shell.navAriaLabel")}
        style={{
          display: "flex",
          gap: 12,
          padding: "8px 24px",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap",
          fontSize: 14,
        }}
      >
        {navItems.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <p
        role="note"
        style={{
          margin: 0,
          padding: "8px 24px",
          fontSize: 12.5,
          color: "#92400e",
          background: "#fffbeb",
          borderBottom: "1px solid #fde68a",
        }}
      >
        {t("shell.auditBanner")}
      </p>
      <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
