import Link from "next/link";
import { formatDeskMode, getDeskById } from "@/lib/desk-catalog";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const deskId = getQueryValue(query.desk);
  const mode = getQueryValue(query.mode);
  const desk = getDeskById(deskId);

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">拒絕</span>
        <h1>目前角色沒有操作此櫃台的權限。</h1>
        <p>系統會清楚顯示角色與櫃台不符，而不是默默放寬權限或讓操作繼續。</p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">原因</span>
        <h2>{desk ? desk.deskName : "櫃台角色不符"}</h2>
        <p>
          {desk && mode
            ? `${formatDeskMode(mode as "concierge_operator" | "call_point_operator")}不可操作 ${desk.deskName}。`
            : "建立代訂前發現角色與櫃台不符。"}
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            選擇其他櫃台
          </Link>
          <Link className="secondary-link" href="/login">
            重新建立操作人員身分
          </Link>
        </div>
      </section>
    </div>
  );
}
