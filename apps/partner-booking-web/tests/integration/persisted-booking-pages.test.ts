// Finite page + real BFF unit transport. Not hosted auth/HTTP/PG evidence.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmedPage from "@/app/[tenantSlug]/(authenticated)/confirmed/page";
import ReceiptPage from "@/app/[tenantSlug]/(authenticated)/receipt/page";
import TripsPage from "@/app/[tenantSlug]/(authenticated)/trips/page";
import { clearPartnerEntryAuthorityCacheForTests } from "@/lib/api-client";

vi.mock("@/lib/server-locale", () => ({ getServerLocale: async () => "en" }));
afterEach(() => {
  clearPartnerEntryAuthorityCacheForTests();
  vi.unstubAllGlobals();
});

type ReceiptWire = {
  orderId: string;
  bookingId: string | null;
  orderNo: string;
  orderStatus: string;
  quotedFare: { currency: string; amountMinor: number } | null;
  completion: {
    taskId: string;
    assignmentId: string;
    dispatchJobId: string;
    driverId: string;
    vehicleId: string;
    completedAt: string | null;
    actualFare: { currency: string; amountMinor: number } | null;
    actualFareBreakdown: {
      startMinor: number;
      distanceMinor: number;
      delayMinor: number;
      nightMinor: number;
    } | null;
    actualDistanceKm: number | null;
    actualDurationSec: number | null;
  } | null;
  payment: {
    availability: "available" | "not_recorded" | "unavailable";
    status: string | null;
    amount: { currency: string; amountMinor: number } | null;
  };
};

function completedReceipt(): ReceiptWire {
  return {
    orderId: "SIM-persisted-order",
    bookingId: "booking-SIM-persisted",
    orderNo: "SIM-receipt-order-no",
    orderStatus: "completed",
    quotedFare: { currency: "TWD", amountMinor: 4000 },
    completion: {
      taskId: "SIM-actual-completed-task",
      assignmentId: "SIM-actual-completed-assignment",
      dispatchJobId: "SIM-actual-job",
      driverId: "SIM-actual-driver",
      vehicleId: "SIM-actual-vehicle",
      completedAt: "2099-01-01T11:00:00Z",
      actualFare: { currency: "TWD", amountMinor: 5500 },
      actualFareBreakdown: {
        startMinor: 2000,
        distanceMinor: 3000,
        delayMinor: 500,
        nightMinor: 0,
      },
      actualDistanceKm: 12.5,
      actualDurationSec: 1200,
    },
    payment: {
      availability: "available",
      status: "captured",
      amount: { currency: "TWD", amountMinor: 6100 },
    },
  };
}

function transport(subtype = "travel_agency_transfer") {
  let status = "created";
  let mode: "rows" | "empty" | "empty-page" | "error" = "rows";
  const calls: string[] = [];
  const requestHeaders: { path: string; authorization: string | null }[] = [];
  let quotationMinor = 4500;
  let receiptErrorCode: string | null = null;
  let receipt: ReceiptWire = {
    ...completedReceipt(),
    orderStatus: "created",
    quotedFare: { currency: "TWD", amountMinor: 4500 },
    completion: null,
    payment: { availability: "not_recorded", status: null, amount: null },
  };
  const entry = {
    entrySlug: "sim-persisted",
    partnerId: "SIM-partner",
    partnerCode: "SIM",
    programId: "SIM-program",
    tenantId: "SIM-tenant",
    displayName: "SIM Program",
    partnerType: "travel_agency",
    programCode: "SIM",
    businessDispatchSubtype: subtype,
    eligibilityMode: "reference_required",
    authMode: "partner_api_key",
    status: "active",
    activeFlag: true,
    auditMetadata: {
      source: "synthetic-unit",
      requestId: null,
      createdBy: null,
      updatedBy: null,
    },
  };
  const details =
    subtype === "travel_agency_transfer"
      ? {
          subtype,
          groupCode: "SIM-actual-group",
          groupSize: 2,
          itineraryLink: "https://travel.example.test/SIM",
          rosterPassengers: ["SIM Alice", "SIM Bob"],
          meetingPoint: "SIM Meeting",
        }
      : subtype === "insurance_replacement_vehicle"
        ? {
            subtype,
            claimNumber: "SIM-actual-claim",
            policyNumber: "SIM-policy",
            claimReference: "SIM-reference",
            claimantName: "SIM Claimant",
            replacementStart: "2099-01-01T10:00:00Z",
            replacementEnd: "2099-01-02T10:00:00Z",
            replacementVehicleClass: "SIM business",
            caseHandler: "SIM Handler",
          }
        : undefined;
  const record = () => ({
    bookingId: "booking-SIM-persisted",
    orderId: "SIM-persisted-order",
    tenantId: entry.tenantId,
    partnerId: entry.partnerId,
    partnerProgramId: entry.programId,
    partnerEntrySlug: entry.entrySlug,
    businessDispatchSubtype: subtype,
    status,
    orderStatus: status,
    reservationWindowStart: "2099-01-01T10:00:00Z",
    reservationWindowEnd: "2099-01-01T11:00:00Z",
    pickup: { address: "SIM actual pickup" },
    dropoff: { address: "SIM actual dropoff" },
    passenger: { name: "SIM Persisted Rider", phone: "0900000000" },
    quotedFare: { currency: "TWD", amountMinor: quotationMinor },
    quotedFareSource: "platform_pricing_rule",
    ...(details
      ? { partnerBookingDetails: details }
      : { flightNo: "SIM-101", terminal: "T1", direction: "pickup" }),
  });
  const envelope = (data: unknown) =>
    Response.json({
      data,
      meta: { requestId: "SIM-read", timestamp: "2026-11-12T00:00:00Z" },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      requestHeaders.push({
        path: url.pathname,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      if (url.pathname === "/api/partner/entries/" + entry.entrySlug)
        return envelope(entry);
      if (url.pathname === "/api/partner/ingress/handoff")
        return envelope({
          accessToken: "SIM-unit-only-server-session",
          tokenType: "Bearer",
          expiresIn: "15m",
          partnerEntrySlug: entry.entrySlug,
          drtsPassengerId: "SIM-resident",
          identity: {
            actorType: "referral_passenger",
            actorId: "SIM-resident",
            realm: "partner",
            authMode: "jwt_bearer",
            roleFamilies: ["partner"],
            roles: ["referral_passenger"],
            scopes: ["partner:book"],
            tenantId: entry.tenantId,
            partnerId: entry.partnerId,
            partnerProgramId: entry.programId,
            partnerEntrySlug: entry.entrySlug,
          },
        });
      if (mode === "error")
        return Response.json(
          {
            error: {
              code: "AUTHORITY_UNAVAILABLE",
              message: "Synthetic transport failure",
            },
          },
          { status: 503 },
        );
      if (url.pathname === "/api/partner/orders/SIM-persisted-order/receipt") {
        if (receiptErrorCode)
          return Response.json(
            {
              error: {
                code: receiptErrorCode,
                message: "Synthetic receipt source failure",
              },
            },
            { status: 503 },
          );
        return envelope(receipt);
      }
      if (url.pathname === "/api/partner/bookings")
        return envelope({
          items: mode === "empty" || mode === "empty-page" ? [] : [record()],
          pagination: {
            page: mode === "empty-page" ? 2 : 1,
            pageSize: 20,
            totalItems: mode === "empty" ? 0 : 1,
            totalPages: mode === "empty" ? 0 : 1,
          },
        });
      if (
        url.pathname === "/api/partner/bookings/booking-SIM-persisted" ||
        url.pathname === "/api/partner/orders/SIM-persisted-order"
      )
        return envelope(record());
      throw new Error("Unexpected unit transport route " + url.pathname);
    }),
  );
  return {
    calls,
    requestHeaders,
    updateReceipt: (value: ReceiptWire) => {
      receipt = value;
    },
    updateQuotation: (value: number) => {
      quotationMinor = value;
    },
    failReceipt: (code: string) => {
      receiptErrorCode = code;
    },
    updateStatus: (value: string) => {
      status = value;
    },
    updateMode: (value: typeof mode) => {
      mode = value;
    },
  };
}

function args(query: Record<string, string> = {}) {
  // Intersection keeps the old real Page callable valid for baseline RED.
  return {
    params: Promise.resolve({ tenantSlug: "sim-persisted" }),
    searchParams: Promise.resolve({
      partnerUserRef: "SIM-existing-ref",
      ...query,
    }),
  };
}

describe("persisted partner booking pages", () => {
  it("reloads the same travel booking and current status through the actual page/BFF", async () => {
    const api = transport();
    const first = renderToStaticMarkup(
      await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(first).toContain("booking-SIM-persisted");
    expect(first).toContain("SIM-persisted-order");
    expect(first).toContain("SIM-actual-group");
    expect(first).toContain("SIM Alice");
    api.updateStatus("assigned");
    const reloaded = renderToStaticMarkup(
      await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(reloaded).toContain("assigned");
    expect(
      api.calls.filter(
        (route) => route === "/api/partner/orders/SIM-persisted-order",
      ),
    ).toHaveLength(2);
    expect(reloaded).not.toContain("SIM-unit-only-server-session");
  });

  it.each(["insurance_replacement_vehicle", "credit_card_airport_transfer"])(
    "shows a real quotation record for %s without inventing paid fare",
    async (subtype) => {
      transport(subtype);
      const html = renderToStaticMarkup(
        await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
      );
      expect(html).toContain("booking-SIM-persisted");
      expect(html).toContain("Quotation");
      expect(html).toContain("not confirmation of payment");
      expect(html).toContain(
        subtype === "insurance_replacement_vehicle"
          ? "SIM-actual-claim"
          : "SIM-101",
      );
    },
  );

  it("renders actual program rows, true empty state, and true read errors", async () => {
    const api = transport();
    const rows = renderToStaticMarkup(await TripsPage(args()));
    expect(rows).toContain("booking-SIM-persisted");
    expect(rows).toContain("SIM actual pickup");
    expect(rows).toContain("partnerUserRef=SIM-existing-ref");
    expect(rows).not.toContain("Yesterday 09:12");
    expect(rows).not.toContain("20% off after quota");
    api.updateMode("empty");
    const empty = renderToStaticMarkup(await TripsPage(args()));
    expect(empty).toContain("No bookings in this partner / program scope.");
    expect(empty).not.toContain("booking-SIM-persisted");
    api.updateMode("empty-page");
    const emptyPage = renderToStaticMarkup(
      await TripsPage(args({ page: "2" })),
    );
    expect(emptyPage).toContain(
      "No bookings on this page. Return to the first page.",
    );
    expect(emptyPage).not.toContain(
      "No bookings in this partner / program scope.",
    );
    expect(emptyPage).not.toContain("Page 2 of 1");
    expect(emptyPage).toContain(
      'href="/sim-persisted/trips?partnerUserRef=SIM-existing-ref&amp;page=1"',
    );
    api.updateMode("error");
    const failed = renderToStaticMarkup(await TripsPage(args()));
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain(
      "No bookings in this partner / program scope.",
    );
    expect(failed).not.toContain("booking-SIM-persisted");
  });

  it("does not render a demonstration confirmation without real ingress context", async () => {
    transport();
    const query = {
      params: Promise.resolve({ tenantSlug: "sim-persisted" }),
      searchParams: Promise.resolve({ bookingId: "booking-SIM-persisted" }),
    };
    const html = renderToStaticMarkup(await ConfirmedPage(query));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("SIM-persisted-order");
  });

  it.each([
    "travel_agency_transfer",
    "insurance_replacement_vehicle",
    "credit_card_airport_transfer",
  ])(
    "shows distinct quotation, completed-task fare and passenger ledger for %s",
    async (subtype) => {
      const api = transport(subtype);
      api.updateStatus("completed");
      api.updateQuotation(4000);
      api.updateReceipt(completedReceipt());
      const html = renderToStaticMarkup(
        await ReceiptPage(args({ bookingId: "booking-SIM-persisted" })),
      );
      expect(html).toContain("<h2>Quotation</h2><p>NT$40.00</p>");
      expect(html).toContain('data-testid="partner-actual-fare">NT$55.00</dd>');
      expect(html).toContain(
        'data-testid="partner-payment-amount">NT$61.00</dd>',
      );
      expect(html).toContain("SIM-actual-completed-task");
      expect(html).toContain('data-order-id="SIM-persisted-order"');
      expect(html).toContain('data-booking-id="booking-SIM-persisted"');
      expect(html).toContain("Starting fare");
      expect(html).toContain("Distance fare");
      expect(html).toContain("Delay fare");
      expect(html).toContain("Night fare");
      expect(html).toContain("12.5");
      expect(html).toContain("1200");
      expect(html).toContain("Passenger electronic payment record");
      expect(html).toContain("Passenger electronic payment captured");
      expect(html).toContain(
        "does not show partner invoices or program settlement",
      );
      expect(html).toContain("not confirmation of payment");
      expect(html).not.toContain("SIM-unit-only-server-session");
      const normalReads = api.requestHeaders.filter(
        ({ path }) =>
          path.startsWith("/api/partner/bookings/") ||
          path.startsWith("/api/partner/orders/"),
      );
      expect(normalReads.map(({ path }) => path)).toEqual([
        "/api/partner/bookings/booking-SIM-persisted",
        "/api/partner/orders/SIM-persisted-order",
        "/api/partner/orders/SIM-persisted-order/receipt",
      ]);
      expect(normalReads.map(({ authorization }) => authorization)).toEqual([
        "Bearer SIM-unit-only-server-session",
        "Bearer SIM-unit-only-server-session",
        "Bearer SIM-unit-only-server-session",
      ]);
    },
  );

  it("reloads the same receipt IDs and fresh task/payment values without reusing the quotation", async () => {
    const api = transport();
    api.updateStatus("completed");
    api.updateQuotation(4000);
    api.updateReceipt(completedReceipt());
    const first = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    const newer = completedReceipt();
    newer.completion!.actualFare = { currency: "TWD", amountMinor: 6600 };
    newer.payment.amount = { currency: "TWD", amountMinor: 6200 };
    api.updateReceipt(newer);
    api.updateQuotation(4100);
    const reloaded = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(first).toContain('data-testid="partner-actual-fare">NT$55.00</dd>');
    expect(reloaded).toContain("<h2>Quotation</h2><p>NT$41.00</p>");
    expect(reloaded).toContain(
      'data-testid="partner-actual-fare">NT$66.00</dd>',
    );
    expect(reloaded).toContain(
      'data-testid="partner-payment-amount">NT$62.00</dd>',
    );
    expect(reloaded).toContain("SIM-actual-completed-task");
    expect(reloaded).toContain('data-order-id="SIM-persisted-order"');
    expect(reloaded).toContain('data-booking-id="booking-SIM-persisted"');
    expect(reloaded).not.toContain("NT$55.00");
    expect(api.calls.filter((path) => path.endsWith("/receipt"))).toHaveLength(
      2,
    );
  });

  it.each([
    ["not_selected", "No passenger electronic payment selected"],
    ["authorized", "Passenger electronic payment authorized; not captured"],
    ["captured", "Passenger electronic payment captured"],
    ["failed", "Passenger electronic payment failed; verify its outcome"],
    ["refunded", "Passenger electronic payment refunded"],
    [
      "manual_recovery",
      "Passenger electronic payment requires manual confirmation",
    ],
  ])(
    "preserves the passenger ledger meaning for %s",
    async (status, expected) => {
      const api = transport();
      const receipt = completedReceipt();
      receipt.payment.status = status!;
      api.updateReceipt(receipt);
      const html = renderToStaticMarkup(
        await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
      );
      expect(html).toContain("<dd>" + expected + "</dd>");
      expect(html).toContain("Recorded transaction amount");
      expect(html).toContain(
        'data-testid="partner-payment-amount">NT$61.00</dd>',
      );
      if (status !== "captured")
        expect(html).not.toContain(
          "<dd>Passenger electronic payment captured</dd>",
        );
    },
  );

  it("keeps the quotation readable without inventing a completed task or actual fare", async () => {
    const api = transport();
    api.updateQuotation(4000);
    const receipt = completedReceipt();
    receipt.completion = null;
    receipt.payment = {
      availability: "not_recorded",
      status: null,
      amount: null,
    };
    api.updateReceipt(receipt);
    const html = renderToStaticMarkup(
      await ReceiptPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(html).toContain("<h2>Quotation</h2><p>NT$40.00</p>");
    expect(html).toContain("No matching completed trip has been provided.");
    expect(html).not.toContain('data-testid="partner-actual-fare"');
    expect(html).not.toContain("NT$0.00");
  });

  it("does not borrow either the quote or task fare when captured ledger amount is absent", async () => {
    const api = transport();
    api.updateQuotation(4000);
    const receipt = completedReceipt();
    receipt.completion!.actualFare = null;
    receipt.payment.amount = null;
    api.updateReceipt(receipt);
    const html = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(html).toContain(
      'data-testid="partner-actual-fare">Not provided</dd>',
    );
    expect(html).toContain("<dd>Passenger electronic payment captured</dd>");
    expect(html).toContain(
      'data-testid="partner-payment-amount">Not provided</dd>',
    );
    expect(html).toContain("<h2>Quotation</h2><p>NT$40.00</p>");
    expect(html).not.toContain("NT$55.00");
    expect(html).not.toContain("NT$61.00");
    expect(html).not.toContain("NT$0.00");
  });

  it("renders recorded zero task and passenger payment amounts as real zero values", async () => {
    const api = transport();
    const receipt = completedReceipt();
    receipt.completion!.actualFare = { currency: "TWD", amountMinor: 0 };
    receipt.completion!.actualFareBreakdown = {
      startMinor: 0,
      distanceMinor: 0,
      delayMinor: 0,
      nightMinor: 0,
    };
    receipt.completion!.actualDistanceKm = 0;
    receipt.completion!.actualDurationSec = 0;
    receipt.payment.amount = { currency: "TWD", amountMinor: 0 };
    api.updateReceipt(receipt);
    const html = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(html).toContain('data-testid="partner-actual-fare">NT$0.00</dd>');
    expect(html).toContain('data-testid="partner-payment-amount">NT$0.00</dd>');
    // Missing trip progress is separate from the recorded zero receipt facts.
    const receiptSections = html.match(
      /<section[^>]*data-testid="partner-(?:task-fare|passenger-payment)"[\s\S]*?<\/section>/g,
    );
    expect(receiptSections).toHaveLength(2);
    expect(receiptSections!.join("")).not.toContain("Not provided");
  });

  it.each([
    ["not_recorded", "No passenger electronic payment record was found."],
    ["unavailable", "The passenger electronic payment source is unavailable."],
  ] as const)(
    "distinguishes %s passenger source without declaring partner settlement unpaid",
    async (availability, expected) => {
      const api = transport();
      const receipt = completedReceipt();
      receipt.payment = { availability, status: null, amount: null };
      api.updateReceipt(receipt);
      const html = renderToStaticMarkup(
        await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
      );
      expect(html).toContain(expected);
      expect(html).toContain("does not mean the partner booking is unpaid");
      expect(html).not.toContain('data-testid="partner-payment-amount"');
      expect(html).not.toContain(
        "<dd>Passenger electronic payment captured</dd>",
      );
    },
  );

  it("shows a true receipt read error instead of converting a failed source to no payment", async () => {
    const api = transport();
    api.failReceipt("PARTNER_RECEIPT_CONTEXT_UNAVAILABLE");
    const html = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'data-read-error="PARTNER_RECEIPT_CONTEXT_UNAVAILABLE"',
    );
    expect(html).not.toContain(
      "No passenger electronic payment record was found.",
    );
    expect(html).not.toContain("SIM-persisted-order");
  });

  it.each(["orderId", "bookingId"] as const)(
    "rejects a receipt with a different %s before rendering any monetary data",
    async (field) => {
      const api = transport();
      const receipt = completedReceipt();
      receipt[field] = "SIM-other-booking";
      api.updateReceipt(receipt);
      const html = renderToStaticMarkup(
        await ReceiptPage(args({ bookingId: "booking-SIM-persisted" })),
      );
      expect(html).toContain(
        'data-read-error="PARTNER_BOOKING_READBACK_MISMATCH"',
      );
      expect(html).not.toContain("SIM-other-booking");
      expect(html).not.toContain('data-testid="partner-payment-receipt"');
    },
  );

  it("does not add receipt reads to normal confirmation or program history", async () => {
    const api = transport();
    await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" }));
    await TripsPage(args());
    expect(api.calls.filter((path) => path.endsWith("/receipt"))).toEqual([]);
    expect(
      api.calls.filter(
        (path) => path === "/api/partner/orders/SIM-persisted-order",
      ),
    ).toHaveLength(1);
    expect(
      api.calls.filter(
        (path) => path === "/api/partner/bookings/booking-SIM-persisted",
      ),
    ).toHaveLength(1);
  });
});

// Reuses the original real pages/BFF and original finite transport unchanged.
function progressPageTransport() {
  const api = transport();
  const previousFetch = globalThis.fetch;
  let current: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const response = await previousFetch(input, init);
      if (
        new URL(String(input)).pathname !==
          "/api/partner/orders/SIM-persisted-order" ||
        !current
      )
        return response;
      const envelope = (await response.json()) as {
        data: Record<string, unknown>;
        meta: unknown;
      };
      return Response.json({
        ...envelope,
        data: { ...envelope.data, progress: current },
      });
    }),
  );
  return {
    ...api,
    changeProgress(value: Record<string, unknown> | undefined) {
      current = value;
    },
  };
}

function pageProgress(status = "accepted") {
  return {
    orderId: "SIM-persisted-order",
    orderStatus: "driver_accepted",
    readAt: "2026-11-12T08:00:00Z",
    availability: "available",
    reason: null,
    currentTask: {
      taskId: "SIM-page-task",
      assignmentId: "SIM-page-assignment",
      dispatchJobId: "SIM-page-job",
      driverId: "SIM-page-driver",
      vehicleId: "SIM-page-vehicle",
      status,
      acceptedAt: "2026-11-12T07:50:00Z",
      departedAt: null,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
    },
    driver: {
      driverId: "SIM-page-driver",
      driverSurname: "陳",
      driverSurnameSource: "driver_profile_declared",
      driverSurnameProfileUpdatedAt: "2026-11-12T07:00:00Z",
    },
    vehicle: { vehicleId: "SIM-page-vehicle", plateNo: "SIM-PROGRESS-PLATE" },
    location: {
      status: "fresh",
      position: { lat: 25, lng: 121 } as { lat: number; lng: number } | null,
      recordedAt: "2026-11-12T08:00:00Z",
      updatedAt: "2026-11-12T08:00:00Z",
      accuracyM: 20,
    },
  };
}

describe("normal Partner same-order progress pages", () => {
  it("renders assigned driver/vehicle and refreshes actual stages through the original confirmation page", async () => {
    const api = progressPageTransport();
    api.changeProgress(pageProgress());
    const first = renderToStaticMarkup(
      await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(first).toContain('data-testid="partner-trip-progress"');
    expect(first).toContain('data-task-id="SIM-page-task"');
    expect(first).toContain("Driver accepted");
    expect(first).toContain("陳");
    expect(first).toContain("SIM-PROGRESS-PLATE");
    expect(first).toContain("A fresh sample matches this task and vehicle");
    const refresh = first.match(/href="([^"]+)">Update trip<\/a>/);
    expect(refresh).not.toBeNull();
    const url = new URL(
      refresh![1]!.replaceAll("&amp;", "&"),
      "https://unit.invalid",
    );
    expect(url.pathname).toBe("/sim-persisted/confirmed");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      partnerUserRef: "SIM-existing-ref",
      bookingId: "booking-SIM-persisted",
      orderId: "SIM-persisted-order",
    });
    for (const [status, label] of [
      ["enroute_pickup", "Driver travelling to pickup"],
      ["arrived_pickup", "Driver arrived at pickup"],
      ["on_trip", "Passenger on board"],
      ["completed", "Trip completed"],
    ]) {
      const progress = pageProgress(status);
      if (status === "completed")
        progress.location = {
          ...progress.location,
          status: "not_live",
          position: null,
        };
      api.changeProgress(progress);
      const next = renderToStaticMarkup(
        await ConfirmedPage(
          args({
            bookingId: "booking-SIM-persisted",
            orderId: "SIM-persisted-order",
          }),
        ),
      );
      expect(next).toContain(label);
      expect(next).toContain('data-order-id="SIM-persisted-order"');
      expect(next).not.toContain("SIM-unit-only-server-session");
    }
    expect(api.calls.filter((path) => path.endsWith("/receipt"))).toEqual([]);
    expect(
      api.calls.filter(
        (path) => path === "/api/partner/orders/SIM-persisted-order",
      ),
    ).toHaveLength(5);
  });

  it("keeps the actual receipt and quotation intact beside same-order progress", async () => {
    const api = progressPageTransport();
    api.updateReceipt(completedReceipt());
    api.changeProgress(pageProgress("completed"));
    const html = renderToStaticMarkup(
      await ReceiptPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(html).toContain("Trip completed");
    expect(html).toContain("SIM-PROGRESS-PLATE");
    expect(html).toContain("not confirmation of payment");
    expect(html).toContain('data-testid="partner-payment-receipt"');
    expect(html).toContain("55.00");
    expect(html).toContain("61.00");
    expect(api.calls.filter((path) => path.endsWith("/receipt"))).toHaveLength(
      1,
    );
  });

  it("shows an old API's absent progress as not provided without breaking a real booking", async () => {
    transport();
    const html = renderToStaticMarkup(
      await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(html).toContain("booking-SIM-persisted");
    expect(html).toContain("Trip progress is not provided");
    expect(html).not.toContain("<dd>Driver accepted</dd>");
    expect(html).not.toContain("SIM-PROGRESS-PLATE");
  });

  it("replaces the old assignment display on fresh read and never invents a missing GPS sample", async () => {
    const api = progressPageTransport();
    api.changeProgress(pageProgress());
    await ConfirmedPage(args({ orderId: "SIM-persisted-order" }));
    const changed = pageProgress();
    changed.driver.driverSurname = "林";
    changed.vehicle.plateNo = "SIM-NEW-PLATE";
    changed.currentTask.driverId = "SIM-new-driver";
    changed.currentTask.taskId = "SIM-new-task";
    changed.currentTask.vehicleId = "SIM-new-vehicle";
    changed.driver.driverId = "SIM-new-driver";
    changed.vehicle.vehicleId = "SIM-new-vehicle";
    changed.location = {
      ...changed.location,
      status: "context_mismatch",
      position: null,
    };
    api.changeProgress(changed);
    const html = renderToStaticMarkup(
      await ConfirmedPage(args({ orderId: "SIM-persisted-order" })),
    );
    expect(html).toContain('data-task-id="SIM-new-task"');
    expect(html).toContain("SIM-NEW-PLATE");
    expect(html).toContain("林");
    expect(html).not.toContain("SIM-PROGRESS-PLATE");
    expect(html).toContain("No GPS sample matches this task and vehicle");
    expect(html).not.toContain("A fresh sample matches this task and vehicle");
  });

  it("refuses a different order's progress instead of displaying it under the same booking", async () => {
    const api = progressPageTransport();
    api.changeProgress({ ...pageProgress(), orderId: "different-order" });
    const html = renderToStaticMarkup(
      await ConfirmedPage(args({ bookingId: "booking-SIM-persisted" })),
    );
    expect(html).toContain(
      'data-read-error="PARTNER_BOOKING_READBACK_MISMATCH"',
    );
    expect(html).not.toContain("SIM-PROGRESS-PLATE");
  });

  it("leaves channel history as a scoped list without per-item tracking requests", async () => {
    const api = progressPageTransport();
    api.changeProgress(pageProgress());
    const html = renderToStaticMarkup(await TripsPage(args()));
    expect(html).toContain("SIM-persisted-order");
    expect(
      api.calls.filter((path) => path.startsWith("/api/partner/orders/")),
    ).toEqual([]);
  });
});
