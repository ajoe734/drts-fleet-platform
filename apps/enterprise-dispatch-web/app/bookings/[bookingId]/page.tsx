import { EnterpriseBookingDetail } from "@/components/enterprise-booking-lifecycle";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <EnterpriseBookingDetail bookingId={bookingId} />;
}
