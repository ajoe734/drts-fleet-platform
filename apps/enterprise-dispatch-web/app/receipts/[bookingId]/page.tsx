import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EBanner,
  EBtn,
  EBtnContent,
  ECard,
  EIcon,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseBooking } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params2?: Record<string, string | number>) =>
    translate(key, params2, locale);
  const booking = getEnterpriseBooking(bookingId, locale);
  if (!booking) {
    notFound();
  }
  const fare = booking.fare ?? "NT$ 2,180";

  return (
    <>
      <EntPageHead
        back={`${tr("receipt.back")} ${booking.id}`}
        title={tr("receipt.title")}
        sub={tr("receipt.subtitle")}
      />
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <ECard t={t} accent={t.success}>
          <div style={{ textAlign: "center", padding: "8px 0 6px" }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                margin: "0 auto 14px",
                background: t.successBg,
                color: t.success,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EIcon name="check" size={28} stroke={2.4} />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 4px" }}>
              {tr("receipt.completed")}
            </h2>
            <div style={{ fontSize: 12.5, color: t.muted, fontFamily: t.mono }}>
              {booking.id}
            </div>
          </div>
          <div
            style={{
              marginTop: 16,
              background: t.surfaceLo,
              border: "1px solid " + t.line,
              borderRadius: 12,
              padding: "4px 16px",
            }}
          >
            <ERow
              t={t}
              k={tr("receipt.passenger")}
              v={`${booking.passenger} · ${booking.bookedBy}`}
            />
            <ERow
              t={t}
              k={tr("receipt.route")}
              v={`${booking.from} → ${booking.to}`}
            />
            <ERow
              t={t}
              k={tr("receipt.card.summary")}
              v={booking.window}
              mono
            />
            <ERow t={t} k={tr("new.policy.vehicle")} v={booking.vehicle} />
            <ERow
              t={t}
              k={tr("receipt.costCenter")}
              v={booking.costCenter}
              mono
            />
            <ERow t={t} k={tr("receipt.fare")} v={fare} strong last />
          </div>
          <EBanner
            t={t}
            tone="info"
            icon="building"
            style={{ marginTop: 14 }}
            body={tr("receipt.banner.body")}
          />
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Link
              href="/bookings"
              style={entBtnStyle(t, { variant: "default", block: true })}
            >
              <EBtnContent iconR="arrow">
                {tr("receipt.backHistory")}
              </EBtnContent>
            </Link>
            <EBtn t={t} variant="primary" block icon="download">
              {tr("receipt.download")}
            </EBtn>
          </div>
        </ECard>
      </div>
    </>
  );
}
