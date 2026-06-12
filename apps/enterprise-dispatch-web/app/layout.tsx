import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootShell } from "@/components/root-shell";
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
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
