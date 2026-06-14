import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { ConciergeShell } from "@/components/concierge-shell";
import { LanguageProvider } from "@/lib/i18n";
import { ConciergePortalProvider } from "@/lib/portal-state";
import { getServerLocale } from "@/lib/server-locale";
import { conciergeThemeStyle } from "@/lib/theme";
import { getLocaleHtmlLang, t } from "@/lib/translations";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: t("app.title", locale),
    description: t("app.description", locale),
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html lang={getLocaleHtmlLang(locale)}>
      <body style={conciergeThemeStyle as CSSProperties}>
        <LanguageProvider defaultLocale={locale}>
          <ConciergePortalProvider>
            <ConciergeShell>{children}</ConciergeShell>
          </ConciergePortalProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
