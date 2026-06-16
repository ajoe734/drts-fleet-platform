import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChannelPortalShell } from "@/components/channel-portal-shell";
import { buildReferralPortalNav } from "@/lib/referral-portal-nav";
import { LanguageProvider } from "@/lib/i18n";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

import "./globals.css";

export const metadata: Metadata = {
  title: "Channel Partner Portal",
  description:
    "Self-service portal for referral channel partners (community / property-management apps): usage attribution, revenue share, and settlement statements.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const nav = buildReferralPortalNav(locale);

  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100dvh", overflow: "hidden" }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <ChannelPortalShell
            nav={nav}
            brandLabel={t("referral.app.name", locale)}
            brandSubLabel={t("referral.app.sub", locale)}
            brandMark={t("referral.app.brandMark", locale)}
            searchPlaceholder={t("common.search", locale)}
          >
            {children}
          </ChannelPortalShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
