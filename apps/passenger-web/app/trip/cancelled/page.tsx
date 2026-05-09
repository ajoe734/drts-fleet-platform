import Link from "next/link";

const cancellationCases = [
  {
    actor: "Rider",
    body: "The rider cancelled while the policy window was open. No fee charged in this scenario.",
    next: "Rider may request a new trip immediately.",
  },
  {
    actor: "Driver",
    body: "The matched driver cancelled before pickup. The platform did not penalize the rider.",
    next: "The platform attempts re-matching automatically; the rider sees the new state explicitly.",
  },
  {
    actor: "Platform",
    body: "Operations cancelled the trip due to a safety, supply, or policy event. The rider is told what happened in non-PII terms.",
    next: "The rider is offered support escalation and any auto-issued credit.",
  },
];

export default function TripCancelledPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          Cancelled
        </span>
        <h1>This trip was cancelled.</h1>
        <p>
          The trip is closed without a completed pickup. The route names the
          cancelling actor and the safe next action. The rider should never have
          to guess who cancelled or whether the cancellation cost something.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Cancelling actor</span>
        <h3>Who cancelled this trip and what comes next</h3>
        <ul className="check-list">
          {cancellationCases.map((row) => (
            <li className="check-item check-cancelled" key={row.actor}>
              <strong>{row.actor}</strong>
              <span className="check-state">cancelled</span>
              <p>{row.body}</p>
              <p className="check-next">Next: {row.next}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Cancellation receipt</strong>
          <p>
            Any cancellation fee receipt follows the same source-driven rules as
            a normal trip receipt; the receipt center surfaces it where it
            applies.
          </p>
          <Link className="text-link" href="/receipts">
            Check the receipt center
          </Link>
        </article>
        <article className="callout-card">
          <strong>Try again</strong>
          <p>
            The rider can submit a new request from the booking entry. If supply
            is the problem, the no-supply route is reused.
          </p>
          <Link className="text-link" href="/book">
            Open a new booking
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>What this route does not do</strong>
          <p>
            It does not silently issue a credit, does not auto-reorder the same
            trip, and does not blame the rider for a cancellation it did not
            own.
          </p>
        </article>
      </section>
    </div>
  );
}
