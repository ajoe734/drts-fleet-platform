import Link from "next/link";

const completionSummary = [
  {
    label: "行程編號",
    value: "trp_8FQ12X",
    note: "此行程在紀錄、收據與客服查詢中使用的固定識別碼。",
  },
  {
    label: "行程時間",
    value: "23 分鐘",
    note: "以實際行程時間計算，不是預估報價時間。",
  },
  {
    label: "行程距離",
    value: "8.4 英里",
    note: "依行程軌跡回報的路線距離。",
  },
  {
    label: "總費用",
    value: "$24.10",
    note: "以後端結算紀錄為準，前端只同步顯示。",
  },
  {
    label: "收據狀態",
    value: "平台開立",
    note: "收據由平台管理，可在收據中心查看。",
  },
];

export default function TripCompletedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow state-pill state-pill-positive">已完成</span>
        <h1>行程已正常完成。</h1>
        <p>
          行程已在下車地點結束。此頁彙整行程摘要、收據入口與回到行程紀錄的後續路徑。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">行程摘要</span>
        <h3>完成後資訊</h3>
        <dl className="kv-grid">
          {completionSummary.map((row) => (
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
          <strong>查看收據</strong>
          <p>平台開立的收據可從收據中心開啟，並保留來源渠道的歸屬規則。</p>
          <Link className="text-link" href="/receipts">
            前往收據中心
          </Link>
        </article>
        <article className="callout-card">
          <strong>回到行程紀錄</strong>
          <p>行程紀錄會列出完成與過往行程，並呈現正確的收據歸屬狀態。</p>
          <Link className="text-link" href="/trips">
            查看行程紀錄
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>其他後續服務</strong>
          <p>小費、申訴與評分會由各自流程處理，不會混在完成頁中讓權責不清。</p>
        </article>
      </section>
    </div>
  );
}
