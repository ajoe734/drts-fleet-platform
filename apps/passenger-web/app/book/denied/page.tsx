import Link from "next/link";

const denialReasons = [
  {
    code: "policy.safety_hold",
    body: "Active safety hold on the rider profile. Booking is blocked until the hold clears via support.",
  },
  {
    code: "policy.fraud_review",
    body: "Open fraud review on the rider's recent activity. The rider sees a non-blaming message and a support exit.",
  },
  {
    code: "policy.unsupported_destination",
    body: "Drop-off lies in a region the platform has explicitly blocked for non-credentialed riders.",
  },
];

export default function BookingDeniedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          Denied by policy
        </span>
        <h1>Booking request was denied.</h1>
        <p>
          The platform rejected this request for a policy reason. The rider
          surface intentionally does not show the underlying decision graph; it
          shows the public-facing reason and the safe next steps.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Reason class (sample)</span>
        <h3>policy.safety_hold</h3>
        <p>
          Public-facing message: "We could not complete this request. Please
          contact support to review your account before booking again."
        </p>
        <p className="surface-footnote">
          Internal reason codes are not surfaced to the rider, but they are
          stable enough for support to look up. The mapping table is owned by
          the booking policy service, not by this UI.
        </p>
      </section>

      <section className="content-grid">
        {denialReasons.map((reason) => (
          <article className="surface-card" key={reason.code}>
            <span className="surface-kicker">{reason.code}</span>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Allowed next steps</strong>
          <p>
            Riders may contact support, retry after the policy reason clears, or
            fall back to an unsupported channel acknowledgement.
          </p>
          <Link className="text-link" href="/unsupported">
            Open unsupported fallback
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>What the route does not do</strong>
          <p>
            It does not auto-retry, does not silently downgrade to a different
            service level, and does not blame the rider for the denial.
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          Re-verify rider identity
        </Link>
        <Link className="secondary-link" href="/book">
          Return to request entry
        </Link>
      </section>
    </div>
  );
}
