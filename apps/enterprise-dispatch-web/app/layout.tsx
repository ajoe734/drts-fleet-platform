import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Dispatch · DRTS",
  description:
    "Tenant-branded employee self-service shell for enterprise dispatch booking across S1 web and S2 embedded surfaces.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
