import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PassengerShell } from "@/components/passenger-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "乘客服務入口",
  description: "乘客查詢預約、行程狀態、收據與不支援情境的服務入口。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <PassengerShell>{children}</PassengerShell>
      </body>
    </html>
  );
}
