import Link from "next/link";

const entryOptions = [
  {
    title: "Magic-link or code entry",
    body: "Primary rider bootstrap path for direct passenger access once the channel-specific auth seam is implemented.",
  },
  {
    title: "Trip lookup with guarded fallback",
    body: "Supports reservation code or contact verification framing without exposing tenant or ops identity surfaces.",
  },
  {
    title: "Support escalation",
    body: "If the rider cannot be verified, the shell routes them to explicit unauthenticated handling rather than inventing partial access.",
  },
];

export default function AuthEntryPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Auth entry</span>
        <h1>Passenger bootstrap now has a named landing route.</h1>
        <p>
          This route reserves the channel-specific sign-in and trip-lookup entry
          point required by the reopened passenger topology. It keeps the auth
          boundary explicit while downstream transport and identity seams are
          still being wired.
        </p>
      </section>

      <section className="content-grid">
        {entryOptions.map((option) => (
          <article className="surface-card" key={option.title}>
            <span className="surface-kicker">Entry lane</span>
            <h3>{option.title}</h3>
            <p>{option.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Unauthenticated state</strong>
          <p>
            Riders who have not cleared verification flow into a dedicated
            fallback route instead of seeing stale trip data.
          </p>
          <Link className="text-link" href="/unauthenticated">
            View unauthenticated fallback
          </Link>
        </article>
      </section>
    </div>
  );
}
