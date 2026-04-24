import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, display: "flex", minHeight: "100vh" }}>
        <RuntimeConfigScript />
        <AdminNav />
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
