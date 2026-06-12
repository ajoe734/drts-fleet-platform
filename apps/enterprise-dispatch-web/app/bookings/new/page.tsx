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
import { enterpriseBookingDraft, policyNotes } from "@/lib/enterprise-fixtures";
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

export default function NewBookingPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="建立預約"
        subtitle="企業版網站首頁進入的 self-service 建單畫面，先確認行程與成本中心。"
        actions={
          <EnterprisePill tone="info">new_booking_fixture</EnterprisePill>
        }
      />

      <EnterpriseBookingFlowStepper current="new" />

      <EnterpriseBanner
        tone="info"
        title="建立階段先填資料，真正的 gate 在 review"
        body="建立預約頁負責讓下單人確認乘客、行程、成本中心與預估費用；送出前的額度與審批判定集中在下一步。"
      />

      <EnterpriseSection
        style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)" }}
      >
        <EnterpriseCard title="行程與乘客">
          <EnterpriseDl
            cols={2}
            items={[
              { k: "乘客", v: enterpriseBookingDraft.passenger },
              {
                k: "乘客電話",
                v: enterpriseBookingDraft.passengerPhone,
                mono: true,
              },
              { k: "下單人", v: enterpriseBookingDraft.bookedBy },
              { k: "代訂關係", v: enterpriseBookingDraft.relation },
              { k: "上車", v: enterpriseBookingDraft.from },
              { k: "下車", v: enterpriseBookingDraft.to },
              {
                k: "日期 / 時間",
                v: `${enterpriseBookingDraft.date} ${enterpriseBookingDraft.pickupTime}`,
                mono: true,
              },
              { k: "航班", v: enterpriseBookingDraft.flightNo, mono: true },
              { k: "車型偏好", v: enterpriseBookingDraft.vehiclePreference },
              { k: "現場聯絡", v: enterpriseBookingDraft.onsiteContact },
            ]}
          />
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: enterpriseTheme.surfaceLo,
              fontSize: 12.5,
              color: enterpriseTheme.text,
            }}
          >
            備註：{enterpriseBookingDraft.note}
          </div>
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard
            title="費用歸屬"
            actions={<EnterprisePill tone="tenant">cost_center</EnterprisePill>}
          >
            <EnterpriseDl
              cols={1}
              items={[
                {
                  k: "成本中心",
                  v: enterpriseBookingDraft.costCenter,
                  mono: true,
                },
                { k: "部門 / 專案", v: enterpriseBookingDraft.costCenterName },
                {
                  k: "預估費用",
                  v: enterpriseBookingDraft.estimatedFare,
                  mono: true,
                },
                {
                  k: "本月額度",
                  v: enterpriseBookingDraft.quotaBefore,
                  mono: true,
                },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard
            title="送出前提醒"
            actions={<EnterprisePill tone="warn">policy</EnterprisePill>}
          >
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {policyNotes.map((note) => (
                <li
                  key={note}
                  style={{ fontSize: 12.5, color: enterpriseTheme.text }}
                >
                  {note}
                </li>
              ))}
            </ul>
          </EnterpriseCard>
        </EnterpriseSection>
      </EnterpriseSection>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/bookings/review" style={primaryLinkStyle}>
          前往確認權責
        </Link>
        <Link href="/" style={secondaryLinkStyle}>
          返回首頁
        </Link>
      </div>
    </div>
  );
}
