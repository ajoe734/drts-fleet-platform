import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import * as contracts from "@drts/contracts";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
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

// Execute the complete production service module without constructing services,
// opening listeners or loading infrastructure. Only unused service imports are
// stubbed; the catalog/order methods, seed, envelopes and serializer are real.
function producer() {
  const apiRoot = resolve(__dirname, "../../../api");
  const realRequire = createRequire(resolve(apiRoot, "package.json"));
  function load(file: string, exposeSeed = false): Record<string, unknown> {
    const module = { exports: {} };
    const source = readFileSync(resolve(apiRoot, "src", file), "utf8");
    const output = ts.transpileModule(
      source + (exposeSeed ? "\nexport { PARTNER_ENTRY_SEED };" : ""),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          esModuleInterop: true,
        },
      },
    ).outputText;
    new Function("require", "module", "exports", output)(
      (id: string) => {
        if (id === "@drts/contracts") return contracts;
        if (id.startsWith("node:") || !id.startsWith("."))
          return realRequire(id);
        if (id === "../../common/api-envelope")
          return load("common/api-envelope.ts");
        return {};
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  const serviceModule = load(
    "modules/tenant-partner/tenant-partner.service.ts",
    true,
  );
  const Service = serviceModule.TenantPartnerService as {
    prototype: {
      listTenantServicePrograms(tenantId: string): {
        programId: string;
        displayName: string;
        programType: string;
      }[];
      listTenantOrders(tenantId: string, query: object): unknown[];
    };
  };
  const service = Object.assign(Object.create(Service.prototype), {
    partnerEntries: serviceModule.PARTNER_ENTRY_SEED,
    orderFeedProvider: () => [],
  }) as typeof Service.prototype & {
    partnerEntries: PartnerChannelEntryRecord[];
    orderFeedProvider: () => unknown[];
  };
  const { toApiListData, toApiSuccessEnvelope } = load(
    "common/api-envelope.ts",
  ) as {
    toApiListData(items: unknown[]): unknown;
    toApiSuccessEnvelope(data: unknown): unknown;
  };
  const { deepToSnakeCase } = load("common/snake-case.interceptor.ts") as {
    deepToSnakeCase(value: unknown): unknown;
  };
  return {
    service,
    wire: (items: unknown[]) =>
      new Response(
        JSON.stringify(
          deepToSnakeCase(toApiSuccessEnvelope(toApiListData(items))),
        ),
      ),
  };
}
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
])("rejects malformed program records %#", async ({ records }) => {
  programs = records;
  const result = await loadBankBookingsData();
  expect(result.status).toBe("invalid");
  expect(result.data.bookings).toEqual([]);
});

describe("production service catalog multiplicity", () => {
  it.each(["mixed source seed", "multiple airport entries"])(
    "preserves authorized bookings/details and unique program options with %s",
    async (scenario) => {
      const { service, wire } = producer();
      const tenantId = "tenant-demo-001";
      getIdentity.mockResolvedValue({ ...identity, tenantId });
      const airport = service.partnerEntries.find(
        (entry) =>
          entry.tenantId === tenantId &&
          entry.businessDispatchSubtype === "credit_card_airport_transfer",
      )!;
      expect(airport).toBeDefined();
      if (scenario === "multiple airport entries") {
        service.partnerEntries = [
          {
            ...airport,
            entrySlug: "airport-b",
            displayName: "B airport entry",
          },
          {
            ...airport,
            entrySlug: "airport-a",
            displayName: "A airport entry",
          },
        ];
      }
      service.orderFeedProvider = () => [
        {
          orderId: "producer-order",
          orderNo: "PRODUCER-ORDER",
          tenantId,
          orderDomain: "owned",
          serviceBucket: "business_dispatch",
          businessDispatchSubtype: "credit_card_airport_transfer",
          partnerProgramId: airport.programId,
          status: "assigned",
          direction: "pickup",
          pickup: { address: "Private street", maskedAddress: "City ••••" },
          dropoff: {
            address: "Private airport",
            maskedAddress: "Airport ••••",
          },
          passenger: { name: "Private passenger", phone: "0912345678" },
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          approvalState: "approved",
        },
      ];
      const catalog = service.listTenantServicePrograms(tenantId);
      const orders = service.listTenantOrders(tenantId, {
        serviceProduct: "credit_card_airport_transfer",
      });
      expect(orders).toHaveLength(1);
      expect(new Set(catalog.map((p) => p.programId)).size).toBeLessThan(
        catalog.length,
      );
      expect(catalog.some((p) => p.programType === "enterprise_dispatch")).toBe(
        true,
      );
      request.mockImplementation(async (url: string) =>
        wire(url.includes("service-programs") ? catalog : orders),
      );
      const result = await loadBankBookingsData();
      expect(result.status).toBe("ready");
      expect(result.data.bookings).toHaveLength(1);
      expect(result.data.detailById.get("producer-order")).toMatchObject({
        orderNo: "PRODUCER-ORDER",
        programCode: airport.programId,
        programLabel: catalog.find((p) => p.programId === airport.programId)!
          .displayName,
        pickupLabel: "City ••••",
        cardholderRefMasked: "09••••78",
      });
      const uniqueIds = [...new Set(catalog.map((p) => p.programId))];
      expect(result.data.programs.map((p) => p.code)).toEqual(uniqueIds);
      for (const option of result.data.programs)
        expect(option.label).toBe(
          catalog.find((p) => p.programId === option.code)!.displayName,
        );
      expect((await loadBankBookingsData()).data.programs).toEqual(
        result.data.programs,
      );
    },
  );

  it.each(["foreign tenant", "malformed label"])(
    "still validates every repeated program entry: %s",
    async (scenario) => {
      programs.push({
        program_id: "program-1",
        tenant_id:
          scenario === "foreign tenant" ? "foreign" : identity.tenantId,
        display_name: scenario === "malformed label" ? 123 : "Another entry",
      });
      const result = await loadBankBookingsData();
      expect(result.status).toBe(
        scenario === "foreign tenant" ? "denied" : "invalid",
      );
      expect(result.data.bookings).toEqual([]);
      expect(result.data.programs).toEqual([]);
      expect(result.data.detailById.size).toBe(0);
    },
  );
});
