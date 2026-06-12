import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseKpi,
  EnterpriseKpiGrid,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  bookingStateMeta,
  enterpriseBookings,
  gateStateFixtures,
  enterpriseTenant,
  enterpriseUser,
  policyNotes,
} from "@/lib/enterprise-fixtures";
import {
  enterpriseCardGridStyle,
  enterprisePageStyle,
  enterpriseTheme,
} from "@/lib/enterprise-theme";

const primaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${enterpriseTheme.accent}`,
  background: enterpriseTheme.accent,
  color: enterpriseTheme.surface,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

const secondaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surface,
  color: enterpriseTheme.text,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

const ghostLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
  color: enterpriseTheme.textMuted,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
} as const;

export default function HomePage() {
  const activeTrip = enterpriseBookings[0];

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={`嗨，${enterpriseUser.name}，要去哪裡？`}
        subtitle={`${enterpriseTenant.name} · 為自己或同事建立企業派車，費用走成本中心、超額需審批。`}
        actions={
          <Link href="/bookings" style={primaryLinkStyle}>
            建立預約
          </Link>
        }
      />

      <EnterpriseKpiGrid>
        <EnterpriseKpi
          label="本月額度"
          value="NT$ 31,000"
          sub="可用 / NT$ 60,000"
          hint="quota"
        />
        <EnterpriseKpi
          label="審批狀態"
          value="1 件待審"
          sub="EB-6ND812 · 等待主管核准"
          hint="approval"
        />
        <EnterpriseKpi
          label="本月已用車"
          value="23 趟"
          delta="+6%"
          deltaTone="up"
          sub="產品部"
          hint="trips"
        />
      </EnterpriseKpiGrid>

      <div style={enterpriseCardGridStyle}>
        <EnterpriseCard
          title="進行中的行程"
          actions={
            <EnterprisePill tone="success">
              {bookingStateMeta.assigned.label}
            </EnterprisePill>
          }
        >
          <EnterpriseDl
            cols={1}
            items={[
              { k: "乘客", v: activeTrip.passenger },
              { k: "下單人", v: `${activeTrip.bookedBy} 代訂` },
              { k: "行程", v: `${activeTrip.from} → ${activeTrip.to}` },
              {
                k: "ETA",
                v: `${activeTrip.etaMinutes} 分鐘 · 估計`,
                mono: true,
              },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <Link href="/trip" style={secondaryLinkStyle}>
              查看目前行程
            </Link>
          </div>
        </EnterpriseCard>

        <EnterpriseCard
          title="快速建立"
          actions={<EnterprisePill tone="info">self-service</EnterprisePill>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <Link
              href="/bookings"
              style={{ ...primaryLinkStyle, width: "100%" }}
            >
              為自己預約
            </Link>
            <Link
              href="/bookings"
              style={{ ...secondaryLinkStyle, width: "100%" }}
            >
              為同事 / 訪客代訂
            </Link>
            <Link href="/help" style={{ ...ghostLinkStyle, width: "100%" }}>
              查看政策與支援
            </Link>
          </div>
        </EnterpriseCard>
      </div>

      <EnterpriseSection>
        <EnterpriseCard
          title="Support-safe gate states"
          actions={<EnterprisePill tone="info">6 states</EnterprisePill>}
        >
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {Object.values(gateStateFixtures).map((gate) => (
              <div
                key={gate.code}
                style={{
                  display: "grid",
                  gap: 12,
                  padding: 16,
                  borderRadius: 16,
                  border: `1px solid ${enterpriseTheme.border}`,
                  background: enterpriseTheme.surface,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {gate.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: enterpriseTheme.textMuted,
                        fontFamily: enterpriseTheme.monoFamily,
                      }}
                    >
                      {gate.code}
                    </div>
                  </div>
                  <EnterprisePill tone={gate.tone}>{gate.code}</EnterprisePill>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {gate.summary}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: enterpriseTheme.textMuted,
                      lineHeight: 1.6,
                    }}
                  >
                    {gate.body}
                  </div>
                </div>
                <EnterpriseDl cols={1} items={Array.from(gate.facts)} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {gate.actions.map((action, index) => (
                    <Link
                      key={action}
                      href={index === 0 ? "/help" : "/bookings"}
                      style={index === 0 ? secondaryLinkStyle : ghostLinkStyle}
                    >
                      {action}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>

        <EnterpriseCard
          title="即將到來的預約"
          actions={
            <EnterprisePill tone="neutral">
              {enterpriseBookings.length} 筆
            </EnterprisePill>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {enterpriseBookings.map((booking, index) => (
              <div
                key={booking.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 2fr 120px",
                  gap: 12,
                  alignItems: "center",
                  paddingBottom: 12,
                  borderBottom:
                    index === enterpriseBookings.length - 1
                      ? "1px solid transparent"
                      : `1px solid ${enterpriseTheme.border}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {booking.passenger}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: enterpriseTheme.textMuted,
                    }}
                  >
                    {booking.self ? "本人預約" : `${booking.bookedBy} 代訂`}
                  </div>
                </div>
                <div style={{ fontSize: 12.5 }}>
                  <div>{booking.from}</div>
                  <div style={{ color: enterpriseTheme.textMuted }}>
                    {booking.to}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: enterpriseTheme.monoFamily,
                    }}
                  >
                    {booking.window}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
                      {bookingStateMeta[booking.state].label}
                    </EnterprisePill>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>

        <EnterpriseBanner
          tone="info"
          title="政策提醒"
          body={`${policyNotes[0]}；${policyNotes[1]}；${policyNotes[2]}。`}
        />
      </EnterpriseSection>
    </div>
  );
}
