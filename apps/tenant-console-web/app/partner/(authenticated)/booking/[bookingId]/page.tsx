import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  buildPartnerClient,
  requirePartnerSession,
} from "@/lib/partner-session";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function PartnerBookingConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const session = await requirePartnerSession();
  const client = buildPartnerClient(session);

  let booking: BookingRecord;
  try {
    booking = (await client.getTenantBooking(bookingId)) as BookingRecord;
  } catch {
    notFound();
  }

  const isPartnerBooking =
    booking.businessDispatchSubtype ===
    session.partnerEntry.businessDispatchSubtype;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="訂單已確認"
        title={`Booking ${booking.bookingId} created.`}
        description="合作夥伴來電者可用此確認作為受理證明。此介面的變更僅透過租戶允許的命令執行。"
      />

      <SurfaceCard
        kicker="Identity"
        title="已記錄合作夥伴來源"
        description="此訂單現已帶有合作夥伴來源。下游 audit、billing 與報表都會保留 entry slug。"
      >
        <dl className="definition-grid">
          <div>
            <dt>訂單 id</dt>
            <dd>
              <code>{booking.bookingId}</code>
            </dd>
          </div>
          <div>
            <dt>單號 id</dt>
            <dd>
              <code>{booking.orderId}</code>
            </dd>
          </div>
          <div>
            <dt>訂單狀態</dt>
            <dd>
              <span className="status-badge">{booking.orderStatus}</span>
            </dd>
          </div>
          <div>
            <dt>服務子類型</dt>
            <dd>
              <code>{booking.businessDispatchSubtype}</code>
              {!isPartnerBooking ? (
                <span className="status-chip is-warning">subtype mismatch</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>預約時窗</dt>
            <dd>
              {formatDateTime(booking.reservationWindowStart)} →{" "}
              {formatDateTime(booking.reservationWindowEnd)}
            </dd>
          </div>
          <div>
            <dt>上車</dt>
            <dd>{booking.pickup.address}</dd>
          </div>
          <div>
            <dt>下車</dt>
            <dd>{booking.dropoff.address}</dd>
          </div>
          <div>
            <dt>乘客</dt>
            <dd>
              {booking.passenger.name}
              <span className="table-secondary">
                {" "}
                · {booking.passenger.phone}
              </span>
            </dd>
          </div>
        </dl>
      </SurfaceCard>

      <CalloutPanel
        title="合作夥伴模式接下來能與不能做什麼"
        description="合作夥伴介面止於建立訂單。更新／取消命令屬於租戶管理或 ops 權限。"
      >
        <ul className="panel-list">
          <li>合作夥伴可向乘客出示此確認。</li>
          <li>合作夥伴無法從此介面編輯、取消或覆寫訂單。</li>
          <li>如需變更，請持訂單 id 聯絡租戶管理員或 ops。</li>
        </ul>
        <div className="link-row">
          <Link className="text-link" href="/partner/booking/new">
            Create another booking
          </Link>
          <Link className="text-link" href="/partner/start">
            Back to partner workspace
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
