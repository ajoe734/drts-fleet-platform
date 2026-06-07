export default function UnsupportedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">不支援情境</span>
        <h1>部分行程與收據結果不由乘客入口直接處理。</h1>
        <p>
          服務區域外、第三方歸屬或其他不支援情境會在這裡明確說明，避免乘客誤以為可以直接預約或下載。
        </p>
      </section>

      <section className="content-grid">
        <article className="surface-card">
          <span className="surface-kicker">暫不服務</span>
          <h3>服務區域外或需求不支援</h3>
          <p>
            若乘客位於服務區域外，系統會明確告知目前無法服務，而不是假裝預約可以繼續。
          </p>
        </article>
        <article className="surface-card">
          <span className="surface-kicker">來源渠道收據</span>
          <h3>合作夥伴或租戶帳務</h3>
          <p>
            若帳務由其他渠道負責，乘客入口會指向正確權責方，不會自行產生下載收據。
          </p>
        </article>
      </section>
    </div>
  );
}
