import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
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

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="合作夥伴工作區"
        title={`${session.partnerEntry.displayName} is signed in.`}
        description="合作夥伴模式僅開放資格驗證與合作夥伴標記訂單建立。租戶管理治理刻意不出現在此介面。"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Entry"
          title="Entry registration snapshot"
          description="後端核發的 entry 紀錄。合作夥伴模式只讀取，不會編輯。"
        >
          <dl className="definition-grid">
            <div>
              <dt>顯示名稱</dt>
              <dd>{session.partnerEntry.displayName}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>
                <code>{session.partnerEntry.entrySlug}</code>
              </dd>
            </div>
            <div>
              <dt>合作夥伴代碼</dt>
              <dd>
                <code>{session.partnerEntry.partnerCode}</code>
              </dd>
            </div>
            <div>
              <dt>方案</dt>
              <dd>
                {session.partnerEntry.programCode ? (
                  <code>{session.partnerEntry.programCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>銀行</dt>
              <dd>
                {session.partnerEntry.bankCode ? (
                  <code>{session.partnerEntry.bankCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>服務子類型</dt>
              <dd>
                <code>{subtype}</code>
              </dd>
            </div>
            <div>
              <dt>授權模式</dt>
              <dd>
                <code>{session.partnerEntry.authMode}</code>
              </dd>
            </div>
            <div>
              <dt>狀態</dt>
              <dd>
                <span
                  className={`status-badge${isActive ? "" : " is-warning"}`}
                >
                  {status}
                </span>
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Eligibility"
          title={
            eligibilityRequired
              ? "Eligibility verification required"
              : "Eligibility check not required"
          }
          description={
            eligibilityRequired
              ? "Run the eligibility check first; only an `eligible` decision unlocks partner booking creation."
              : "This entry is configured with `eligibility_mode = none`. Booking creation is allowed without an eligibility verification."
          }
        >
          <p>
            Eligibility mode:{" "}
            <code>{session.partnerEntry.eligibilityMode}</code>
          </p>
          <div className="link-row">
            <Link className="text-link" href="/partner/eligibility">
              Open eligibility verification
            </Link>
            {!eligibilityRequired ? (
              <Link className="text-link" href="/partner/booking/new">
                Skip to booking creation
              </Link>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Booking"
          title="合作夥伴標記訂單建立"
          description="從此介面建立的訂單會標記 `partnerEntrySlug`，並在通過驗證時標記 `eligibilityVerificationId`，讓下游 audit 與 billing 保留合作夥伴來源。"
        >
          <ul className="panel-list">
            <li>服務子類型由 entry 紀錄固定。</li>
            <li>報價權限由後端擁有；合作夥伴模式不設定車資。</li>
            <li>
              Negative paths (denied / ineligible / degraded) stop short of
              create.
            </li>
          </ul>
          <div className="link-row">
            <Link className="text-link" href="/partner/booking/new">
              Open booking create
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Boundary"
          title="合作夥伴模式得不到什麼"
          description="介面外殼沒有這些頁面的導覽項目；路由本身未設防護，但導覽讓邊界清楚呈現。"
        >
          <ul className="panel-list">
            <li>無租戶使用者／角色指派。</li>
            <li>無 API 金鑰、Webhook、audit log 或設定。</li>
            <li>無租戶 billing 或整合就緒度。</li>
            <li>無履約覆寫或派遣權限。</li>
          </ul>
        </SurfaceCard>
      </section>

      {!isActive ? (
        <CalloutPanel
          title="Entry status flagged"
          description={`Entry status is "${status}". Booking creation will fail until the entry is reactivated by platform admin.`}
          tone="warning"
        />
      ) : null}
    </div>
  );
}
