import Link from "next/link";

const denialReasons = [
  {
    label: "安全狀態需客服確認",
    body: "乘客帳戶目前有安全限制。限制解除前，系統會暫停接受新的預約。",
  },
  {
    label: "近期活動正在審查",
    body: "近期使用紀錄需要進一步確認。乘客會看到中性的說明與客服協助入口。",
  },
  {
    label: "下車地點暫不支援",
    body: "下車地點位於目前不開放一般乘客預約的區域，因此無法完成此需求。",
  },
];

export default function BookingDeniedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          政策未通過
        </span>
        <h1>此預約需求無法送出。</h1>
        <p>
          系統因政策或安全原因暫停此需求。頁面只顯示可對乘客說明的原因類型與安全下一步，不顯示內部判斷細節。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">原因類型</span>
        <h3>帳戶狀態需客服確認</h3>
        <p>
          對乘客顯示的訊息：目前無法完成此預約，請先聯絡客服確認帳戶狀態後再嘗試。
        </p>
        <p className="surface-footnote">
          內部原因代碼只供客服查詢與稽核使用，不會直接顯示給乘客。
        </p>
      </section>

      <section className="content-grid">
        {denialReasons.map((reason) => (
          <article className="surface-card" key={reason.label}>
            <span className="surface-kicker">{reason.label}</span>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>可以怎麼做</strong>
          <p>乘客可聯絡客服、待限制解除後重試，或查看不支援情境說明。</p>
          <Link className="text-link" href="/unsupported">
            查看不支援情境
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>頁面不會做的事</strong>
          <p>
            系統不會自動重試、不會偷偷改成其他服務類型，也不會用責備乘客的語氣說明。
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          重新驗證乘客身分
        </Link>
        <Link className="secondary-link" href="/book">
          回到預約入口
        </Link>
      </section>
    </div>
  );
}
