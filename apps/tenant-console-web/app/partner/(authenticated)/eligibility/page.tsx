import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerEligibilityForm } from "@/app/partner/(authenticated)/eligibility/eligibility-form";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerEligibilityPage() {
  const session = await requirePartnerSession();
  const mode = session.partnerEntry.eligibilityMode;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="資格"
        title="驗證此合作夥伴 entry 的乘客資格。"
        description="這裡回傳的驗證紀錄是合作夥伴建立訂單的權威關卡。只有 `eligible` 判定才會解鎖訂單介面。"
      />

      {mode === "none" ? (
        <CalloutPanel
          title="不需資格檢查"
          description="此 entry 設定為 `eligibility_mode = none`。建立訂單時會直接接受合作夥伴來電者，無需驗證。"
        />
      ) : (
        <SurfaceCard
          kicker={mode}
          title={
            mode === "bank_card_inline"
              ? "Inline card verification"
              : "Reference-token verification"
          }
          description={
            mode === "bank_card_inline"
              ? "Card last 4 and cardholder name are required. The backend hashes the reference; raw card data is never persisted on this surface."
              : "Reference token and benefit reference are required. Optional flight number helps the issuer reference lookup pattern."
          }
        >
          <PartnerEligibilityForm mode={mode} />
        </SurfaceCard>
      )}

      <CalloutPanel
        title="負向路徑是明確的"
        description="驗證紀錄可能判定為 `eligible`、`ineligible` 或 `manual_review`。兩種負向結果都不會默默進入建立訂單。"
      >
        <ul className="panel-list">
          <li>
            <strong>eligible</strong>: booking create unlocks with the
            verification id stamped on the booking.
          </li>
          <li>
            <strong>ineligible</strong>: booking is denied; the partner sees the
            issuer reason code and may not retry without changing inputs.
          </li>
          <li>
            <strong>manual_review</strong>: booking is held in degraded mode;
            ops review is required before the rider can travel under benefit.
          </li>
        </ul>
      </CalloutPanel>
    </div>
  );
}
