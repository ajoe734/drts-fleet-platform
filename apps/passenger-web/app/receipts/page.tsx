const receiptStates = [
  {
    title: "DRTS-issued receipt",
    status: "Supported",
    body: "Direct passenger trips can expose a platform-owned receipt artifact and trace metadata from this lane.",
  },
  {
    title: "External receipt reference",
    status: "Supported with ownership handoff",
    body: "When the source channel owns billing, the rider sees who owns the receipt and where to continue instead of a fake download button.",
  },
  {
    title: "Receipt unavailable or unsupported",
    status: "Explicitly handled",
    body: "Phone-assisted, partner, or otherwise unsupported cases remain visible with a concrete explanation and support direction.",
  },
];

export default function ReceiptCenterPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">Receipt center</span>
        <h1>
          The passenger receipt surface is now a real route, not only a roadmap
          note.
        </h1>
        <p>
          This landing page establishes the receipt topology required by
          `SYS-UI-003`: supported DRTS receipts, external-reference handoff, and
          unsupported cases are separated on purpose so the UI stays honest
          about source ownership.
        </p>
      </section>

      <section className="content-grid">
        {receiptStates.map((state) => (
          <article className="surface-card" key={state.title}>
            <span className="surface-kicker">{state.status}</span>
            <h3>{state.title}</h3>
            <p>{state.body}</p>
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
