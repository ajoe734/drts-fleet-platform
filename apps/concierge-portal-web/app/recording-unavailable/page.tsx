"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function RecordingUnavailablePage() {
  const { session } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">錄音不可用</span>
        <h1>錄音回補仍需由營運端處理。</h1>
        <p>
          此入口可開啟通話、建立訂單、回報預估抵達與管理回覆，但不會假裝擁有錄音系統的綁定權限。
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">目前櫃台狀態</span>
          <h2>{desk ? desk.deskName : "尚未選擇櫃台"}</h2>
          <p>
            {session?.activeCallId
              ? `進行中通話：${session.activeCallId}`
              : "目前本機狀態中沒有開啟中的櫃台通話。"}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/callbacks">
              前往回覆追蹤
            </Link>
            <Link className="secondary-link" href="/lookup">
              查看訂單查詢
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">營運交接</span>
          <h2>錄音綁定由營運客服中心負責。</h2>
          <p>
            後端目前支援錄音回補，但客服代訂入口不會把原始錄音證據管理當成櫃台主要操作。
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
          </div>
        </article>
      </section>
    </div>
  );
}
