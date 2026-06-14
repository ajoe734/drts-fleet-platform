import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnterpriseAppFrame } from "@/components/enterprise-app-frame";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Dispatch",
  description: "Enterprise employee self-service dispatch shell.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <EnterpriseAppFrame>{children}</EnterpriseAppFrame>
      </body>
    </html>
  );
}
