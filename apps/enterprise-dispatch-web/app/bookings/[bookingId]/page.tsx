import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  bookingStateMeta,
  enterpriseTripProgress,
  getEnterpriseBooking,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = getEnterpriseBooking(bookingId);

  if (!booking) {
    return notFound();
  }

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={`預約詳情 · ${booking.id}`}
        subtitle="詳情頁以 availableActions 與 read-side projection 為主，不從狀態文字推導權限。"
        actions={
          <EnterprisePill tone={bookingStateMeta[booking.state].tone}>
            {bookingStateMeta[booking.state].label}
          </EnterprisePill>
        }
      />

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
        }}
      >
        <EnterpriseCard title="行程與權責">
          <EnterpriseDl
            cols={2}
            items={[
              { k: "乘客", v: booking.passenger },
              {
                k: "下單人",
                v: booking.self ? "本人" : `${booking.bookedBy} 代訂`,
              },
              { k: "上車 / 下車", v: `${booking.from} → ${booking.to}` },
              { k: "時間", v: booking.window, mono: true },
              { k: "成本中心", v: booking.costCenter, mono: true },
              { k: "車型", v: booking.vehicle },
              { k: "審批", v: booking.approval, mono: true },
              {
                k: "機場情境",
                v: booking.flight
                  ? `${booking.flight} · ${booking.terminal} · ${booking.luggage}`
                  : "一般企業派車",
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard title="可用操作">
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {booking.availableActions.map((action) => (
                <li key={action} style={{ color: enterpriseTheme.text, fontSize: 12.5 }}>
                  {action}
                </li>
              ))}
            </ul>
          </EnterpriseCard>

          <EnterpriseCard title="進度 rail">
            <div style={{ display: "grid", gap: 10 }}>
              {enterpriseTripProgress.map((step, index) => (
                <div
                  key={step}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr",
                    gap: 10,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background:
                        index <= 3 ? enterpriseTheme.accentBg : enterpriseTheme.surfaceLo,
                      border: `1px solid ${
                        index <= 3 ? enterpriseTheme.accentBorder : enterpriseTheme.border
                      }`,
                      color:
                        index <= 3 ? enterpriseTheme.accent : enterpriseTheme.textMuted,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ paddingTop: 2, fontSize: 12.5 }}>{step}</div>
                </div>
              ))}
            </div>
          </EnterpriseCard>
        </EnterpriseSection>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/bookings"
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
          返回列表
        </Link>
        {booking.receiptReady ? (
          <Link
            href={`/receipts/${booking.id}`}
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
            查看收據
          </Link>
        ) : null}
      </div>
    </div>
  );
}
