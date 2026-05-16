import Link from "next/link";

const supplyContext = [
  {
    label: "Pickup ETA window",
    value: "no qualified driver under 30 min",
    note: "The platform searched the configured radius and time window without a match.",
  },
  {
    label: "Service area",
    value: "in service",
    note: "The drop-off is inside the supported area, so this is not an `unsupported` outcome.",
  },
  {
    label: "Fallback options",
    value: "schedule for later, retry, alternate channel",
    note: "Each fallback is offered as an explicit affordance, not auto-applied.",
  },
];

export default function BookingNoSupplyPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          No driver matched
        </span>
        <h1>No supply is currently available for this request.</h1>
        <p>
          The request was not denied; the platform simply could not match a
          qualified driver inside the configured radius and time window. The
          rider keeps cancel-safe authority and is offered explicit fallbacks.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">
          Why this differs from `denied` and `unsupported`
        </span>
        <h3>Supply-side rather than policy-side</h3>
        <dl className="kv-grid">
          {supplyContext.map((row) => (
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
          <strong>Retry now</strong>
          <p>
            Riders may retry immediately; supply changes second-by-second and
            the platform may match a driver shortly.
          </p>
          <Link className="text-link" href="/book">
            Re-submit the same request
          </Link>
        </article>
        <article className="callout-card">
          <strong>Schedule for later</strong>
          <p>
            Riders may convert the request into a scheduled reservation if the
            program allows it. The reservation lane owns the actual booking type
            swap.
          </p>
        </article>
        <article className="callout-card warning">
          <strong>No phantom matching</strong>
          <p>
            The route never claims a match that does not exist and never holds
            the rider in a fake "searching forever" state without a deadline.
          </p>
        </article>
      </section>
    </div>
  );
}
