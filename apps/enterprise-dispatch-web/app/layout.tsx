import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  CanvasShell,
  type CanvasShellNavItem,
  buildCanvasTheme,
} from "@drts/ui-web";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Dispatch",
  description: "Enterprise dispatch operations workspace scaffold.",
};

const theme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

const nav: CanvasShellNavItem[] = [
  {
    key: "overview",
    href: "/",
    label: "Dispatch Overview",
    icon: "operations",
  },
  {
    key: "reassignments",
    href: "/reassignments",
    label: "Availability Reassignments",
    icon: "dispatch",
    badge: "pending",
    badgeTone: "warn",
  },
  {
    key: "supply",
    href: "/supply",
    label: "Supply Watch",
    icon: "fleet",
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CanvasShell
          theme={theme}
          nav={nav}
          active="overview"
          currentPath="/"
          brandLabel="Enterprise Dispatch"
          brandSubLabel="Ops Realm Scaffold"
          title="Availability-first dispatch shell"
          env="scaffold"
          versionLabel="v0"
          searchPlaceholder="Search dispatches, drivers, partners"
          avatarLabel="ED"
          sidebarFooter="Design canvas pending"
        >
          {children}
        </CanvasShell>
      </body>
    </html>
  );
}
