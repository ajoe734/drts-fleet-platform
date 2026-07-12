import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildRocShellNav } from "@/lib/roc-shell-nav";
import { RocShell } from "@/components/roc-shell";
import { getRocBodyStyleVars } from "@/lib/roc-theme";

import "./globals.css";

export const metadata: Metadata = {
  title: t("app.metadata.title", "en"),
  description: t("app.metadata.description", "en"),
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const nav = buildRocShellNav(locale);

  return (
    <html lang={locale === "zh" ? "zh-TW" : "en"}>
      <body style={{ margin: 0, ...getRocBodyStyleVars() }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <RocShell
            nav={nav}
            brandLabel={t("app.name", locale)}
            brandSubLabel={t("app.sub", locale)}
            searchPlaceholder={t("common.search", locale)}
            avatarLabel={t("app.avatarLabel", locale)}
            versionLabel={t("app.versionLabel", locale)}
            env={t("app.environment.production", locale)}
          >
            {children}
          </RocShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
