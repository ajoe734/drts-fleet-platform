import Link from "next/link";

const ownership = [
  {
    label: "Source channel",
    value: "Tenant booking",
    note: "The trip was booked by a tenant on behalf of the rider; tenant retains mutation authority.",
  },
  {
    label: "Visible to rider",
    value: "Status, ETA, vehicle, lifecycle",
    note: "All read paths are mirrored so the rider can follow the trip without owning mutation.",
  },
  {
    label: "Hidden from rider",
    value: "Cancel / reschedule / fare override",
    note: "Mutating affordances live with the source channel and are not surfaced here.",
  },
];

const ownershipMatrix = [
  {
    source: "Direct passenger",
    mutate: "Rider",
    view: "Rider",
    note: "The standard `/trip` route. Cancel-safe authority sits with the rider.",
  },
  {
    source: "Tenant booking",
    mutate: "Tenant console",
    view: "Rider (read-only)",
    note: "This route. Rider sees status; tenant owns cancel and override.",
  },
  {
    source: "Partner booking",
    mutate: "Partner channel",
    view: "Rider (read-only)",
    note: "Mutation is delegated to the partner surface. Rider stays read-only.",
  },
  {
    source: "Concierge booking",
    mutate: "Concierge / call-point",
    view: "Rider (read-only)",
    note: "Mutation is held by the concierge surface (see SYS-UI-005).",
  },
];

export default function TripReadOnlyPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">
          Read-only authority
        </span>
        <h1>This trip is read-only for the rider.</h1>
        <p>
          The booking is owned by another channel. The rider can follow the trip
          but cannot cancel, reschedule, or override fare from this surface. The
          mutating authority lives with the source channel.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Ownership snapshot</span>
        <h3>Authority breakdown</h3>
        <dl className="kv-grid">
          {ownership.map((row) => (
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
        <span className="surface-kicker">Cross-channel matrix</span>
        <h3>Where mutation lives by source channel</h3>
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Source channel</th>
              <th>Mutation authority</th>
              <th>Rider visibility</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {ownershipMatrix.map((row) => (
              <tr key={row.source}>
                <td>
                  <strong>{row.source}</strong>
                </td>
                <td>{row.mutate}</td>
                <td>{row.view}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>No fake mutation affordance</strong>
          <p>
            Cancel, reschedule, and override do not appear here even as disabled
            buttons. Hiding them is intentional: surfacing a button the rider
            cannot press would be misleading.
          </p>
        </article>
        <article className="callout-card">
          <strong>How the rider acts on this trip</strong>
          <p>
            The rider must reach back through the source channel — tenant,
            partner, or concierge — to mutate the trip. Support escalation stays
            available.
          </p>
          <Link className="text-link" href="/unsupported">
            Open unsupported / source-owned fallback
          </Link>
        </article>
      </section>
    </div>
  );
}
