/** Browser-only navigation policy. Portable SDK retains only an opaque URL string. */
export function approvedPaymentActionUrl(
  value: string,
  approvedOrigins: readonly string[],
): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !approvedOrigins.includes(url.origin)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
