import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantShell } from "@/components/tenant-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRTS 租戶控制台",
  description: "DRTS 第一階段租戶管理工作台。",
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
