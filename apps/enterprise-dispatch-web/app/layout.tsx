import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnterpriseShell } from "@/components/enterprise-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Dispatch",
  description: "Enterprise dispatch operations workspace shell.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <EnterpriseShell>{children}</EnterpriseShell>
      </body>
    </html>
  );
}
