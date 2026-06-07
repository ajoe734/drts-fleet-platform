import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

const ELIGIBILITY_REQUIRED: Record<string, boolean> = {
  none: false,
  bank_card_inline: true,
  reference_required: true,
};

export default async function PartnerStartPage() {
  const session = await requirePartnerSession();
  const eligibilityRequired =
    ELIGIBILITY_REQUIRED[session.partnerEntry.eligibilityMode] ?? true;
  const subtype = session.partnerEntry.businessDispatchSubtype;
  const status = session.partnerEntry.status;
  const isActive = status === "active";
  const bindingSummary = session.partnerEntry.programCode
    ? "已綁定合作方案"
    : "由平台管理端維護";
  const bankSummary = session.partnerEntry.bankCode
    ? "已綁定合作銀行識別"
    : "未提供";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="合作夥伴工作區"
        title={`${session.partnerEntry.displayName} 已完成登入。`}
        description="合作夥伴模式只開放資格驗證與入口專用訂單建立，不提供租戶管理後台的治理功能。"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="入口"
          title="入口註冊快照"
          description="這是平台管理端簽發的入口摘要。合作夥伴模式只能讀取，不能直接修改。"
        >
          <dl className="definition-grid">
            <div>
              <dt>顯示名稱</dt>
              <dd>{session.partnerEntry.displayName}</dd>
            </div>
            <div>
              <dt>入口識別</dt>
              <dd>目前工作區已綁定這個合作夥伴入口。</dd>
            </div>
            <div>
              <dt>合作夥伴來源</dt>
              <dd>由平台管理端維護合作夥伴識別。</dd>
            </div>
            <div>
              <dt>合作方案</dt>
              <dd>{bindingSummary}</dd>
            </div>
            <div>
              <dt>合作銀行</dt>
              <dd>{bankSummary}</dd>
            </div>
            <div>
              <dt>服務子類型</dt>
              <dd>{formatTenantCodeLabel(subtype, subtype)}</dd>
            </div>
            <div>
              <dt>驗證模式</dt>
              <dd>
                {formatTenantCodeLabel(
                  session.partnerEntry.authMode,
                  session.partnerEntry.authMode,
                )}
              </dd>
            </div>
            <div>
              <dt>狀態</dt>
              <dd>
                <span
                  className={`status-badge${isActive ? "" : " is-warning"}`}
                >
                  {formatTenantCodeLabel(status, status)}
                </span>
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="資格驗證"
          title={
            eligibilityRequired ? "需要先完成資格驗證" : "此入口不需要資格驗證"
          }
          description={
            eligibilityRequired
              ? "請先完成資格驗證；只有驗證結果為符合資格時，才會開放合作夥伴建立訂單。"
              : "這個入口設定為不需資格驗證，因此可直接建立訂單。"
          }
        >
          <p>
            資格驗證模式：{" "}
            {formatTenantCodeLabel(
              session.partnerEntry.eligibilityMode,
              session.partnerEntry.eligibilityMode,
            )}
          </p>
          <div className="link-row">
            <Link className="text-link" href="/partner/eligibility">
              開啟資格驗證
            </Link>
            {!eligibilityRequired ? (
              <Link className="text-link" href="/partner/booking/new">
                直接前往建立訂單
              </Link>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="訂單"
          title="合作夥伴入口訂單建立"
          description="從這個頁面建立的訂單都會自動帶入入口別名，以及通過驗證時的資格驗證編號，讓後續稽核與帳務都能保留合作夥伴來源。"
        >
          <ul className="panel-list">
            <li>服務子類型由入口資料固定，不可自行變更。</li>
            <li>報價與車資權責仍由後端掌控，合作夥伴模式不能自行設定費用。</li>
            <li>
              只要遇到拒絕、不符合資格或人工審查等負向路徑，系統都會直接中止，不會繞道建立訂單。
            </li>
          </ul>
          <div className="link-row">
            <Link className="text-link" href="/partner/booking/new">
              開啟建立訂單
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="邊界"
          title="合作夥伴模式不提供的功能"
          description="這些頁面不會出現在合作夥伴模式導覽中；雖然路由本身不一定完全封鎖，但工作區會明確劃清邊界。"
        >
          <ul className="panel-list">
            <li>不提供租戶使用者與角色指派。</li>
            <li>不提供 API 金鑰、回呼、稽核軌跡與租戶設定。</li>
            <li>不提供租戶帳務與整合治理。</li>
            <li>不提供履約覆寫或派遣控制權。</li>
          </ul>
        </SurfaceCard>
      </section>

      {!isActive ? (
        <CalloutPanel
          title="入口狀態異常"
          description={`目前入口狀態為「${formatTenantCodeLabel(status, status)}」。在平台管理端重新啟用前，建立訂單都會失敗。`}
          tone="warning"
        />
      ) : null}
    </div>
  );
}
