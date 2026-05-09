"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  findNavItem,
  isNavItemActive,
  tenantNavGroups,
} from "@/lib/navigation";

export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findNavItem(pathname);

  if (pathname.startsWith("/partner")) {
    return <>{children}</>;
  }

  return (
    <div className="tenant-shell">
      <aside className="tenant-sidebar">
        <div className="tenant-brand">
          <span className="tenant-badge">Phase 1 tenant console</span>
          <h1>Tenant Console</h1>
          <p>
            Formal tenant-admin shell target selected by `TEN-UI-001`, isolated
            from partner booking mode and sunset shell assumptions.
          </p>
        </div>

        <nav className="tenant-nav" aria-label="Tenant console navigation">
          {tenantNavGroups.map((group) => (
            <div className="tenant-nav-group" key={group.label}>
              <span className="tenant-nav-label">{group.label}</span>
              {group.items.map((item) => {
                const isActive =
                  activeItem?.href === item.href &&
                  isNavItemActive(pathname, item.href);

                return (
                  <Link
                    className={`tenant-nav-link${isActive ? " is-active" : ""}`}
                    href={item.href}
                    key={item.href}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="tenant-sidebar-note">
          <strong>Partner mode stays constrained</strong>
          <p>
            Partner entry only owns eligibility and booking intake. It must not
            inherit users, audit, API key, webhook, or settings navigation.
          </p>
        </div>

        <p className="tenant-sidebar-footnote">
          Current production traffic still lives in `tenant-commute-hub`; this
          app materializes the in-repo target information architecture only.
        </p>
      </aside>

      <main className="tenant-main">
        <div className="tenant-frame">
          <header className="tenant-topbar">
            <div className="tenant-topbar-copy">
              <span className="eyebrow">Tenant Admin Mode</span>
              <h2>{activeItem?.label ?? "Tenant Console"}</h2>
              <p>{activeItem?.note ?? "Route topology and shell alignment."}</p>
            </div>
            <div className="tenant-topbar-meta">
              <span className="meta-pill">Authority: `/api/tenant/*`</span>
              <span className="meta-pill">Shared query model: `XS-UI-004`</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
