import Link from "next/link";
import {
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import {
  bookingStateMeta,
  enterpriseBookings,
  enterpriseTripProgress,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function TripPage() {
  const trip = enterpriseBookings[0] ?? null;

  if (!trip) {
    return null;
  }

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 880 }}>
      <EnterprisePageHeader
        title="目前行程"
        subtitle="最快回到目前用車狀態，ETA 為估計值。"
      />

      <EnterpriseCard
        title={`${trip.passenger} · ${trip.id}`}
        actions={
          <EnterprisePill tone={bookingStateMeta[trip.state].tone}>
            {bookingStateMeta[trip.state].label}
          </EnterprisePill>
        }
      >
        <div
          aria-label="企業派車進度 rail"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
            gap: 10,
            marginBottom: 18,
          }}
        >
          {enterpriseTripProgress.map((step, index) => {
            const active = index <= 3;

            return (
              <div
                key={step}
                style={{
                  display: "grid",
                  gap: 7,
                  justifyItems: "center",
                  minWidth: 0,
                  color: active
                    ? enterpriseTheme.accent
                    : enterpriseTheme.textMuted,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active
                      ? enterpriseTheme.accentBg
                      : enterpriseTheme.surfaceLo,
                    border: `1px solid ${
                      active
                        ? enterpriseTheme.accentBorder
                        : enterpriseTheme.border
                    }`,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.35,
                    textAlign: "center",
                  }}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "minmax(0, 1fr) 180px",
            alignItems: "start",
          }}
        >
          <EnterpriseDl
            cols={1}
            items={[
              { k: "上車", v: trip.from },
              { k: "下車", v: trip.to },
              { k: "時間", v: trip.window, mono: true },
              { k: "費用歸屬", v: trip.costCenter, mono: true },
            ]}
          />
          <div
            style={{
              padding: 18,
              borderRadius: 16,
              background: enterpriseTheme.successBg,
              border: `1px solid ${enterpriseTheme.successBorder}`,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
                color: enterpriseTheme.success,
              }}
            >
              {trip.etaMinutes}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: enterpriseTheme.textMuted,
              }}
            >
              分鐘 · 估計抵達
            </div>
          </div>
        </div>

        <div
          style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}
        >
          <EnterpriseBtn variant="secondary">聯絡司機</EnterpriseBtn>
          <EnterpriseBtn variant="secondary">企業客服</EnterpriseBtn>
          <Link
            href={`/bookings/${trip.id}`}
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
            預約詳情
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
