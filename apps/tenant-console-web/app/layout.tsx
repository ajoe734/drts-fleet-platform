import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantShell } from "@/components/tenant-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRTS TENANT CONSOLE",
  description: "租戶叫車、帳務、整合與人員權限管理工作台。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <TenantShell>{children}</TenantShell>
      </body>
    </html>
  );
}
