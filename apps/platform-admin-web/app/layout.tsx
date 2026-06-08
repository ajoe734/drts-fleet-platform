import type { ReactNode } from "react";
import { PlatformAdminAssistantProvider } from "@/components/assistant/route-context";
import { AdminShell } from "@/components/admin-shell";
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
      <body style={{ margin: 0, minHeight: "100vh", overflow: "hidden" }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <PlatformAdminAssistantProvider>
            <AdminShell>{children}</AdminShell>
          </PlatformAdminAssistantProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
