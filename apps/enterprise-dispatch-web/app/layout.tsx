import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { EnterpriseAppFrame } from "@/components/enterprise-app-frame";
import { LanguageProvider } from "@/lib/i18n";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return {
    title: t("app.title", undefined, locale),
    description: t("app.description", undefined, locale),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getServerLocale();

  return (
    <html lang={locale === "zh" ? "zh-Hant" : "en"}>
      <body>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <EnterpriseAppFrame>{children}</EnterpriseAppFrame>
        </LanguageProvider>
      </body>
    </html>
  );
}
