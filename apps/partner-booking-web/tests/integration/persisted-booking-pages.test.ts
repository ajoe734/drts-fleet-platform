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

function transport(subtype = "travel_agency_transfer") {
  let status = "created";
  let mode: "rows" | "empty" | "empty-page" | "error" = "rows";
  const calls: string[] = [];
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
    quotedFare: { currency: "TWD", amountMinor: 4500 },
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
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
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
});
