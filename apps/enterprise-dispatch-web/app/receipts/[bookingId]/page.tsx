import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
} from "@/components/enterprise-primitives";
import { getEnterpriseBooking } from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const booking = getEnterpriseBooking(bookingId, locale);

  if (!booking) {
    return notFound();
  }

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader
        title={t("receipt.title", { id: booking.id }, locale)}
        subtitle={t("receipt.subtitle", undefined, locale)}
      />

      {booking.receiptReady ? (
        <EnterpriseCard title={t("receipt.card.summary", undefined, locale)}>
          <EnterpriseDl
            cols={2}
            items={[
              { k: t("receipt.passenger", undefined, locale), v: booking.passenger },
              { k: t("receipt.costCenter", undefined, locale), v: booking.costCenter, mono: true },
              { k: t("receipt.fare", undefined, locale), v: booking.fare ?? t("common.notReady", undefined, locale), mono: true },
              { k: t("receipt.route", undefined, locale), v: `${booking.from} → ${booking.to}` },
            ]}
          />
        </EnterpriseCard>
      ) : (
        <EnterpriseBanner
          tone="warn"
          title={t("receipt.banner.title", undefined, locale)}
          body={t("receipt.banner.body", undefined, locale)}
        />
      )}

      <Link
        href={`/bookings/${booking.id}`}
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
        {t("receipt.back", undefined, locale)}
      </Link>
    </div>
  );
}
