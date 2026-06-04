import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { IdentityContext } from "@drts/contracts";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerOpsClient } from "@/lib/api-client.server";
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
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const identity = await client
    .get<IdentityContext>("/api/identity/context")
    .catch(() => null as IdentityContext | null);
  const nav = buildOpsShellNav(locale, identity?.roles ?? []);
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
