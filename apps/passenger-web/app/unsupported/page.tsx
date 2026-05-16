export default function UnsupportedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Unsupported state</span>
        <h1>
          Some trip and receipt outcomes are intentionally not owned by this
          shell.
        </h1>
        <p>
          This route is the honest landing zone for out-of-service-area, third-
          party-owned, or otherwise unsupported passenger scenarios.
        </p>
      </section>

      <section className="content-grid">
        <article className="surface-card">
          <span className="surface-kicker">Not serviceable</span>
          <h3>Out-of-area or unsupported demand</h3>
          <p>
            If the rider is outside the service area, the product rule is to
            return an explicit `not_serviceable` outcome instead of pretending a
            booking can proceed.
          </p>
        </article>
        <article className="surface-card">
          <span className="surface-kicker">Source-owned receipts</span>
          <h3>Partner or tenant billing lane</h3>
          <p>
            Where another channel owns settlement, this shell can point to that
            authority but should not fabricate a passenger download artifact.
          </p>
        </article>
      </section>
    </div>
  );
}
