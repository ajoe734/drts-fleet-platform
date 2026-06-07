import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildOpsShellNav } from "@/lib/ops-shell-nav";
import { OpsShell } from "@/components/ops-shell";
import {
  OpsAssistantContextProvider,
  OpsAssistantWidget,
} from "@/components/ops-assistant";
import {
  resolveOpsAssistantIdentity,
  seedOpsAssistantHealth,
} from "@/lib/ops-assistant-context.server";

import "./globals.css";

export const metadata: Metadata = {
  title: "DRTS 營運控制台",
  description: "派遣、報表、營收與主資料流程的受保護營運工作區。",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const nav = buildOpsShellNav(locale);
  const assistantIdentity = await resolveOpsAssistantIdentity();
  const assistantHealth = seedOpsAssistantHealth();

  return (
    <html lang={locale}>
      <body style={{ margin: 0 }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <OpsAssistantContextProvider
            identity={assistantIdentity}
            initialHealth={assistantHealth}
          >
            <OpsShell
              nav={nav}
              brandLabel={t("app.name", locale)}
              brandSubLabel={t("app.sub", locale)}
              searchPlaceholder={t("common.search", locale)}
            >
              {children}
            </OpsShell>
            <OpsAssistantWidget />
          </OpsAssistantContextProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
