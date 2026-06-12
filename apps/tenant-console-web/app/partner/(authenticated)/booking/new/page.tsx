import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerBookingCreateForm } from "@/app/partner/(authenticated)/booking/new/booking-create-form";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerBookingCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ eligibilityVerificationId?: string }>;
}) {
  const session = await requirePartnerSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const eligibilityVerificationId =
    typeof resolvedSearchParams.eligibilityVerificationId === "string"
      ? resolvedSearchParams.eligibilityVerificationId
      : "";
  const requiresEligibility = session.partnerEntry.eligibilityMode !== "none";
  const isActive = session.partnerEntry.status === "active";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="新增訂單"
        title="建立合作夥伴標記訂單。"
        description="需要填寫上車、下車、預約時窗、乘客聯絡方式與選填備註。後端會自動標記 `partnerEntrySlug`，並在通過驗證時標記 `eligibilityVerificationId`。"
      />

      {!isActive ? (
        <CalloutPanel
          title="建立訂單已封鎖"
          description={`Entry status is "${session.partnerEntry.status}". Contact platform admin before creating partner bookings.`}
          tone="warning"
        />
      ) : null}

      {requiresEligibility && !eligibilityVerificationId ? (
        <CalloutPanel
          title="需要資格驗證"
          description="此 entry 在建立訂單前需要 eligibility verification id。請先執行資格驗證步驟再繼續。"
          tone="warning"
        />
      ) : null}

      <SurfaceCard
        kicker="Service"
        title={`Subtype fixed by entry: ${session.partnerEntry.businessDispatchSubtype}`}
        description="服務子類型由合作夥伴 entry 註冊擁有，無法從此介面編輯。報價權限僅由後端管理。"
      >
        <PartnerBookingCreateForm
          canSubmit={
            isActive &&
            (!requiresEligibility ||
              eligibilityVerificationId.trim().length > 0)
          }
          eligibilityRequired={requiresEligibility}
          eligibilityVerificationId={eligibilityVerificationId}
        />
      </SurfaceCard>

      <CalloutPanel
        title="負向路徑不會進入建立"
        description="若後端以 `partner_entry_inactive`、`eligibility_required`、`eligibility_ineligible` 或 `eligibility_manual_review` 拒絕訂單，介面會回傳拒絕原因，且不會默默回退到租戶管理路徑。"
      />
    </div>
  );
}
