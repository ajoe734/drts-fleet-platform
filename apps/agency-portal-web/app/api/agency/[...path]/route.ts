import { createAgencyApiProxyHandlers } from "@drts/agency-auth/agency-api";

export const dynamic = "force-dynamic";
export const { GET, POST } = createAgencyApiProxyHandlers();
