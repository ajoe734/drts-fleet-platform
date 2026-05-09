import Link from "next/link";

const policyDetails = [
  {
    label: "Cancel window",
    value: "Open until pickup",
    note: "Rider holds cancellation authority until the driver arrives at pickup.",
  },
  {
    label: "Cancellation fee",
    value: "$0 today",
    note: "Server enforces fee policy. The UI mirrors the current quote and never invents a different amount.",
  },
  {
    label: "Refund posture",
    value: "Pre-auth release",
    note: "Any payment pre-auth is released; no settled charge happens for an in-window cancel.",
  },
];

const reasonOptions = [
  { id: "changed_plans", label: "Plans changed" },
  { id: "wait_too_long", label: "Wait time too long" },
  { id: "wrong_pickup", label: "Pickup location is wrong" },
  { id: "other", label: "Other (free text optional)" },
];

export default function TripCancelPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">
          Cancel requested
        </span>
        <h1>Cancel the active trip while authority allows it.</h1>
        <p>
          This route is reachable only while the rider holds cancel authority.
          The page mirrors the server-enforced policy window and the quoted fee
          so the rider sees the same numbers support sees.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Policy snapshot</span>
        <h3>What cancellation does right now</h3>
        <dl className="kv-grid">
          {policyDetails.map((row) => (
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

      <section className="surface-card">
        <span className="surface-kicker">Reason (optional)</span>
        <h3>Why are you cancelling?</h3>
        <ul className="check-list">
          {reasonOptions.map((reason) => (
            <li className="check-item check-available" key={reason.id}>
              <strong>{reason.label}</strong>
              <span className="check-state">selectable</span>
              <p>Free-form text is allowed but is not required to cancel.</p>
            </li>
          ))}
        </ul>
        <p className="surface-footnote">
          The reason is reported to the operations side for supply tuning. It
          never blocks cancellation when the policy window is open.
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>After cancellation</strong>
          <p>
            The rider lands on the cancelled-trip surface, which names the
            cancelling actor (rider, driver, or platform) for clarity.
          </p>
          <Link className="text-link" href="/trip/cancelled">
            Preview cancelled-trip view
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>Out-of-window cancellation</strong>
          <p>
            Once the cancel window closes, this route stops offering the
            mutation and routes the rider to the read-only or completed view
            instead.
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip/cancelled">
          Confirm cancellation (preview)
        </Link>
        <Link className="secondary-link" href="/trip">
          Keep the trip
        </Link>
      </section>
    </div>
  );
}
