import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { BankShell } from "@/components/bank-shell";
import { t } from "@/lib/translations";
import "./globals.css";

const AUTH_BOUNDARY_HEADER = "x-drts-bank-console-auth-boundary";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const isAuthBoundary =
    requestHeaders.get(AUTH_BOUNDARY_HEADER)?.trim() === "1";

  return (
    <html lang="zh-Hant">
      <body>
        {isAuthBoundary ? (
          <main className="bank-auth-runtime">{children}</main>
        ) : (
          <BankShell>{children}</BankShell>
        )}
      </body>
    </html>
  );
}
