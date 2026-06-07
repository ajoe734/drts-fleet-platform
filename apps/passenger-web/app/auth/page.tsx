import Link from "next/link";

const entryOptions = [
  {
    title: "連結或驗證碼登入",
    body: "乘客可透過安全連結或驗證碼進入直訂服務。",
  },
  {
    title: "行程查詢與保護備援",
    body: "可用預約代碼或聯絡資訊驗證行程，同時避免暴露租戶或營運後台資訊。",
  },
  {
    title: "客服協助",
    body: "若乘客無法完成驗證，系統會導向明確的未驗證處理，而不是提供不完整存取。",
  },
];

export default function AuthEntryPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">身分驗證</span>
        <h1>乘客需先完成驗證才能查看受保護資訊。</h1>
        <p>
          此入口處理登入、驗證碼與行程查詢。完成驗證後，乘客才能查看行程、車輛與收據等敏感資訊。
        </p>
      </section>

      <section className="content-grid">
        {entryOptions.map((option) => (
          <article className="surface-card" key={option.title}>
            <span className="surface-kicker">進入方式</span>
            <h3>{option.title}</h3>
            <p>{option.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>尚未驗證狀態</strong>
          <p>
            尚未完成驗證的乘客會進入專用備援頁，不會看到過期或不該顯示的行程資料。
          </p>
          <Link className="text-link" href="/unauthenticated">
            查看未驗證處理方式
          </Link>
        </article>
      </section>
    </div>
  );
}
