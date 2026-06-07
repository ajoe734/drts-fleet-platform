import Link from "next/link";

const policyDetails = [
  {
    label: "取消期限",
    value: "上車前仍可取消",
    note: "司機抵達上車地點前，乘客仍保有取消權限。",
  },
  {
    label: "取消費用",
    value: "目前為 0 元",
    note: "費用政策由後端判定，前端只呈現目前報價，不自行產生其他金額。",
  },
  {
    label: "退款狀態",
    value: "解除預授權",
    note: "若有付款預授權，會解除保留；期限內取消不會產生已結算扣款。",
  },
];

const reasonOptions = [
  { id: "changed_plans", label: "行程計畫改變" },
  { id: "wait_too_long", label: "等待時間太久" },
  { id: "wrong_pickup", label: "上車地點有誤" },
  { id: "other", label: "其他原因，可選填文字" },
];

export default function TripCancelPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">準備取消</span>
        <h1>在規則允許時取消進行中行程。</h1>
        <p>
          此頁只會在乘客仍具取消權限時開放。頁面會呈現後端判定的取消期限與費用，讓乘客與客服看到一致資訊。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">取消規則</span>
        <h3>目前取消會產生的結果</h3>
        <dl className="kv-grid">
          {policyDetails.map((row) => (
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
        <span className="surface-kicker">取消原因，可選填</span>
        <h3>為什麼要取消？</h3>
        <ul className="check-list">
          {reasonOptions.map((reason) => (
            <li className="check-item check-available" key={reason.id}>
              <strong>{reason.label}</strong>
              <span className="check-state">可選擇</span>
              <p>可補充文字說明，但不是取消的必要條件。</p>
            </li>
          ))}
        </ul>
        <p className="surface-footnote">
          取消原因會提供給營運端調整供給品質；只要仍在取消期限內，未填原因也不會阻擋取消。
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>取消後</strong>
          <p>乘客會前往已取消行程頁，並清楚看到取消方是乘客、司機或平台。</p>
          <Link className="text-link" href="/trip/cancelled">
            查看已取消行程
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>超過取消期限</strong>
          <p>
            一旦取消期限結束，此頁會停止提供取消操作，並導向唯讀或完成狀態。
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip/cancelled">
          確認取消
        </Link>
        <Link className="secondary-link" href="/trip">
          保留行程
        </Link>
      </section>
    </div>
  );
}
