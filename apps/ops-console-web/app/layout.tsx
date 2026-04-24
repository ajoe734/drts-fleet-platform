import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";

import "./globals.css";

export const metadata: Metadata = {
  title: "Operations Console",
  description:
    "Protected operations workspace for dispatch, reporting, revenue, and registry workflows.",
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
