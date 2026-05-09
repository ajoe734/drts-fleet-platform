import Link from "next/link";

export default function UnauthenticatedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Unauthenticated state</span>
        <h1>Trip details stay locked until the rider clears bootstrap.</h1>
        <p>
          This route makes the fallback explicit for passengers who arrive
          without a valid session, code, or trip-verification context.
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Allowed next steps</strong>
          <p>
            Re-enter through auth, verify a reservation code, or contact support
            through the future passenger support lane.
          </p>
          <Link className="text-link" href="/auth">
            Return to auth entry
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>What this route does not do</strong>
          <p>
            It does not leak tenant-admin booking data, ops tooling, or partial
            receipt artifacts to an unauthenticated rider.
          </p>
        </article>
      </section>
    </div>
  );
}
