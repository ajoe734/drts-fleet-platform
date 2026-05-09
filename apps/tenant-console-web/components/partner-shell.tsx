"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityMode,
} from "@drts/contracts";

export type PartnerNavItem = {
  href: string;
  label: string;
  note: string;
};

type PartnerSessionSummary = {
  partnerCode: string;
  displayName: string;
  entrySlug: string;
  programCode: string | null;
  bankCode: string | null;
  eligibilityMode: PartnerEligibilityMode;
  authMode: PartnerChannelEntryRecord["authMode"];
  themeAccent: string | null;
  identityActorType: string;
  identityActorId: string | null;
  expiresAt: string;
};

const ELIGIBILITY_NOTE: Record<PartnerEligibilityMode, string> = {
  none: "No eligibility check required for this entry.",
  bank_card_inline: "Inline card verification required before booking.",
  reference_required: "Reference token verification required before booking.",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PartnerAuthenticatedShell({
  session,
  navItems,
  children,
}: {
  session: PartnerSessionSummary;
  navItems: PartnerNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleLogout() {
    const response = await fetch("/api/partner/session", { method: "DELETE" });
    if (response.ok) {
      startTransition(() => {
        router.push("/partner/login");
        router.refresh();
      });
    }
  }

  const activeItem = navItems.find((item) => isActive(pathname, item.href));

  return (
    <div
      className="partner-shell"
      style={
        session.themeAccent
          ? ({ "--partner-accent": session.themeAccent } as React.CSSProperties)
          : undefined
      }
    >
      <aside className="partner-sidebar" aria-label="Partner navigation">
        <div className="partner-brand">
          <span className="partner-badge">Partner mode</span>
          <h1>{session.displayName}</h1>
          <p className="partner-brand-note">
            Entry slug <code>{session.entrySlug}</code>
            {session.programCode ? (
              <>
                {" · "}program <code>{session.programCode}</code>
              </>
            ) : null}
            {session.bankCode ? (
              <>
                {" · "}bank <code>{session.bankCode}</code>
              </>
            ) : null}
          </p>
          <p className="partner-brand-note">
            {ELIGIBILITY_NOTE[session.eligibilityMode]}
          </p>
        </div>

        <nav className="partner-nav">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                className={`partner-nav-link${active ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </Link>
            );
          })}
        </nav>

        <div className="partner-sidebar-footer">
          <div className="partner-identity">
            <strong>Identity</strong>
            <p>
              Actor <code>{session.identityActorType}</code>
              {session.identityActorId ? (
                <>
                  {" · "}id <code>{session.identityActorId}</code>
                </>
              ) : null}
            </p>
            <p>
              Auth mode <code>{session.authMode}</code>
            </p>
            <p>
              Session valid until{" "}
              <time dateTime={session.expiresAt}>
                {new Date(session.expiresAt).toLocaleString()}
              </time>
            </p>
          </div>
          <button
            className="action-button action-button-secondary"
            disabled={pending}
            onClick={() => void handleLogout()}
            type="button"
          >
            {pending ? "Signing out..." : "Sign out partner"}
          </button>
        </div>
      </aside>

      <main className="partner-main">
        <div className="partner-frame">
          <header className="partner-topbar">
            <div className="partner-topbar-copy">
              <span className="eyebrow">Constrained partner shell</span>
              <h2>{activeItem?.label ?? "Partner workspace"}</h2>
              <p>
                {activeItem?.note ??
                  "Partner workspace exposes only entry-scoped eligibility and booking creation."}
              </p>
            </div>
            <div className="partner-topbar-meta">
              <span className="meta-pill">Authority: `/api/tenant/*`</span>
              <span className="meta-pill">No tenant-admin nav exposed</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

export function PartnerPublicShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="partner-public-shell">
      <header className="partner-public-header">
        <span className="partner-badge">Partner mode</span>
        <h1>Partner sign-in</h1>
        <p>
          Repo-local partner booking entry. Submit your entry slug and partner
          API key to start a backend-issued bootstrap session.
        </p>
      </header>
      <section className="partner-public-body">{children}</section>
      <footer className="partner-public-footer">
        Partner mode is constrained: it never exposes tenant-admin governance,
        users, audit, API keys, webhooks, or settings.
      </footer>
    </div>
  );
}
