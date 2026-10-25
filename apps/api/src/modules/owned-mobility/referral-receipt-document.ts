import { createHash } from "node:crypto";
import {
  REFERRAL_RECEIPT_AUTHORITY_COMPLAINT_PHONE,
  REFERRAL_RECEIPT_CONSUMER_SERVICE_PHONE,
  REFERRAL_RECEIPT_NOT_TAX_RECEIPT_NOTICE,
  buildReferralReceiptE04Fields,
  formatReferralReceiptTaipeiTime,
  type ReferralPassengerReceipt,
  type ReferralPassengerReceiptPdfDocument,
} from "@drts/contracts";
import { renderBillingDocumentPdf } from "../billing-settlement/billing-document-pdf.renderer";

/** Uses the already packaged Unicode renderer/font, without changing issuance,
 * tax/payment state, persisted fare authority or any formal E04 document. */
export async function renderReferralReceiptDocument(
  receipt: ReferralPassengerReceipt,
): Promise<ReferralPassengerReceiptPdfDocument> {
  const fare = (n: number | null | undefined) =>
    n == null ? "實際分項未提供" : `NT$ ${n}`;
  const completed =
    formatReferralReceiptTaipeiTime(receipt.completedAt) ?? "完成時間待確認";
  const serviceLabels: Record<string, string> = {
    enterprise_dispatch: "企業派車",
    standard: "一般計程車",
    standard_taxi: "一般計程車",
  };
  const bytes = await renderBillingDocumentPdf([
    "DRTS 乘車明細（非正式稅務憑證）",
    `訂單編號：${receipt.orderNo}`,
    `行程 ID：${receipt.orderId}`,
    `完成時間（臺灣）：${completed}`,
    `行程狀態：${receipt.status === "completed" ? "已完成" : receipt.status}`,
    "",
    `乘客：${receipt.passengerNameMasked}`,
    `聯絡電話：${receipt.passengerPhoneMasked}`,
    `司機：${receipt.driverName ?? "資料未提供"}`,
    `車牌：${receipt.plateNumber ?? "資料未提供"}`,
    `用車服務：${serviceLabels[receipt.vehicleType] ?? receipt.vehicleType}`,
    `上車地點：${receipt.pickupAddress}`,
    `下車地點：${receipt.dropoffAddress}`,
    "",
    `起步價：${fare(receipt.fareBase)}`,
    `里程費：${fare(receipt.fareDistance)}`,
    `時間費：${fare(receipt.fareTime)}`,
    `夜間費：${fare(receipt.fareNight)}`,
    `實際車資合計：${receipt.formattedTotal}`,
    `付款及結算：${receipt.paymentChannel}`,
    "",
    "E-04 乘車證明欄位（未核發者顯示未提供）",
    ...buildReferralReceiptE04Fields(receipt).map(
      (field) => `${field.label}：${field.value}`,
    ),
    "",
    `客服：${REFERRAL_RECEIPT_CONSUMER_SERVICE_PHONE}；主管機關：${REFERRAL_RECEIPT_AUTHORITY_COMPLAINT_PHONE}`,
    REFERRAL_RECEIPT_NOT_TAX_RECEIPT_NOTICE,
  ]);
  return {
    orderId: receipt.orderId,
    fileName: `receipt-${receipt.orderId}.pdf`,
    mimeType: "application/pdf",
    contentBase64: bytes.toString("base64"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    formalTaxReceipt: false,
  };
}
