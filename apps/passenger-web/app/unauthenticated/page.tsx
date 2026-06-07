import Link from "next/link";

export default function UnauthenticatedPage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">尚未驗證</span>
        <h1>完成驗證前，行程詳細資訊會保持鎖定。</h1>
        <p>
          若乘客沒有有效登入狀態、驗證碼或行程驗證脈絡，系統會顯示此安全處理頁。
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>可以怎麼做</strong>
          <p>乘客可回到身分驗證入口、輸入預約代碼，或透過客服渠道取得協助。</p>
          <Link className="text-link" href="/auth">
            回到身分驗證
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>此頁不會做的事</strong>
          <p>
            系統不會向未驗證乘客洩漏租戶後台預約資料、營運工具資訊或部分收據內容。
          </p>
        </article>
      </section>
    </div>
  );
}
