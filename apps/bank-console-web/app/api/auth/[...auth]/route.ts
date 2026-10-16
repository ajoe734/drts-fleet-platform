import { createTenantAuthHandlers } from "@drts/tenant-auth";

export const dynamic = "force-dynamic";
export const { GET, POST } = createTenantAuthHandlers();
