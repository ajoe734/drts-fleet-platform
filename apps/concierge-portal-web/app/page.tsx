"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function HomePage() {
  const { ready, session } = useConciergePortal();
  const desk = useSelectedDesk();

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">電話站點與客服代訂</span>
        <h1>固定站點的代訂流程集中在此入口處理。</h1>
        <p>
          此入口提供登入、固定站點選擇、代訂建立、訂單查詢、回覆追蹤，以及拒絕、資格不符、服務降級與錄音不可用等明確例外頁。
        </p>
        <div className="hero-actions">
          <Link
            className="primary-link"
            href={session ? "/bookings/new" : "/login"}
          >
            {session ? "開啟代訂表單" : "開始本機登入"}
          </Link>
          <Link className="secondary-link" href="/lookup">
            查看訂單查詢
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="section-kicker">工作階段</span>
          <strong>{ready && session ? "已就緒" : "待建立"}</strong>
          <p>
            {session
              ? `${session.operatorName} 以${formatDeskMode(session.mode)}身分登入。`
              : "尚未建立本機客服代訂工作階段。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">櫃台</span>
          <strong>{desk ? desk.deskName : "尚未選擇"}</strong>
          <p>
            {desk
              ? `${desk.siteName} · ${desk.zoneLabel}`
              : "建立代訂前必須先選擇固定站點。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">近期活動</span>
          <strong>{session?.recentOrderIds.length ?? 0} 筆訂單</strong>
          <p>
            {session
              ? `${session.recentCallIds.length} 筆櫃台通話，${session.recentCallbackTaskIds.length} 筆回覆任務。`
              : "建立工作階段後才會顯示近期訂單、通話與回覆任務。"}
          </p>
        </article>
      </section>

      <section className="grid-columns">
        <article className="panel-card">
          <span className="section-kicker">下一步</span>
          <h2>
            {session
              ? desk
                ? "可建立代訂、查詢訂單或追蹤回覆。"
                : "請先選擇固定站點。"
              : "請先建立站點操作人員身分。"}
          </h2>
          <p>
            此入口只開放外部櫃台需要的狹窄流程：可使用客服與訂單
            API，但不開放完整營運導覽或申訴案件管理。
          </p>
          <div className="inline-actions">
            {!session ? (
              <Link className="primary-link" href="/login">
                本機登入
              </Link>
            ) : !desk ? (
              <Link className="primary-link" href="/start">
                選擇固定站點
              </Link>
            ) : (
              <>
                <Link className="primary-link" href="/bookings/new">
                  建立代訂
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  開啟回覆任務
                </Link>
              </>
            )}
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">營運交接</span>
          <h2>營運客服中心仍是升級處理權責方。</h2>
          <p>
            錄音回補、申訴轉交與更完整的派遣控制仍由營運後台處理，櫃台入口只提供必要交接。
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
            <Link className="secondary-link" href="/recording-unavailable">
              查看錄音限制
            </Link>
          </div>
        </article>
      </section>

      <section className="grid-columns">
        <article className="info-card">
          <span className="section-kicker">正常流程</span>
          <h3>登入、選擇站點、建立代訂、查詢訂單</h3>
          <p>
            正常流程會先建立本機登入，再選擇固定櫃台、開啟櫃台通話，並送出含預估抵達時間與軌跡回讀的代訂需求。
          </p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/start">
              查看櫃台清單
            </Link>
          </div>
        </article>

        <article className="info-card tone-warning">
          <span className="section-kicker">例外狀態</span>
          <h3>拒絕、資格不符、降級與錄音限制都會清楚顯示。</h3>
          <p>
            此入口不會把失敗情境藏在空白表單裡。每個保護規則都有自己的頁面，方便操作人員理解下一步。
          </p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/denied">
              拒絕
            </Link>
            <Link className="secondary-link" href="/ineligible">
              資格不符
            </Link>
            <Link className="secondary-link" href="/degraded">
              服務降級
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
