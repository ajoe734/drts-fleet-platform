import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
} from "@/components/enterprise-primitives";
import { getEnterpriseBooking } from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default async function ReceiptPage({
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
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader
        title={`行程收據 · ${booking.id}`}
        subtitle="收據只在支援的渠道與狀態下顯示。"
      />

      {booking.receiptReady ? (
        <EnterpriseCard title="收據摘要">
          <EnterpriseDl
            cols={2}
            items={[
              { k: "乘客", v: booking.passenger },
              { k: "成本中心", v: booking.costCenter, mono: true },
              { k: "車資", v: booking.fare ?? "待結算", mono: true },
              { k: "行程", v: `${booking.from} → ${booking.to}` },
            ]}
          />
        </EnterpriseCard>
      ) : (
        <EnterpriseBanner
          tone="warn"
          title="這筆行程目前沒有可下載收據"
          body="可能尚未完成結算，或這個渠道不提供獨立 receipt。請改由企業報帳流程或客服支援處理。"
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
        返回預約詳情
      </Link>
    </div>
  );
}
