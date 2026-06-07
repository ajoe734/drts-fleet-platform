import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { getDeskById } from "@/lib/desk-catalog";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DegradedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const desk = getDeskById(getQueryValue((await searchParams).desk));

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">服務降級</span>
        <h1>櫃台仍可查看，但暫停建立新代訂。</h1>
        <p>
          當櫃台服務降級時，系統不會假裝一切正常。恢復前會保留唯讀查詢與升級處理說明。
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">櫃台健康狀態</span>
          <h2>{desk ? desk.deskName : "降級櫃台"}</h2>
          <p>
            {desk
              ? `${desk.siteName} 目前標記為降級。`
              : "所選櫃台目前降級或無法建立新訂單。"}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/lookup">
              繼續唯讀查詢
            </Link>
            <Link className="secondary-link" href="/callbacks">
              繼續處理回覆
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">升級處理</span>
          <h2>營運後台仍是上游權責方。</h2>
          <p>
            當櫃台降級時，客服代訂入口只保留查詢與回覆處理。更完整的修復與派遣控制需回到營運客服或派遣工作區。
          </p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              開啟營運客服中心
            </a>
            <Link className="secondary-link" href="/start">
              選擇其他櫃台
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
