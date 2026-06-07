import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { tripFlowRoutes } from "@/lib/navigation";

const tripSnapshot = {
  tripId: "trp_8FQ12X",
  status: "已媒合司機",
  eta: "約 8 分鐘",
  vehicle: "白色 Toyota Camry，車牌 7VBN384",
  driverName: "司機 M.，僅顯示名字",
  cancelWindow: "抵達上車地點前可取消",
  authority: "乘客直訂行程",
};

const lifecycle = [
  {
    phase: "已送出需求",
    state: "complete",
    stateLabel: "已完成",
    body: "乘客已送出叫車需求。",
  },
  {
    phase: "已媒合",
    state: "current",
    stateLabel: "目前階段",
    body: "司機已接受行程，預估抵達時間會持續更新。",
  },
  {
    phase: "前往上車地點",
    state: "upcoming",
    stateLabel: "待進行",
    body: "司機正在前往乘客上車地點。",
  },
  {
    phase: "已上車",
    state: "upcoming",
    stateLabel: "待進行",
    body: "乘客上車後，行程正式開始。",
  },
  {
    phase: "抵達下車地點",
    state: "upcoming",
    stateLabel: "待進行",
    body: "行程於下車地點結束，收據將可查詢。",
  },
];

const subRoutes = tripFlowRoutes.filter((route) => route.href !== "/trip");

export default function TripStatusPage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">進行中行程狀態</span>
        <h1>查看司機、車輛、預估抵達與可用操作。</h1>
        <p>
          此頁提供乘客在行程進行中需要的資訊。只有在乘客仍有操作權限時，才會顯示取消等變更操作。
        </p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">行程 {tripSnapshot.tripId}</span>
        <h3>{tripSnapshot.status}</h3>
        <dl className="kv-grid">
          <div className="kv-row">
            <dt>預估抵達</dt>
            <dd>
              <strong>{tripSnapshot.eta}</strong>
              <span>一律以預估呈現，不作為保證時間。</span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>車輛</dt>
            <dd>
              <strong>{tripSnapshot.vehicle}</strong>
              <span>顯示車牌與車型，協助乘客辨識車輛。</span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>司機</dt>
            <dd>
              <strong>{tripSnapshot.driverName}</strong>
              <span>僅顯示必要資訊；通話或轉接聯絡由其他流程處理。</span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>操作權限</dt>
            <dd>
              <strong>{tripSnapshot.authority}</strong>
              <span>因為此行程由乘客直訂，仍可在規則允許時操作。</span>
            </dd>
          </div>
          <div className="kv-row">
            <dt>取消期限</dt>
            <dd>
              <strong>{tripSnapshot.cancelWindow}</strong>
              <span>取消規則由後端判定，前端只呈現目前可用狀態。</span>
            </dd>
          </div>
        </dl>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip/cancel">
            取消此行程
          </Link>
          <Link className="secondary-link" href="/trip/completed">
            查看完成頁
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">行程進度</span>
        <h3>各階段狀態</h3>
        <ul className="check-list">
          {lifecycle.map((phase) => (
            <li className={`check-item check-${phase.state}`} key={phase.phase}>
              <strong>{phase.phase}</strong>
              <span className="check-state">{phase.stateLabel}</span>
              <p>{phase.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">行程狀態頁</span>
          <h2>每個結果都有自己的說明頁</h2>
          <p>
            取消、完成、唯讀權限、事後取消與重新驗證都拆成獨立頁面，讓狀態與責任清楚可查。
          </p>
        </header>
        <FlowRouteCards routes={subRoutes} />
      </section>
    </div>
  );
}
