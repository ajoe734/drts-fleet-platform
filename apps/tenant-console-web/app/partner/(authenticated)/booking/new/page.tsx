import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerBookingCreateForm } from "@/app/partner/(authenticated)/booking/new/booking-create-form";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
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
        eyebrow="建立訂單"
        title="建立合作夥伴入口專用訂單。"
        description="必填資料包含上車地點、下車地點、預約時窗與乘客聯絡資訊；其他補充欄位可視需求填寫。後端會自動補上入口別名與資格驗證編號。"
      />

      {!isActive ? (
        <CalloutPanel
          title="目前無法建立訂單"
          description={`入口狀態為「${formatTenantCodeLabel(session.partnerEntry.status, session.partnerEntry.status)}」。請先聯絡平台管理端恢復此入口，再建立合作夥伴訂單。`}
          tone="warning"
        />
      ) : null}

      {requiresEligibility && !eligibilityVerificationId ? (
        <CalloutPanel
          title="建立訂單前需要資格驗證"
          description="這個入口必須先取得資格驗證編號，才能建立訂單。請先完成資格驗證，再從驗證結果頁繼續。"
          tone="warning"
        />
      ) : null}

      <SurfaceCard
        kicker="服務"
        title={`入口固定服務子類型：${formatTenantCodeLabel(
          session.partnerEntry.businessDispatchSubtype,
          session.partnerEntry.businessDispatchSubtype,
        )}`}
        description="服務子類型由合作夥伴入口註冊資料決定，這個頁面不能修改。報價與車資權責仍由後端掌控。"
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
        title="未通過路徑不會繞道放行"
        description="如果後端因入口停用、缺少資格驗證、驗證未通過或人工審查中而拒絕建立訂單，畫面只會回傳拒絕原因，不會悄悄切回租戶管理模式。"
      />
    </div>
  );
}
