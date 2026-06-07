import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { TenantPortalChrome } from "@/components/tenant-portal-chrome";
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
  title: "DRTS 租戶入口",
  description: "租戶角色、營運設定與治理能力的單一入口。",
};

function SignOutForm() {
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
        登出
      </button>
    </form>
  );
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getTenantPortalSession();
  const roleSnapshot = session ? await getTenantRoleSnapshot() : null;
  const navItems = roleSnapshot ? getTenantPortalNavItems(roleSnapshot) : [];
  const footer =
    session && roleSnapshot ? (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
            {session.fullName}
          </div>
          <div>{session.email}</div>
          <div>{describeRoleSnapshot(roleSnapshot)}</div>
        </div>
        <SignOutForm />
      </div>
    ) : null;

  return (
    <html lang="zh-Hant">
      <body>
        <TenantPortalChrome navItems={navItems} footer={footer}>
          {children}
        </TenantPortalChrome>
      </body>
    </html>
  );
}
