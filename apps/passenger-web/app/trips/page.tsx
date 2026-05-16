import Link from "next/link";

const tripCards = [
  {
    title: "Completed trip",
    note: "DRTS-owned receipt available",
    detail:
      "A completed direct passenger trip can expose a platform-issued receipt and trip trace from the same lane.",
    href: "/trip/completed",
    cta: "Open completed-trip view",
  },
  {
    title: "Partner or tenant-funded trip",
    note: "External receipt reference",
    detail:
      "History stays visible, but billing ownership may point the rider to the source channel that actually owns the receipt artifact.",
    href: "/trip/read-only",
    cta: "Open read-only trip view",
  },
  {
    title: "Cancelled trip",
    note: "Cancellation outcome",
    detail:
      "History keeps cancelled trips with the cancelling actor named so the rider does not have to reconstruct what happened.",
    href: "/trip/cancelled",
    cta: "Open cancelled-trip view",
  },
  {
    title: "No prior trips",
    note: "Empty state",
    detail:
      "The route still explains how to find an active trip or re-enter via auth instead of rendering an empty table shell.",
    href: "/auth",
    cta: "Re-enter through auth",
  },
];

export default function TripHistoryPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Trip history</span>
        <h1>
          Trip history is a real passenger sub-surface with explicit outcome
          links.
        </h1>
        <p>
          The reopened passenger app no longer leaves trip history as deferred
          prose. This route surfaces completed, cancelled, and read-only past
          trips, each linked to its own outcome route from the `SYS-UI-004`
          materialization.
        </p>
      </section>

      <section className="content-grid">
        {tripCards.map((trip) => (
          <article className="surface-card" key={trip.title}>
            <span className="surface-kicker">{trip.note}</span>
            <h3>{trip.title}</h3>
            <p>{trip.detail}</p>
            <Link className="text-link" href={trip.href}>
              {trip.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>Receipt center handoff</strong>
          <p>
            Receipt rendering rules are owned by the dedicated receipt lane, so
            trip history links forward instead of duplicating billing logic.
          </p>
          <Link className="text-link" href="/receipts">
            Open receipt center
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>What history does not do</strong>
          <p>
            History does not re-issue receipts, does not invent cancellation
            credits, and does not surface trips owned by other riders.
          </p>
        </article>
      </section>
    </div>
  );
}
