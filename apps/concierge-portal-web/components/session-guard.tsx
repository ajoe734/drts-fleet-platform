"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export function SessionGuard({
  children,
  requireDesk = false,
}: {
  children: ReactNode;
  requireDesk?: boolean;
}) {
  const { ready, session } = useConciergePortal();
  const desk = useSelectedDesk();

  if (!ready) {
    return (
      <section className="panel-card">
        <span className="section-kicker">Bootstrap</span>
        <h2>Loading local portal session.</h2>
        <p>
          This route waits for the repo-local assisted-entry bootstrap because
          dedicated call-point auth is still gated outside the repo.
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">Sign-in required</span>
        <h2>Desk bootstrap has not been created yet.</h2>
        <p>
          Use the repo-local sign-in route first, then choose a fixed site
          before opening bookings, lookup, or callback follow-up.
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/login">
            Open bootstrap sign-in
          </Link>
        </div>
      </section>
    );
  }

  if (requireDesk && !desk) {
    return (
      <section className="panel-card tone-warning">
        <span className="section-kicker">Desk selection required</span>
        <h2>Select the fixed site first.</h2>
        <p>
          Phase 1 requires every call point to be bound to a site before proxy
          booking starts. The portal keeps that selection explicit.
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            Choose site-bound desk
          </Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
