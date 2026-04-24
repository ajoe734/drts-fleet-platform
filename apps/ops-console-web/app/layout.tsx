import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { Sidebar } from "@/components/sidebar";

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
      <body style={{ margin: 0, display: "flex", minHeight: "100vh" }}>
        <RuntimeConfigScript />
        <Sidebar />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: "32px",
            background: "#f8fafc",
            minHeight: "100vh",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
