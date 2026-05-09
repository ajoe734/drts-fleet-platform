import Link from "next/link";

const eligibilityGates = [
  {
    name: "Identity verification",
    state: "verified",
    body: "Rider identity has been verified. This gate is currently passing.",
  },
  {
    name: "Payment instrument",
    state: "missing",
    body: "No usable payment instrument is on file. The rider must add one before requesting a paid trip.",
  },
  {
    name: "Program eligibility",
    state: "not enrolled",
    body: "The requested fare program (e.g., paratransit, partner subsidy) requires enrollment that is not present on this profile.",
  },
];

export default function BookingIneligiblePage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          Eligibility failed
        </span>
        <h1>Rider does not currently qualify for this booking.</h1>
        <p>
          Eligibility is checked before the request is dispatched. This route
          shows which gate failed without leaking PII or other riders' data.
          Each gate has its own remediation lane.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Eligibility checklist</span>
        <h3>Gate-by-gate result</h3>
        <ul className="check-list">
          {eligibilityGates.map((gate) => (
            <li
              key={gate.name}
              className={`check-item check-${gate.state.replace(/\s+/g, "-")}`}
            >
              <strong>{gate.name}</strong>
              <span className="check-state">{gate.state}</span>
              <p>{gate.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Add a payment instrument</strong>
          <p>
            Riders may resolve the most common ineligible state by adding a
            valid payment instrument. The rider profile lane owns this entry
            point.
          </p>
        </article>
        <article className="callout-card">
          <strong>Program enrollment</strong>
          <p>
            Subsidy / paratransit / partner programs are not auto-enrolled. The
            rider is sent to the program owner instead of being denied silently.
          </p>
          <Link className="text-link" href="/unsupported">
            Open unsupported fallback
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>No silent downgrade</strong>
          <p>
            The route never silently switches the rider to a different fare
            program or service tier. Any fallback must be explicit.
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          Re-verify identity
        </Link>
        <Link className="secondary-link" href="/book">
          Return to request entry
        </Link>
      </section>
    </div>
  );
}
