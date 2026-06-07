import Link from "next/link";

const ownership = [
  {
    label: "來源渠道",
    value: "租戶代訂",
    note: "此行程由租戶代乘客建立，因此變更權限保留在租戶端。",
  },
  {
    label: "乘客可見資訊",
    value: "狀態、預估抵達、車輛、行程進度",
    note: "乘客仍可追蹤行程，但不擁有變更權限。",
  },
  {
    label: "乘客不可操作",
    value: "取消、改期、費用調整",
    note: "所有變更操作都保留在來源渠道，不會在乘客端顯示。",
  },
];

const ownershipMatrix = [
  {
    source: "乘客直訂",
    mutate: "乘客",
    view: "乘客可查看與操作",
    note: "標準進行中行程，取消權限由乘客持有。",
  },
  {
    source: "租戶代訂",
    mutate: "租戶後台",
    view: "乘客唯讀",
    note: "乘客可看狀態，取消與調整由租戶處理。",
  },
  {
    source: "合作夥伴代訂",
    mutate: "合作夥伴渠道",
    view: "乘客唯讀",
    note: "變更由合作夥伴入口處理，乘客端只顯示狀態。",
  },
  {
    source: "客服代訂",
    mutate: "客服櫃台",
    view: "乘客唯讀",
    note: "變更權限由客服端持有。",
  },
];

export default function TripReadOnlyPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">僅可查看</span>
        <h1>此行程對乘客為唯讀狀態。</h1>
        <p>
          此預約由其他渠道建立。乘客可以追蹤行程，但不能在此頁取消、改期或調整費用；變更權限由來源渠道持有。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">權限摘要</span>
        <h3>可見資訊與可操作項目</h3>
        <dl className="kv-grid">
          {ownership.map((row) => (
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

      <section className="surface-card">
        <span className="surface-kicker">跨渠道權限</span>
        <h3>不同來源渠道的變更權限</h3>
        <table className="matrix-table">
          <thead>
            <tr>
              <th>來源渠道</th>
              <th>變更權限</th>
              <th>乘客可見性</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>
            {ownershipMatrix.map((row) => (
              <tr key={row.source}>
                <td>
                  <strong>{row.source}</strong>
                </td>
                <td>{row.mutate}</td>
                <td>{row.view}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>不顯示假的操作按鈕</strong>
          <p>
            取消、改期與費用調整不會以停用按鈕形式出現。乘客不能操作的按鈕若顯示出來，反而會造成誤解。
          </p>
        </article>
        <article className="callout-card">
          <strong>乘客如何處理此行程</strong>
          <p>
            若要變更此行程，乘客需回到租戶、合作夥伴或客服等來源渠道。客服協助仍會保持可用。
          </p>
          <Link className="text-link" href="/unsupported">
            查看來源渠道處理說明
          </Link>
        </article>
      </section>
    </div>
  );
}
