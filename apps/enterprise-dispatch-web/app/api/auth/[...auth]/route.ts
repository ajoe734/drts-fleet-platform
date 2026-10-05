import { createTenantAuthHandlers } from "../../../../../tenant-console-web/lib/auth/route-handlers";

export const dynamic = "force-dynamic";
export const { GET, POST } = createTenantAuthHandlers("/auth-required");
