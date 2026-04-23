import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Console",
  description: "Bootstrap shell for shared operational back-office workflows.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RuntimeConfigScript />
        {children}
      </body>
    </html>
  );
}
