import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { bookingFlowRoutes } from "@/lib/navigation";

const requestSummary = [
  {
    label: "Pickup",
    value: "1 Market St, San Francisco",
    note: "Captured from the rider's stored location or fresh entry.",
  },
  {
    label: "Drop-off",
    value: "SFO Terminal 2",
    note: "Drop-off can be a saved place or freeform address.",
  },
  {
    label: "Reservation window",
    value: "Pick up in ~10 min (estimate)",
    note: "Estimated arrival is shown as a range, never as a guaranteed minute.",
  },
  {
    label: "Service level",
    value: "Standard direct (DRTS-owned)",
    note: "Partner / tenant / concierge surfaces have their own request entry; this lane is direct passenger.",
  },
];

const negativeRoutes = bookingFlowRoutes.filter(
  (route) => route.kind === "negative",
);

export default function BookingRequestPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">Booking request</span>
        <h1>
          Request a ride lands as a real route, not a "coming soon" placeholder.
        </h1>
        <p>
          This route materializes the passenger booking entry required by
          `SYS-UI-004`. It frames the request as a quote-then-confirm flow,
          stays explicit about ETA estimates, and exposes every reachable
          negative outcome as its own named subroute.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip">
            Continue to active trip view
          </Link>
          <Link className="secondary-link" href="/auth">
            Verify rider identity first
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Request payload (preview)</span>
        <h3>Confirm pickup, drop-off, and timing before submission</h3>
        <dl className="kv-grid">
          {requestSummary.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="surface-footnote">
          Submission is intentionally not wired to a live backend in this slice.
          The slice materializes the route topology and authority framing; the
          actual `POST /bookings` integration belongs to a downstream wave.
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Authority-safe entry</strong>
          <p>
            This surface only owns direct passenger requests. Bookings owned by
            tenant, partner, or concierge channels stay in their own surfaces
            and are not duplicated here.
          </p>
        </article>
        <article className="callout-card warning">
          <strong>ETA stays an estimate</strong>
          <p>
            The route never guarantees a specific pickup minute. Quote and
            estimated-arrival framing is part of the contract, not decoration.
          </p>
        </article>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">Negative outcomes</span>
          <h2>Every reachable rejection has its own route</h2>
          <p>
            Riders never land on a vague "something went wrong" page. Each
            failure mode is a named subroute with explicit framing and a safe
            next action.
          </p>
        </header>
        <FlowRouteCards routes={negativeRoutes} emphasizeKind="negative" />
      </section>
    </div>
  );
}
