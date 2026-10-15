import type { PassengerRideAuthorityView } from "@drts/contracts";

export interface PassengerReviewRecord {
  notice: string;
  ride: PassengerRideAuthorityView;
  trip: {
    taskId?: string;
    actualDistanceKm?: number;
    actualDurationSec?: number;
    startedAt?: string;
    completedAt?: string;
  } | null;
  consent?: {
    contactRequested: boolean;
    complaintCaseNo: string | null;
  } | null;
  charge: {
    paymentId: string;
    status: string;
    attemptCount: number;
    retryAt: string | null;
    lastErrorCode: string | null;
  } | null;
}

/** A separate rehearsal document, built from account-owned API facts. It never
 * presents simulated payment, qualification or location as operational proof.
 */
export function renderPassengerReviewRecord(
  record: PassengerReviewRecord,
): string {
  const escape = (value: unknown) =>
    String(value ?? "未提供").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const { ride, trip, charge } = record;
  const fields: [string, unknown][] = [
    ["訂單 UUID", ride.order.orderId],
    ["訂單狀態", ride.order.status],
    ["起點", ride.order.pickup.address],
    ["終點", ride.order.dropoff.address],
    ["預約時間", ride.order.requestedPickupAt],
    ["開始時間", trip?.startedAt],
    ["完成時間", ride.order.completedAt],
    ["取消時間", ride.order.cancelledAt],
    ["車牌（模擬）", ride.assignment?.vehicle.plateNo],
    ["里程公里（模擬定位）", trip?.actualDistanceKm],
    ["時長秒", trip?.actualDurationSec],
    ["原報價下限 TWD", ride.bookingQuote?.estimatedMin],
    ["原報價上限 TWD", ride.bookingQuote?.estimatedMax],
    ["原報價 ID", ride.bookingQuote?.fareSnapshotId],
    ["費率版本", ride.bookingQuote?.fareVersion],
    ["付款狀態（模擬 PSP）", ride.payment?.status ?? "未扣款"],
    [
      "付款金額 TWD",
      ride.payment?.amount ? ride.payment.amount.amountMinor / 100 : null,
    ],
    ["付款 ID", charge?.paymentId],
    ["扣款次數", charge?.attemptCount ?? 0],
    ["評價", ride.rating?.score],
  ];
  return `<!doctype html><html lang="zh-TW"><meta charset="utf-8"><title>演練紀錄 ${escape(ride.order.orderId)}</title><h1>演練紀錄・非正式憑證</h1><p>${escape(record.notice)}</p><p>未實際出車、扣款、通知真人或開立正式報帳憑證。演練採 1 分鐘預約前置設定，開始時間不得早於預約時間；報價與車資依真實日夜間費率及時間計算。</p><dl>${fields.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("")}</dl></html>`;
}
