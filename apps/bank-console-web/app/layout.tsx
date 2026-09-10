import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BankShell } from "@/components/bank-shell";
import { t } from "@/lib/translations";
import { normalizeServerRuntimeEnv } from "@drts/ui-web";
import "./globals.css";

export const metadata: Metadata = {
  title: t("app.title"),
  description: t("app.description"),
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const env = normalizeServerRuntimeEnv(process.env.DRTS_ENV);

  return (
    <html lang="zh-Hant">
      <body>
        <BankShell env={env}>{children}</BankShell>
      </body>
    </html>
  );
}
