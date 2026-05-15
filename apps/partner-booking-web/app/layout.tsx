import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Partner Booking",
  description:
    "Partner-aware, mobile-first booking surface for partner channel entry points.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="pb-app-body">{children}</body>
    </html>
  );
}
