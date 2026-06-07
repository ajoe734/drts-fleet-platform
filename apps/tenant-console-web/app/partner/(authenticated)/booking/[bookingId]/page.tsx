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
import { formatTenantCodeLabel } from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-TW");
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
        eyebrow="訂單已建立"
        title={`訂單 ${booking.bookingId} 已建立`}
        description="合作夥伴來電方可使用此確認頁作為受理證明。此頁面不提供後續異動，僅呈現租戶允許的建立結果。"
      />

      <SurfaceCard
        kicker="身分脈絡"
        title="已記錄合作夥伴來源"
        description="這筆訂單已帶入合作夥伴來源資訊。後續稽核、帳務與報表都會保留對應的合作夥伴入口代碼。"
      >
        <dl className="definition-grid">
          <div>
            <dt>訂單編號</dt>
            <dd>
              <code>{booking.bookingId}</code>
            </dd>
          </div>
          <div>
            <dt>叫車單編號</dt>
            <dd>
              <code>{booking.orderId}</code>
            </dd>
          </div>
          <div>
            <dt>訂單狀態</dt>
            <dd>
              <span className="status-badge">
                {formatTenantCodeLabel(
                  booking.orderStatus,
                  booking.orderStatus,
                )}
              </span>
            </dd>
          </div>
          <div>
            <dt>服務子類型</dt>
            <dd>
              <code>
                {formatTenantCodeLabel(
                  booking.businessDispatchSubtype,
                  booking.businessDispatchSubtype,
                )}
              </code>
              {!isPartnerBooking ? (
                <span className="status-chip is-warning">子類型不一致</span>
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
            <dt>上車地點</dt>
            <dd>{booking.pickup.address}</dd>
          </div>
          <div>
            <dt>下車地點</dt>
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
        title="合作夥伴模式接下來可做與不可做的事"
        description="合作夥伴端在建立訂單後即止步。修改與取消等操作仍屬租戶管理員或營運權限。"
      >
        <ul className="panel-list">
          <li>合作夥伴可將此確認頁提供給乘客作為受理證明。</li>
          <li>合作夥伴無法從這個頁面直接修改、取消或覆寫訂單。</li>
          <li>若需變更，請攜帶訂單編號聯繫租戶管理員或營運單位。</li>
        </ul>
        <div className="link-row">
          <Link className="text-link" href="/partner/booking/new">
            再建立一筆訂單
          </Link>
          <Link className="text-link" href="/partner/start">
            返回合作夥伴工作區
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
