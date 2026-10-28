import { createAgencyAuthHandlers } from "@drts/agency-auth";

export const dynamic = "force-dynamic";
export const { GET, POST } = createAgencyAuthHandlers("/login");
