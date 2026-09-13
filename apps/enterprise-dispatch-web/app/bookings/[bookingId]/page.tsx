import { cookies } from "next/headers";
import { EnterpriseBookingDetail } from "@/components/enterprise-booking-lifecycle";
import { EnterpriseGatePage } from "@/components/enterprise-state-page";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    return <EnterpriseGatePage kind="auth-required" />;
  }

  return (
    <EnterpriseBookingDetail
      bookingId={bookingId}
      tenantId={verified.session.tenantId}
    />
  );
}
