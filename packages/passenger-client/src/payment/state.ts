import type { PassengerPaymentMethod } from "@drts/contracts";

export function paymentMethodLabel(method: PassengerPaymentMethod): string {
  return `${method.cardType} •••• ${method.last4}`;
}
export function paymentMethodExpired(
  method: PassengerPaymentMethod,
  now = new Date(),
): boolean {
  if (
    !/^\d{4}$/.test(method.expiryYear) ||
    !/^(0?[1-9]|1[0-2])$/.test(method.expiryMonth) ||
    !Number.isFinite(now.getTime())
  )
    return true;
  const year = Number(method.expiryYear);
  const month = Number(method.expiryMonth);
  return (
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1)
  );
}
/** Display only: never infer capture from trip completion, a quote or card binding. */
export function passengerPaymentDisplay(status: string | undefined): {
  label: string;
  tone: "info" | "warn" | "success" | "danger";
} {
  switch (status) {
    case "not_selected":
      return { label: "尚未選擇付款方式", tone: "info" };
    case "authorized":
      return { label: "付款已授權，尚未扣款", tone: "info" };
    case "captured":
      return { label: "付款完成", tone: "success" };
    case "failed":
      return { label: "扣款失敗", tone: "danger" };
    case "refunded":
      return { label: "已退款", tone: "info" };
    case "manual_recovery":
      return { label: "款項待客服處理", tone: "warn" };
    default:
      return { label: "目前無法確認付款狀態", tone: "warn" };
  }
}
