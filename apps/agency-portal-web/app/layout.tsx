import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: t("app.title", undefined, locale),
    description: t("app.description", undefined, locale),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = await getServerLocale();
  return (
    <html lang={locale === "zh" ? "zh-Hant" : "en"}>
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Noto Sans TC', 'PingFang TC', sans-serif",
          color: "#0f172a",
        }}
      >
        <LanguageProvider defaultLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
