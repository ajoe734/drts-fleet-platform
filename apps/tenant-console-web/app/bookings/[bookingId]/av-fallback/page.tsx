import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BookingAvFallbackDetailPage() {
  // Tenant Console has no canonical canvas for a dedicated AV fallback detail
  // surface. Keep the route file present for the restore task, but block the UI.
  notFound();
}
