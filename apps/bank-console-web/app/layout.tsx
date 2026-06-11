import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BankShell } from "@/components/bank-shell";
import { t } from "@/lib/translations";
import "./globals.css";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <BankShell>{children}</BankShell>
      </body>
    </html>
  );
}
