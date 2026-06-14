import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  enterpriseBookingDraft,
  enterpriseReviewChecklist,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function ReviewBookingPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="確認權責"
        subtitle="提交前最後確認 passenger、bookedBy、cost center、quota impact 與 approval posture。"
      />

      <EnterpriseBanner
        tone="warn"
        title="這筆預約需要審批"
        body="送出後可能先顯示 accepted + pending；不要把畫面上的已受理誤認成已完成派車。"
      />

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
        }}
      >
        <EnterpriseCard
          title="預約摘要"
          actions={<EnterprisePill tone="accent">review</EnterprisePill>}
        >
          <EnterpriseDl
            cols={2}
            items={[
              { k: "乘客", v: enterpriseBookingDraft.passenger },
              { k: "下單人", v: enterpriseBookingDraft.bookedBy },
              { k: "上車 / 下車", v: `${enterpriseBookingDraft.pickup} → ${enterpriseBookingDraft.dropoff}` },
              { k: "時間", v: enterpriseBookingDraft.reservationWindow, mono: true },
              { k: "成本中心", v: enterpriseBookingDraft.costCenter, mono: true },
              { k: "現場聯絡", v: enterpriseBookingDraft.onsiteContact },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard title="審批與額度">
            <EnterpriseDl
              cols={1}
              items={[
                { k: "審批 posture", v: enterpriseBookingDraft.approval },
                { k: "額度影響", v: enterpriseBookingDraft.quotaImpact },
                { k: "備註", v: enterpriseBookingDraft.notes },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard title="送出前確認">
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {enterpriseReviewChecklist.map((item) => (
                <li key={item} style={{ color: enterpriseTheme.text, fontSize: 12.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </EnterpriseCard>
        </EnterpriseSection>
      </div>

      <EnterpriseCard title="提交 booking command">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/bookings/submitted"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            送出預約
          </Link>
          <Link
            href="/bookings/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.surface,
              border: `1px solid ${enterpriseTheme.border}`,
              color: enterpriseTheme.text,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            返回編輯
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
