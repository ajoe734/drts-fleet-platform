// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  TenantCostCenterRecord,
  TenantBookingsPageRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { createEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  buildEnterpriseBookingUpdateCommand,
  createEnterpriseBookingDraftFromRecord,
  createEnterpriseBookingDraft,
  parseEnterpriseBookingDraft,
  serializeEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import * as sharedApi from "@drts/api-client";
import * as contracts from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import { resolve } from "node:path";
import { createUiModuleLoader } from "../../../../tests/unit/system-remediation/sr-wire-001/ui-module-loader";

// Existing finite TSX loader executes the real normal submit and local helpers.
// The application Vitest configuration intentionally retains Next JSX; no
// configuration or component implementation is substituted for this test.
const loadUi = createUiModuleLoader(resolve(__dirname, "../.."), {
  "@drts/api-client": sharedApi,
  "@drts/contracts": contracts,
  "@drts/ui-tokens": uiTokens,
});
const { submitEnterpriseBookingDraft } = loadUi<
  Pick<
    typeof import("@/app/bookings/review/booking-submit-button"),
    "submitEnterpriseBookingDraft"
  >
>(resolve(__dirname, "../../app/bookings/review/booking-submit-button.tsx"));
import { enterpriseDispatchBookingRecord } from "../fixtures/dispatch-booking-fixture";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body, meta: {} }), {
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("enterprise booking lifecycle API wiring", () => {
  it("reads, updates, and cancels the same booking id through tenant commands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [enterpriseDispatchBookingRecord],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        } satisfies TenantBookingsPageRecord),
      )
      .mockResolvedValueOnce(jsonResponse(enterpriseDispatchBookingRecord))
      .mockResolvedValueOnce(jsonResponse(enterpriseDispatchBookingRecord))
      .mockResolvedValueOnce(
        jsonResponse({
          ...enterpriseDispatchBookingRecord,
          status: "cancelled",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createEnterpriseDispatchTenantClient(
      "http://api.test",
      "tenant-001",
    );
    const listed = (await client.listBookings())[0]!;
    const read = await client.getBooking(listed.bookingId);
    const draft = createEnterpriseBookingDraftFromRecord(read);

    expect(draft).toMatchObject({
      reservationDate: "2026-06-12",
      reservationTime: "18:00",
    });

    const update = buildEnterpriseBookingUpdateCommand({
      ...draft,
      notes: "Updated at browser review",
    });
    await client.updateBooking(listed.bookingId, update);
    await client.cancelBooking(listed.bookingId, {
      reason: "Cancelled from browser",
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://api.test/api/tenant/bookings?page=1&pageSize=100",
      "http://api.test/api/tenant/bookings/booking-001",
      "http://api.test/api/tenant/bookings/booking-001",
      "http://api.test/api/tenant/bookings/booking-001/cancel",
    ]);
    const updateCall = fetchMock.mock.calls[2]!;
    expect(updateCall[1]).toMatchObject({ method: "PUT" });
    expect(
      JSON.parse(String((updateCall[1] as RequestInit).body)),
    ).toMatchObject({
      notes: "Updated at browser review",
      passenger: { name: enterpriseDispatchBookingRecord.passenger.name },
      costCenter: enterpriseDispatchBookingRecord.costCenter,
      reservationWindowStart:
        enterpriseDispatchBookingRecord.reservationWindowStart,
    });
    expect(fetchMock.mock.calls[3]![1]).toMatchObject({ method: "POST" });
  });
});

const editNow = new Date("2099-06-11T00:00:00Z");

// The existing API JSON may carry Source37 travel fields before the accepted
// client contract models them. Check all common contract members and declare
// the fixture extension explicitly; keep the complete payload under test.
type TravelEditFixtureDetails = Extract<
  NonNullable<BookingRecord["partnerBookingDetails"]>,
  { subtype: "travel_agency_transfer" }
> & {
  routeStops: Array<{ address: string; lat: number; lng: number }>;
  planFareBasis: "included_in_tour";
};

function editRecord(
  subtype: BookingRecord["businessDispatchSubtype"] = "travel_agency_transfer",
): BookingRecord {
  const travelDetails: TravelEditFixtureDetails = {
    subtype: "travel_agency_transfer",
    groupCode: "SIM-original-group",
    groupSize: 2,
    itineraryLink: "https://example.invalid/SIM-tour",
    meetingPoint: "SIM original meeting point",
    rosterPassengers: ["SIM rider A", "SIM rider B"],
    routeStops: [{ address: "SIM waypoint", lat: 25.05, lng: 121.55 }],
    planFareBasis: "included_in_tour",
  };
  return {
    ...enterpriseDispatchBookingRecord,
    businessDispatchSubtype: subtype,
    partnerEntrySlug:
      subtype === "enterprise_dispatch" ? null : "SIM-existing-entry",
    reservationWindowStart: "2099-06-12T10:00:12.500Z",
    reservationWindowEnd: "2099-06-12T11:30:12.500Z",
    modifiableUntil: "2099-06-12T09:00:00Z",
    pickup: {
      ...enterpriseDispatchBookingRecord.pickup,
      addressId: "SIM-pickup-master",
      lat: 25.0418,
      lng: 121.565,
    },
    dropoff: {
      ...enterpriseDispatchBookingRecord.dropoff,
      addressId: "SIM-dropoff-master",
      lat: 25.0797,
      lng: 121.2342,
    },
    direction: subtype === "credit_card_airport_transfer" ? "dropoff" : null,
    ...(subtype === "travel_agency_transfer"
      ? {
          partnerBookingDetails: travelDetails,
        }
      : subtype === "insurance_replacement_vehicle"
        ? {
            partnerBookingDetails: {
              subtype,
              claimNumber: "SIM-claim",
              policyNumber: "SIM-policy",
              claimReference: "SIM-reference",
              claimantName: "SIM claimant",
              replacementStart: "2099-06-12T10:00:00Z",
              replacementEnd: "2099-06-13T10:00:00Z",
              replacementVehicleClass: "SIM original class",
              caseHandler: "SIM handler",
            },
          }
        : {}),
  };
}

function existingBookingTransport(record: BookingRecord, readFails = false) {
  const calls: Array<{
    method: string;
    path: string;
    body: UpdateTenantBookingCommand | null;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(
        String(input),
        "http://enterprise-edit-unit.invalid",
      ).pathname.replace(/^\/control-plane-proxy(?=\/)/, "");
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as UpdateTenantBookingCommand)
        : null;
      calls.push({ method, path, body });
      if (method === "GET" && readFails)
        return Response.json(
          {
            error: {
              code: "BOOKING_NOT_FOUND",
              message: "Original booking read failed",
              retryable: false,
              traceId: "SIM-original-read",
            },
          },
          { status: 404 },
        );
      if (method === "GET") return jsonResponse(record);
      if (method === "PUT") {
        // Synthetic HTTP transport follows the existing API subtype contract.
        // The real command builder and normal submit helper remain unmocked.
        if (
          record.partnerEntrySlug &&
          body?.businessDispatchSubtype &&
          body.businessDispatchSubtype !== record.businessDispatchSubtype
        )
          return Response.json(
            {
              error: {
                code: "PARTNER_BOOKING_SUBTYPE_IMMUTABLE",
                message: "Partner-originated bookings cannot change subtype.",
                retryable: false,
                traceId: "SIM-immutable-subtype",
              },
            },
            { status: 409 },
          );
        return jsonResponse({ ...record, ...body });
      }
      if (method === "POST")
        return jsonResponse({
          bookingId: record.bookingId,
          orderId: record.orderId,
          status: "active",
          businessDispatchSubtype: "enterprise_dispatch",
        });
      throw new Error(
        "Unexpected synthetic booking transport " + method + " " + path,
      );
    }),
  );
  return calls;
}

function roundTripEdit(record: BookingRecord) {
  return parseEnterpriseBookingDraft(
    Object.fromEntries(
      serializeEnterpriseBookingDraft(
        createEnterpriseBookingDraftFromRecord(record),
      ),
    ),
    "zh",
    editNow,
  );
}

describe("normal existing-booking review submits changes without changing its service", () => {
  it.each([
    "credit_card_airport_transfer",
    "travel_agency_transfer",
    "insurance_replacement_vehicle",
    "enterprise_dispatch",
  ] as const)(
    "changes only phone and notes on the same %s booking",
    async (subtype) => {
      const record = editRecord(subtype);
      const calls = existingBookingTransport(record);
      const router = { push: vi.fn(), refresh: vi.fn() };
      await submitEnterpriseBookingDraft({
        draft: {
          ...roundTripEdit(record),
          onsiteContactPhone: "+886900000009",
          notes: "SIM edited notes",
        },
        bookingId: record.bookingId,
        tenantId: record.tenantId,
        idempotencyKey: "SIM-unused-update-key",
        clickNow: editNow,
        router,
      });
      expect(calls.map(({ method, path }) => [method, path])).toEqual([
        ["GET", `/api/tenant/bookings/${record.bookingId}`],
        ["PUT", `/api/tenant/bookings/${record.bookingId}`],
      ]);
      expect(calls[1]?.body).toEqual({
        onsiteContact: {
          name: record.onsiteContact?.name,
          phone: "+886900000009",
        },
        notes: "SIM edited notes",
      });
      expect(router.push).toHaveBeenCalledWith(`/bookings/${record.bookingId}`);
      expect(router.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("does not issue an update or navigation when the original booking read fails", async () => {
    const record = editRecord();
    const calls = existingBookingTransport(record, true);
    const router = { push: vi.fn(), refresh: vi.fn() };
    await expect(
      submitEnterpriseBookingDraft({
        draft: { ...roundTripEdit(record), notes: "SIM edit" },
        bookingId: record.bookingId,
        tenantId: record.tenantId,
        idempotencyKey: "SIM-unused",
        clickNow: editNow,
        router,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" });
    expect(calls.map(({ method }) => method)).toEqual(["GET"]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("leaves legitimate missing Partner-only fields absent during a notes-only edit", async () => {
    const record: BookingRecord = {
      ...editRecord("insurance_replacement_vehicle"),
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    };
    const calls = existingBookingTransport(record);
    await submitEnterpriseBookingDraft({
      draft: { ...roundTripEdit(record), notes: "SIM changed case notes" },
      bookingId: record.bookingId,
      tenantId: record.tenantId,
      idempotencyKey: "SIM-unused",
      clickNow: editNow,
      router: { push: vi.fn(), refresh: vi.fn() },
    });
    expect(calls[1]?.body).toEqual({ notes: "SIM changed case notes" });
  });

  it("keeps a newly selected address master instead of detaching that new identity", async () => {
    const record = editRecord();
    const calls = existingBookingTransport(record);
    await submitEnterpriseBookingDraft({
      draft: {
        ...roundTripEdit(record),
        pickup: "SIM new selected address",
        pickupAddressId: "SIM-new-master",
      },
      bookingId: record.bookingId,
      tenantId: record.tenantId,
      idempotencyKey: "SIM-unused",
      clickNow: editNow,
      router: { push: vi.fn(), refresh: vi.fn() },
    });
    expect(calls[1]?.body).toEqual({
      pickupAddressId: "SIM-new-master",
      pickup: {
        address: "SIM new selected address",
        addressName: "SIM new selected address",
      },
    });
  });

  it("detaches the old master ID when edited address text still carries that old ID", async () => {
    const record = editRecord();
    const calls = existingBookingTransport(record);
    await submitEnterpriseBookingDraft({
      draft: { ...roundTripEdit(record), pickup: "SIM new typed pickup" },
      bookingId: record.bookingId,
      tenantId: record.tenantId,
      idempotencyKey: "SIM-unused",
      clickNow: editNow,
      router: { push: vi.fn(), refresh: vi.fn() },
    });
    expect(calls[1]?.body).toEqual({
      pickupAddressId: null,
      pickup: {
        address: "SIM new typed pickup",
        addressName: "SIM new typed pickup",
      },
    });
  });

  it("keeps the actual booker email when the editable booker name changes", async () => {
    const record = editRecord();
    const calls = existingBookingTransport(record);
    await submitEnterpriseBookingDraft({
      draft: { ...roundTripEdit(record), bookedBy: "SIM updated coordinator" },
      bookingId: record.bookingId,
      tenantId: record.tenantId,
      idempotencyKey: "SIM-unused",
      clickNow: editNow,
      router: { push: vi.fn(), refresh: vi.fn() },
    });
    expect(calls[1]?.body).toEqual({
      bookedBy: {
        name: "SIM updated coordinator",
        email: record.bookedBy?.email,
      },
    });
  });

  it("moves the original window duration only when its date or time is edited", async () => {
    const record = editRecord();
    const calls = existingBookingTransport(record);
    await submitEnterpriseBookingDraft({
      draft: { ...roundTripEdit(record), reservationTime: "19:00" },
      bookingId: record.bookingId,
      tenantId: record.tenantId,
      idempotencyKey: "SIM-unused",
      clickNow: editNow,
      router: { push: vi.fn(), refresh: vi.fn() },
    });
    expect(calls[1]?.body).toEqual({
      reservationWindowStart: "2099-06-12T11:00:00.000Z",
      reservationWindowEnd: "2099-06-12T12:30:00.000Z",
    });
  });

  it("keeps normal enterprise create on its original POST without an existing-booking GET", async () => {
    const record = editRecord("enterprise_dispatch");
    const calls = existingBookingTransport(record);
    const router = { push: vi.fn(), refresh: vi.fn() };
    await submitEnterpriseBookingDraft({
      draft: createEnterpriseBookingDraft("zh", editNow),
      tenantId: record.tenantId,
      idempotencyKey: "SIM-create-key",
      clickNow: editNow,
      router,
    });
    expect(calls.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/api/tenant/bookings"],
    ]);
    expect(calls[0]?.body?.businessDispatchSubtype).toBe("enterprise_dispatch");
    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining("/bookings/submitted?"),
    );
  });
});

// Real async pages, original form, serializer/parser and mounted normal submit.
// Cookies, navigation/Link and HTTP transport are finite IO ports only. This is
// React/jsdom unit evidence, not API/DB/provider or hosted browser execution.
function mountedEditHarness(record: BookingRecord) {
  const appRoot = resolve(__dirname, "../..");
  const router = { push: vi.fn(), refresh: vi.fn() };
  const calls: {
    method: string;
    wirePath: string;
    path: string;
    body: unknown;
  }[] = [];
  const stamp = "2099-06-10T00:00:00Z";
  const costCenter: TenantCostCenterRecord = {
    tenantId: record.tenantId,
    code: "SIM-ONLY",
    name: "SIM only active center",
    description: null,
    ownerUserId: null,
    ownerName: null,
    activeFlag: true,
    disabledAt: null,
    disabledReason: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  vi.stubEnv("DRTS_API_URL", "http://enterprise-edit-unit.invalid");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://enterprise-edit-unit.invalid");
      const path = url.pathname.replace(/^\/control-plane-proxy(?=\/)/, "");
      const method = init?.method ?? "GET";
      const body: unknown = init?.body
        ? JSON.parse(String(init.body))
        : undefined;
      calls.push({ method, wirePath: url.pathname, path, body });
      if (path === "/api/auth/session")
        return jsonResponse({
          active: true,
          identity: {
            realm: "tenant",
            tenant_id: record.tenantId,
            actor_id: "SIM-editor",
            scopes: ["tenant:read", "tenant:write"],
          },
        });
      if (path === "/api/tenant/passengers" || path === "/api/tenant/addresses")
        return jsonResponse({ items: [] });
      if (path === "/api/tenant/cost-centers")
        return jsonResponse({ items: [costCenter] });
      if (
        path === `/api/tenant/bookings/${record.bookingId}` &&
        method === "GET"
      )
        return jsonResponse(record);
      if (
        path === `/api/tenant/bookings/${record.bookingId}` &&
        method === "PUT"
      )
        return jsonResponse(record);
      throw new Error(`Unexpected mounted edit IO: ${method} ${path}`);
    }),
  );
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/api-client": sharedApi,
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "next/headers": {
      cookies: async () => ({
        get: (name: string) =>
          name === "drts_tenant_session"
            ? { name, value: "SIM-session" }
            : undefined,
      }),
    },
    "next/navigation": {
      useRouter: () => router,
      usePathname: () => "/bookings/new",
    },
    "next/link": {
      __esModule: true,
      default: ({
        href,
        children,
        ...rest
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement("a", { href, ...rest }, children),
    },
  };
  const load = createUiModuleLoader(appRoot, modules);
  // The shell uses this actual shared export. Loading its original pure module
  // avoids sending the unrelated UI barrel's preserved TSX to Vitest's loader.
  modules["@drts/ui-web"] = load<
    typeof import("../../../../packages/ui-web/src/environment-badge/environment-resolver")
  >(
    resolve(
      appRoot,
      "../../packages/ui-web/src/environment-badge/environment-resolver.ts",
    ),
  );
  modules["@/components/booking-form"] = load<
    typeof import("@/components/booking-form")
  >(resolve(appRoot, "components/booking-form/index.ts"));
  const { default: NewBookingPage } = load<
    typeof import("@/app/bookings/new/page")
  >(resolve(appRoot, "app/bookings/new/page.tsx"));
  const { default: ReviewBookingPage } = load<
    typeof import("@/app/bookings/review/page")
  >(resolve(appRoot, "app/bookings/review/page.tsx"));
  return { router, calls, NewBookingPage, ReviewBookingPage };
}

function actualReviewParams(container: HTMLElement) {
  const link = container.querySelector<HTMLAnchorElement>(
    '[data-drt-intent="enterprise-review"]',
  );
  if (!link)
    throw new Error("Normal enterprise form did not render review navigation");
  expect(link.getAttribute("aria-disabled")).not.toBe("true");
  return Object.fromEntries(
    new URL(
      link.getAttribute("href") ?? "",
      "http://enterprise-edit-unit.invalid",
    ).searchParams,
  );
}

function formInput(container: HTMLElement, field: string) {
  const control = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(`#enterprise-booking-${field}`);
  if (!control) throw new Error(`Normal enterprise form missing ${field}`);
  return control;
}

describe("mounted existing-booking new form, review and normal submit roundtrip", () => {
  it.each([
    "credit_card_airport_transfer",
    "travel_agency_transfer",
    "insurance_replacement_vehicle",
    "enterprise_dispatch",
  ] as const)(
    "keeps an empty existing cost center and untouched service fields for %s",
    async (subtype) => {
      const record: BookingRecord = {
        ...editRecord(subtype),
        costCenter: null,
      };
      const h = mountedEditHarness(record);
      const params = Object.fromEntries(
        serializeEnterpriseBookingDraft(
          createEnterpriseBookingDraftFromRecord(record),
        ),
      );
      const page = render(
        await h.NewBookingPage({
          searchParams: Promise.resolve({
            ...params,
            bookingId: record.bookingId,
          }),
        }),
      );
      expect(formInput(page.container, "cost-center").value).toBe("");
      expect(
        formInput(page.container, "cost-center").hasAttribute("required"),
      ).toBe(false);
      fireEvent.change(formInput(page.container, "contact"), {
        target: { value: "+886900000009" },
      });
      fireEvent.change(formInput(page.container, "notes"), {
        target: { value: "SIM mounted edited notes" },
      });
      const reviewParams = actualReviewParams(page.container);
      expect(reviewParams.bookingId).toBe(record.bookingId);
      expect(reviewParams.cc).toBe("");
      const restored = parseEnterpriseBookingDraft(reviewParams, "zh");
      expect(restored).toMatchObject({
        costCenterCode: "",
        onsiteContactPhone: "+886900000009",
        notes: "SIM mounted edited notes",
        pickupAddressId: record.pickup.addressId,
        dropoffAddressId: record.dropoff.addressId,
      });
      page.unmount();
      render(
        await h.ReviewBookingPage({
          searchParams: Promise.resolve(reviewParams),
        }),
      );
      const submit = await screen.findByTestId("enterprise-booking-submit");
      await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
      fireEvent.click(submit);
      await waitFor(() =>
        expect(h.router.push).toHaveBeenCalledWith(
          `/bookings/${record.bookingId}`,
        ),
      );
      const bookingCalls = h.calls.filter(
        ({ path }) => path === `/api/tenant/bookings/${record.bookingId}`,
      );
      expect(
        bookingCalls.map(({ method, wirePath }) => [method, wirePath]),
      ).toEqual([
        ["GET", `/control-plane-proxy/api/tenant/bookings/${record.bookingId}`],
        ["PUT", `/control-plane-proxy/api/tenant/bookings/${record.bookingId}`],
      ]);
      expect(bookingCalls[1]?.body).toEqual({
        onsiteContact: {
          name: record.onsiteContact?.name,
          phone: "+886900000009",
        },
        notes: "SIM mounted edited notes",
      });
      expect(h.router.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("allows an existing cost center to be explicitly cleared through the actual form and normal nullable command", async () => {
    const record = editRecord();
    const h = mountedEditHarness(record);
    const params = Object.fromEntries(
      serializeEnterpriseBookingDraft(
        createEnterpriseBookingDraftFromRecord(record),
      ),
    );
    const page = render(
      await h.NewBookingPage({
        searchParams: Promise.resolve({
          ...params,
          bookingId: record.bookingId,
        }),
      }),
    );
    fireEvent.change(formInput(page.container, "cost-center"), {
      target: { value: "" },
    });
    const reviewParams = actualReviewParams(page.container);
    expect(reviewParams.cc).toBe("");
    page.unmount();
    render(
      await h.ReviewBookingPage({
        searchParams: Promise.resolve(reviewParams),
      }),
    );
    const submit = await screen.findByTestId("enterprise-booking-submit");
    fireEvent.click(submit);
    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith(
        `/bookings/${record.bookingId}`,
      ),
    );
    expect(h.calls.find(({ method }) => method === "PUT")?.body).toEqual({
      costCenter: null,
    });
  });

  it("retains sole active cost-center preselection and the required field for a normal new booking", async () => {
    const h = mountedEditHarness(editRecord());
    const page = render(
      await h.NewBookingPage({
        searchParams: Promise.resolve({ entry: "self" }),
      }),
    );
    const control = formInput(page.container, "cost-center");
    expect(control.value).toBe("SIM-ONLY");
    expect(control.hasAttribute("required")).toBe(true);
    const link = page.container.querySelector<HTMLAnchorElement>(
      '[data-drt-intent="enterprise-review"]',
    );
    expect(link?.getAttribute("aria-disabled")).toBe("false");
    expect(actualReviewParams(page.container).cc).toBe("SIM-ONLY");
    fireEvent.change(formInput(page.container, "contact"), {
      target: { value: "" },
    });
    expect(link?.getAttribute("aria-disabled")).toBe("true");
  });
});
