const scopeCards = [
  {
    label: "S1 web",
    title: "企業內部網站版",
    body: "Enterprise SSO / tenant bootstrap session. Employees and delegates can start bookings, review cost ownership, and return to booking or trip status without admin navigation.",
    routes: ["/", "/bookings/new", "/bookings/review", "/bookings"],
  },
  {
    label: "S2 embed",
    title: "企業 App 內嵌版",
    body: "Host app signed session / tenant-scoped hand-off token. Same booking semantics, compact chrome, explicit identity hand-off states, and no management credential prompts.",
    routes: ["/embed", "/embed/reauth-required", "/embed/unsupported-host"],
  },
];

const boundaryNotes = [
  "enterprise_dispatch only: passenger, bookedBy, cost center, quota, approval, and billing ownership stay first-class.",
  "Airport fields are conditional enterprise dispatch context, not the product information architecture.",
  "Command submit must allow accepted+pending and must not claim synchronous dispatch completion.",
];

const buildSlices = [
  {
    step: "A",
    title: "App scaffold",
    status: "In place",
  },
  {
    step: "B",
    title: "Enterprise Dispatch design kit and shell",
    status: "Next",
  },
  {
    step: "C-F",
    title: "Booking flow, status, gates, API wiring",
    status: "Planned",
  },
];

export default function HomePage() {
  return (
    <main className="ent-page-shell">
      <section className="ent-hero">
        <div className="ent-hero-copy">
          <span className="ent-eyebrow">enterprise_dispatch · A slice</span>
          <h1>企業用戶叫車前台 app scaffold</h1>
          <p>
            This app is the dedicated tenant-branded employee self-service
            frontend for enterprise dispatch booking. The first slice opens the
            product boundary, route posture, and S1 / S2 shell without importing
            tenant-console admin or partner-booking business flows.
          </p>
        </div>
        <div className="ent-hero-panel" aria-label="Product boundary summary">
          <span>範圍確認</span>
          <strong>S1 web + S2 embed</strong>
          <p>網站版與企業 App 內嵌版都屬於本 app 範圍。</p>
        </div>
      </section>

      <nav className="ent-top-nav" aria-label="Enterprise dispatch sections">
        <a href="/">首頁</a>
        <a href="/bookings">我的預約</a>
        <a href="/trip">目前行程</a>
        <a href="/help">說明</a>
      </nav>

      <section className="ent-surface-grid" aria-label="App surfaces">
        {scopeCards.map((card) => (
          <article className="ent-surface-card" key={card.label}>
            <span className="ent-card-label">{card.label}</span>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
            <div className="ent-route-list" aria-label={`${card.label} routes`}>
              {card.routes.map((route) => (
                <code key={route}>{route}</code>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="ent-architecture-grid">
        <article className="ent-card ent-boundary">
          <span className="ent-card-label">Product boundary</span>
          <h2>員工自助叫車，不是後台管理殼</h2>
          <ul>
            {boundaryNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>

        <article className="ent-card">
          <span className="ent-card-label">Build posture</span>
          <h2>Fresh frontend rebuild</h2>
          <div className="ent-slice-list">
            {buildSlices.map((slice) => (
              <div className="ent-slice" key={slice.step}>
                <span>{slice.step}</span>
                <strong>{slice.title}</strong>
                <em>{slice.status}</em>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
