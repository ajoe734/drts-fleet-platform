import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  bookingStateMeta,
  enterpriseBookings,
  policyNotes,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function BookingsPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="我的預約"
        subtitle="前台歷史檢視與建立入口；不是派遣看板。"
        actions={<EnterpriseBtn variant="primary">建立預約</EnterpriseBtn>}
      />

      <EnterpriseBanner
        tone="info"
        title="費用歸屬與審批優先"
        body="預約送出後，狀態可能先顯示已受理或待審批；可用操作仍以 backend availableActions 為準。"
      />

      <EnterpriseSection>
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
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/bookings/${booking.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 30,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${enterpriseTheme.border}`,
                  background: enterpriseTheme.surface,
                  color: enterpriseTheme.text,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                查看詳情
              </Link>
            </div>
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
