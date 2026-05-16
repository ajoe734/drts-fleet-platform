import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { bookingFlowRoutes, tripFlowRoutes } from "@/lib/navigation";

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
    title: "Negative-flow visibility",
    body: "Booking denial, ineligible, no-supply, degraded, cancelled, and reauth states are dedicated routes — not silent toasts.",
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
          `SYS-UI-003` opened the passenger shell with auth, trip-history, and
          receipt landing zones. `SYS-UI-004` now materializes the booking
          request, active trip status, completion / cancellation, and the named
          negative-flow routes that go with them.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/book">
            Request a ride
          </Link>
          <Link className="secondary-link" href="/trip">
            View active trip
          </Link>
          <Link className="text-link" href="/trips">
            Trip history
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

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">Booking flow inventory</span>
          <h2>Every booking-request outcome has its own route</h2>
          <p>
            The request entry, denial, ineligible, no-supply, and degraded
            states are reachable directly from this map for review and demos.
          </p>
        </header>
        <FlowRouteCards routes={bookingFlowRoutes} />
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">Trip flow inventory</span>
          <h2>Every active-trip outcome has its own route</h2>
          <p>
            Active status, cancel, completion, read-only authority, cancelled,
            and reauth-required all live on dedicated subroutes.
          </p>
        </header>
        <FlowRouteCards routes={tripFlowRoutes} />
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Empty-state contract</strong>
          <p>
            If no active trip exists, the surface degrades to history, receipt
            lookup, and support-safe entry points instead of a blank shell.
          </p>
        </article>
        <article className="callout-card warning">
          <strong>Backend wiring stays downstream</strong>
          <p>
            This slice materializes route topology and authority framing. Live
            booking create, cancel, and status integration is the next wave;
            nothing here invents a fake mutation.
          </p>
        </article>
      </section>
    </div>
  );
}
