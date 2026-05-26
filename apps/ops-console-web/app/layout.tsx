import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildOpsShellNav } from "@/lib/ops-shell-nav";
import { OpsShell } from "@/components/ops-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Operations Console",
  description:
    "Protected operations workspace for dispatch, reporting, revenue, and registry workflows.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const nav = buildOpsShellNav(locale);

  return (
    <html lang={locale}>
      <body style={{ margin: 0 }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <OpsShell
            nav={nav}
            brandLabel={t("app.name", locale)}
            brandSubLabel={t("app.sub", locale)}
            searchPlaceholder={t("common.search", locale)}
          >
            {children}
          </OpsShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
