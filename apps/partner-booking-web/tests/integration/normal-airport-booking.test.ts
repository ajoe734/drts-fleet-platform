/** @vitest-environment jsdom */
// Real existing pages/components/BFF; API responses are synthetic unit transport.
// No hosted browser, normal authority admission or PostgreSQL proof is claimed.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import EligibilityPage from "@/app/[tenantSlug]/(public)/eligibility/page";
import BookPage from "@/app/[tenantSlug]/(authenticated)/book/page";
import ConfirmedPage from "@/app/[tenantSlug]/(authenticated)/confirmed/page";
import ReceiptPage from "@/app/[tenantSlug]/(authenticated)/receipt/page";
import TripsPage from "@/app/[tenantSlug]/(authenticated)/trips/page";
import { clearPartnerEntryAuthorityCacheForTests } from "@/lib/api-client";
import {
  createDefaultPartnerBookingDraft,
  type PartnerBookingSubmission,
} from "@/lib/partner-booking-form";
import { submitPartnerProgramBooking } from "@/lib/submit-partner-booking";

vi.mock("@/lib/server-locale", () => ({ getServerLocale: async () => "zh" }));
afterEach(() => {
  cleanup();
  clearPartnerEntryAuthorityCacheForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fixture(mode = "bank_card_inline") {
  vi.stubGlobal("React", React);
  const entry = {
    entrySlug: "sim-airport",
    displayName: "SIM Airport Program",
    partnerId: "SIM-airport-partner",
    partnerCode: "ACME",
    partnerType: "bank_partner",
    programId: "SIM-airport-program",
    programCode: "SIM-AIRPORT",
    tenantId: "SIM-airport-tenant",
    bankCode: "ACME",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: mode,
    status: "active",
    activeFlag: true,
    auditMetadata: {
      source: "synthetic-unit",
      requestId: null,
      createdBy: null,
      updatedBy: null,
    },
  };
  const calls: {
    path: string;
    body: Record<string, unknown> | null;
    headers: Headers;
  }[] = [];
  const commands: Record<string, unknown>[] = [];
  let verificationStatus = "eligible";
  let verificationFailure = false;
  let readFailures = 0;
  let wrongFlight = false;
  const verificationId = "elig-SIM-authority-airport-result";
  const orderId = "6ddfa143-f827-4c97-8d42-92533d31e334";
  const bookingId = "booking-SIM-airport-result";
  const record = () => {
    const command = commands.at(-1) ?? {};
    return {
      ...command,
      bookingId,
      orderId,
      orderNo: "SIM-AIRPORT-ORDER",
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      businessDispatchSubtype: entry.businessDispatchSubtype,
      status: "created",
      orderStatus: "created",
      flightNo: wrongFlight ? "SIM-OTHER-FLIGHT" : command.flightNo,
      quotedFare: null,
    };
  };
  const envelope = (data: unknown) =>
    Response.json({
      data,
      meta: {
        requestId: "SIM-airport-unit",
        timestamp: "2026-11-12T00:00:00Z",
      },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      calls.push({
        path: url.pathname,
        body,
        headers: new Headers(init?.headers),
      });
      if (url.pathname === "/api/partner/entries/" + entry.entrySlug)
        return envelope(entry);
      if (url.pathname === "/api/partner/ingress/handoff")
        return envelope({
          accessToken: "SIM-server-only-airport-session",
          tokenType: "Bearer",
          expiresIn: "15m",
          partnerEntrySlug: entry.entrySlug,
          drtsPassengerId: "SIM-airport-passenger",
          identity: {
            actorType: "referral_passenger",
            actorId: "SIM-airport-passenger",
            realm: "partner",
            authMode: "jwt_bearer",
            roleFamilies: ["partner"],
            roles: ["referral_passenger"],
            scopes: ["partner:book", "partner:eligibility:write"],
            tenantId: entry.tenantId,
            partnerId: entry.partnerId,
            partnerProgramId: entry.programId,
            partnerEntrySlug: entry.entrySlug,
          },
        });
      if (url.pathname === "/api/partner/eligibility/verify") {
        if (verificationFailure)
          return Response.json(
            {
              error: {
                code: "PARTNER_ELIGIBILITY_UNAVAILABLE",
                message: "SIM adapter unavailable",
              },
            },
            { status: 503 },
          );
        return envelope({
          eligibilityVerificationId: verificationId,
          verificationStatus,
          verificationReasonCode: "SIM-EXTERNAL-ISSUER-" + verificationStatus,
        });
      }
      if (url.pathname === "/api/partner/bookings" && init?.method === "POST") {
        commands.push(body!);
        return envelope({ booking: record(), order: record() });
      }
      if (url.pathname === "/api/partner/bookings")
        return envelope({
          items: [record()],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        });
      if (
        url.pathname === "/api/partner/bookings/" + bookingId ||
        url.pathname === "/api/partner/orders/" + orderId
      ) {
        if (readFailures-- > 0)
          return Response.json(
            {
              error: {
                code: "PARTNER_AUTHORITY_UNAVAILABLE",
                message: "SIM readback failure",
              },
            },
            { status: 503 },
          );
        return envelope(record());
      }
      throw new Error("Unexpected airport unit route " + url.pathname);
    }),
  );
  const draft = {
    ...createDefaultPartnerBookingDraft("2099-06-05T02:00:00Z"),
    pickupAddress: "SIM Home",
    dropoffAddress: "SIM Airport",
    reservationWindowStart: "2099-06-05T10:00:00+08:00",
    reservationWindowEnd: "2099-06-05T11:00:00+08:00",
    passengerName: "SIM Airport Rider",
    passengerPhone: "0900000000",
    cardTier: "SIM card program",
    flightNo: "SIM-101",
    terminal: "SIM T1",
    direction: "pickup" as const,
    luggageCount: "2",
  };
  const submission: PartnerBookingSubmission = {
    draft,
    idempotencyKey: "SIM-one-airport-submit-key",
    eligibilityVerificationId: verificationId,
    pickup: {
      address: draft.pickupAddress,
      lat: 25.033,
      lng: 121.565,
      coordinateSource: "manual_pin" as const,
      manualOverrideReason: "SIM manual location",
      surface: "partner_booking" as const,
    },
    dropoff: {
      address: draft.dropoffAddress,
      lat: 25.048,
      lng: 121.517,
      coordinateSource: "manual_pin" as const,
      manualOverrideReason: "SIM manual location",
      surface: "partner_booking" as const,
    },
    serviceability: null,
    providerState: {
      available: true,
      degraded: false,
      reasonCode: "available",
    },
  };
  const submit = (value: PartnerBookingSubmission = submission) =>
    submitPartnerProgramBooking({
      tenantSlug: entry.entrySlug,
      partnerUserRef: "SIM-existing-airport-owner",
      referenceToken: null,
      eligibilityVerificationId: null,
      submission: value,
      locale: "zh",
    });
  return {
    entry,
    calls,
    commands,
    draft,
    submission,
    submit,
    verificationId,
    orderId,
    bookingId,
    setVerification: (value: string) => {
      verificationStatus = value;
    },
    failVerification: () => {
      verificationFailure = true;
    },
    failRead: () => {
      readFailures = 1;
    },
    wrongFlight: () => {
      wrongFlight = true;
    },
  };
}

function args(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ tenantSlug: "sim-airport" }),
    searchParams: Promise.resolve({
      partnerUserRef: "SIM-existing-airport-owner",
      ...query,
    }),
  };
}

async function verifyThroughExistingPage(
  f: ReturnType<typeof fixture>,
  query: Record<string, string> = {},
) {
  render(await EligibilityPage(args(query)));
  if (f.entry.eligibilityMode === "bank_card_inline") {
    fireEvent.change(screen.getByLabelText("卡號末四碼"), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByLabelText("持卡人姓名"), {
      target: { value: "SIM Airport Rider" },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "確認資格" }));
}

async function chooseMapLocations(container: HTMLElement) {
  const pickers = container.querySelectorAll("[data-address-map-picker]");
  for (const [index, query] of ["taipei 101", "taipei main"].entries()) {
    const picker = within(pickers[index] as HTMLElement);
    fireEvent.change(picker.getByRole("textbox", { name: "搜尋地址" }), {
      target: { value: query },
    });
    fireEvent.click(picker.getByRole("button", { name: "搜尋" }));
    fireEvent.click(
      await picker.findByRole("button", {
        name: index === 0 ? /Taipei 101/ : /Taipei Main Station/,
      }),
    );
  }
}

describe("normal airport eligibility, booking and actual record routes", () => {
  it.each(["pickup", "dropoff"] as const)(
    "creates an airport %s through the existing helper and rereads the exact IDs and airport fields",
    async (direction) => {
      const f = fixture();
      const result = await f.submit({
        ...f.submission,
        draft: { ...f.draft, direction },
      });
      expect(result).toMatchObject({
        ok: true,
        confirmation: {
          bookingId: f.bookingId,
          orderId: f.orderId,
          eligibilityVerificationId: f.verificationId,
          businessDispatchSubtype: "credit_card_airport_transfer",
          direction,
          flightNo: "SIM-101",
          terminal: "SIM T1",
        },
      });
      expect(f.commands).toHaveLength(1);
      expect(f.commands[0]).toMatchObject({
        businessDispatchSubtype: "credit_card_airport_transfer",
        idempotencyKey: f.submission.idempotencyKey,
        eligibilityVerificationId: f.verificationId,
        pickup: f.submission.pickup,
        dropoff: f.submission.dropoff,
        reservationWindowStart: "2099-06-05T02:00:00.000Z",
        reservationWindowEnd: "2099-06-05T03:00:00.000Z",
      });
      expect(f.commands[0]).not.toHaveProperty("partnerBookingDetails");
      expect(f.calls.map((call) => call.path)).toContain(
        "/api/partner/bookings/" + f.bookingId,
      );
      expect(f.calls.map((call) => call.path)).toContain(
        "/api/partner/orders/" + f.orderId,
      );
    },
  );

  it("obtains real API verification from the existing eligibility page, then books and reloads the same confirmation, record and program history", async () => {
    const f = fixture();
    await verifyThroughExistingPage(f);
    const continuation = await screen.findByRole("link", {
      name: "繼續建立預約",
    });
    const href = continuation.getAttribute("href")!;
    const url = new URL(href, "https://unit.example.test");
    expect(url.searchParams.get("eligibilityVerificationId")).toBe(
      f.verificationId,
    );
    expect(url.searchParams.get("partnerUserRef")).toBe(
      "SIM-existing-airport-owner",
    );
    expect(href).not.toContain("SIM-server-only-airport-session");
    const verificationCall = f.calls.find(
      (call) => call.path === "/api/partner/eligibility/verify",
    );
    expect(verificationCall?.body).toMatchObject({
      entrySlug: f.entry.entrySlug,
      cardLast4: "1234",
      cardholderName: "SIM Airport Rider",
    });
    expect(verificationCall?.headers.get("authorization")).toBe(
      "Bearer SIM-server-only-airport-session",
    );
    cleanup();
    const query = Object.fromEntries(url.searchParams);
    const { container } = render(await BookPage(args(query)));
    for (const [label, value] of [
      ["預約開始時間", "2099-06-05T10:00"],
      ["預約結束時間", "2099-06-05T11:00"],
      ["乘客姓名", "SIM Airport Rider"],
      ["乘客電話", "0900000000"],
      ["卡別", "SIM card program"],
      ["航班號碼", "SIM-101"],
      ["航廈", "SIM T1"],
      ["接送方向", "pickup"],
    ]) {
      fireEvent.change(screen.getByLabelText(new RegExp("^" + label)), {
        target: { value },
      });
    }
    await chooseMapLocations(container);
    const submit = screen.getByRole("button", { name: "建立預約" });
    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(submit);
    await screen.findByTestId("partner-booking-confirmation");
    expect(screen.getByTestId("partner-booking-id").textContent).toBe(
      f.bookingId,
    );
    expect(screen.getByTestId("partner-order-id").textContent).toBe(f.orderId);
    expect(container.textContent).toContain("SIM-101");
    expect(container.textContent).not.toContain("表單驗證通過");
    const confirmationHref = screen
      .getByRole("link", { name: "預約確認" })
      .getAttribute("href")!;
    const confirmationQuery = Object.fromEntries(
      new URL(confirmationHref, "https://unit.example.test").searchParams,
    );
    cleanup();
    const confirmed = render(await ConfirmedPage(args(confirmationQuery)));
    expect(confirmed.container.textContent).toContain(f.bookingId);
    expect(confirmed.container.textContent).toContain(f.orderId);
    expect(confirmed.container.textContent).toContain("SIM-101");
    cleanup();
    const receipt = render(await ReceiptPage(args({ orderId: f.orderId })));
    expect(receipt.container.textContent).toContain("不代表已付款");
    expect(receipt.container.textContent).toContain(f.orderId);
    cleanup();
    const history = render(await TripsPage(args()));
    expect(history.container.textContent).toContain(f.bookingId);
    expect(history.container.textContent).not.toContain(
      "SIM-server-only-airport-session",
    );
    expect(f.commands).toHaveLength(1);
  });

  it.each(["manual_review", "ineligible"])(
    "keeps the real %s eligibility outcome and never creates a booking",
    async (status) => {
      const f = fixture();
      f.setVerification(status);
      await verifyThroughExistingPage(f);
      await waitFor(() =>
        expect(
          document
            .querySelector("[data-verification-status]")
            ?.getAttribute("data-verification-status"),
        ).toBe(status),
      );
      expect(screen.queryByRole("link", { name: "繼續建立預約" })).toBeNull();
      expect(f.commands).toHaveLength(0);
    },
  );

  it("uses an existing issuer reference only on the server and returns a public verified-ID link", async () => {
    const f = fixture("reference_required");
    await verifyThroughExistingPage(f, {
      referenceToken: "SIM-private-issuer-reference",
    });
    const link = await screen.findByRole("link", { name: "繼續建立預約" });
    expect(
      f.calls.find((call) => call.path === "/api/partner/eligibility/verify")
        ?.body,
    ).toMatchObject({
      referenceToken: "SIM-private-issuer-reference",
      entrySlug: f.entry.entrySlug,
    });
    expect(document.body.innerHTML).not.toContain(
      "SIM-private-issuer-reference",
    );
    expect(document.body.innerHTML).not.toContain(
      "SIM-server-only-airport-session",
    );
    expect(link.getAttribute("href")).toContain(
      encodeURIComponent(f.verificationId),
    );
  });

  it("preserves the original missing-verification booking gate and original identity in the eligibility link", async () => {
    const f = fixture();
    const { container } = render(await BookPage(args()));
    const link = screen.getByRole("link", { name: "前往資格驗證" });
    expect(link.getAttribute("href")).toBe(
      "/sim-airport/eligibility?partnerUserRef=SIM-existing-airport-owner",
    );
    const button = screen.getByRole("button", { name: "建立預約" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).not.toContain("預約已建立並完成讀回");
    const result = await f.submit({
      ...f.submission,
      eligibilityVerificationId: "",
    });
    expect(result).toMatchObject({
      ok: false,
      errorCode: "ELIGIBILITY_VERIFICATION_REQUIRED",
    });
    expect(f.commands).toHaveLength(0);
  });

  it("keeps the same command and key after a real readback failure instead of claiming a local success", async () => {
    const f = fixture();
    f.failRead();
    expect(await f.submit()).toMatchObject({
      ok: false,
      errorCode: "PARTNER_AUTHORITY_UNAVAILABLE",
      eligibilityVerificationId: f.verificationId,
    });
    expect(await f.submit()).toMatchObject({
      ok: true,
      confirmation: { orderId: f.orderId, bookingId: f.bookingId },
    });
    expect(f.commands).toHaveLength(2);
    expect(f.commands[1]).toEqual(f.commands[0]);
  });

  it("does not confirm a created order whose airport readback belongs to a different flight", async () => {
    const f = fixture();
    f.wrongFlight();
    expect(await f.submit()).toMatchObject({
      ok: false,
      errorCode: "PARTNER_BOOKING_READBACK_MISMATCH",
    });
  });

  it("shows the normal API eligibility failure and never invents an eligible record", async () => {
    const f = fixture();
    f.failVerification();
    await verifyThroughExistingPage(f);
    await screen.findByRole("alert");
    expect(
      screen.queryByTestId("partner-eligibility-verification-id"),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "繼續建立預約" })).toBeNull();
    expect(f.commands).toHaveLength(0);
  });
});
