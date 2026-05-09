import Link from "next/link";

const reauthCauses = [
  {
    code: "session.expired",
    body: "The rider's session token expired during the trip. Trip data stays hidden until the rider re-verifies.",
  },
  {
    code: "session.revoked",
    body: "The session was revoked from another device or by support. Re-authentication is required.",
  },
  {
    code: "context.mismatch",
    body: "The trip context cannot be re-established because the rider profile changed. Verification clears it.",
  },
];

export default function TripReauthRequiredPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          Session expired
        </span>
        <h1>Re-authentication is required to continue.</h1>
        <p>
          The platform held back trip data because it can no longer prove who
          the rider is. The route does not show stale trip details and does not
          silently downgrade to anonymous mode. Re-verification is the only way
          forward.
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">Why this happens</span>
        <h3>Reauth is triggered by an explicit signal</h3>
        <ul className="check-list">
          {reauthCauses.map((cause) => (
            <li className="check-item check-blocked" key={cause.code}>
              <strong>{cause.code}</strong>
              <span className="check-state">blocked</span>
              <p>{cause.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Re-verify identity</strong>
          <p>
            The auth entry route owns the actual reauthentication path. After it
            clears, the rider returns to the active trip view automatically.
          </p>
          <Link className="text-link" href="/auth">
            Go to auth entry
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>What stays hidden</strong>
          <p>
            Trip status, ETA, vehicle, and driver details all stay hidden during
            reauth. The unauthenticated guardrails apply.
          </p>
          <Link className="text-link" href="/unauthenticated">
            See unauthenticated fallback
          </Link>
        </article>
      </section>
    </div>
  );
}
