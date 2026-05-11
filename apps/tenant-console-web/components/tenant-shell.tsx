"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ManagementShell } from "@drts/ui-web/client";
import type { ManagementSidebarSection } from "@drts/ui-web";
import { findNavItem, tenantNavGroups } from "@/lib/navigation";

export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findNavItem(pathname);
  const sections: ManagementSidebarSection[] = tenantNavGroups.map((group) => ({
    key: group.label.toLowerCase().replace(/\s+/g, "-"),
    title: group.label,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
    })),
  }));

  if (pathname.startsWith("/partner")) {
    return <>{children}</>;
  }

  return (
    <ManagementShell
      sidebar={{
        brand: "Tenant Console",
        brandSub: "Bookings, billing, and team access",
        brandIcon: (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            TC
          </span>
        ),
        sections,
        currentPath: pathname,
        footer: (
          <div style={{ display: "grid", gap: "10px", lineHeight: 1.5 }}>
            <div>
              Partner booking stays focused on eligibility checks and trip
              requests. Team administration stays here.
            </div>
            <div>
              Manage bookings, people, billing, and integrations for your
              organization from one workspace.
            </div>
          </div>
        ),
      }}
      topbar={{
        breadcrumb: [
          { label: "Tenant Console" },
          { label: activeItem?.label ?? "Home" },
        ],
        searchSlot: (
          <div
            style={{
              minWidth: "320px",
              maxWidth: "560px",
              padding: "9px 12px",
              borderRadius: "14px",
              border: "1px solid #ccfbf1",
              background: "#f0fdfa",
              color: "#115e59",
              fontSize: "12.5px",
              lineHeight: 1.4,
            }}
          >
            {activeItem?.note ??
              "Choose a section to review bookings, directories, billing, or workspace settings."}
          </div>
        ),
        envLabel: "tenant",
        envTone: "tenant",
      }}
    >
      {children}
    </ManagementShell>
  );
}
