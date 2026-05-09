import Link from "next/link";

const tripCards = [
  {
    title: "Completed trip",
    note: "DRTS-owned receipt available",
    detail:
      "A completed direct passenger trip can expose a platform-issued receipt and trip trace from the same lane.",
  },
  {
    title: "Partner or tenant-funded trip",
    note: "External receipt reference",
    detail:
      "History stays visible, but billing ownership may point the rider to the source channel that actually owns the receipt artifact.",
  },
  {
    title: "No prior trips",
    note: "Empty state",
    detail:
      "The route must still explain how to find an active trip or re-enter via auth instead of rendering an empty table shell.",
  },
];

export default function TripHistoryPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">Trip history</span>
        <h1>
          Receipt and history now exist as a concrete passenger sub-surface.
        </h1>
        <p>
          The reopened passenger app no longer leaves trip history as deferred
          prose. This route marks where completed and prior trips will land,
          including explicit receipt-ownership outcomes.
        </p>
      </section>

      <section className="content-grid">
        {tripCards.map((trip) => (
          <article className="surface-card" key={trip.title}>
            <span className="surface-kicker">{trip.note}</span>
            <h3>{trip.title}</h3>
            <p>{trip.detail}</p>
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
      </section>
    </div>
  );
}
