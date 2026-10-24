const UUID_ORDER_NO = /^O-([0-9a-f]{8})(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Short order reference for riders. Owned-mobility order numbers are
 * "O-<uuid>", which is unreadable on a phone; riders see "O-" plus the first
 * eight hex digits. The full number stays on the receipt download and PDF.
 * Any other format is shown as it is.
 */
export function displayOrderNo(orderNo: string): string {
  const match = UUID_ORDER_NO.exec(orderNo);
  return match ? `O-${match[1]!.toUpperCase()}` : orderNo;
}
