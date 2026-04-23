import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RuntimeConfigScript />
        <div className="admin-layout">
          <AdminNav />
          <main className="admin-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
