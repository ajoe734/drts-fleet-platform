import Link from "next/link";

const eligibilityGates = [
  {
    name: "身分驗證",
    state: "已通過",
    className: "verified",
    body: "乘客身分已完成驗證，這個檢查目前通過。",
  },
  {
    name: "付款方式",
    state: "尚未設定",
    className: "missing",
    body: "目前沒有可使用的付款方式。若此行程需付款，乘客必須先新增付款工具。",
  },
  {
    name: "方案資格",
    state: "未加入方案",
    className: "not-enrolled",
    body: "此票價或補助方案需要事先加入，乘客資料目前不符合此方案要求。",
  },
];

export default function BookingIneligiblePage() {
  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          資格檢查未通過
        </span>
        <h1>乘客目前不符合此預約資格。</h1>
        <p>
          系統會在派遣前檢查資格。此頁會說明哪個關卡未通過，但不會洩漏個資或其他乘客資料。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">資格檢查清單</span>
        <h3>各項檢查結果</h3>
        <ul className="check-list">
          {eligibilityGates.map((gate) => (
            <li
              key={gate.name}
              className={`check-item check-${gate.className}`}
            >
              <strong>{gate.name}</strong>
              <span className="check-state">{gate.state}</span>
              <p>{gate.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>新增付款方式</strong>
          <p>
            最常見的資格問題是缺少可用付款方式。乘客可先回到個人資料流程新增付款工具。
          </p>
        </article>
        <article className="callout-card">
          <strong>方案加入狀態</strong>
          <p>
            補助、復康或合作方案不會自動加入。若資格不足，乘客會被導向方案負責單位確認。
          </p>
          <Link className="text-link" href="/unsupported">
            查看不支援情境
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>不會偷偷降級</strong>
          <p>
            系統不會默默把乘客改到其他票價方案或服務等級。任何備援都必須清楚告知。
          </p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          重新驗證身分
        </Link>
        <Link className="secondary-link" href="/book">
          回到預約入口
        </Link>
      </section>
    </div>
  );
}
