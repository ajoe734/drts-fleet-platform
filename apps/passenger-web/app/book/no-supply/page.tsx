import Link from "next/link";

const supplyContext = [
  {
    label: "預估上車時間",
    value: "30 分鐘內沒有符合條件的司機",
    note: "系統已在設定的距離與時間範圍內搜尋，但尚未媒合成功。",
  },
  {
    label: "服務區域",
    value: "位於服務範圍內",
    note: "下車地點仍在支援範圍內，因此問題是暫無車輛，而不是地點不支援。",
  },
  {
    label: "可用備援",
    value: "稍後預約、重新嘗試、改由其他渠道協助",
    note: "每個備援都會明確提供給乘客選擇，不會自動套用。",
  },
];

export default function BookingNoSupplyPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          尚未媒合司機
        </span>
        <h1>目前沒有可接此需求的車輛。</h1>
        <p>
          這不代表需求被政策拒絕，而是系統在指定範圍內尚未找到符合條件的司機。乘客可以重試或選擇其他備援方式。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">與政策拒絕或不支援不同</span>
        <h3>這是車輛供給問題，不是資格或政策問題</h3>
        <dl className="kv-grid">
          {supplyContext.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>立即重試</strong>
          <p>乘客可以立即重新嘗試。車輛供給會隨時間變化，稍後可能成功媒合。</p>
          <Link className="text-link" href="/book">
            重新送出相同需求
          </Link>
        </article>
        <article className="callout-card">
          <strong>改約稍後</strong>
          <p>若方案允許，乘客可改成稍後預約。實際預約類型會由預約流程處理。</p>
        </article>
        <article className="callout-card warning">
          <strong>不假裝已媒合</strong>
          <p>
            頁面不會宣稱不存在的媒合，也不會讓乘客停在沒有期限的「持續搜尋中」狀態。
          </p>
        </article>
      </section>
    </div>
  );
}
