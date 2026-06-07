import Link from "next/link";

const receiptStates = [
  {
    title: "平台開立收據",
    status: "可支援",
    body: "乘客直訂行程可在此查看平台管理的收據與追蹤資訊。",
    href: "/trip/completed",
    cta: "查看完成行程收據",
  },
  {
    title: "外部收據參考",
    status: "可支援，但需交回來源渠道",
    body: "若帳務由來源渠道負責，乘客會看到收據歸屬與後續處理位置，而不是假的下載按鈕。",
    href: "/trip/read-only",
    cta: "查看唯讀行程歸屬",
  },
  {
    title: "收據暫不可用或不支援",
    status: "明確說明",
    body: "電話協助、合作夥伴或其他不支援情境會顯示具體原因與客服方向。",
    href: "/unsupported",
    cta: "查看不支援情境",
  },
];

export default function ReceiptCenterPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">收據中心</span>
        <h1>依行程結果與來源渠道顯示正確收據狀態。</h1>
        <p>
          收據中心會把平台開立、外部來源與不支援情境分開呈現。收據歸屬以來源渠道為準，此頁只同步顯示。
        </p>
      </section>

      <section className="content-grid">
        {receiptStates.map((state) => (
          <article className="surface-card" key={state.title}>
            <span className="surface-kicker">{state.status}</span>
            <h3>{state.title}</h3>
            <p>{state.body}</p>
            <Link className="text-link" href={state.href}>
              {state.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>不宣稱不存在的寄送渠道</strong>
          <p>
            頁面不會自行宣稱電子郵件或簡訊收據寄送。可用性與歸屬必須與上游結算和來源渠道一致。
          </p>
        </article>
      </section>
    </div>
  );
}
