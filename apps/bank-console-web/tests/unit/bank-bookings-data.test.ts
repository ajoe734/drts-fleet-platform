import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBankBookingsData } from "../../lib/bank-bookings-data";
import {
  bookingList,
  filterBookingItems,
  paginateBookingItems,
} from "../../lib/bookings";

const { getIdentity, request } = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  request: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/bank-user-identity", () => ({
  getBankUserIdentity: getIdentity,
}));
vi.mock("@drts/tenant-auth/api-fetch", () => ({
  resolveTenantApiUrl: () => "https://api.example",
  tenantAuthFetch: request,
}));
const identity = {
  accessToken: "secret-bearer",
  tenantId: "real-issuer",
  userId: "verified-user",
  scopes: ["tenant:read"],
  roleCodes: ["tenant_viewer"],
  displayRole: "bank_ops_viewer",
};
const formal = () => ({
  order_id: "original-order",
  order_no: "FORMAL-ORDER",
  tenant_id: identity.tenantId,
  order_domain: "owned",
  service_bucket: "business_dispatch",
  business_dispatch_subtype: "credit_card_airport_transfer",
  partner_program_id: "program-1",
  status: "on_trip",
  direction: "pickup",
  pickup: { address: "Owner full address", masked_address: "City ••••" },
  dropoff: { address: "Owner airport", masked_address: "Airport ••••" },
  passenger: { name: "Private Passenger", phone: "0912345678" },
  created_at: "2026-10-01T02:00:00+08:00",
  updated_at: "2026-10-02T03:00:00+08:00",
  reservation_window_start: "2026-11-01T04:00:00+08:00",
  flight_no: "XY101",
  terminal: "T2",
  benefit_reference: "BEN-PRIVATE-123",
  issuer_authorization_ref: "AUTH-PRIVATE-456",
  approval_state: "approved",
  notes: "greet",
});
let rows: unknown[];
let programs: unknown[];
function response(items: unknown[]) {
  return new Response(
    JSON.stringify({ data: { items }, meta: { request_id: "formal-wire" } }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  getIdentity.mockResolvedValue(identity);
  rows = [formal()];
  programs = [
    {
      program_id: "program-1",
      tenant_id: identity.tenantId,
      display_name: "Canonical program",
    },
  ];
  request.mockImplementation(async (url: string) =>
    response(url.includes("service-programs") ? programs : rows),
  );
});
describe("formal Bank read boundary", () => {
  it.each(["bank_program_admin", "bank_ops_viewer", "bank_finance"])(
    "%s display never changes verified authority or masking",
    async (displayRole) => {
      getIdentity.mockResolvedValue({ ...identity, displayRole });
      const result = await loadBankBookingsData();
      expect(result.status).toBe("ready");
      expect(result.degradedMessage).toBeNull();
      expect(result.data.bookings).toHaveLength(1);
      const detail = result.data.detailById.get("original-order");
      expect(detail).toMatchObject({
        orderId: "original-order",
        orderNo: "FORMAL-ORDER",
        programCode: "program-1",
        programLabel: "Canonical program",
        direction: "inbound",
        state: "en_route",
        pickupLabel: "City ••••",
        dropoffLabel: "Airport ••••",
        scheduledAt: formal().reservation_window_start,
        flightNo: "XY101",
        terminal: "T2",
        cardholderRefMasked: "09••••78",
        benefitReferenceMasked: "BEN-••••-123",
        authorizationReferenceMasked: "AUTH-••••-456",
        opsLink: { state: "forbidden" },
      });
      expect(detail?.timeline[0]?.occurredAt).toBe(formal().created_at);
      expect(detail?.timeline.at(-1)?.occurredAt).toBe(formal().updated_at);
      expect(result.data.periods).toEqual(["2026-11"]);
      const serialized = JSON.stringify(result.data.bookings);
      for (const privateValue of [
        identity.accessToken,
        "Private Passenger",
        "0912345678",
        "Owner full address",
        "PRIVATE",
      ])
        expect(serialized).not.toContain(privateValue);
      expect(request).toHaveBeenCalledTimes(2);
      for (const [url, init] of request.mock.calls) {
        expect(url).toMatch(/^https:\/\/api.example\/api\/tenant\//);
        expect(init.headers).toEqual({
          Authorization: "Bearer secret-bearer",
          "x-tenant-id": identity.tenantId,
        });
      }
    },
  );
  it("preserves owning address access when formal mask is absent", async () => {
    const row = formal();
    rows = [
      { ...row, pickup: { address: row.pickup.address, masked_address: null } },
    ];
    const result = await loadBankBookingsData();
    expect(result.status).toBe("ready");
    expect(result.data.bookings[0]?.pickupLabel).toBe("Owner full address");
  });
  it("preserves created-at fallback and legal empty passenger fields", async () => {
    rows = [
      {
        ...formal(),
        reservation_window_start: null,
        passenger: { name: "", phone: "" },
        approval_state: "blocked",
      },
    ];
    const result = await loadBankBookingsData();
    expect(result.status).toBe("ready");
    expect(result.data.bookings[0]?.scheduledAt).toBe(formal().created_at);
  });
  it.each([401, 403])(
    "verified identity failure %i makes no downstream call",
    async (status) => {
      getIdentity.mockRejectedValue({ status, body: "private" });
      expect((await loadBankBookingsData()).status).toBe("denied");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("insufficient canonical scope cannot be elevated by display role", async () => {
    getIdentity.mockResolvedValue({
      ...identity,
      scopes: ["tenant:billing:read"],
      displayRole: "bank_program_admin",
    });
    expect((await loadBankBookingsData()).status).toBe("denied");
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["orders", "programs"])(
    "rejects foreign-tenant %s without partial data",
    async (source) => {
      if (source === "orders") rows = [{ ...formal(), tenant_id: "foreign" }];
      else
        programs = [
          {
            program_id: "program-1",
            tenant_id: "foreign",
            display_name: "Foreign",
          },
        ];
      const result = await loadBankBookingsData();
      expect(result.status).toBe("denied");
      expect(result.data.bookings).toEqual([]);
      expect(result.data.detailById.size).toBe(0);
      expect(result.data.programs).toEqual([]);
    },
  );
  it("real empty response is ready and never becomes a seed list", async () => {
    rows = [];
    const result = await loadBankBookingsData();
    expect(result.status).toBe("ready");
    expect(result.data.bookings).toEqual([]);
    expect(result.data.detailById.size).toBe(0);
  });
  it.each([401, 403, 500, 503])(
    "upstream HTTP %i is honest, empty and contains no upstream body",
    async (status) => {
      request.mockImplementation(
        async () => new Response("private-token-and-address", { status }),
      );
      const result = await loadBankBookingsData();
      expect(result.status).toBe(status < 500 ? "denied" : "unavailable");
      expect(result.data.bookings).toEqual([]);
      expect(result.degradedMessage).not.toContain("private");
    },
  );
  it("network failure is unavailable without seed fallback", async () => {
    request.mockRejectedValue(new Error("secret network diagnostic"));
    const result = await loadBankBookingsData();
    expect(result.status).toBe("unavailable");
    expect(result.data.bookings).toEqual([]);
    expect(result.degradedMessage).not.toContain("secret");
  });
  it.each([
    { data: {} },
    { data: { items: null } },
    { data: { items: [null] } },
    { data: { items: [{ ...formal(), order_id: undefined }] } },
    { data: { items: [{ ...formal(), pickup: null }] } },
    {
      data: {
        items: [
          { ...formal(), pickup: { address: "Owner", masked_address: 123 } },
        ],
      },
    },
    { data: { items: [{ ...formal(), status: "unrecognized" }] } },
    { data: { items: [{ ...formal(), created_at: "yesterday" }] } },
    { data: { items: [formal(), formal()] } },
  ])(
    "rejects malformed formal envelope/record %# without partial data",
    async (body) => {
      request.mockImplementation(async (url: string) =>
        url.includes("service-programs")
          ? response(programs)
          : new Response(JSON.stringify(body)),
      );
      const result = await loadBankBookingsData();
      expect(result.status).toBe("invalid");
      expect(result.data.bookings).toEqual([]);
    },
  );
  it("invalid JSON is not an authoritative empty result", async () => {
    request.mockImplementation(async () => new Response("not json"));
    expect((await loadBankBookingsData()).status).toBe("invalid");
  });
});
describe("same filtered dataset pagination", () => {
  it("retains original six-to-two status filtering with other filters", () => {
    expect(bookingList).toHaveLength(6);
    const scoped = filterBookingItems(bookingList, { programCode: "WE12" });
    expect(scoped).toHaveLength(3);
    const filtered = filterBookingItems(scoped, { state: "assigned" });
    expect(filtered).toHaveLength(2);
    expect(filterBookingItems(bookingList, { state: "assigned" })).toHaveLength(
      2,
    );
  });
  it("formal large result is complete across all pages without duplicate/skip/reorder", async () => {
    rows = Array.from({ length: 137 }, (_, i) => ({
      ...formal(),
      order_id: `order-${i}`,
      order_no: `FORMAL-${i}`,
      status: i % 2 ? "completed" : "assigned",
    }));
    const result = await loadBankBookingsData();
    expect(result.status).toBe("ready");
    const filtered = filterBookingItems(result.data.bookings, {
      state: "completed",
      programCode: "program-1",
      direction: "inbound",
      period: "2026-11",
      cardholder: "09",
    });
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const sliced = paginateBookingItems(filtered, String(page));
      expect(sliced.total).toBe(68);
      expect(sliced.totalPages).toBe(3);
      ids.push(...sliced.items.map((item) => item.orderId));
    }
    expect(ids).toEqual(filtered.map((item) => item.orderId));
    expect(new Set(ids).size).toBe(68);
    expect(result.data.detailById.get(ids.at(-1)!)?.orderNo).toBe("FORMAL-135");
    expect(paginateBookingItems(filtered, "999")).toMatchObject({
      page: 3,
      from: 51,
      to: 68,
    });
  });
  it.each(["-1", "NaN", "1.5", "Infinity", "0"])(
    "normalizes invalid page %s",
    (page) => {
      expect(paginateBookingItems(bookingList, page).page).toBe(1);
    },
  );
  it("normalizes empty list and invalid size; keeps supported UI sizes", () => {
    expect(paginateBookingItems([], "2", "999")).toMatchObject({
      page: 1,
      pageSize: 25,
      from: 0,
      to: 0,
      totalPages: 1,
    });
    expect(paginateBookingItems(bookingList, "1", "10").pageSize).toBe(10);
  });
});

it.each([
  {
    records: [
      {
        program_id: "program-1",
        tenant_id: identity.tenantId,
        display_name: 123,
      },
    ],
  },
  {
    records: [
      {
        program_id: "program-1",
        tenant_id: identity.tenantId,
        display_name: "One",
      },
      {
        program_id: "program-1",
        tenant_id: identity.tenantId,
        display_name: "Two",
      },
    ],
  },
])("rejects malformed or duplicate program records %#", async ({ records }) => {
  programs = records;
  const result = await loadBankBookingsData();
  expect(result.status).toBe("invalid");
  expect(result.data.bookings).toEqual([]);
});
