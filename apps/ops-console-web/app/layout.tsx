import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { Sidebar } from "@/components/sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "DRTS OPS CONSOLE",
  description:
    "Dark-theme dispatch command center for realtime operations, case handling, monitoring, and master data workflows.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100vh" }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <Sidebar>{children}</Sidebar>
        </LanguageProvider>
      </body>
    </html>
  );
}
