import Link from "next/link";

const cancellationCases = [
  {
    actor: "乘客",
    body: "乘客在規則允許的期限內取消。此情境不收取取消費。",
    next: "乘客可立即重新送出新的行程需求。",
  },
  {
    actor: "司機",
    body: "已媒合司機在上車前取消。平台不會因此對乘客收費或處罰。",
    next: "平台會嘗試重新媒合，並明確顯示新的狀態。",
  },
  {
    actor: "平台",
    body: "營運端因安全、供給或政策事件取消行程。乘客會看到不含個資的原因說明。",
    next: "乘客可聯絡客服，並查看是否有自動補償或後續處理。",
  },
];

export default function TripCancelledPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">已取消</span>
        <h1>此行程已取消。</h1>
        <p>
          行程未完成上車即已結束。頁面會說明取消方與可採取的下一步，避免乘客猜測是誰取消或是否產生費用。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">取消方</span>
        <h3>誰取消了行程，以及接下來怎麼做</h3>
        <ul className="check-list">
          {cancellationCases.map((row) => (
            <li className="check-item check-cancelled" key={row.actor}>
              <strong>{row.actor}</strong>
              <span className="check-state">已取消</span>
              <p>{row.body}</p>
              <p className="check-next">下一步：{row.next}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>取消收據</strong>
          <p>
            若有取消費收據，會依一般行程收據的來源歸屬規則處理，並在適用時於收據中心顯示。
          </p>
          <Link className="text-link" href="/receipts">
            查看收據中心
          </Link>
        </article>
        <article className="callout-card">
          <strong>重新預約</strong>
          <p>
            乘客可從預約入口重新送出需求。若問題是暫無車輛，系統會再次顯示供給不足說明。
          </p>
          <Link className="text-link" href="/book">
            開啟新的預約
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>頁面不會做的事</strong>
          <p>
            系統不會默默發放補償、不會自動重建相同行程，也不會把非乘客造成的取消歸咎於乘客。
          </p>
        </article>
      </section>
    </div>
  );
}
