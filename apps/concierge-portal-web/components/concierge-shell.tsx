"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { conciergeNavItems, findConciergeNavItem } from "@/lib/navigation";
import { formatScopeSummary } from "@/lib/api-client";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export function ConciergeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = findConciergeNavItem(pathname);
  const { ready, session, signOut } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="brand-stack">
          <span className="brand-badge">Phase 1 assisted-entry surface</span>
          <h1>Concierge Portal</h1>
          <p>
            Dedicated site-bound shell for call point and concierge operators,
            kept separate from the full ops control plane.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Concierge portal navigation">
          {conciergeNavItems.map((item) => {
            const isActive = item.href === pathname;

            return (
              <Link
                className={`sidebar-link${isActive ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <strong>Limited bootstrap scope</strong>
          <p>
            Current repo auth has no dedicated call-point actor type. This app
            constrains the borrowed ops bootstrap to: {formatScopeSummary()}.
          </p>
        </div>

        <p className="sidebar-footnote">
          Task artifact path is `apps/concierge-portal-web`; topology docs still
          refer to the assisted-entry family. The support packet records that
          naming seam explicitly.
        </p>
      </aside>

      <main className="portal-main">
        <div className="portal-frame">
          <header className="portal-topbar">
            <div className="topbar-copy">
              <span className="topbar-eyebrow">Assisted-Entry Plane</span>
              <h2>{activeItem?.label ?? "Concierge Portal"}</h2>
              <p>
                {activeItem?.note ??
                  "Proxy booking, lookup, and callback follow-up for site-bound desks."}
              </p>
            </div>

            <div className="topbar-stack">
              <div className="badge-row">
                <span className="meta-pill">
                  {session
                    ? `${formatDeskMode(session.mode)} · ${session.operatorName}`
                    : "Bootstrap required"}
                </span>
                <span className="meta-pill">
                  {desk
                    ? `${desk.siteName} · ${desk.deskName}`
                    : "No desk selected"}
                </span>
                <span className="meta-pill">
                  {ready ? "Repo-local session" : "Loading bootstrap"}
                </span>
              </div>

              {session ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    signOut();
                    router.push("/login");
                  }}
                  type="button"
                >
                  Clear local session
                </button>
              ) : null}
            </div>
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
