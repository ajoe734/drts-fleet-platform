import { notFound } from "next/navigation";
import {
  TenantAvFallbackDetailSurface,
  loadTenantAvFallbackDetailItem,
  supportsTenantAvFallbackDetail,
} from "@/lib/tenant-av-fallback";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

export default async function BookingAvFallbackDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const locale = await getServerLocale();
  const { bookingId } = await params;
  const item = await loadTenantAvFallbackDetailItem(bookingId);

  if (!item || !supportsTenantAvFallbackDetail(item.projection)) {
    notFound();
  }

  return <TenantAvFallbackDetailSurface item={item} locale={locale} />;
}
