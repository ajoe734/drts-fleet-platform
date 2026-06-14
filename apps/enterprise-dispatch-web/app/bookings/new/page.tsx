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
  enterpriseAddresses,
  enterpriseBookingDraft,
  enterpriseCostCenters,
  enterprisePassengers,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

const cardGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.95fr)",
} as const;

const fieldStyle = {
  display: "grid",
  gap: 6,
} as const;

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: enterpriseTheme.textMuted,
} as const;

const valueStyle = {
  minHeight: 42,
  padding: "11px 12px",
  borderRadius: 12,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surfaceLo,
  color: enterpriseTheme.text,
  fontSize: 13,
} as const;

const actionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "8px 12px",
  borderRadius: 10,
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 600,
} as const;

export default function NewBookingPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="建立預約"
        subtitle="先確認乘客、成本中心與企業情境，再進入 review page。"
        actions={
          <Link
            href="/bookings/review"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
            }}
          >
            前往確認頁
          </Link>
        }
      />

      <EnterpriseBanner
        tone="info"
        title="企業語意優先"
        body="這裡先確認 passenger、bookedBy、cost center、quota 與 approval posture；機場欄位只在情境需要時出現。"
      />

      <div style={cardGridStyle}>
        <EnterpriseCard title="預約內容">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={fieldStyle}>
              <span style={labelStyle}>乘客</span>
              <div style={valueStyle}>{enterpriseBookingDraft.passenger}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>下單人</span>
              <div style={valueStyle}>{enterpriseBookingDraft.bookedBy}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>上車地點</span>
              <div style={valueStyle}>{enterpriseBookingDraft.pickup}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>下車地點</span>
              <div style={valueStyle}>{enterpriseBookingDraft.dropoff}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>預約時段</span>
              <div style={valueStyle}>{enterpriseBookingDraft.reservationWindow}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>成本中心</span>
              <div style={valueStyle}>{enterpriseBookingDraft.costCenter}</div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>機場情境</span>
              <div style={valueStyle}>
                {enterpriseBookingDraft.flight} · {enterpriseBookingDraft.terminal}
                · {enterpriseBookingDraft.luggage}
              </div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>現場聯絡</span>
              <div style={valueStyle}>{enterpriseBookingDraft.onsiteContact}</div>
            </div>
          </div>
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard
            title="政策預覽"
            actions={<EnterprisePill tone="warn">approval</EnterprisePill>}
          >
            <EnterpriseDl
              cols={1}
              items={[
                { k: "審批結果", v: enterpriseBookingDraft.approval },
                { k: "額度影響", v: enterpriseBookingDraft.quotaImpact },
                { k: "車型", v: enterpriseBookingDraft.vehicle },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard title="常用選項">
            <EnterpriseDl
              cols={1}
              items={[
                { k: "乘客捷徑", v: enterprisePassengers.join(" / ") },
                { k: "常用地址", v: enterpriseAddresses.slice(0, 2).join(" / ") },
                { k: "成本中心", v: enterpriseCostCenters.join(" / ") },
              ]}
            />
          </EnterpriseCard>
        </EnterpriseSection>
      </div>

      <EnterpriseCard title="下一步">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/bookings/review"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
            }}
          >
            繼續到 review
          </Link>
          <Link
            href="/bookings"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.surface,
              border: `1px solid ${enterpriseTheme.border}`,
              color: enterpriseTheme.text,
            }}
          >
            返回我的預約
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
