import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantShell } from "@/components/tenant-shell";
import { LanguageProvider } from "@/lib/i18n";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { normalizeServerRuntimeEnv } from "@drts/ui-web";
import "./globals.css";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const env = normalizeServerRuntimeEnv(process.env.DRTS_ENV);

  return (
    <html lang={locale === "zh" ? "zh-Hant" : "en"}>
      <body>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <TenantShell env={env}>{children}</TenantShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
