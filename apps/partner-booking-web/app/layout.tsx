import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/lib/i18n";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

import "./globals.css";

export const metadata: Metadata = {
  title: t("app.title", undefined, "zh"),
  description: t("app.description", undefined, "zh"),
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html lang={locale === "zh" ? "zh-Hant" : "en"}>
      <body>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
