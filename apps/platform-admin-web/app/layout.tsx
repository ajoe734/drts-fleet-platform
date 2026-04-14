"use client";

import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="admin-layout">
          <AdminNav />
          <main className="admin-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
