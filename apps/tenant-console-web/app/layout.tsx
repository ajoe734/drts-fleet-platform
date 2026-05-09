import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantShell } from "@/components/tenant-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tenant Console",
  description: "Tenant administration workspace shell for DRTS Phase 1.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TenantShell>{children}</TenantShell>
      </body>
    </html>
  );
}
