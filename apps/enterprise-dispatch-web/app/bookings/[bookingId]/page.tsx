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
  getBookingStateMeta,
  getEnterpriseActionLabel,
  getEnterpriseBooking,
  getEnterpriseTripProgress,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const booking = getEnterpriseBooking(bookingId, locale);
  const bookingStateMeta = getBookingStateMeta(locale);
  const progress = getEnterpriseTripProgress(locale);

  if (!booking) {
    return notFound();
  }

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("detail.title", { id: booking.id }, locale)}
        subtitle={t("detail.subtitle", undefined, locale)}
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
        <EnterpriseCard title={t("detail.card.trip", undefined, locale)}>
          <EnterpriseDl
            cols={2}
            items={[
              { k: t("new.field.passenger", undefined, locale), v: booking.passenger },
              {
                k: t("detail.bookedBy", undefined, locale),
                v: booking.self
                  ? t("common.self", undefined, locale)
                  : t("common.bookedByDelegate", { name: booking.bookedBy }, locale),
              },
              { k: t("detail.pickupDropoff", undefined, locale), v: `${booking.from} → ${booking.to}` },
              { k: t("detail.time", undefined, locale), v: booking.window, mono: true },
              { k: t("detail.costCenter", undefined, locale), v: booking.costCenter, mono: true },
              { k: t("detail.vehicle", undefined, locale), v: booking.vehicle },
              { k: t("detail.approval", undefined, locale), v: booking.approval, mono: true },
              {
                k: t("detail.airport", undefined, locale),
                v: booking.flight
                  ? `${booking.flight} · ${booking.terminal} · ${booking.luggage}`
                  : t("common.generalDispatch", undefined, locale),
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard title={t("detail.card.actions", undefined, locale)}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {booking.availableActions.map((action) => (
                <li key={action} style={{ color: enterpriseTheme.text, fontSize: 12.5 }}>
                  {getEnterpriseActionLabel(action, locale)}
                </li>
              ))}
            </ul>
          </EnterpriseCard>

          <EnterpriseCard title={t("detail.card.progress", undefined, locale)}>
            <div style={{ display: "grid", gap: 10 }}>
              {progress.map((step, index) => (
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
          {t("detail.back", undefined, locale)}
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
            {t("detail.receipt", undefined, locale)}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
