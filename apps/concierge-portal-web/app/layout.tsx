import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConciergeShell } from "@/components/concierge-shell";
import { ConciergePortalProvider } from "@/lib/portal-state";

import "./globals.css";

export const metadata: Metadata = {
  title: "Concierge Portal",
  description:
    "Site-bound assisted-entry portal for call point and concierge operators, with proxy booking, lookup, callbacks, and explicit failure-state routes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConciergePortalProvider>
          <ConciergeShell>{children}</ConciergeShell>
        </ConciergePortalProvider>
      </body>
    </html>
  );
}
