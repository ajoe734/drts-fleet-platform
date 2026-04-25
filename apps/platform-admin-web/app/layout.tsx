import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
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

  return (
    <html lang={locale}>
      <body style={{ margin: 0, display: "flex", minHeight: "100vh" }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <AdminNav />
          <main
            style={{
              flex: 1,
              minWidth: 0,
              padding: "32px",
              background: "#f8fafc",
              minHeight: "100vh",
            }}
          >
            {children}
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
