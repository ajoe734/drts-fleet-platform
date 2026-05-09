import Link from "next/link";

const completionSummary = [
  {
    label: "Trip ID",
    value: "trp_8FQ12X",
    note: "Stable identifier for this trip across history, receipts, and support.",
  },
  {
    label: "Duration",
    value: "23 min",
    note: "Measured wheels-down to wheels-up; not a quoted estimate.",
  },
  {
    label: "Distance",
    value: "8.4 mi",
    note: "Routing distance reported by the trip trace.",
  },
  {
    label: "Fare total",
    value: "$24.10",
    note: "Server-authoritative; UI mirrors the settlement record.",
  },
  {
    label: "Receipt status",
    value: "DRTS-issued",
    note: "Receipt is owned by the platform; visible in the receipt center.",
  },
];

export default function TripCompletedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow state-pill state-pill-positive">
          Completed
        </span>
        <h1>Trip completed cleanly.</h1>
        <p>
          The trip ended at the drop-off. This route consolidates the post-trip
          summary, points the rider at the platform-issued receipt, and leaves a
          return path back to history for follow-up.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Trip summary</span>
        <h3>Post-trip snapshot</h3>
        <dl className="kv-grid">
          {completionSummary.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Open the receipt</strong>
          <p>
            The DRTS-issued receipt is reachable from the receipt center and
            keeps source-driven ownership semantics.
          </p>
          <Link className="text-link" href="/receipts">
            Go to receipt center
          </Link>
        </article>
        <article className="callout-card">
          <strong>Return to history</strong>
          <p>
            Past trips list completed and prior trips together with the right
            receipt-ownership outcomes.
          </p>
          <Link className="text-link" href="/trips">
            View trip history
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>Out of scope</strong>
          <p>
            Tip flow, complaint flow, and ratings are intentionally not
            materialized in this slice. Each lives in its own future lane.
          </p>
        </article>
      </section>
    </div>
  );
}
