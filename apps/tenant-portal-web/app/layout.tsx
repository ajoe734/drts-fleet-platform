import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { TenantPortalChrome } from "@/components/tenant-portal-chrome";
import { TenantPortalLocaleToggle } from "@/components/tenant-portal-locale-toggle";
import { LanguageProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  clearTenantPortalSession,
  getTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";
import {
  describeRoleSnapshot,
  getTenantPortalNavItems,
  getTenantRoleSnapshot,
} from "@/lib/rbac";

import "./globals.css";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

function SignOutForm({ label }: { label: string }) {
  async function signOut() {
    "use server";
    await clearTenantPortalSession();
    redirect(TENANT_PORTAL_LOGIN_PATH);
  }

  return (
    <form action={signOut}>
      <button
        type="submit"
        style={{
          width: "100%",
          borderRadius: "10px",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "rgba(15, 23, 42, 0.35)",
          color: "#e2e8f0",
          padding: "0.55rem 0.8rem",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    </form>
  );
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const session = await getTenantPortalSession();
  const roleSnapshot = session ? await getTenantRoleSnapshot() : null;
  const navItems = roleSnapshot
    ? getTenantPortalNavItems(roleSnapshot, locale)
    : [];
  const footer =
    session && roleSnapshot ? (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
            {session.fullName}
          </div>
          <div>{session.email}</div>
          <div>{describeRoleSnapshot(roleSnapshot, locale)}</div>
        </div>
        <TenantPortalLocaleToggle />
        <SignOutForm label={t("shell.signOut", locale)} />
      </div>
    ) : null;

  return (
    <html lang={locale === "zh" ? "zh-Hant" : "en"}>
      <body>
        <LanguageProvider defaultLocale={locale}>
          <TenantPortalChrome navItems={navItems} footer={footer}>
            {children}
          </TenantPortalChrome>
        </LanguageProvider>
      </body>
    </html>
  );
}
