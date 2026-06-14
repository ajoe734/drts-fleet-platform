import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PassengerShell } from "@/components/passenger-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Passenger Web",
  description:
    "Passenger-facing DRTS shell for booking status, receipts, trip history, referral embed handoff, and explicit unsupported states.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <PassengerShell>{children}</PassengerShell>
      </body>
    </html>
  );
}
