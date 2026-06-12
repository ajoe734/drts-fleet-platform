export const ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP = {
  booking: {
    status: "wired",
    routes: [
      "POST /api/tenant/bookings",
      "GET /api/tenant/bookings/:bookingId",
    ],
    clientMethods: ["createTenantBooking", "getTenantBooking"],
    adapter: "adaptBookingFixtureToCreateCommand",
    note: "Enterprise Dispatch booking intake already maps cleanly to the tenant booking authority.",
  },
  gate: {
    status: "derived",
    routes: ["GET /api/tenant/bookings/:bookingId"],
    clientMethods: ["getTenantBooking"],
    adapter: "summarizeBookingGates",
    note: "No dedicated /api/tenant/* gate endpoint is present; dispatch gate state is derived from booking.complianceGates.",
  },
  embed: {
    status: "unsupported",
    routes: [],
    clientMethods: [],
    adapter: "resolveDispatchEmbedDisposition",
    note: "Phase 1 cross-app movement uses deep links and CrossAppResourceLink, not embedded sub-apps.",
  },
} as const;

export type EnterpriseDispatchTenantApiGapMap =
  typeof ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP;
