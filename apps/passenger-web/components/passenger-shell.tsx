"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { findPassengerNavItem, passengerNavItems } from "@/lib/navigation";

export function PassengerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findPassengerNavItem(pathname);

  return (
    <div className="passenger-shell">
      <aside className="passenger-sidebar">
        <div className="passenger-brand">
          <span className="passenger-badge">Phase 1 passenger surface</span>
          <h1>Passenger Web</h1>
          <p>
            External-consumer shell for trip status, trip history, and
            receipt-aware follow-up, kept separate from tenant and ops control
            planes.
          </p>
        </div>

        <nav
          className="passenger-nav"
          aria-label="Passenger surface navigation"
        >
          {passengerNavItems.map((item) => {
            const isActive = item.href === pathname;

            return (
              <Link
                className={`passenger-nav-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-callout">
          <strong>Receipt ownership stays source-driven</strong>
          <p>
            This shell may show DRTS receipts, external receipt references, or
            explicit unsupported states. It must not invent a new email or SMS
            delivery channel.
          </p>
        </div>

        <p className="sidebar-footnote">
          Baseline routes come from `SYS-UI-003`. Booking request, active trip,
          cancel, completion, and the named negative-flow routes are
          materialized by `SYS-UI-004`.
        </p>
      </aside>

      <main className="passenger-main">
        <div className="passenger-frame">
          <header className="passenger-topbar">
            <div className="topbar-copy">
              <span className="eyebrow">External Consumer Plane</span>
              <h2>{activeItem?.label ?? "Passenger Web"}</h2>
              <p>
                {activeItem?.note ??
                  "Dedicated shell for rider-facing status and receipt surfaces."}
              </p>
            </div>
            <div className="topbar-meta">
              <span className="meta-pill">Topology: `apps/passenger-web`</span>
              <span className="meta-pill">
                Scope: booking + trip + negative routes
              </span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
