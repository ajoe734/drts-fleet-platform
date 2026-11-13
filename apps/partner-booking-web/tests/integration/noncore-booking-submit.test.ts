/** @vitest-environment jsdom */
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
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { PartnerBookingForm } from "@/components/partner-booking-form";
import {
  createDefaultPartnerBookingDraft,
  type PartnerBookingDraftValues,
  type PartnerBookingSubmission,
} from "@/lib/partner-booking-form";
import { submitPartnerProgramBooking } from "@/lib/submit-partner-booking";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function draftFor(): PartnerBookingDraftValues {
  return {
    ...createDefaultPartnerBookingDraft("2099-06-05T08:00:00Z"),
    pickupAddress: "SIM Pickup",
    dropoffAddress: "SIM Dropoff",
    passengerName: "SIM Rider",
    passengerPhone: "0912000000",
    reservationWindowStart: "2099-06-05T10:00:00+08:00",
    reservationWindowEnd: "2099-06-05T11:00:00+08:00",
    guideName: "SIM Guide Contact",
    guidePhone: "0900000099",
    groupCode: "SIM-GROUP-20261111",
    groupSize: "2",
    itineraryLink: "https://travel.example.test/itinerary/SIM-GROUP",
    rosterPassengers: "SIM Tour Leader\nSIM Passenger",
    meetingPoint: "SIM meeting point",
    luggageCount: "2",
    notes: "External roster / policy facts are synthetic in this unit fixture.",
    claimNumber: "SIM-CLAIM-20261111",
    policyNumber: "SIM-POLICY-20261111",
    claimReference: "SIM-REFERENCE",
    claimantName: "SIM Insured Passenger",
    replacementStart: "2099-06-05T10:00:00+08:00",
    replacementEnd: "2099-06-06T10:00:00+08:00",
    replacementVehicleClass: "business_vehicle",
    caseHandler: "SIM Handler",
  };
}

function transport(
  subtype: "travel_agency_transfer" | "insurance_replacement_vehicle",
) {
  const entry = {
    entrySlug: "sim-" + subtype,
    displayName: "Synthetic noncore partner",
    partnerId: "SIM-partner",
    partnerCode: "SIM",
    partnerType: "bank_partner",
    programId: "SIM-program",
    programCode: "SIM-program",
    tenantId: "SIM-tenant",
    bankCode: "SIM",
    businessDispatchSubtype: subtype,
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    activeFlag: true,
    status: "active",
    entryHost: null,
    entryPath: null,
    themeAccent: null,
    brandingMetadata: null,
    eligibilityContract: null,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-11-11T00:00:00Z",
    updatedAt: "2026-11-11T00:00:00Z",
    auditMetadata: {
      source: "synthetic-unit",
      requestId: null,
      createdBy: null,
      updatedBy: null,
    },
  } as unknown as PartnerChannelEntryRecord;
  const calls: {
    path: string;
    body: Record<string, unknown> | null;
    headers: Headers;
  }[] = [];
  const commands: Record<string, unknown>[] = [];
  let readFailures = 0;
  let createFailures = 0;
  let eligibilityStatus = "eligible";
  let verificationCount = 0;
  let stopReadbackFault = false;
  let contactFault: "none" | "missing_booking" | "changed_order" = "none";
  let canonicalReadFlight: string | undefined;
  const orderId = "386a8769-074b-44a0-94b0-3425301563bb";
  const bookingId = "booking-actual-authority-result";
  const envelope = (data: unknown) =>
    Response.json({
      data,
      meta: { requestId: "SIM-request", timestamp: "2026-11-11T00:00:00Z" },
    });
  const record = (readPath = "") => ({
    bookingId,
    orderId,
    orderStatus: "created",
    status: "created",
    reservationWindowStart: commands.at(-1)?.reservationWindowStart,
    reservationWindowEnd: commands.at(-1)?.reservationWindowEnd,
    eligibilityVerificationId: commands.at(-1)?.eligibilityVerificationId,
    partnerBookingDetails: (() => {
      const details = structuredClone(
        commands.at(-1)?.partnerBookingDetails,
      ) as { routeStops?: Array<{ lat: number }> } | undefined;
      if (
        stopReadbackFault &&
        readPath === "/api/partner/bookings/" + bookingId &&
        details?.routeStops?.[0]
      )
        details.routeStops[0].lat += 0.1;
      return details;
    })(),
    onsiteContact:
      contactFault === "missing_booking" &&
      readPath === "/api/partner/bookings/" + bookingId
        ? null
        : contactFault === "changed_order" &&
            readPath === "/api/partner/orders/" + orderId
          ? { name: "SIM Different Guide", phone: "0900000001" }
          : (commands.at(-1)?.onsiteContact ?? null),
    flightNo: commands.at(-1)?.flightNo ?? null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      calls.push({ path, body, headers: new Headers(init?.headers) });
      if (path === "/api/partner/entries/" + entry.entrySlug)
        return envelope(entry);
      if (path === "/api/partner/ingress/handoff")
        return envelope({
          accessToken: "SIM-server-only-bearer",
          expiresIn: "15m",
          tokenType: "Bearer",
          partnerEntrySlug: entry.entrySlug,
          drtsPassengerId: "SIM-server-issued-passenger",
          identity: {
            actorType: "referral_passenger",
            actorId: "SIM-server-issued-passenger",
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
      if (path === "/api/partner/eligibility/verify") {
        verificationCount++;
        return envelope({
          eligibilityVerificationId: "SIM-verified-" + verificationCount,
          verificationStatus: eligibilityStatus,
        });
      }
      if (path === "/api/partner/bookings") {
        commands.push(body!);
        if (createFailures-- > 0)
          return Response.json(
            {
              error: {
                code: "SERVICE_PRODUCT_INACTIVE",
                message: "Synthetic inactive product",
              },
            },
            { status: 409 },
          );
        return envelope({ booking: record(), order: record() });
      }
      if (
        path === "/api/partner/bookings/" + bookingId ||
        path === "/api/partner/orders/" + orderId
      ) {
        if (readFailures-- > 0)
          return Response.json(
            {
              error: {
                code: "PARTNER_AUTHORITY_UNAVAILABLE",
                message: "Synthetic read failure",
              },
            },
            { status: 503 },
          );
        return envelope(
          canonicalReadFlight === undefined
            ? record(path)
            : { ...record(path), flightNo: canonicalReadFlight },
        );
      }
      throw new Error("Unexpected C032 transport " + path);
    }),
  );
  const submission: PartnerBookingSubmission = {
    draft: draftFor(),
    idempotencyKey: "SIM-stable-create-key",
    pickup: {
      address: "SIM Pickup",
      lat: 25.033,
      lng: 121.565,
      coordinateSource: "manual_pin",
      manualOverrideReason: "SIM unit location",
      surface: "partner_booking",
    },
    dropoff: {
      address: "SIM Dropoff",
      lat: 25.048,
      lng: 121.517,
      coordinateSource: "manual_pin",
      manualOverrideReason: "SIM unit location",
      surface: "partner_booking",
    },
    serviceability: null,
    providerState: {
      available: true,
      degraded: false,
      reasonCode: "available",
    },
  };
  const submit = (value = submission) =>
    submitPartnerProgramBooking({
      tenantSlug: entry.entrySlug,
      partnerUserRef: "SIM-caller-owned-reference",
      referenceToken: "SIM-external-reference",
      eligibilityVerificationId: null,
      submission: value,
      locale: "zh",
    });
  return {
    entry,
    submission,
    submit,
    calls,
    commands,
    bookingId,
    orderId,
    readFlightAs: (flightNo: string) => {
      canonicalReadFlight = flightNo;
    },
    corruptStopReadback: () => {
      stopReadbackFault = true;
    },
    setContactFault: (value: typeof contactFault) => {
      contactFault = value;
    },
    failRead: () => {
      readFailures = 1;
    },
    failCreate: () => {
      createFailures = 1;
    },
    manualReview: () => {
      eligibilityStatus = "manual_review";
    },
  };
}

describe("C032 normal partner create and readback", () => {
  it.each(["travel_agency_transfer", "insurance_replacement_vehicle"] as const)(
    "uses the issued session and actual booking/order GETs for %s",
    async (subtype) => {
      const f = transport(subtype);
      const result = await f.submit();
      expect(result).toMatchObject({
        ok: true,
        confirmation: { bookingId: f.bookingId, orderId: f.orderId },
      });
      expect(f.calls.map((call) => call.path)).toEqual([
        "/api/partner/entries/" + f.entry.entrySlug,
        "/api/partner/ingress/handoff",
        "/api/partner/eligibility/verify",
        "/api/partner/bookings",
        "/api/partner/bookings/" + f.bookingId,
        "/api/partner/orders/" + f.orderId,
      ]);
      const create = f.calls.find(
        (call) => call.path === "/api/partner/bookings",
      )!;
      expect(create.headers.get("Authorization")).toBe(
        "Bearer SIM-server-only-bearer",
      );
      expect(create.headers.get("x-tenant-id")).toBe("SIM-tenant");
      expect(create.body).toMatchObject({
        businessDispatchSubtype: subtype,
        idempotencyKey: "SIM-stable-create-key",
        eligibilityVerificationId: "SIM-verified-1",
        pickup: {
          lat: 25.033,
          coordinateSource: "manual_pin",
          manualOverrideReason: "SIM unit location",
        },
        partnerBookingDetails:
          subtype === "travel_agency_transfer"
            ? {
                groupCode: "SIM-GROUP-20261111",
                groupSize: 2,
                rosterPassengers: ["SIM Tour Leader", "SIM Passenger"],
              }
            : {
                claimNumber: "SIM-CLAIM-20261111",
                policyNumber: "SIM-POLICY-20261111",
                replacementStart: "2099-06-05T02:00:00.000Z",
              },
      });
      expect(create.body).not.toHaveProperty("flightNo");
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("Expected the real booking readback");
      expect(result.confirmation).not.toHaveProperty("flightNo");
      expect(JSON.stringify(result)).not.toContain("SIM-server-only-bearer");
      expect(JSON.stringify(result)).not.toContain(
        "SIM-caller-owned-reference",
      );
    },
  );

  it("does not present create or read failures as confirmed and retries the same payload/verification", async () => {
    const f = transport("travel_agency_transfer");
    f.failRead();
    const first = await f.submit();
    expect(first).toMatchObject({
      ok: false,
      errorCode: "PARTNER_AUTHORITY_UNAVAILABLE",
      eligibilityVerificationId: "SIM-verified-1",
    });
    expect(first).not.toHaveProperty("confirmation");
    if (first.ok || !first.eligibilityVerificationId)
      throw new Error("Expected the real read error and verification receipt");
    const second = await f.submit({
      ...f.submission,
      eligibilityVerificationId: first.eligibilityVerificationId,
    });
    expect(second).toMatchObject({
      ok: true,
      confirmation: { bookingId: f.bookingId, orderId: f.orderId },
    });
    expect(f.commands).toHaveLength(2);
    expect(f.commands[1]).toEqual(f.commands[0]);
    expect(
      f.calls.filter((call) => call.path.endsWith("/eligibility/verify")),
    ).toHaveLength(1);
    f.failCreate();
    expect(await f.submit()).toMatchObject({
      ok: false,
      errorCode: "SERVICE_PRODUCT_INACTIVE",
    });
  });

  it("requires the actual caller ingress reference instead of manufacturing an owner", async () => {
    const f = transport("travel_agency_transfer");
    const result = await submitPartnerProgramBooking({
      tenantSlug: f.entry.entrySlug,
      partnerUserRef: null,
      referenceToken: "SIM-reference",
      eligibilityVerificationId: null,
      submission: f.submission,
      locale: "zh",
    });
    expect(result).toMatchObject({
      ok: false,
      errorCode: "PARTNER_USER_REF_REQUIRED",
    });
    expect(
      f.calls.filter((call) => call.path.endsWith("/ingress/handoff")),
    ).toHaveLength(0);
    expect(f.commands).toHaveLength(0);
  });

  it("records the existing map manual-review state with the actual booking command", async () => {
    const f = transport("travel_agency_transfer");
    expect(
      await f.submit({
        ...f.submission,
        providerState: {
          available: false,
          degraded: false,
          reasonCode: "provider_unhealthy",
        },
      }),
    ).toMatchObject({ ok: true });
    expect(f.commands[0]).toMatchObject({
      mapFallbackReview: {
        reasonCode: "dispatch_manual_review_required",
        providerAvailable: false,
        providerDegraded: false,
        providerReasonCode: "provider_unhealthy",
      },
    });
  });

  it("keeps manual eligibility and outside-service-area decisions before booking", async () => {
    const f = transport("insurance_replacement_vehicle");
    f.manualReview();
    expect(await f.submit()).toMatchObject({
      ok: false,
      errorCode: "ELIGIBILITY_MANUAL_REVIEW",
    });
    expect(f.commands).toHaveLength(0);
    expect(
      await f.submit({
        ...f.submission,
        serviceability: {
          decision: "not_serviceable",
          serviceProductType: f.entry.businessDispatchSubtype,
          evaluatedAt: "2026-11-11T00:00:00Z",
          stops: [],
          serviceAreaCodes: [],
          geometryVersionRefs: [],
          reasonCodes: [],
          reasonMessages: [],
        },
      }),
    ).toMatchObject({ ok: false, errorCode: "PARTNER_BOOKING_INVALID" });
    expect(f.commands).toHaveLength(0);
  });
});

async function chooseActualMapLocations(container: HTMLElement) {
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

function independentSimTourPlan() {
  const vehicle = (id: string, name: string) => ({
    id,
    label: "SIM planned " + id,
    seats: 6,
    luggageCount: 0,
    rosterPassengers: [name, "SIM Second Traveller"],
  });
  const batch = (id: string) => ({
    id,
    label: "SIM departure " + id,
    windowStart: "2099-06-05T10:00:00+08:00",
    windowEnd: "2099-06-05T11:00:00+08:00",
    meetingPoint: "SIM declared meeting",
    vehicles: [
      vehicle("slot-A", "SIM First Traveller"),
      vehicle("slot-B", "SIM Selected Traveller"),
    ],
  });
  return {
    source: {
      kind: "sim",
      id: "SIM-independent-tour",
      revision: "7",
      label: "SIM external roster source",
    },
    groupCode: "SIM-SOURCE-GROUP",
    groupSize: 4,
    itineraryLink: "https://travel.example.test/SIM-source-plan",
    guideName: "SIM Distinct Guide",
    guidePhone: "0900000077",
    fareBasis: "included_in_tour",
    legs: [
      {
        id: "leg-out",
        label: "SIM Outbound",
        pickupAddress: "SIM planned pickup",
        dropoffAddress: "SIM planned destination",
        viaStops: [],
        signage: "",
        batches: [batch("batch-early")],
      },
      {
        id: "leg-return",
        label: "SIM Return",
        pickupAddress: "SIM planned return",
        dropoffAddress: "SIM planned end",
        viaStops: ["SIM Stop One", "SIM Stop Two"],
        signage: "SIM Group Sign",
        batches: [batch("batch-early"), batch("batch-late")],
      },
    ],
  };
}

describe("actual PartnerBookingForm", () => {
  it.each(["travel_agency_transfer", "insurance_replacement_vehicle"] as const)(
    "keeps the exact field name separate from validation and policy descriptions for %s",
    (subtype) => {
      vi.stubGlobal("React", React);
      const f = transport(subtype);
      render(
        React.createElement(PartnerBookingForm, {
          brand: BRAND_TEMPLATES.ACME,
          entry: f.entry,
          eligibilityVerificationId: null,
          initialDraft: {
            ...draftFor(),
            passengerName: "",
            passengerPhone: "",
          },
          submitBookingAction: vi.fn(f.submit),
        }),
      );
      const passenger = screen.queryByRole("textbox", {
        name: "乘客姓名",
      });
      expect(passenger).not.toBeNull();
      expect(screen.getByLabelText("乘客姓名", { exact: true })).toBe(
        passenger,
      );
      const description = (control: HTMLElement) =>
        (control.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
      expect(description(passenger!)).toBe("乘客姓名為必填。");
      expect(screen.getByRole("textbox", { name: "乘客電話" })).toBe(
        screen.getByLabelText("乘客電話", { exact: true }),
      );
      const start = screen.getByLabelText("預約開始時間", { exact: true });
      expect(description(start)).toBe(
        "預約結束時間必須晚於開始時間；各方案可再套更細的期間規則。",
      );
      expect(screen.getByRole("textbox", { name: "備註" })).toBe(
        screen.getByLabelText("備註", { exact: true }),
      );
      const labelId = passenger!.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)?.textContent).toBe("乘客姓名");
      expect(document.getElementById(labelId!)?.closest("label")?.htmlFor).toBe(
        passenger!.id,
      );
      fireEvent.change(passenger!, { target: { value: "SIM Named Rider" } });
      expect(passenger!.getAttribute("aria-labelledby")).toBe(labelId);
      expect(passenger!.hasAttribute("aria-describedby")).toBe(false);
      expect(screen.getByLabelText("乘客姓名", { exact: true })).toBe(
        passenger,
      );
    },
  );

  it("submits real map payload, preserves its command on retry and gives edited bookings a new key", async () => {
    vi.stubGlobal("React", React);
    vi.stubEnv("TZ", "Asia/Taipei");
    const f = transport("travel_agency_transfer");
    f.readFlightAs("SIM-JX802");
    f.failRead();
    const action = vi.fn(f.submit);
    const { container } = render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: f.entry,
        eligibilityVerificationId: null,
        initialDraft: draftFor(),
        submitBookingAction: action,
      }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/預約開始時間/) as HTMLInputElement).value,
      ).toBe("2099-06-05T10:00"),
    );
    const flight = screen.getByRole("textbox", {
      name: "航班號碼",
    }) as HTMLInputElement;
    expect(flight.required).toBe(false);
    fireEvent.change(flight, { target: { value: " sim-jx802 " } });
    await chooseActualMapLocations(container);
    const submit = screen.getByRole("button", {
      name: "建立預約",
    });
    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(submit);
    await screen.findByText(/PARTNER_AUTHORITY_UNAVAILABLE/);
    expect(screen.queryByTestId("partner-booking-confirmation")).toBeNull();
    fireEvent.click(submit);
    await screen.findByTestId("partner-booking-confirmation");
    expect(screen.getByTestId("partner-booking-id").textContent).toBe(
      f.bookingId,
    );
    expect(screen.getByTestId("partner-order-id").textContent).toBe(f.orderId);
    expect(f.commands[1]).toEqual(f.commands[0]);
    expect(f.commands[1]).toMatchObject({ flightNo: "sim-jx802" });
    expect(
      within(screen.getByTestId("partner-booking-confirmation")).getByText(
        "SIM-JX802",
      ),
    ).toBeTruthy();
    const firstSubmission = action.mock.calls[0]?.[0];
    expect(firstSubmission).toBeDefined();
    if (!firstSubmission)
      throw new Error("Expected the actual form submission");
    expect(firstSubmission.draft.reservationWindowStart).toBe(
      new Date(draftFor().reservationWindowStart).toISOString(),
    );
    expect(container.textContent).not.toContain("SIM-server-only-bearer");
    expect(screen.queryByText("表單驗證通過")).toBeNull();
    fireEvent.change(screen.getByLabelText("乘客姓名"), {
      target: { value: "SIM Edited Rider" },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(f.commands).toHaveLength(3));
    await screen.findByTestId("partner-booking-confirmation");
    expect(f.commands[2]?.idempotencyKey).not.toBe(
      f.commands[1]?.idempotencyKey,
    );
    expect(f.commands[2]?.passenger).toMatchObject({
      name: "SIM Edited Rider",
    });
  });

  it("retains validation-only airport behavior when no server action is supplied", async () => {
    vi.stubGlobal("React", React);
    const initialDraft = {
      ...draftFor(),
      cardTier: "SIM card",
      flightNo: "SIM-101",
      terminal: "T1",
      direction: "pickup" as const,
    };
    const { container } = render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: {
          businessDispatchSubtype: "credit_card_airport_transfer",
          eligibilityMode: "bank_card_inline",
          entrySlug: "acme",
          programCode: "SIM",
        },
        eligibilityVerificationId: "SIM-existing-eligibility",
        initialDraft,
      }),
    );
    await chooseActualMapLocations(container);
    fireEvent.click(screen.getByRole("button", { name: "驗證下單表單" }));
    await screen.findByText("表單驗證通過");
    expect(screen.queryByTestId("partner-booking-confirmation")).toBeNull();
  });

  it("maps a selected SIM plan leg, batch and vehicle roster through one normal create and readback", async () => {
    vi.stubGlobal("React", React);
    const f = transport("travel_agency_transfer");
    const plan = independentSimTourPlan();
    const action = vi.fn(f.submit);
    const { container } = render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: f.entry,
        eligibilityVerificationId: null,
        initialDraft: draftFor(),
        submitBookingAction: action,
      }),
    );
    expect(container.textContent).not.toContain("4 段 · 第 1 段");
    fireEvent.click(
      screen.getByText("匯入業者團務計畫（選用）", { exact: true }),
    );
    fireEvent.change(screen.getByLabelText("團務計畫文件（JSON）"), {
      target: { value: JSON.stringify(plan) },
    });
    fireEvent.click(screen.getByRole("button", { name: "套用團務計畫" }));
    fireEvent.change(screen.getByLabelText("選定接送段"), {
      target: { value: "leg-return" },
    });
    fireEvent.change(screen.getByLabelText("選定接送批次"), {
      target: { value: "batch-late" },
    });
    fireEvent.change(screen.getByLabelText("選定規劃車位"), {
      target: { value: "slot-B" },
    });
    expect(
      (screen.getByLabelText("導遊聯絡姓名") as HTMLInputElement).value,
    ).toBe("SIM Distinct Guide");
    expect((screen.getByLabelText("乘客姓名") as HTMLInputElement).value).toBe(
      "SIM Rider",
    );
    expect(
      (screen.getByLabelText("乘客名單 / roster") as HTMLTextAreaElement)
        .readOnly,
    ).toBe(true);
    expect((screen.getByLabelText("行李件數") as HTMLInputElement).value).toBe(
      "0",
    );
    await chooseActualMapLocations(container);
    const submit = screen.getByRole("button", {
      name: "建立預約",
    });
    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(submit);
    const confirmed = await screen.findByTestId("partner-booking-confirmation");
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0]?.partnerBookingDetails).toMatchObject({
      groupCode: "SIM-SOURCE-GROUP",
      groupSize: 2,
      guideName: "SIM Distinct Guide",
      guidePhone: "0900000077",
      rosterPassengers: ["SIM Selected Traveller", "SIM Second Traveller"],
      viaStops: ["SIM Stop One", "SIM Stop Two"],
      signage: "SIM Group Sign",
      planSourceKind: "sim",
      planSourceId: "SIM-independent-tour",
      planSourceRevision: "7",
      planGroupSize: 4,
      planLegId: "leg-return",
      planLegIndex: 2,
      planLegCount: 2,
      planBatchId: "batch-late",
      planBatchIndex: 2,
      planBatchCount: 2,
      planVehicleId: "slot-B",
      planVehicleLabel: "SIM planned slot-B",
      planVehicleSeats: 6,
      planVehicleCount: 2,
      planVehicleLabels: ["SIM planned slot-A", "SIM planned slot-B"],
      planPickupAddress: "SIM planned return",
      planDropoffAddress: "SIM planned end",
      planWindowStart: "2099-06-05T02:00:00.000Z",
      planWindowEnd: "2099-06-05T03:00:00.000Z",
      planFareBasis: "included_in_tour",
    });
    expect(f.commands[0]?.luggageCount).toBe(0);
    expect(f.commands[0]?.onsiteContact).toEqual({
      name: "SIM Distinct Guide",
      phone: "0900000077",
    });
    expect(f.commands[0]?.passenger).toMatchObject({
      name: "SIM Rider",
      phone: "0912000000",
    });
    expect(confirmed.textContent).toContain("SIM 外部團務計畫");
    expect(confirmed.textContent).toContain("SIM external roster source");
    expect(confirmed.textContent).toContain("SIM Selected Traveller");
    fireEvent.click(screen.getByRole("button", { name: "清除計畫並手動編輯" }));
    expect(
      (screen.getByLabelText("乘客名單 / roster") as HTMLTextAreaElement)
        .readOnly,
    ).toBe(false);
    expect(screen.queryByLabelText("選定接送段")).toBeNull();
    expect(f.commands).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("乘客名單 / roster"), {
      target: {
        value: Array.from(
          { length: 9 },
          (_, index) => "SIM Manual Traveller " + index,
        ).join("\n"),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "載入模擬團務計畫" }));
    expect(screen.getByLabelText("選定接送段")).toBeDefined();
    expect(
      (screen.getByLabelText("乘客名單 / roster") as HTMLTextAreaElement).value,
    ).toBe("SIM Traveller One\nSIM Traveller Two");
    expect(screen.getByText("SIM 外部團務計畫", { exact: true })).toBeDefined();
    expect(
      (screen.getByLabelText("乘客名單 / roster") as HTMLTextAreaElement)
        .readOnly,
    ).toBe(true);
    expect(f.commands).toHaveLength(1);
  });

  it("requires the distinct guide contact and does not treat an invalid source as an applied plan", async () => {
    const f = transport("travel_agency_transfer");
    expect(
      await f.submit({
        ...f.submission,
        draft: { ...f.submission.draft, guidePhone: "" },
      }),
    ).toMatchObject({ ok: false, errorCode: "PARTNER_BOOKING_INVALID" });
    expect(f.commands).toHaveLength(0);
    vi.stubGlobal("React", React);
    render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: f.entry,
        eligibilityVerificationId: null,
        initialDraft: draftFor(),
        submitBookingAction: f.submit,
      }),
    );
    fireEvent.click(
      screen.getByText("匯入業者團務計畫（選用）", { exact: true }),
    );
    fireEvent.change(screen.getByLabelText("團務計畫文件（JSON）"), {
      target: { value: JSON.stringify({ source: { kind: "sim" }, legs: [] }) },
    });
    fireEvent.click(screen.getByRole("button", { name: "套用團務計畫" }));
    expect(
      screen.getByText(
        "團務計畫文件或選定的接送段、批次及規劃車位不完整或無效。",
        { exact: true },
      ),
    ).toBeDefined();
    expect(screen.queryByLabelText("選定規劃車位")).toBeNull();
    expect(
      (screen.getByLabelText("團體 / 訂單參照") as HTMLInputElement).value,
    ).toBe("SIM-GROUP-20261111");
    expect(f.commands).toHaveLength(0);
  });
});

describe("normal tour source consistency and contact", () => {
  it.each(["vehicle_seats", "batch_group_total"] as const)(
    "does not apply a declared tour whose %s contradicts its roster",
    (fault) => {
      vi.stubGlobal("React", React);
      const f = transport("travel_agency_transfer");
      const plan = independentSimTourPlan();
      if (fault === "vehicle_seats") {
        const vehicle = plan.legs[0]?.batches[0]?.vehicles[0];
        if (!vehicle) throw new Error("Expected independent source allocation");
        vehicle.seats = 1;
      } else {
        // Each two-person roster fits its own six seats, but the batch totals four.
        plan.groupSize = 3;
      }
      render(
        React.createElement(PartnerBookingForm, {
          brand: BRAND_TEMPLATES.ACME,
          entry: f.entry,
          eligibilityVerificationId: null,
          initialDraft: draftFor(),
          submitBookingAction: f.submit,
        }),
      );
      fireEvent.click(
        screen.getByText("匯入業者團務計畫（選用）", { exact: true }),
      );
      fireEvent.change(screen.getByLabelText("團務計畫文件（JSON）"), {
        target: { value: JSON.stringify(plan) },
      });
      fireEvent.click(screen.getByRole("button", { name: "套用團務計畫" }));
      expect(
        screen.getByText(
          "團務計畫文件或選定的接送段、批次及規劃車位不完整或無效。",
          { exact: true },
        ),
      ).toBeDefined();
      expect(screen.queryByLabelText("選定規劃車位")).toBeNull();
      expect(f.commands).toHaveLength(0);
      // Partial source rosters are valid, and repeated passengers across legs are not added together.
      plan.groupSize = 10;
      const vehicle = plan.legs[0]?.batches[0]?.vehicles[0];
      if (!vehicle) throw new Error("Expected independent source allocation");
      vehicle.seats = 6;
      fireEvent.change(screen.getByLabelText("團務計畫文件（JSON）"), {
        target: { value: JSON.stringify(plan) },
      });
      fireEvent.click(screen.getByRole("button", { name: "套用團務計畫" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByLabelText("選定規劃車位")).toBeDefined();
      expect(f.commands).toHaveLength(0);
    },
  );

  it("requires travel luggage while accepting zero without inventing optional instructions", async () => {
    const f = transport("travel_agency_transfer");
    expect(
      await f.submit({
        ...f.submission,
        draft: { ...f.submission.draft, luggageCount: "" },
      }),
    ).toMatchObject({ ok: false, errorCode: "PARTNER_BOOKING_INVALID" });
    expect(f.commands).toHaveLength(0);
    expect(
      await f.submit({
        ...f.submission,
        draft: { ...f.submission.draft, luggageCount: "0" },
      }),
    ).toMatchObject({ ok: true });
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0]?.luggageCount).toBe(0);
    const details = f.commands[0]?.partnerBookingDetails;
    expect(details).not.toHaveProperty("viaStops");
    expect(details).not.toHaveProperty("signage");
    expect(f.commands[0]?.onsiteContact).toEqual({
      name: "SIM Guide Contact",
      phone: "0900000099",
    });
  });

  it.each(["missing_booking", "changed_order"] as const)(
    "does not confirm when normal %s contact readback loses the guide tuple",
    async (fault) => {
      const f = transport("travel_agency_transfer");
      f.setContactFault(fault);
      const result = await f.submit();
      expect(result).toMatchObject({
        ok: false,
        errorCode: "PARTNER_BOOKING_READBACK_MISMATCH",
      });
      expect(result).not.toHaveProperty("confirmation");
      expect(f.commands).toHaveLength(1);
      expect(f.calls.map((call) => call.path)).toContain(
        "/api/partner/bookings/" + f.bookingId,
      );
      expect(f.calls.map((call) => call.path)).toContain(
        "/api/partner/orders/" + f.orderId,
      );
    },
  );
});

describe("selected tour stop places through the normal booking action", () => {
  it("selects two ordered real map stops and retains both, including a repeated place, in canonical readbacks", async () => {
    vi.stubGlobal("React", React);
    const f = transport("travel_agency_transfer");
    const action = vi.fn(f.submit);
    const { container } = render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: f.entry,
        eligibilityVerificationId: null,
        initialDraft: draftFor(),
        submitBookingAction: action,
      }),
    );
    await chooseActualMapLocations(container);
    for (const index of [1, 2]) {
      fireEvent.click(screen.getByRole("button", { name: "新增停靠點" }));
      const submit = screen.getByRole("button", {
        name: "建立預約",
      }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      const picker = within(
        screen.getByRole("region", { name: "停靠地點 " + index }),
      );
      fireEvent.change(picker.getByRole("textbox", { name: "搜尋地址" }), {
        target: { value: "taipei main" },
      });
      fireEvent.click(picker.getByRole("button", { name: "搜尋" }));
      fireEvent.click(
        await picker.findByRole("button", { name: /Taipei Main Station/ }),
      );
      await waitFor(() => expect(submit.disabled).toBe(false));
    }
    fireEvent.click(screen.getByRole("button", { name: "建立預約" }));
    const confirmation = await screen.findByTestId(
      "partner-booking-confirmation",
    );
    expect(f.commands).toHaveLength(1);
    const selected = action.mock.calls[0]?.[0]?.routeStops;
    expect(selected).toHaveLength(2);
    expect(selected?.[0]).toMatchObject({
      address: "No. 3, Beiping West Road, Zhongzheng District, Taipei",
      lat: 25.047762,
      lng: 121.517017,
    });
    expect(selected?.[1]).toEqual(selected?.[0]);
    expect(f.commands[0]?.partnerBookingDetails).toMatchObject({
      routeStops: selected,
    });
    expect(confirmation.textContent).toContain(
      "No. 3, Beiping West Road, Zhongzheng District, Taipei",
    );
    expect(confirmation.textContent).not.toContain("[object Object]");
    expect(
      f.calls.some(
        (call) => call.path === "/api/partner/bookings/" + f.bookingId,
      ),
    ).toBe(true);
    expect(
      f.calls.some((call) => call.path === "/api/partner/orders/" + f.orderId),
    ).toBe(true);
  });

  it("rejects an unselected stop before create and refuses a changed nested canonical coordinate", async () => {
    const f = transport("travel_agency_transfer");
    expect(
      await f.submit({ ...f.submission, routeStops: [null] }),
    ).toMatchObject({ ok: false, errorCode: "PARTNER_BOOKING_INVALID" });
    expect(f.commands).toHaveLength(0);
    f.corruptStopReadback();
    const routeStops = [
      { address: "SIM selected stop", lat: 25.04, lng: 121.51 },
    ];
    expect(await f.submit({ ...f.submission, routeStops })).toMatchObject({
      ok: false,
      errorCode: "PARTNER_BOOKING_READBACK_MISMATCH",
    });
    expect(f.commands).toHaveLength(1);
  });
});

it.each(["manual", "cleared"] as const)(
  "keeps the tour fee arrangement through a normal %s booking without source or payment claims",
  async (mode) => {
    vi.stubGlobal("React", React);
    const f = transport("travel_agency_transfer");
    const { container } = render(
      React.createElement(PartnerBookingForm, {
        brand: BRAND_TEMPLATES.ACME,
        entry: f.entry,
        eligibilityVerificationId: null,
        initialDraft: draftFor(),
        submitBookingAction: f.submit,
      }),
    );
    if (mode === "cleared") {
      fireEvent.click(screen.getByRole("button", { name: "載入模擬團務計畫" }));
      fireEvent.click(
        screen.getByRole("button", { name: "清除計畫並手動編輯" }),
      );
    }
    expect(screen.queryByLabelText("選定接送段")).toBeNull();
    expect(
      screen.getByTestId("partner-tour-fee-arrangement").textContent,
    ).toContain("已含團費");
    expect(f.commands).toHaveLength(0);
    await chooseActualMapLocations(container);
    const submit = screen.getByRole("button", {
      name: "建立預約",
    }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    const confirmation = await screen.findByTestId(
      "partner-booking-confirmation",
    );
    expect(
      within(confirmation).getByTestId("partner-confirmed-tour-fee")
        .textContent,
    ).toContain("已含團費");
    expect(
      within(confirmation).getByTestId("partner-confirmed-tour-fee")
        .textContent,
    ).toContain("實際付款狀態請以付款紀錄為準");
    expect(screen.getByTestId("partner-booking-id").textContent).toBe(
      f.bookingId,
    );
    expect(screen.getByTestId("partner-order-id").textContent).toBe(f.orderId);
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0]?.partnerBookingDetails).not.toHaveProperty(
      "planSourceKind",
    );
    expect(f.commands[0]?.partnerBookingDetails).not.toHaveProperty(
      "planFareBasis",
    );
    expect(f.commands[0]).not.toHaveProperty("paymentStatus");
  },
);
