import Link from "next/link";

const activeTrip = {
  rideLabel: "Airport return to downtown",
  eta: "8 minutes",
  status: "Driver matched",
  supportWindow: "Cancelable until driver arrives at pickup",
};

const statusLanes = [
  {
    title: "Current trip posture",
    body: "Passenger home lands on booking status first, not a generic marketing splash. ETA is always framed as an estimate rather than a guarantee.",
  },
  {
    title: "History and receipts",
    body: "Past trips and receipt ownership are reachable from the same shell so riders do not need a separate product surface.",
  },
  {
    title: "Unsupported channels",
    body: "Orders owned by partner, tenant, or third-party receipt channels stay explicit instead of pretending every trip can download a DRTS PDF.",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">Booking status home</span>
        <h1>
          Passenger landing starts from trip state, ETA framing, and next action
          clarity.
        </h1>
        <p>
          `SYS-UI-003` reopens the first-party passenger surface with a real app
          shell. This home route anchors status visibility, auth entry, receipt
          landing, and explicit fallback states without inventing the downstream
          booking workflow yet.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/auth">
            Open auth entry
          </Link>
          <Link className="secondary-link" href="/trips">
            Review trip history
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Active trip</span>
          <strong>{activeTrip.status}</strong>
          <p>{activeTrip.rideLabel}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">ETA</span>
          <strong>{activeTrip.eta}</strong>
          <p>Displayed as an estimated arrival, never as a guarantee.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Next action</span>
          <strong>Trip trace</strong>
          <p>{activeTrip.supportWindow}</p>
        </article>
      </section>

      <section className="content-grid">
        {statusLanes.map((lane) => (
          <article className="surface-card" key={lane.title}>
            <span className="surface-kicker">Baseline</span>
            <h3>{lane.title}</h3>
            <p>{lane.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Empty-state contract</strong>
          <p>
            If no active trip exists, this surface should degrade to history,
            receipt lookup, and support-safe entry points instead of a blank
            shell.
          </p>
        </article>
        <article className="callout-card warning">
          <strong>Downstream scope stays downstream</strong>
          <p>
            Booking create, cancel, denial, no-supply, and degraded negative
            flows remain the `SYS-UI-004` materialization task.
          </p>
        </article>
      </section>
    </div>
  );
}
