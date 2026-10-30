// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  CreateTenantBookingCommand,
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import * as contracts from "../../../packages/contracts/src/index";
import * as sharedApi from "../../../packages/api-client/src/index";
import * as uiTokens from "../../../packages/ui-tokens/src/index";
import * as uiWeb from "../../../packages/ui-web/src/index";
import type { EnterpriseBookingDraftForm } from "../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

// Executes the real async route, session verifier, form, draft helpers, Enterprise
// wrapper and shared SDK. Only cookies, navigation/Link and fetch are IO ports.
// API responses below are transport SIM: no Controller, SQL, browser or provider
// execution is claimed by this mounted React/jsdom unit.
const appRoot = resolve("apps/enterprise-dispatch-web");
const API_URL = "http://enterprise-directory-unit.invalid";
const TENANT_ID = "tenant-directory-existing";
const ACCESS_TOKEN = "directory-session-token";
const NOW = new Date("2026-10-29T08:00:00.000Z");
const stamp = "2026-10-29T07:00:00.000Z";

type DirectoryDraft = EnterpriseBookingDraftForm & {
  passengerId?: string;
  pickupAddressId?: string;
  dropoffAddressId?: string;
};
type SearchParams = Record<string, string | string[] | undefined>;
type ApiCall = {
  wirePath: string;
  path: string;
  method: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
};

const passengerOne: TenantPassengerRecord = {
  tenantId: TENANT_ID,
  passengerId: "passenger-one",
  fullName: "陳同名",
  employeeNo: "E-001",
  departmentName: "研發部",
  mobile: "0911111111",
  email: null,
  roles: ["employee"],
  activeFlag: true,
  metadata: {},
  createdAt: stamp,
  updatedAt: stamp,
};
const passengerTwo: TenantPassengerRecord = {
  ...passengerOne,
  passengerId: "passenger-two",
  employeeNo: "E-002",
  mobile: "0922222222",
};
const inactivePassenger: TenantPassengerRecord = {
  ...passengerOne,
  passengerId: "passenger-disabled",
  fullName: "停用員工",
  employeeNo: "E-OFF",
  activeFlag: false,
};
const pickupAddress: TenantAddressRecord = {
  tenantId: TENANT_ID,
  addressId: "address-headquarters",
  ownerPassengerId: null,
  addressName: "總公司",
  addressText: "新北市板橋區中山路一段10號",
  lat: 25.01,
  lng: 121.46,
  tags: ["office"],
  activeFlag: true,
  createdAt: stamp,
  updatedAt: stamp,
};
const dropoffAddress: TenantAddressRecord = {
  ...pickupAddress,
  addressId: "address-branch",
  addressName: "分公司",
  addressText: "新北市新莊區中正路20號",
  lat: null,
  lng: null,
};
const inactiveAddress: TenantAddressRecord = {
  ...pickupAddress,
  addressId: "address-disabled",
  addressName: "停用地址",
  addressText: "新北市板橋區舊址30號",
  activeFlag: false,
};
const costCenter: TenantCostCenterRecord = {
  tenantId: TENANT_ID,
  code: "RND42",
  name: "研發專案",
  description: null,
  ownerUserId: null,
  ownerName: null,
  activeFlag: true,
  disabledAt: null,
  disabledReason: null,
  createdAt: stamp,
  updatedAt: stamp,
};
const inactiveCostCenter: TenantCostCenterRecord = {
  ...costCenter,
  code: "OLD42",
  name: "已停用專案",
  activeFlag: false,
  disabledAt: stamp,
};

function harness(
  options: {
    session?: boolean;
    failDirectory?: boolean;
    emptyDirectory?: boolean;
  } = {},
) {
  const calls: ApiCall[] = [];
  const router = { push: vi.fn(), refresh: vi.fn() };
  const cookieMap = new Map<string, string>(
    options.session === false ? [] : [["drts_tenant_session", ACCESS_TOKEN]],
  );
  const fetchPort = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), API_URL);
      if (url.hostname === "metadata.google.internal") {
        return new Response("directory-upstream-identity-token");
      }
      const call: ApiCall = {
        wirePath: url.pathname,
        // jsdom retains the real browser runtime-config BFF prefix; the
        // server session verifier still uses its original DRTS_API_URL.
        path: url.pathname.replace(/^\/control-plane-proxy(?=\/)/, ""),
        method: init?.method ?? "GET",
        query: url.searchParams,
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      if (call.path === "/api/auth/session") {
        return Response.json({
          data: {
            active: true,
            identity: {
              realm: "tenant",
              tenant_id: TENANT_ID,
              actor_id: "existing-tenant-operator",
              scopes: ["tenant:read", "tenant:write"],
            },
          },
        });
      }
      const ok = (items: unknown[]) => Response.json({ data: { items } });
      if (call.path === "/api/tenant/passengers") {
        if (options.emptyDirectory) return ok([]);
        return ok([passengerOne, passengerTwo, inactivePassenger]);
      }
      if (call.path === "/api/tenant/addresses") {
        if (options.emptyDirectory) return ok([]);
        return ok([pickupAddress, dropoffAddress, inactiveAddress]);
      }
      if (call.path === "/api/tenant/cost-centers") {
        if (options.emptyDirectory) return ok([]);
        if (options.failDirectory) {
          return Response.json(
            {
              error: {
                code: "SIM_DIRECTORY_UNAVAILABLE",
                message: "Canonical directory read unavailable",
                retryable: false,
                traceId: "directory-read-failed",
              },
            },
            { status: 503 },
          );
        }
        // Deliberately return an inactive record as well: the real form's
        // record handling must preserve activeFlag display semantics.
        return ok([costCenter, inactiveCostCenter]);
      }
      if (call.path === "/api/tenant/bookings" && call.method === "POST") {
        return Response.json({
          data: {
            bookingId: "booking-selected-masters",
            orderId: "order-selected-masters",
            serviceBucket: "business_dispatch",
            businessDispatchSubtype: "enterprise_dispatch",
            dispatchSemantics: "reservation",
            status: "created",
          },
        });
      }
      throw new Error(
        `Unexpected directory unit IO: ${call.method} ${call.path}`,
      );
    },
  );
  vi.stubGlobal("fetch", fetchPort);

  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/api-client": sharedApi,
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "@drts/ui-web": uiWeb,
    "next/headers": {
      cookies: async () => ({
        get: (name: string) => {
          const value = cookieMap.get(name);
          return value === undefined ? undefined : { name, value };
        },
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
  // The accepted loader resolves files, not directory index modules. This
  // supplies the real barrel exports, rather than substituting a form mock.
  const bookingFormModule = load<{
    EnterpriseBookingForm: React.ComponentType<{
      initialDraft: DirectoryDraft;
      passengers: (string | TenantPassengerRecord)[];
      addresses: (string | TenantAddressRecord)[];
      costCenters: (string | TenantCostCenterRecord)[];
    }>;
  }>(resolve(appRoot, "components/booking-form/index.ts"));
  modules["@/components/booking-form"] = bookingFormModule;
  const { default: NewBookingPage } = load<{
    default: (props: {
      searchParams?: Promise<SearchParams>;
    }) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/bookings/new/page.tsx"));
  const draft = load<{
    parseEnterpriseBookingDraft: (
      params: SearchParams,
      locale: "zh",
      now?: Date,
    ) => DirectoryDraft;
    serializeEnterpriseBookingDraft: (draft: DirectoryDraft) => URLSearchParams;
    createEnterpriseBookingDraftFromRecord: (
      record: BookingRecord,
    ) => DirectoryDraft;
    buildEnterpriseBookingCommand: (
      draft: DirectoryDraft,
      now?: Date,
    ) => CreateTenantBookingCommand;
    buildEnterpriseBookingUpdateCommand: (
      draft: DirectoryDraft,
      now?: Date,
    ) => UpdateTenantBookingCommand;
  }>(resolve(appRoot, "lib/enterprise-booking-draft.ts"));
  const { submitEnterpriseBookingDraft } = load<{
    submitEnterpriseBookingDraft: (options: {
      draft: DirectoryDraft;
      tenantId: string;
      idempotencyKey: string;
      clickNow: Date;
      router: typeof router;
    }) => Promise<void>;
  }>(resolve(appRoot, "app/bookings/review/booking-submit-button.tsx"));

  const { enterpriseDispatchBookingRecord } = load<{
    enterpriseDispatchBookingRecord: BookingRecord;
  }>(resolve(appRoot, "tests/fixtures/dispatch-booking-fixture.ts"));

  async function mount(params: SearchParams = { entry: "other" }) {
    return render(
      await NewBookingPage({ searchParams: Promise.resolve(params) }),
    );
  }
  function mountDraft(initialDraft: DirectoryDraft) {
    return render(
      React.createElement(bookingFormModule.EnterpriseBookingForm, {
        initialDraft,
        passengers: [passengerOne, passengerTwo],
        addresses: [pickupAddress, dropoffAddress],
        costCenters: [costCenter],
      }),
    );
  }
  function reviewDraft(container: HTMLElement) {
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-drt-intent="enterprise-review"]',
    );
    if (!link) throw new Error("Actual form did not render the review link");
    const url = new URL(link.getAttribute("href") ?? "", API_URL);
    return draft.parseEnterpriseBookingDraft(
      Object.fromEntries(url.searchParams),
      "zh",
      NOW,
    );
  }
  return {
    calls,
    router,
    fixture: enterpriseDispatchBookingRecord,
    mount,
    mountDraft,
    reviewDraft,
    draft,
    submitEnterpriseBookingDraft,
  };
}

function input(container: HTMLElement, name: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `#enterprise-booking-${name}`,
  );
  if (!element) throw new Error(`Actual form missing ${name} input`);
  return element;
}

function chooseMasters(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: /陳同名.*E-001/ }));
  fireEvent.click(screen.getByRole("button", { name: /陳同名.*E-002/ }));
  fireEvent.focus(input(container, "pickup"));
  fireEvent.click(
    screen.getByRole("button", {
      name: /總公司.*新北市板橋區中山路一段10號/,
    }),
  );
  fireEvent.focus(input(container, "dropoff"));
  fireEvent.click(
    screen.getByRole("button", { name: /分公司.*新北市新莊區中正路20號/ }),
  );
  fireEvent.change(input(container, "cost-center"), {
    target: { value: costCenter.code },
  });
  fireEvent.change(input(container, "contact"), {
    target: { value: "0922222222" },
  });
}

describe("Enterprise normal booking reads the existing tenant master directory", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("DRTS_API_URL", API_URL);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://directory-audience.invalid");
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("real NewBookingPage verifies its session and reads all three SDK lists with original tenant and upstream headers, without preselecting a fixture cost center", async () => {
    const h = harness();
    const { container } = await h.mount();
    const directoryCalls = h.calls.filter((call) =>
      [
        "/api/tenant/passengers",
        "/api/tenant/addresses",
        "/api/tenant/cost-centers",
      ].includes(call.path),
    );
    expect(
      h.calls.filter((call) => call.path === "/api/auth/session"),
    ).toHaveLength(1);
    expect(directoryCalls.map((call) => call.path).sort()).toEqual([
      "/api/tenant/addresses",
      "/api/tenant/cost-centers",
      "/api/tenant/passengers",
    ]);
    for (const call of directoryCalls) {
      expect(call.wirePath).toBe(`/control-plane-proxy${call.path}`);
      expect(call.method).toBe("GET");
      expect(call.headers.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(call.headers.get("x-tenant-id")).toBe(TENANT_ID);
      expect(call.headers.get("x-serverless-authorization")).toBe(
        "Bearer directory-upstream-identity-token",
      );
      expect(call.headers.get("x-drts-google-id-token")).toBe(
        "directory-upstream-identity-token",
      );
    }
    expect(
      directoryCalls
        .find((call) => call.path.endsWith("cost-centers"))
        ?.query.get("activeOnly"),
    ).toBe("true");
    expect(input(container, "cost-center").value).toBe("");
    expect(h.reviewDraft(container).costCenterCode).toBe("");
    expect(h.reviewDraft(container).costCenterLabel).toBe("");
    expect(screen.getByRole("button", { name: /陳同名.*E-001/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /陳同名.*E-002/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /停用員工/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /停用地址/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /已停用專案/ })).toBeNull();
    expect(
      screen.queryByTestId("enterprise-booking-directory-unavailable"),
    ).toBeNull();
  });

  it("selects the second same-name employee and exact addresses/code through the mounted Page, review URL, parser and unchanged SDK create payload", async () => {
    const h = harness();
    const { container } = await h.mount();
    chooseMasters(container);
    const draft = h.reviewDraft(container);
    expect(draft).toMatchObject({
      passenger: passengerTwo.fullName,
      passengerId: passengerTwo.passengerId,
      pickup: pickupAddress.addressText,
      pickupAddressId: pickupAddress.addressId,
      dropoff: dropoffAddress.addressText,
      dropoffAddressId: dropoffAddress.addressId,
      costCenterCode: costCenter.code,
    });
    await h.submitEnterpriseBookingDraft({
      draft,
      tenantId: TENANT_ID,
      idempotencyKey: "same-master-selection-command",
      clickNow: NOW,
      router: h.router,
    });
    const posts = h.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.path).toBe("/api/tenant/bookings");
    expect(posts[0]?.wirePath).toBe("/control-plane-proxy/api/tenant/bookings");
    expect(posts[0]?.headers.get("idempotency-key")).toBe(
      "same-master-selection-command",
    );
    expect(posts[0]?.headers.get("x-tenant-id")).toBe(TENANT_ID);
    expect(posts[0]?.body).toMatchObject({
      passengerId: passengerTwo.passengerId,
      pickupAddressId: pickupAddress.addressId,
      dropoffAddressId: dropoffAddress.addressId,
      costCenter: costCenter.code,
      passenger: { name: passengerTwo.fullName },
      pickup: { address: pickupAddress.addressText },
      dropoff: { address: dropoffAddress.addressText },
    });
    expect(h.router.push).toHaveBeenCalledWith(
      expect.stringContaining("bookingId=booking-selected-masters"),
    );
    expect(h.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("clears the selected master IDs on manual name/address edits and self mode while preserving a custom placard", async () => {
    const h = harness();
    const { container } = await h.mount();
    chooseMasters(container);
    fireEvent.change(input(container, "placard"), {
      target: { value: "VIP 接待專用牌" },
    });
    fireEvent.change(input(container, "passenger"), {
      target: { value: "手動輸入乘客" },
    });
    fireEvent.change(input(container, "pickup"), {
      target: { value: "新北市板橋區手動上車40號" },
    });
    fireEvent.change(input(container, "dropoff"), {
      target: { value: "新北市新莊區手動下車50號" },
    });
    let draft = h.reviewDraft(container);
    expect(draft.passengerId).toBeFalsy();
    expect(draft.pickupAddressId).toBeFalsy();
    expect(draft.dropoffAddressId).toBeFalsy();
    expect(draft.placard).toBe("VIP 接待專用牌");
    fireEvent.click(screen.getByRole("button", { name: /陳同名.*E-002/ }));
    expect(h.reviewDraft(container).passengerId).toBe(passengerTwo.passengerId);
    const self = container.querySelector<HTMLInputElement>(
      "#enterprise-booking-passenger-mode-self",
    );
    if (!self) throw new Error("Actual form missing original self radio");
    fireEvent.click(self);
    draft = h.reviewDraft(container);
    expect(draft.passengerMode).toBe("self");
    expect(draft.passengerId).toBeFalsy();
    expect(draft.placard).toBe("VIP 接待專用牌");
    expect(
      h.draft.buildEnterpriseBookingCommand(draft, NOW).passengerId,
    ).toBeFalsy();
  });

  it("keeps record master IDs across edit serialization and both create/update commands while retaining original nullable clear fields", () => {
    const h = harness();
    const enterpriseDispatchBookingRecord = h.fixture;
    const record: BookingRecord = {
      ...enterpriseDispatchBookingRecord,
      bookingId: "booking-existing-directory",
      tenantId: TENANT_ID,
      passenger: {
        ...enterpriseDispatchBookingRecord.passenger,
        passengerId: passengerTwo.passengerId,
        name: passengerTwo.fullName,
      },
      pickup: {
        ...enterpriseDispatchBookingRecord.pickup,
        addressId: pickupAddress.addressId,
        address: pickupAddress.addressText,
      },
      dropoff: {
        ...enterpriseDispatchBookingRecord.dropoff,
        addressId: dropoffAddress.addressId,
        address: dropoffAddress.addressText,
      },
      costCenter: costCenter.code,
      reservationWindowStart: "2026-10-31T02:00:00.000Z",
      reservationWindowEnd: "2026-10-31T02:30:00.000Z",
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: null,
    };
    const fromRecord = h.draft.createEnterpriseBookingDraftFromRecord(record);
    const roundTrip = h.draft.parseEnterpriseBookingDraft(
      Object.fromEntries(h.draft.serializeEnterpriseBookingDraft(fromRecord)),
      "zh",
      NOW,
    );
    const refs = {
      passengerId: passengerTwo.passengerId,
      pickupAddressId: pickupAddress.addressId,
      dropoffAddressId: dropoffAddress.addressId,
    };
    expect(fromRecord).toMatchObject(refs);
    expect(roundTrip).toMatchObject(refs);
    expect(h.draft.buildEnterpriseBookingCommand(roundTrip, NOW)).toMatchObject(
      {
        ...refs,
        costCenter: costCenter.code,
      },
    );
    expect(
      h.draft.buildEnterpriseBookingUpdateCommand(roundTrip, NOW),
    ).toMatchObject({
      ...refs,
      costCenter: costCenter.code,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: null,
    });

    // Other-booking coordinator edits must preserve the selected passenger;
    // self-booking coordinator edits change the passenger itself and must clear
    // the original master ID, including the fromRecord edit entry point.
    const other = h.mountDraft(fromRecord);
    fireEvent.change(input(other.container, "booked-by"), {
      target: { value: "另一位代訂者" },
    });
    expect(h.reviewDraft(other.container).passengerId).toBe(
      passengerTwo.passengerId,
    );
    cleanup();
    const selfDraft = h.draft.createEnterpriseBookingDraftFromRecord({
      ...record,
      bookedBy: {
        name: record.passenger.name,
        email: "existing-self@example.invalid",
      },
    });
    expect(selfDraft.passengerMode).toBe("self");
    expect(selfDraft.passengerId).toBe(passengerTwo.passengerId);
    const self = h.mountDraft(selfDraft);
    fireEvent.change(input(self.container, "booked-by"), {
      target: { value: "本人更新姓名" },
    });
    const changedSelf = h.reviewDraft(self.container);
    expect(changedSelf.passenger).toBe("本人更新姓名");
    expect(changedSelf.passengerId).toBeFalsy();
    expect(
      h.draft.buildEnterpriseBookingUpdateCommand(changedSelf, NOW).passengerId,
    ).toBeFalsy();
  });

  it("keeps the normal form with an explicit unavailable notice when no session exists and does not read a catalogue or supply fixture options", async () => {
    const h = harness({ session: false });
    const { container } = await h.mount();
    expect(h.calls).toEqual([]);
    expect(
      screen.getByTestId("enterprise-booking-directory-unavailable")
        .textContent,
    ).toMatch(/\S/);
    expect(input(container, "pickup")).toBeTruthy();
    expect(input(container, "cost-center").value).toBe("");
    expect(screen.queryByRole("button", { name: /陳同名/ })).toBeNull();
    const codes = Array.from(
      container.querySelectorAll<HTMLOptionElement>(
        "#enterprise-booking-cost-center option",
      ),
      (option) => option.value,
    ).filter(Boolean);
    expect(codes).toEqual([]);
  });

  it("keeps all directory options empty after a canonical read fails, with the normal form and explicit notice rather than fixture or partial-success options", async () => {
    const h = harness({ failDirectory: true });
    const { container } = await h.mount();
    expect(h.calls.some((call) => call.path === "/api/auth/session")).toBe(
      true,
    );
    expect(
      h.calls.some((call) => call.path === "/api/tenant/cost-centers"),
    ).toBe(true);
    expect(
      screen.getByTestId("enterprise-booking-directory-unavailable")
        .textContent,
    ).toMatch(/\S/);
    expect(input(container, "pickup")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /陳同名/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /總公司/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /研發專案/ })).toBeNull();
    expect(input(container, "cost-center").value).toBe("");
    expect(h.reviewDraft(container).costCenterLabel).toBe("");
  });

  it("preserves the original unseeded-tenant free-text cost-center flow after three successful empty canonical lists, through the real form, review and SDK payload", async () => {
    const h = harness({ emptyDirectory: true });
    const { container } = await h.mount();
    expect(
      h.calls
        .filter((call) =>
          [
            "/api/tenant/passengers",
            "/api/tenant/addresses",
            "/api/tenant/cost-centers",
          ].includes(call.path),
        )
        .map((call) => call.path)
        .sort(),
    ).toEqual([
      "/api/tenant/addresses",
      "/api/tenant/cost-centers",
      "/api/tenant/passengers",
    ]);
    expect(
      screen.queryByTestId("enterprise-booking-directory-unavailable"),
    ).toBeNull();
    const costCenterControl = input(container, "cost-center");
    expect(costCenterControl.tagName).toBe("INPUT");
    expect(costCenterControl.value).toBe("");
    fireEvent.change(costCenterControl, { target: { value: "LEGACY-07" } });
    fireEvent.change(input(container, "passenger"), {
      target: { value: "既有未建目錄乘客" },
    });
    fireEvent.change(input(container, "pickup"), {
      target: { value: "新北市板橋區原上車處70號" },
    });
    fireEvent.change(input(container, "dropoff"), {
      target: { value: "新北市新莊區原下車處80號" },
    });
    fireEvent.change(input(container, "contact"), {
      target: { value: "0933333333" },
    });
    const draft = h.reviewDraft(container);
    expect(draft.costCenterCode).toBe("LEGACY-07");
    expect(draft.costCenterLabel).toBe("LEGACY-07");
    expect(draft.passengerId).toBeFalsy();
    expect(draft.pickupAddressId).toBeFalsy();
    expect(draft.dropoffAddressId).toBeFalsy();
    const reviewLink = container.querySelector<HTMLAnchorElement>(
      '[data-drt-intent="enterprise-review"]',
    );
    expect(reviewLink?.getAttribute("aria-disabled")).toBe("false");
    await h.submitEnterpriseBookingDraft({
      draft,
      tenantId: TENANT_ID,
      idempotencyKey: "original-unseeded-cost-center-command",
      clickNow: NOW,
      router: h.router,
    });
    const posts = h.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.wirePath).toBe("/control-plane-proxy/api/tenant/bookings");
    expect(posts[0]?.headers.get("idempotency-key")).toBe(
      "original-unseeded-cost-center-command",
    );
    expect(posts[0]?.body).toMatchObject({
      costCenter: "LEGACY-07",
      passenger: { name: "既有未建目錄乘客", phone: "0933333333" },
      pickup: { address: "新北市板橋區原上車處70號" },
      dropoff: { address: "新北市新莊區原下車處80號" },
    });
    expect(h.router.push).toHaveBeenCalledWith(
      expect.stringContaining("bookingId=booking-selected-masters"),
    );

    // The legacy empty-directory path must not replace the existing record
    // selector: populated tenants keep their catalogue code and master IDs.
    cleanup();
    const populated = harness();
    const populatedForm = await populated.mount();
    expect(input(populatedForm.container, "cost-center").tagName).toBe(
      "SELECT",
    );
    chooseMasters(populatedForm.container);
    expect(populated.reviewDraft(populatedForm.container)).toMatchObject({
      passengerId: passengerTwo.passengerId,
      pickupAddressId: pickupAddress.addressId,
      dropoffAddressId: dropoffAddress.addressId,
      costCenterCode: costCenter.code,
    });
  });
});
