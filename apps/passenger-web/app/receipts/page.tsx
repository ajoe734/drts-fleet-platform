import Link from "next/link";

const receiptStates = [
  {
    title: "DRTS-issued receipt",
    status: "Supported",
    body: "Direct passenger trips can expose a platform-owned receipt artifact and trace metadata from this lane.",
    href: "/trip/completed",
    cta: "Preview completed-trip receipt",
  },
  {
    title: "External receipt reference",
    status: "Supported with ownership handoff",
    body: "When the source channel owns billing, the rider sees who owns the receipt and where to continue instead of a fake download button.",
    href: "/trip/read-only",
    cta: "See read-only trip ownership",
  },
  {
    title: "Receipt unavailable or unsupported",
    status: "Explicitly handled",
    body: "Phone-assisted, partner, or otherwise unsupported cases remain visible with a concrete explanation and support direction.",
    href: "/unsupported",
    cta: "Open unsupported fallback",
  },
];

export default function ReceiptCenterPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">Receipt center</span>
        <h1>
          The passenger receipt surface is now wired to concrete trip outcomes.
        </h1>
        <p>
          This landing page establishes the receipt topology required by
          `SYS-UI-003` and links each ownership class to the matching trip
          outcome route from `SYS-UI-004`. Source-channel ownership stays
          authoritative; this surface only mirrors it.
        </p>
      </section>

      <section className="content-grid">
        {receiptStates.map((state) => (
          <article className="surface-card" key={state.title}>
            <span className="surface-kicker">{state.status}</span>
            <h3>{state.title}</h3>
            <p>{state.body}</p>
            <Link className="text-link" href={state.href}>
              {state.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>No invented delivery channel</strong>
          <p>
            The route intentionally avoids claiming new email or SMS receipt
            delivery. Ownership and availability must stay aligned with the
            upstream settlement and source-channel rules.
          </p>
        </article>
      </section>
    </div>
  );
}
