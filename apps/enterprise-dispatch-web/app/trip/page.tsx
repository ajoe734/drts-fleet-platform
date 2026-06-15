import Link from "next/link";
import {
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import {
  getBookingStateMeta,
  getEnterpriseBookings,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function TripPage() {
  const locale = await getServerLocale();
  const trip = getEnterpriseBookings(locale)[0] ?? null;
  const bookingStateMeta = getBookingStateMeta(locale);

  if (!trip) {
    return null;
  }

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 880 }}>
      <EnterprisePageHeader
        title={t("trip.title", undefined, locale)}
        subtitle={t("trip.subtitle", undefined, locale)}
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
              { k: t("trip.pickup", undefined, locale), v: trip.from },
              { k: t("trip.dropoff", undefined, locale), v: trip.to },
              { k: t("trip.time", undefined, locale), v: trip.window, mono: true },
              { k: t("trip.costCenter", undefined, locale), v: trip.costCenter, mono: true },
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
            <div style={{ marginTop: 6, fontSize: 12, color: enterpriseTheme.textMuted }}>
              {t("common.etaArrival", undefined, locale)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <EnterpriseBtn variant="secondary">{t("trip.contactDriver", undefined, locale)}</EnterpriseBtn>
          <EnterpriseBtn variant="secondary">{t("trip.contactSupport", undefined, locale)}</EnterpriseBtn>
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
            {t("trip.detail", undefined, locale)}
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
