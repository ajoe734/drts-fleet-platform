import type { ReactNode } from "react";
import { PlatformAdminAssistantProvider } from "@/components/assistant/route-context";
import { AdminShell } from "@/components/admin-shell";
import { LanguageProvider } from "@/lib/i18n";
import { PlatformAdminAuthorityProvider } from "@/lib/platform-admin-authority";
import { getServerLocale } from "@/lib/server-locale";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerPlatformAdminAuthority } from "@/lib/server-platform-admin-authority";
import "./globals.css";

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const authority = await getServerPlatformAdminAuthority();

  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100dvh", overflow: "hidden" }}>
        <RuntimeConfigScript authority={authority} />
        <LanguageProvider defaultLocale={locale}>
          <PlatformAdminAuthorityProvider authority={authority}>
            <PlatformAdminAssistantProvider>
              <AdminShell>{children}</AdminShell>
            </PlatformAdminAssistantProvider>
          </PlatformAdminAuthorityProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
