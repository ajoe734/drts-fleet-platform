import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerEligibilityForm } from "@/app/partner/(authenticated)/eligibility/eligibility-form";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerEligibilityPage() {
  const session = await requirePartnerSession();
  const mode = session.partnerEntry.eligibilityMode;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="資格驗證"
        title="驗證這個合作夥伴入口的乘客資格。"
        description="這裡回傳的驗證紀錄就是合作夥伴建立訂單前的正式門檻。只有驗證結果為「符合資格」時，才能繼續建立訂單。"
      />

      {mode === "none" ? (
        <CalloutPanel
          title="此入口不需要資格驗證"
          description="這個入口設定為不需資格驗證，因此合作夥伴可直接建立訂單，不必先跑驗證流程。"
        />
      ) : (
        <SurfaceCard
          kicker={formatTenantCodeLabel(mode, mode)}
          title={
            mode === "bank_card_inline" ? "即時銀行卡驗證" : "參考代碼驗證"
          }
          description={
            mode === "bank_card_inline"
              ? "必須提供卡號末四碼與持卡人姓名。後端只會保留雜湊後的參照資訊，這個頁面不會保存原始卡號。"
              : "必須提供參考代碼與福利參考編號。若有航班號，也可一併提供給發卡或福利系統查核。"
          }
        >
          <PartnerEligibilityForm mode={mode} />
        </SurfaceCard>
      )}

      <CalloutPanel
        title="未通過路徑會明確中止"
        description="驗證結果可能是符合資格、不符合資格或人工審查。只要不是符合資格，就不會悄悄放行到建立訂單。"
      >
        <ul className="panel-list">
          <li>
            <strong>符合資格</strong>
            ：系統會開放建立訂單，並自動把驗證編號帶進訂單。
          </li>
          <li>
            <strong>不符合資格</strong>
            ：系統會拒絕建立訂單；合作夥伴會看到原因代碼，若不更改輸入資料就不能重試。
          </li>
          <li>
            <strong>人工審查</strong>
            ：訂單建立會先被擋下，必須等營運端完成審查後，乘客才能以福利資格搭乘。
          </li>
        </ul>
      </CalloutPanel>
    </div>
  );
}
