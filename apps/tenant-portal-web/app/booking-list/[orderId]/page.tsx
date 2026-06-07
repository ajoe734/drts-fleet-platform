import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord, TenantInvoiceRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot } from "@/lib/rbac";
import {
  buildBookingTimeline,
  describeManualFareOverride,
  findInvoicesForOrder,
  formatDateTime,
  formatMoney,
  summarizeComplianceGates,
} from "@/lib/booking-domain";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const { orderId: bookingId } = await params;

  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking);
  const timeline = buildBookingTimeline(booking);
  const relatedInvoices: TenantInvoiceRecord[] =
    invoicesResult.status === "fulfilled"
      ? findInvoicesForOrder(invoicesResult.value, booking.orderId)
      : [];
  const invoiceWarning =
    invoicesResult.status === "rejected"
      ? invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : "發票脈絡目前不可用"
      : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={`訂單編號 ${booking.bookingId}`}
        description="這個租戶訂單明細會顯示生命週期時間線、路線與乘客脈絡、履約摘要、車資／發票資訊，以及租戶可執行的操作。"
      >
        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">總覽</span>
            <h3>流程與履約摘要</h3>
            <p>
              訂單紀錄狀態與叫車單狀態仍需分開看待：租戶訂單狀態描述的是業務
              紀錄，而叫車單狀態反映的是派遣執行進度。
            </p>
            <div className="chip-row">
              <span className={`status-badge status-${booking.orderStatus}`}>
                {formatPortalCodeLabel(
                  booking.orderStatus,
                  booking.orderStatus,
                )}
              </span>
              <span className="status-chip">
                訂單紀錄 {formatPortalCodeLabel(booking.status, booking.status)}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>叫車單編號</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>服務類型</dt>
                <dd>
                  {formatPortalCodeLabel(
                    booking.serviceBucket,
                    booking.serviceBucket ?? "—",
                  )}
                </dd>
              </div>
              <div>
                <dt>派遣子類型</dt>
                <dd>
                  {formatPortalCodeLabel(
                    booking.businessDispatchSubtype,
                    booking.businessDispatchSubtype ?? "—",
                  )}
                </dd>
              </div>
              <div>
                <dt>訂單類型</dt>
                <dd>
                  {formatPortalCodeLabel(
                    booking.bookingType,
                    booking.bookingType ?? "—",
                  )}
                </dd>
              </div>
              <div>
                <dt>履約路徑</dt>
                <dd>{source.summary}</dd>
              </div>
              <div>
                <dt>權責方</dt>
                <dd>{source.badge}</dd>
              </div>
              <div>
                <dt>建立時間</dt>
                <dd>{formatDateTime(booking.createdAt)}</dd>
              </div>
            </dl>
            <p className="source-note">{source.detail}</p>
            {source.domain === "forwarded_authority" ? (
              <article className="callout-panel is-warning">
                <strong>轉送權限邊界</strong>
                <p>{source.statusBoundary}</p>
                <p>{source.escalationHint}</p>
              </article>
            ) : null}
          </article>

          <article className="surface-card">
            <span className="surface-kicker">時間線</span>
            <h3>訂單生命週期節點</h3>
            <p>
              租戶明細頁只會呈現已發布的訂單節點。更低階的派遣追蹤與司機任務
              投影，仍會留在營運控制台權限路徑，直到租戶專用時間線端點完成。
            </p>
            <ol className="booking-timeline">
              {timeline.map((point) => (
                <li className="booking-timeline-item" key={point.key}>
                  <strong>{point.label}</strong>
                  <span>{point.at ? formatDateTime(point.at) : "未公布"}</span>
                  <p className="muted-copy">{point.detail}</p>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">乘客與路線</span>
            <h3>乘車脈絡</h3>
            <p>
              乘客與路線資訊會放在同一區塊，讓租戶使用者不必切去派遣專用頁面
              也能確認商務預約內容。
            </p>
            <dl className="definition-grid">
              <div>
                <dt>乘客</dt>
                <dd>{booking.passenger.name}</dd>
              </div>
              <div>
                <dt>電話</dt>
                <dd>{booking.passenger.phone || "未提供"}</dd>
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
                <dt>時段開始</dt>
                <dd>{formatDateTime(booking.reservationWindowStart)}</dd>
              </div>
              <div>
                <dt>時段結束</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd)}</dd>
              </div>
              <div>
                <dt>方向</dt>
                <dd>
                  {booking.direction
                    ? formatPortalCodeLabel(
                        booking.direction,
                        booking.direction,
                      )
                    : "未指定"}
                </dd>
              </div>
              <div>
                <dt>重複規則</dt>
                <dd>{booking.recurrenceRule ?? "單次行程"}</dd>
              </div>
            </dl>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">履約</span>
            <h3>租戶可見的履約摘要</h3>
            <p>
              履約責任會從訂單紀錄中整理摘要。司機身分、車輛指派與即時派遣候選
              狀態仍不屬於租戶權限範圍，除非後續新增租戶專用讀取模型。
            </p>
            <dl className="definition-grid">
              <div>
                <dt>來源領域</dt>
                <dd>{source.badge}</dd>
              </div>
              <div>
                <dt>合作方案</dt>
                <dd>{booking.partnerProgramId ?? "不適用"}</dd>
              </div>
              <div>
                <dt>合作夥伴入口</dt>
                <dd>{booking.partnerEntrySlug ?? "不適用"}</dd>
              </div>
              <div>
                <dt>資格驗證</dt>
                <dd>{booking.eligibilityVerificationId ?? "不適用"}</dd>
              </div>
              <div>
                <dt>發行授權</dt>
                <dd>{booking.issuerAuthorizationRef ?? "不適用"}</dd>
              </div>
              <div>
                <dt>合規</dt>
                <dd>{summarizeComplianceGates(booking.complianceGates)}</dd>
              </div>
              <div>
                <dt>財務權責</dt>
                <dd>{source.financeAuthority}</dd>
              </div>
            </dl>
            <p className="muted-copy">
              在租戶可讀的履約投影發布前，司機、車輛與即時預估到達時間
              明細都會刻意隱藏。
            </p>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">車資與發票</span>
            <h3>租戶可見的財務脈絡</h3>
            <p>當後端已公布資料時，明細頁會顯示報價權責與發票關聯資訊。</p>
            <dl className="definition-grid">
              <div>
                <dt>報價車資</dt>
                <dd>{formatMoney(booking.quotedFare)}</dd>
              </div>
              <div>
                <dt>報價來源</dt>
                <dd>
                  {booking.quotedFareSource
                    ? formatPortalCodeLabel(
                        booking.quotedFareSource,
                        booking.quotedFareSource,
                      )
                    : "未公布"}
                </dd>
              </div>
              <div>
                <dt>定價版本</dt>
                <dd>{booking.quotedFareRuleVersion ?? "未公布"}</dd>
              </div>
              <div>
                <dt>人工覆寫</dt>
                <dd>
                  {describeManualFareOverride(booking.manualFareOverride)}
                </dd>
              </div>
            </dl>
            {invoiceWarning ? (
              <p className="muted-copy">發票脈絡目前不可用：{invoiceWarning}</p>
            ) : null}
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>發票編號 {invoice.invoiceId}</strong>
                    <span className="list-note">
                      {formatPortalCodeLabel(invoice.status, invoice.status)} ·{" "}
                      {formatMoney(invoice.amount)} · 期間{" "}
                      {formatDateTime(invoice.periodStart)} →{" "}
                      {formatDateTime(invoice.periodEnd)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : invoiceWarning ? null : (
              <p className="muted-copy">
                目前沒有任何租戶發票列連到這筆訂單。現階段的發票關聯仍以期間為主。
              </p>
            )}
          </article>

          <article className="surface-card">
            <span className="surface-kicker">業務脈絡</span>
            <h3>預約屬性</h3>
            <p>
              這裡會保留可選的商務出行欄位，讓租戶使用者不必變更流程狀態，也能
              確認預約內容。
            </p>
            <dl className="definition-grid">
              <div>
                <dt>成本中心</dt>
                <dd>{booking.costCenter ?? "未提供"}</dd>
              </div>
              <div>
                <dt>車型偏好</dt>
                <dd>{booking.vehiclePreference ?? "未提供"}</dd>
              </div>
              <div>
                <dt>福利參考</dt>
                <dd>{booking.benefitReference ?? "未提供"}</dd>
              </div>
              <div>
                <dt>航班</dt>
                <dd>{booking.flightNo ?? "未提供"}</dd>
              </div>
              <div>
                <dt>航廈</dt>
                <dd>{booking.terminal ?? "未提供"}</dd>
              </div>
              <div>
                <dt>行李</dt>
                <dd>
                  {booking.luggageCount == null
                    ? "未提供"
                    : `${booking.luggageCount} 件`}
                </dd>
              </div>
              <div>
                <dt>建立者</dt>
                <dd>
                  {booking.bookedBy
                    ? `${booking.bookedBy.name} · ${booking.bookedBy.email}`
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>現場聯絡人</dt>
                <dd>
                  {booking.onsiteContact
                    ? `${booking.onsiteContact.name} · ${booking.onsiteContact.phone}`
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>備註</dt>
                <dd>{booking.notes ?? "未提供"}</dd>
              </div>
            </dl>
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">可用操作</span>
          <h3>租戶指令入口</h3>
          <p>
            這裡只會顯示租戶權限允許的指令。更新與取消都會依既定租戶流程送出對應請求。
          </p>
          <BookingCommandPanel
            booking={booking}
            allowMutations={roleSnapshot.capabilities.canWriteTenant}
          />
        </article>

        <section className="callout-panel">
          <strong>權限邊界</strong>
          <p>
            司機指派、派遣覆寫、人工車資覆寫與外部結算操作都不會暴露在租戶端。
            完整權限切分仍以跨系統指令矩陣與路由對應為準。
          </p>
        </section>

        <Link className="route-link" href="/booking-list">
          <strong>返回訂單列表</strong>
          回到租戶訂單總覽頁。
        </Link>
      </AppShellCard>
    </main>
  );
}
