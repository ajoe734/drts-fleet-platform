import { createTenantAuthHandlers } from "../../../../lib/auth/route-handlers";

export const dynamic = "force-dynamic";
export const { GET, POST } = createTenantAuthHandlers();
