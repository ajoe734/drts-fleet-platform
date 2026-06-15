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
  getBookingStateMeta,
  getEnterpriseBookings,
  getPolicyNotes,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function BookingsPage() {
  const locale = await getServerLocale();
  const bookings = getEnterpriseBookings(locale);
  const bookingStateMeta = getBookingStateMeta(locale);
  const policyNotes = getPolicyNotes(locale);

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("bookings.title", undefined, locale)}
        subtitle={t("bookings.subtitle", undefined, locale)}
        actions={<EnterpriseBtn variant="primary">{t("bookings.create", undefined, locale)}</EnterpriseBtn>}
      />

      <EnterpriseBanner
        tone="info"
        title={t("bookings.banner.title", undefined, locale)}
        body={t("bookings.banner.body", undefined, locale)}
      />

      <EnterpriseSection>
        {bookings.map((booking) => (
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
                  k: t("bookings.card.passengerBooker", undefined, locale),
                  v: booking.self
                    ? `${booking.passenger} / ${t("common.self", undefined, locale)}`
                    : `${booking.passenger} / ${t(
                        "common.bookedByDelegate",
                        { name: booking.bookedBy },
                        locale,
                      )}`,
                },
                { k: t("bookings.card.costCenter", undefined, locale), v: booking.costCenter, mono: true },
                { k: t("bookings.card.route", undefined, locale), v: `${booking.from} → ${booking.to}` },
                { k: t("bookings.card.time", undefined, locale), v: booking.window, mono: true },
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
                {t("bookings.card.detail", undefined, locale)}
              </Link>
            </div>
          </EnterpriseCard>
        ))}

        <EnterpriseCard title={t("bookings.policy.title", undefined, locale)}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {policyNotes.map((note) => (
              <li key={note} style={{ fontSize: 12.5, color: enterpriseTheme.text }}>
                {note}
              </li>
            ))}
          </ul>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}
