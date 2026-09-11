import { cookies } from "next/headers";
import { EnterpriseBookingHistory } from "@/components/enterprise-booking-lifecycle";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";

export default async function BookingsHistoryPage() {
  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    return (
      <div role="alert" data-testid="enterprise-search-auth-required">
        {verified.status === 503
          ? "登入服務暫時無法連線，請稍後重試。"
          : "請使用有效的企業租戶帳號登入後查詢預約。"}
      </div>
    );
  }
  return <EnterpriseBookingHistory tenantId={verified.session.tenantId} />;
}
