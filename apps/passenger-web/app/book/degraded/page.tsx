import Link from "next/link";

const degradedAffordances = [
  {
    state: "available",
    stateLabel: "可使用",
    name: "查看既有行程狀態",
    body: "查詢功能仍可使用。乘客可以確認是否有進行中行程，並查看最後更新的狀態快照。",
  },
  {
    state: "blocked",
    stateLabel: "暫停",
    name: "送出新的預約需求",
    body: "平台降級期間會暫停變更操作。送出按鈕會被隱藏，而不是假裝可以送出。",
  },
  {
    state: "blocked",
    stateLabel: "暫停",
    name: "取消進行中行程",
    body: "降級期間取消操作也會暫停，由營運或客服協助處理，避免多方同時改寫狀態。",
  },
  {
    state: "available",
    stateLabel: "可使用",
    name: "聯絡客服",
    body: "客服協助始終可用，並會提供清楚的事件參考供乘客說明。",
  },
];

export default function BookingDegradedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">唯讀備援</span>
        <h1>預約服務目前處於降級模式。</h1>
        <p>
          系統偵測到預約後端服務異常。頁面會清楚說明哪些功能可用、哪些操作暫停，而不是在送出時才無聲失敗。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">功能可用性</span>
        <h3>哪些功能可用、哪些暫停，以及原因</h3>
        <ul className="check-list">
          {degradedAffordances.map((row) => (
            <li className={`check-item check-${row.state}`} key={row.name}>
              <strong>{row.name}</strong>
              <span className="check-state">{row.stateLabel}</span>
              <p>{row.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>狀態來源</strong>
          <p>
            降級模式由上游健康狀態決定，不是前端自行猜測。乘客與客服看到的說法會保持一致。
          </p>
        </article>
        <article className="callout-card warning">
          <strong>不偷偷重試</strong>
          <p>
            頁面不會在背景偷偷重試已暫停的操作。任何重試都必須由乘客明確觸發，並依恢復狀態判斷。
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip">
          查看進行中行程狀態
        </Link>
        <Link className="secondary-link" href="/unsupported">
          查看不支援情境
        </Link>
      </section>
    </div>
  );
}
