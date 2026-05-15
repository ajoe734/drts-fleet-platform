import type { ReactNode } from "react";
import { ManagementThemeProvider } from "@drts/ui-web/client";
import { PlatformShell } from "@/components/platform-shell";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const htmlLang = locale === "zh" ? "zh-Hant" : "en";

  return (
    <html lang={htmlLang}>
      <body className="platform-admin-body">
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <ManagementThemeProvider defaultDensity="compact" defaultDark>
            <PlatformShell>{children}</PlatformShell>
          </ManagementThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
