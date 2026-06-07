import Link from "next/link";

const tripCards = [
  {
    title: "已完成行程",
    note: "平台收據可用",
    detail: "乘客直訂且已完成的行程，可在同一入口查看平台開立收據與行程軌跡。",
    href: "/trip/completed",
    cta: "查看完成行程",
  },
  {
    title: "合作夥伴或租戶支付行程",
    note: "外部收據參考",
    detail:
      "行程紀錄仍可查看，但收據歸屬可能需要回到實際負責開立收據的來源渠道。",
    href: "/trip/read-only",
    cta: "查看唯讀行程",
  },
  {
    title: "已取消行程",
    note: "取消結果",
    detail:
      "紀錄會保留已取消行程，並標示取消方，讓乘客不必自行推測發生了什麼。",
    href: "/trip/cancelled",
    cta: "查看取消結果",
  },
  {
    title: "尚無過往行程",
    note: "空狀態",
    detail:
      "即使沒有資料，頁面也會說明如何查詢進行中行程或重新驗證，而不是只顯示空表格。",
    href: "/auth",
    cta: "透過身分驗證重新進入",
  },
];

export default function TripHistoryPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">行程紀錄</span>
        <h1>行程紀錄會清楚連到每一種結果頁。</h1>
        <p>
          乘客可在此查看完成、取消與唯讀行程，並依照不同結果前往對應的說明與後續處理頁。
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
          <strong>交由收據中心處理</strong>
          <p>
            收據顯示規則由收據中心負責，行程紀錄只提供正確連結，不重複處理帳務邏輯。
          </p>
          <Link className="text-link" href="/receipts">
            開啟收據中心
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>行程紀錄不會做的事</strong>
          <p>
            行程紀錄不會重新開立收據、不會自行產生取消補償，也不會顯示其他乘客的行程。
          </p>
        </article>
      </section>
    </div>
  );
}
