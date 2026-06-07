import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { bookingFlowRoutes, tripFlowRoutes } from "@/lib/navigation";

const activeTrip = {
  rideLabel: "機場返回市中心",
  eta: "8 分鐘",
  status: "已媒合司機",
  supportWindow: "司機抵達上車地點前仍可取消",
};

const statusLanes = [
  {
    title: "目前行程狀態",
    body: "乘客首頁優先呈現預約與行程狀態，而不是一般行銷頁。抵達時間一律以預估呈現，不承諾精準分鐘。",
  },
  {
    title: "行程紀錄與收據",
    body: "過往行程與收據歸屬可在同一入口查詢，乘客不需要切換到其他產品頁。",
  },
  {
    title: "例外情境清楚可見",
    body: "預約遭拒、資格不符、暫無車輛、服務降級、取消與重新驗證都有獨立頁面，不只是一閃而過的提示。",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">預約狀態首頁</span>
        <h1>乘客入口從行程狀態、預估抵達時間與下一步操作開始。</h1>
        <p>
          乘客可在這裡查看預約需求、進行中行程、完成或取消結果，以及各種需要處理的例外狀態。
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/book">
            叫車預約
          </Link>
          <Link className="secondary-link" href="/trip">
            查看進行中行程
          </Link>
          <Link className="text-link" href="/trips">
            行程紀錄
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">進行中行程</span>
          <strong>{activeTrip.status}</strong>
          <p>{activeTrip.rideLabel}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">預估抵達</span>
          <strong>{activeTrip.eta}</strong>
          <p>以預估抵達時間呈現，不作為保證時間。</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">下一步</span>
          <strong>查看行程進度</strong>
          <p>{activeTrip.supportWindow}</p>
        </article>
      </section>

      <section className="content-grid">
        {statusLanes.map((lane) => (
          <article className="surface-card" key={lane.title}>
            <span className="surface-kicker">服務入口</span>
            <h3>{lane.title}</h3>
            <p>{lane.body}</p>
          </article>
        ))}
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">預約流程</span>
          <h2>每一種預約結果都有對應頁面</h2>
          <p>
            從送出需求、政策拒絕、資格不符、暫無車輛到服務降級，都可以直接開啟查看。
          </p>
        </header>
        <FlowRouteCards routes={bookingFlowRoutes} />
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">行程流程</span>
          <h2>每一種行程狀態都有對應頁面</h2>
          <p>
            進行中、取消、完成、唯讀權限、已取消與重新驗證都以獨立頁面呈現。
          </p>
        </header>
        <FlowRouteCards routes={tripFlowRoutes} />
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>沒有行程時的處理</strong>
          <p>
            若目前沒有進行中行程，系統會提供行程紀錄、收據查詢與客服安全入口，而不是顯示空白頁。
          </p>
        </article>
        <article className="callout-card warning">
          <strong>即時操作仍依後端狀態</strong>
          <p>
            預約建立、取消與狀態更新會依實際後端回應呈現，頁面不會假裝操作已成功。
          </p>
        </article>
      </section>
    </div>
  );
}
