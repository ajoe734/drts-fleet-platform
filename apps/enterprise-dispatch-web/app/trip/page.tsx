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
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function TripPage() {
  const trip = enterpriseBookings[0];

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
          <EnterpriseBtn variant="primary">預約詳情</EnterpriseBtn>
        </div>
      </EnterpriseCard>
    </div>
  );
}
