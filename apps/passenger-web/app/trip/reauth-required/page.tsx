import Link from "next/link";

const reauthCauses = [
  {
    label: "工作階段過期",
    body: "乘客的登入狀態在行程期間失效。重新驗證前，行程資料會保持隱藏。",
  },
  {
    label: "登入狀態已撤銷",
    body: "登入狀態可能由其他裝置或客服撤銷，因此需要重新驗證。",
  },
  {
    label: "行程脈絡不一致",
    body: "乘客資料已變更，系統無法直接還原行程脈絡。完成驗證後即可重新確認。",
  },
];

export default function TripReauthRequiredPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          工作階段已失效
        </span>
        <h1>需要重新驗證才能繼續。</h1>
        <p>
          系統目前無法確認乘客身分，因此暫時隱藏行程資料。頁面不會顯示過期資訊，也不會降級為匿名模式。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">發生原因</span>
        <h3>重新驗證由明確訊號觸發</h3>
        <ul className="check-list">
          {reauthCauses.map((cause) => (
            <li className="check-item check-blocked" key={cause.label}>
              <strong>{cause.label}</strong>
              <span className="check-state">需驗證</span>
              <p>{cause.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>重新驗證身分</strong>
          <p>
            實際驗證流程由身分驗證入口處理。驗證完成後，乘客會回到進行中行程頁。
          </p>
          <Link className="text-link" href="/auth">
            前往身分驗證
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>暫時隱藏的資訊</strong>
          <p>
            重新驗證前，行程狀態、預估抵達、車輛與司機資訊都會保持隱藏，並套用未驗證保護規則。
          </p>
          <Link className="text-link" href="/unauthenticated">
            查看未驗證處理方式
          </Link>
        </article>
      </section>
    </div>
  );
}
