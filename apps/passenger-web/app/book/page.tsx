import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { bookingFlowRoutes } from "@/lib/navigation";

const requestSummary = [
  {
    label: "上車地點",
    value: "舊金山市 Market St 1 號",
    note: "可使用乘客已儲存地點，或由乘客重新輸入。",
  },
  {
    label: "下車地點",
    value: "舊金山機場第 2 航廈",
    note: "下車地點可選擇常用地點，也可輸入自由格式地址。",
  },
  {
    label: "預約時段",
    value: "約 10 分鐘後上車",
    note: "抵達時間會以範圍或預估呈現，不保證精準分鐘。",
  },
  {
    label: "服務類型",
    value: "一般直達服務",
    note: "合作夥伴、租戶與客服代訂各有自己的入口；此頁只處理乘客直訂。",
  },
];

const negativeRoutes = bookingFlowRoutes.filter(
  (route) => route.kind === "negative",
);

export default function BookingRequestPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">叫車預約</span>
        <h1>送出乘車需求前，先確認地點、時段與可用性。</h1>
        <p>
          此頁以先估價、再確認的方式呈現乘客預約流程，並明確說明抵達時間只是預估。任何可預期的失敗情境都會導向具體說明頁。
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip">
            前往進行中行程
          </Link>
          <Link className="secondary-link" href="/auth">
            先驗證乘客身分
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">預約內容預覽</span>
        <h3>送出前確認上車、下車與時間</h3>
        <dl className="kv-grid">
          {requestSummary.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="surface-footnote">
          若即時預約服務暫時不可用，系統會顯示明確備援狀態，而不是讓乘客誤以為已成功預約。
        </p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>只處理乘客直訂</strong>
          <p>
            此入口只負責乘客直接送出的需求。租戶、合作夥伴或客服代訂的行程會保留在原來源渠道處理。
          </p>
        </article>
        <article className="callout-card warning">
          <strong>抵達時間是預估</strong>
          <p>
            頁面不會保證特定上車分鐘數。估價與預估抵達時間都會清楚標示為估計值。
          </p>
        </article>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">可能無法預約</span>
          <h2>每一種失敗情境都有清楚說明</h2>
          <p>
            乘客不會只看到「發生錯誤」。每個情境都會說明原因類型與安全的下一步。
          </p>
        </header>
        <FlowRouteCards routes={negativeRoutes} emphasizeKind="negative" />
      </section>
    </div>
  );
}
