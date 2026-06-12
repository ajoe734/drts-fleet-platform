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
  bookingStateMeta,
  enterpriseSubmittedStates,
  enterpriseBookings,
  policyNotes,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

const primaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "7px 12px",
  borderRadius: 10,
  border: `1px solid ${enterpriseTheme.accent}`,
  background: enterpriseTheme.accent,
  color: enterpriseTheme.surface,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
} as const;

const secondaryLinkStyle = {
  ...primaryLinkStyle,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surface,
  color: enterpriseTheme.text,
} as const;

export default function BookingsPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="我的預約"
        subtitle="前台歷史檢視與建立入口；不是派遣看板。"
        actions={
          <Link href="/bookings/new" style={primaryLinkStyle}>
            建立預約
          </Link>
        }
      />

      <EnterpriseBookingFlowStepper current="submitted" />

      <EnterpriseBanner
        tone="info"
        title="費用歸屬與審批優先"
        body="預約送出後，狀態可能先顯示已受理或待審批；可用操作仍以 backend availableActions 為準。"
      />

      <EnterpriseSection>
        <EnterpriseCard
          title="submitted fixture 狀態"
          actions={
            <EnterprisePill tone="info">accepted + pending</EnterprisePill>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {Object.entries(enterpriseSubmittedStates).map(([key, state]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: `1px solid ${enterpriseTheme.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {state.bookingId} · {state.title}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: enterpriseTheme.textMuted,
                    }}
                  >
                    {state.summary}
                  </div>
                </div>
                <Link
                  href={`/bookings/submitted?state=${key}`}
                  style={secondaryLinkStyle}
                >
                  開啟
                </Link>
              </div>
            ))}
          </div>
        </EnterpriseCard>

        {enterpriseBookings.map((booking) => (
          <EnterpriseCard
            key={booking.id}
            title={`${booking.id} · ${booking.passenger}`}
            actions={
              <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
                {bookingStateMeta[booking.state].label}
              </EnterprisePill>
            }
          >
            <EnterpriseDl
              cols={2}
              items={[
                {
                  k: "乘客 / 下單人",
                  v: booking.self
                    ? `${booking.passenger} / 本人`
                    : `${booking.passenger} / ${booking.bookedBy} 代訂`,
                },
                { k: "成本中心", v: booking.costCenter, mono: true },
                { k: "行程", v: `${booking.from} → ${booking.to}` },
                { k: "時間", v: booking.window, mono: true },
              ]}
            />
          </EnterpriseCard>
        ))}

        <EnterpriseCard title="建立預約前提醒">
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
    </div>
  );
}
