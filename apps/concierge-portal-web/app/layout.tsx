import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConciergeShell } from "@/components/concierge-shell";
import { ConciergePortalProvider } from "@/lib/portal-state";

import "./globals.css";

export const metadata: Metadata = {
  title: "客服代訂入口",
  description: "提供固定站點客服與電話站點人員代訂、查詢、回覆與例外狀態處理。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <ConciergePortalProvider>
          <ConciergeShell>{children}</ConciergeShell>
        </ConciergePortalProvider>
      </body>
    </html>
  );
}
