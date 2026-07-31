import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "智行叫車",
  description: "P5 passenger ride surface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <RuntimeConfigScript />
        {children}
      </body>
    </html>
  );
}
