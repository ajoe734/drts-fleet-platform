import Link from "next/link";

const degradedAffordances = [
  {
    state: "available",
    name: "View existing trip status",
    body: "Read paths still work. Riders can confirm whether an in-progress trip exists and view its last-known status snapshot.",
  },
  {
    state: "blocked",
    name: "Submit new booking request",
    body: "Mutating endpoints are intentionally disabled while the platform is in degraded mode. The submit affordance is hidden, not faked.",
  },
  {
    state: "blocked",
    name: "Cancel an active trip",
    body: "Cancellation is also held back; ops/support owns mutations during the degraded window so two writers cannot race.",
  },
  {
    state: "available",
    name: "Contact support",
    body: "Support escalation is always available, including a clearly-named incident reference for the rider to share.",
  },
];

export default function BookingDegradedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          Read-only fallback
        </span>
        <h1>Booking is in degraded mode.</h1>
        <p>
          The booking surface has detected a degraded backend. The route stays
          honest about which affordances are available and which are
          intentionally blocked instead of failing silently when a submit is
          attempted.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Affordance matrix</span>
        <h3>What works, what is blocked, and why</h3>
        <ul className="check-list">
          {degradedAffordances.map((row) => (
            <li className={`check-item check-${row.state}`} key={row.name}>
              <strong>{row.name}</strong>
              <span className="check-state">{row.state}</span>
              <p>{row.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Where the signal comes from</strong>
          <p>
            Degraded mode is driven by an upstream health signal, not by the UI
            guessing. The rider sees the same posture support is operating on,
            so explanations stay consistent.
          </p>
        </article>
        <article className="callout-card warning">
          <strong>No fake retries</strong>
          <p>
            The route never silently retries a blocked mutation in the
            background. Retries are explicit rider actions tied to the recovery
            state.
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip">
          View any active trip status
        </Link>
        <Link className="secondary-link" href="/unsupported">
          Open unsupported fallback
        </Link>
      </section>
    </div>
  );
}
