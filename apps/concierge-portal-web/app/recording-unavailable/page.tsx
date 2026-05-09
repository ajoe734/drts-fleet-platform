"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function RecordingUnavailablePage() {
  const { session } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">Recording unavailable</span>
        <h1>Raw recording callback remains an ops-only follow-up step.</h1>
        <p>
          The portal can open sessions, create orders, quote ETA, and manage
          callbacks, but it does not pretend to own the CTI callback binding
          path. Recording callback remains explicit because production telephony
          activation is still gated.
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">Current desk posture</span>
          <h2>{desk ? desk.deskName : "Desk not selected"}</h2>
          <p>
            {session?.activeCallId
              ? `Active call session: ${session.activeCallId}`
              : "No active desk session is currently open in local state."}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/callbacks">
              Route to callback follow-up
            </Link>
            <Link className="secondary-link" href="/lookup">
              Review order lookup
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">Escalation seam</span>
          <h2>Ops callcenter owns attach-recording-callback.</h2>
          <p>
            This mirrors the current backend truth: callcenter supports
            `attach-recording-callback`, but the assisted-entry portal does not
            surface raw recording evidence management as a primary desk action.
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
          </div>
        </article>
      </section>
    </div>
  );
}
