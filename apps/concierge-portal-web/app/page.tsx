"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function HomePage() {
  const { ready, session } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">Call Point / Concierge Portal</span>
        <h1>
          Site-bound assisted entry is now materialized as a real landing zone.
        </h1>
        <p>
          This shell covers bootstrap sign-in, fixed-site selection, proxy
          booking, order lookup, callback follow-up, and explicit guardrail
          routes for denied, ineligible, degraded, and recording-unavailable
          states.
        </p>
        <div className="hero-actions">
          <Link
            className="primary-link"
            href={session ? "/bookings/new" : "/login"}
          >
            {session ? "Open proxy booking" : "Start local sign-in"}
          </Link>
          <Link className="secondary-link" href="/lookup">
            Review lookup surface
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="section-kicker">Bootstrap</span>
          <strong>{ready && session ? "Ready" : "Pending"}</strong>
          <p>
            {session
              ? `${session.operatorName} signed in as ${session.mode}.`
              : "No repo-local assisted-entry bootstrap exists yet."}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">Desk</span>
          <strong>{desk ? desk.deskName : "Not selected"}</strong>
          <p>
            {desk
              ? `${desk.siteName} · ${desk.zoneLabel}`
              : "Phase 1 keeps fixed-site selection explicit before order entry."}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">Recent activity</span>
          <strong>{session?.recentOrderIds.length ?? 0} order(s)</strong>
          <p>
            {session
              ? `${session.recentCallIds.length} desk session(s), ${session.recentCallbackTaskIds.length} callback task(s).`
              : "Recent order, callback, and session recall appears after bootstrap."}
          </p>
        </article>
      </section>

      <section className="grid-columns">
        <article className="panel-card">
          <span className="section-kicker">Next action</span>
          <h2>
            {session
              ? desk
                ? "Move into booking, lookup, or callback follow-up."
                : "Select the fixed site before the desk opens."
              : "Bootstrap the site-bound operator first."}
          </h2>
          <p>
            The portal keeps the external desk flow narrow: it reuses callcenter
            and order APIs, but it does not expose the full ops navigation or
            complaint-case management surface.
          </p>
          <div className="inline-actions">
            {!session ? (
              <Link className="primary-link" href="/login">
                Sign in locally
              </Link>
            ) : !desk ? (
              <Link className="primary-link" href="/start">
                Choose fixed site
              </Link>
            ) : (
              <>
                <Link className="primary-link" href="/bookings/new">
                  Create proxy booking
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  Open callbacks
                </Link>
              </>
            )}
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">Control-plane seam</span>
          <h2>Ops callcenter remains the escalation authority.</h2>
          <p>
            Dedicated call-point auth and telephony callback binding are still
            gated. The portal therefore keeps a direct handoff to ops for
            recording review, complaint transfer, and wider dispatch control.
          </p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              Open ops callcenter
            </a>
            <Link className="secondary-link" href="/recording-unavailable">
              Review recording gate
            </Link>
          </div>
        </article>
      </section>

      <section className="grid-columns">
        <article className="info-card">
          <span className="section-kicker">Positive flow</span>
          <h3>Bootstrap → site select → booking → lookup</h3>
          <p>
            The happy path starts at local sign-in, moves through a fixed desk,
            opens a desk session, and submits a phone-order style booking with
            ETA and trace readback.
          </p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/start">
              View desk catalog
            </Link>
          </div>
        </article>

        <article className="info-card tone-warning">
          <span className="section-kicker">Negative states</span>
          <h3>
            Denied, ineligible, degraded, and recording gate stay explicit.
          </h3>
          <p>
            The portal does not collapse failure modes into blank forms. Each
            guardrail has a first-class route so SYS-UI-006 and SYS-UI-008 can
            verify the matrix later.
          </p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/denied">
              Denied
            </Link>
            <Link className="secondary-link" href="/ineligible">
              Ineligible
            </Link>
            <Link className="secondary-link" href="/degraded">
              Degraded
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
