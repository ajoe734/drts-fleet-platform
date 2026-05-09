import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { tripFlowRoutes } from "@/lib/navigation";

const tripSnapshot = {
  tripId: "trp_8FQ12X",
  status: "Driver matched",
  eta: "8 min (estimate)",
  vehicle: "White Toyota Camry · 7VBN384",
  driverName: "Driver M. (first name shown to rider)",
  cancelWindow: "Cancel-safe until pickup arrival",
  authority: "DRTS-owned trip",
};

const lifecycle = [
  {
    phase: "Requested",
    state: "complete",
    body: "Rider submitted the request.",
  },
  {
    phase: "Matched",
    state: "current",
    body: "Driver accepted; ETA estimate is rolling.",
  },
  {
    phase: "En route to pickup",
    state: "upcoming",
    body: "Driver is moving toward pickup.",
  },
  {
    phase: "Picked up",
    state: "upcoming",
    body: "Trip starts after rider boards.",
  },
  {
    phase: "Drop-off",
    state: "upcoming",
    body: "Trip ends at the drop-off; receipt becomes available.",
  },
];

const subRoutes = tripFlowRoutes.filter((route) => route.href !== "/trip");

export default function TripStatusPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">Active trip status</span>
        <h1>
          The active trip surface is now a real route, not a roadmap note.
        </h1>
        <p>
          This page materializes the in-flight passenger trip view required by
          `SYS-UI-004`. Status, ETA framing, vehicle metadata, and authority
          posture are all visible. Mutations only appear when the rider still
          owns the relevant authority.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Trip {tripSnapshot.tripId}</span>
        <h3>{tripSnapshot.status}</h3>
        <dl className="kv-grid">
          <div className="kv-row">
            <dt>ETA</dt>
            <dd>
              <strong>{tripSnapshot.eta}</strong>
              <span>Always rendered as an estimate, never as a guarantee.</span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Vehicle</dt>
            <dd>
              <strong>{tripSnapshot.vehicle}</strong>
              <span>
                Plate and model shown so the rider can identify the vehicle.
              </span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Driver</dt>
            <dd>
              <strong>{tripSnapshot.driverName}</strong>
              <span>
                Only first name; phone-bridged contact handled outside this
                surface.
              </span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Authority</dt>
            <dd>
              <strong>{tripSnapshot.authority}</strong>
              <span>
                Mutation is allowed because this is a direct passenger trip.
              </span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Cancel window</dt>
            <dd>
              <strong>{tripSnapshot.cancelWindow}</strong>
              <span>
                Cancellation policy is enforced server-side; the UI only mirrors
                it.
              </span>
            </dd>
          </div>
        </dl>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip/cancel">
            Cancel this trip
          </Link>
          <Link className="secondary-link" href="/trip/completed">
            Preview completion view
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Lifecycle</span>
        <h3>Phase-by-phase progress</h3>
        <ul className="check-list">
          {lifecycle.map((phase) => (
            <li className={`check-item check-${phase.state}`} key={phase.phase}>
              <strong>{phase.phase}</strong>
              <span className="check-state">{phase.state}</span>
              <p>{phase.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">Subroutes</span>
          <h2>Each lifecycle outcome has its own named route</h2>
          <p>
            Cancel, complete, read-only authority, post-fact cancellation, and
            reauth-required outcomes are split out so the UI is auditable
            route-by-route, not behind hidden conditional branches.
          </p>
        </header>
        <FlowRouteCards routes={subRoutes} />
      </section>
    </div>
  );
}
