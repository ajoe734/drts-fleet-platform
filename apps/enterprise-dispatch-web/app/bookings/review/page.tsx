import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import { EnterpriseBookingFlowStepper } from "@/components/enterprise-booking-flow";
import {
  enterpriseBookingDraft,
  enterpriseReviewChecklist,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

const primaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  padding: "8px 14px",
  borderRadius: 10,
  border: `1px solid ${enterpriseTheme.accent}`,
  background: enterpriseTheme.accent,
  color: enterpriseTheme.surface,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
} as const;

const secondaryLinkStyle = {
  ...primaryLinkStyle,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surface,
  color: enterpriseTheme.text,
} as const;

export default function ReviewBookingPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="送出前確認"
        subtitle="review 是企業版網站核心，集中確認成本中心、額度、審批與下單權責。"
        actions={<EnterprisePill tone="warn">approval_review</EnterprisePill>}
      />

      <EnterpriseBookingFlowStepper current="review" />

      <EnterpriseBanner
        tone="warn"
        title="本趟超過免審門檻"
        body={`預估費用 ${enterpriseBookingDraft.estimatedFare}，高於 ${enterpriseBookingDraft.approvalThreshold}；送出後可能直接 accepted，也可能先 pending 等待主管核准。`}
      />

      <EnterpriseSection
        style={{
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.9fr)",
        }}
      >
        <EnterpriseSection>
          <EnterpriseCard
            title="行程摘要"
            actions={<EnterprisePill tone="info">trip_summary</EnterprisePill>}
          >
            <EnterpriseDl
              cols={2}
              items={[
                { k: "乘客", v: enterpriseBookingDraft.passenger },
                { k: "下單人", v: enterpriseBookingDraft.bookedBy },
                {
                  k: "行程",
                  v: `${enterpriseBookingDraft.from} → ${enterpriseBookingDraft.to}`,
                },
                {
                  k: "搭乘時間",
                  v: `${enterpriseBookingDraft.date} ${enterpriseBookingDraft.pickupTime}`,
                  mono: true,
                },
                { k: "航班", v: enterpriseBookingDraft.flightNo, mono: true },
                { k: "現場聯絡", v: enterpriseBookingDraft.onsiteContact },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard
            title="權責確認"
            actions={
              <EnterprisePill tone="tenant">accountability</EnterprisePill>
            }
          >
            <ul
              style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10 }}
            >
              {enterpriseReviewChecklist.map((item) => (
                <li
                  key={item}
                  style={{ fontSize: 12.5, color: enterpriseTheme.text }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </EnterpriseCard>
        </EnterpriseSection>

        <EnterpriseSection>
          <EnterpriseCard
            title="成本中心與額度"
            actions={<EnterprisePill tone="tenant">quota</EnterprisePill>}
          >
            <EnterpriseDl
              cols={1}
              items={[
                {
                  k: "成本中心",
                  v: enterpriseBookingDraft.costCenter,
                  mono: true,
                },
                { k: "歸屬專案", v: enterpriseBookingDraft.costCenterName },
                {
                  k: "本月額度送出前",
                  v: enterpriseBookingDraft.quotaBefore,
                  mono: true,
                },
                {
                  k: "本趟預估費用",
                  v: enterpriseBookingDraft.estimatedFare,
                  mono: true,
                },
                {
                  k: "送出後額度",
                  v: enterpriseBookingDraft.quotaAfter,
                  mono: true,
                },
              ]}
            />
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                background: enterpriseTheme.infoBg,
                border: `1px solid ${enterpriseTheme.infoBorder}`,
                fontSize: 12.5,
                color: enterpriseTheme.info,
              }}
            >
              {enterpriseBookingDraft.quotaImpact}
            </div>
          </EnterpriseCard>

          <EnterpriseCard
            title="審批判定"
            actions={<EnterprisePill tone="warn">approval</EnterprisePill>}
          >
            <EnterpriseDl
              cols={1}
              items={[
                {
                  k: "審批門檻",
                  v: enterpriseBookingDraft.approvalThreshold,
                  mono: true,
                },
                { k: "當前判定", v: "需要主管審批" },
                { k: "核准人", v: enterpriseBookingDraft.approver },
                { k: "預估處理時間", v: enterpriseBookingDraft.approvalEta },
              ]}
            />
          </EnterpriseCard>
        </EnterpriseSection>
      </EnterpriseSection>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/bookings/submitted?state=accepted"
          style={primaryLinkStyle}
        >
          送出 fixture：已受理
        </Link>
        <Link
          href="/bookings/submitted?state=pending"
          style={secondaryLinkStyle}
        >
          送出 fixture：待審批
        </Link>
        <Link href="/bookings/new" style={secondaryLinkStyle}>
          返回修改資料
        </Link>
      </div>
    </div>
  );
}
