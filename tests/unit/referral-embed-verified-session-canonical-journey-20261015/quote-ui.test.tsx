// @vitest-environment jsdom
import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
  type ReferralPassengerReceipt,
  type ReferralPassengerTripSnapshot,
} from "@drts/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { waitFor, fireEvent, getByRole } from "@testing-library/dom";
import { renderToString } from "react-dom/server";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
import {
  BookScreen,
  PassengerEmbed,
} from "../../../apps/referral-embed-web/components/passenger-embed";
import { LanguageProvider } from "../../../apps/referral-embed-web/lib/i18n";
import { PASSENGER_LOCALE_COOKIE } from "../../../apps/referral-embed-web/lib/locale-config";

const context = {
  entry: {
    entrySlug: "quote-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "handoff",
    recoveryScope: "opaque-scope-a",
    identityActive: true,
    partnerEntrySlug: "quote-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "book",
  requestedScreen: "book",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#123456",
  strings: {
    appName: "社區",
    displayName: "測試社區",
    supportPhone: "0800-000-000",
  },
  issues: [],
  fallbackEntry: null,
};
let root: Root | undefined;
afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.removeItem(PASSENGER_LOCALE_COOKIE);
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(node));
  return host;
}
function quote(
  quoteId = "quote-a",
  expiresAt = new Date(Date.now() + 900000).toISOString(),
) {
  return {
    quoteId,
    feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
    feeContentHash: PASSENGER_FEE_CONTENT_HASH,
    fixedPrice: false,
    isGuaranteed: false,
    estimatedMin: 265,
    estimatedMax: 340,
    expiresAt,
    quotedFareRuleVersion: "published-taxi-v1",
  };
}
function ok(data: unknown) {
  return Response.json({ ok: true, data });
}
function submit(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>(
    '[data-drt-operation="referral-create"]',
  )!;
}
function navigationPort() {
  const assign = vi.fn(),
    testWindow = Object.create(window);
  Object.defineProperty(testWindow, "location", {
    value: { assign },
    configurable: true,
  });
  vi.stubGlobal("window", testWindow);
  return assign;
}

it("keeps the mounted booking disabled while its authorized quote has not arrived", async () => {
  stubFeeAwareFetch(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(<BookScreen context={context as never} />));
  await waitFor(() =>
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="上車地點"]')?.disabled,
    ).toBe(false),
  );
  expect(
    host.querySelector<HTMLButtonElement>(
      '[data-drt-operation="referral-create"]',
    )?.disabled,
  ).toBe(true);
  expect(host.textContent).not.toContain("約 NT$ 290");
});

it("retains disabled booking controls in the actual SSR output", () => {
  const node = document.createElement("div");
  node.innerHTML = renderToString(<BookScreen context={context as never} />);
  expect(
    node.querySelector<HTMLButtonElement>(
      '[data-drt-operation="referral-create"]',
    )?.disabled,
  ).toBe(true);
});

it("ignores a late quote for the old route and only enables the matching current quote", async () => {
  const requests: Array<{ body: any; finish: (r: Response) => void }> = [];
  stubFeeAwareFetch(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise<Response>((finish) =>
          requests.push({ body: JSON.parse(init.body), finish }),
        ),
    ),
  );
  const host = mount(<BookScreen context={context as never} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.change(host.querySelector('[aria-label="上車地點"]')!, {
    target: { value: "changed real pickup" },
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  requests[0]!.finish(ok(quote("old-route")));
  await Promise.resolve();
  expect(submit(host).disabled).toBe(true);
  requests[1]!.finish(ok(quote("current-route")));
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  expect(requests[1]!.body.pickupAddress).toBe("changed real pickup");
});

it("preserves exact original key/body over a lost booking ACK, reload and original quote expiry", async () => {
  const commands: any[] = [],
    assign = navigationPort();
  stubFeeAwareFetch(
    "fetch",
    vi.fn(async (url, init) => {
      if (url === "/api/referral/quote") return ok(quote());
      commands.push({ body: JSON.parse(init.body), headers: init.headers });
      if (commands.length === 1)
        throw new Error("controlled ACK lost after commit");
      return ok({
        orderId: "same-order-a",
        quote: {
          quoteId: commands[0].body.quoteId,
          feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          feeContentHash: PASSENGER_FEE_CONTENT_HASH,
        },
        confirmedAt: "2026-10-20T02:00:00Z",
        feeConfirmation: {
          orderId: "same-order-a",
          quoteId: commands[0].body.quoteId,
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          feeConfirmedAt: "2026-10-20T02:00:01Z",
        },
      });
    }),
  );
  let host = mount(<BookScreen context={context as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  fireEvent.click(submit(host));
  await waitFor(() => expect(host.textContent).toContain("重送原叫車要求"));
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="上車地點"]')?.disabled,
  ).toBe(true);
  const key = "referral.booking.recovery.v1:opaque-scope-a";
  const original = JSON.parse(sessionStorage.getItem(key)!);
  expect(original.command).toEqual(commands[0].body);
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(<BookScreen context={context as never} />);
  await waitFor(() =>
    expect(submit(host).textContent).toContain("重送原叫車要求"),
  );
  fireEvent.click(submit(host));
  await waitFor(() => expect(assign).toHaveBeenCalledOnce());
  expect(commands[1]).toEqual(commands[0]);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(assign.mock.calls[0]![0]).toContain("orderId=same-order-a");
});

it("never sends another account's pending command and rejects malformed local recovery without granting authority", async () => {
  sessionStorage.setItem(
    "referral.booking.recovery.v1:opaque-scope-a",
    JSON.stringify({
      scope: "opaque-scope-a",
      command: {
        entrySlug: "quote-entry",
        quoteId: "old-subject-quote",
        idempotencyKey: "old-subject-key",
      },
      form: { pickupAddress: { untrusted: true } },
    }),
  );
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => ok(quote()),
  );
  stubFeeAwareFetch("fetch", fetch);
  const b = {
    ...context,
    session: { ...context.session, recoveryScope: "opaque-scope-b" },
  };
  const host = mount(<BookScreen context={b as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  expect(host.textContent).not.toContain("重送原叫車要求");
  expect(fetch.mock.calls.every(([url]) => url === "/api/referral/quote")).toBe(
    true,
  );
});

it("shows a recoverable Chinese error and keeps submit disabled when quote storage is unavailable", async () => {
  stubFeeAwareFetch(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: "FARE_QUOTE_UNAVAILABLE",
            message: "unsafe upstream details",
          },
        },
        { status: 503 },
      ),
    ),
  );
  const host = mount(<BookScreen context={context as never} />);
  await waitFor(() => expect(host.textContent).toContain("目前無法試算車資"));
  expect(submit(host).disabled).toBe(true);
  expect(host.textContent).not.toContain("FARE_QUOTE_");
  expect(host.textContent).not.toContain("unsafe upstream");
  expect(getByRole(host, "button", { name: "重新試算" })).toBeTruthy();
});

it.each(["account-switch", "unmount"])(
  "retires a late booking ACK after %s while keeping the original uncertain intent",
  async (mode) => {
    let finish!: (r: Response) => void;
    const assign = navigationPort(),
      calls: any[] = [];
    stubFeeAwareFetch(
      "fetch",
      vi.fn(async (url, init) => {
        if (url === "/api/referral/quote") return ok(quote());
        calls.push(JSON.parse(init.body));
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const host = mount(<BookScreen context={context as never} />);
    await confirmCurrentOrder(host);
    await waitFor(() => expect(submit(host).disabled).toBe(false));
    fireEvent.click(submit(host));
    await waitFor(() => expect(calls).toHaveLength(1));
    if (mode === "unmount") {
      flushSync(() => root!.unmount());
      root = undefined;
    } else
      flushSync(() =>
        root!.render(
          <BookScreen
            context={
              {
                ...context,
                entry: { ...context.entry, entrySlug: "other-entry" },
                session: {
                  ...context.session,
                  partnerEntrySlug: "other-entry",
                  recoveryScope: "other-subject-scope",
                },
              } as never
            }
          />,
        ),
      );
    finish(
      ok({
        orderId: "old-scope-order",
        quote: { quoteId: calls[0].quoteId },
        confirmedAt: "2026-10-20T02:00:00Z",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(assign).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        sessionStorage.getItem("referral.booking.recovery.v1:opaque-scope-a")!,
      ).command,
    ).toEqual(calls[0]);
    if (mode === "account-switch") {
      expect(host.textContent).not.toContain("old-scope-order");
      await confirmCurrentOrder(host);
      await waitFor(() => expect(submit(host).disabled).toBe(false));
    }
  },
);

function completedData(status = "completed") {
  return {
    selectedOrderId: "owned-order",
    activeTrip: null,
    receipt: null,
    history: {
      items: [
        {
          orderId: "owned-order",
          orderNo: "OWNED-1",
          status,
          pickupAddress: "Owned origin",
          dropoffAddress: "Owned destination",
          fareTotal: null,
          formattedFare: "實際車資待確認",
          createdAt: "2026-10-20T01:00:00Z",
          completedAt: status === "completed" ? "2026-10-20T02:00:00Z" : null,
        },
      ],
    },
  };
}

// Controlled server snapshots/transport only; provider, dictionaries, UI and
// ETA/status/nullable-data decisions remain the production implementations.
it.each(["zh", "en"] as const)(
  "localizes ordinary booking labels with the actual %s provider and retains SSR/quote readiness",
  async (locale) => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    stubFeeAwareFetch("fetch", fetch);
    const node = (
      <LanguageProvider defaultLocale={locale}>
        <BookScreen context={context as never} />
      </LanguageProvider>
    );
    const ssr = document.createElement("div");
    ssr.innerHTML = renderToString(node);
    expect(submit(ssr).disabled).toBe(true);
    const host = mount(node);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(submit(host).disabled).toBe(true);
    for (const rendered of [ssr, host]) {
      // Existing translated controls qualify the real provider independently.
      expect(
        getByRole(rendered, "button", {
          name: locale === "en" ? "Use current location" : "使用目前位置",
        }),
      ).toBeTruthy();
      expect(rendered.textContent).toContain(
        locale === "en" ? "Vehicle type" : "車種",
      );
      expect
        .soft(submit(rendered).textContent)
        .toContain(locale === "en" ? "Confirm ride request" : "確認叫車");
      expect
        .soft(
          [...rendered.querySelectorAll("input[aria-label]")].map((input) =>
            input.getAttribute("aria-label"),
          ),
        )
        .toEqual(
          expect.arrayContaining(
            locale === "en"
              ? [
                  "Pickup",
                  "Drop-off",
                  "Trip time",
                  "Passenger name",
                  "Contact phone",
                ]
              : ["上車地點", "下車地點", "用車時間", "乘客姓名", "聯絡電話"],
          ),
        );
      expect(
        rendered.querySelector<HTMLInputElement>('[name="pickupAddress"]')
          ?.value,
      ).toBe("新北市板橋區縣民大道二段7號");
    }
  },
);

it.each(["zh", "en"] as const)(
  "localizes the actual %s history heading and canonical completed/cancelled badges without changing links or fares",
  (locale) => {
    const data = completedData();
    data.history.items.push({
      ...completedData("cancelled").history.items[0]!,
      orderId: "cancelled-order",
      orderNo: "CANCELLED-1",
    });
    const host = mount(
      <LanguageProvider defaultLocale={locale}>
        <PassengerEmbed
          context={{ ...context, screen: "trips" } as never}
          liveData={data as never}
        />
      </LanguageProvider>,
    );
    expect
      .soft(host.textContent)
      .toContain(locale === "en" ? "My trips" : "我的行程");
    for (const [orderId, screen, label] of [
      ["owned-order", "completed", locale === "en" ? "Completed" : "已完成"],
      [
        "cancelled-order",
        "cancelled",
        locale === "en" ? "Cancelled" : "已取消",
      ],
    ]) {
      const card = [
        ...host.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ].find((a) => new URL(a.href).searchParams.get("orderId") === orderId)!;
      expect(new URL(card.href).searchParams.get("screen")).toBe(screen);
      expect.soft(card.textContent).toContain(label);
      expect(card.textContent).toContain("Owned origin → Owned destination");
      expect(card.textContent).toContain(
        screen === "completed" ? "實際車資待確認" : "—",
      );
    }
  },
);

const localeReceipt: ReferralPassengerReceipt = {
  orderId: "owned-order",
  orderNo: "OWNED-1",
  status: "completed",
  completedAt: "2026-10-20T02:00:00Z",
  passengerNameMasked: "乘○○",
  passengerPhoneMasked: "09*****820",
  driverName: "Controlled driver",
  plateNumber: "TEST-1234",
  vehicleType: "standard",
  pickupAddress: "Owned origin",
  dropoffAddress: "Owned destination",
  fareBase: 85,
  fareDistance: 180,
  fareTime: 0,
  totalFare: 265,
  formattedTotal: "NT$ 265",
  paymentChannel: "Controlled payment channel",
  downloadUrl: "/api/referral/receipt?orderId=owned-order&download=1",
};

it.each(["zh", "en"] as const)(
  "localizes the actual %s receipt actions/ordinary labels while retaining same-order masks and legal fields",
  (locale) => {
    const host = mount(
      <LanguageProvider defaultLocale={locale}>
        <PassengerEmbed
          context={{ ...context, screen: "receipt" } as never}
          liveData={{ ...completedData(), receipt: localeReceipt } as never}
        />
      </LanguageProvider>,
    );
    expect(
      getByRole(host, "link", {
        name: locale === "en" ? "Download PDF details" : "下載 PDF 明細",
      }),
    ).toBeTruthy();
    expect(
      getByRole(host, "button", {
        name: locale === "en" ? "Prepare PDF sharing" : "準備分享 PDF",
      }),
    ).toBeTruthy();
    expect(host.textContent).toContain(
      locale === "en" ? "Order OWNED-1" : "訂單 OWNED-1",
    );
    const download = host.querySelector<HTMLAnchorElement>(
      'a[href="/api/referral/receipt?orderId=owned-order&download=1"]',
    )!;
    expect
      .soft(download.textContent)
      .toContain(locale === "en" ? "Download receipt" : "下載收據");
    for (const label of locale === "en"
      ? ["Contact phone", "Driver / plate", "Vehicle type"]
      : ["聯絡電話", "司機 / 車牌", "車種"])
      expect.soft(host.textContent).toContain(label);
    for (const value of [
      "乘○○",
      "09*****820",
      "Controlled driver · TEST-1234",
      "NT$ 265",
      "本頁為乘車紀錄，非正式稅務憑證；付款及結算狀態以實際通知為準。",
    ])
      expect(host.textContent).toContain(value);
    expect(host.querySelector("[data-drt-receipt-e04]")?.textContent).toContain(
      "未提供",
    );
  },
);

it.each(["zh", "en"] as const)(
  "localizes actual %s completed receipt/rebook/rating names and preserves the submitted score/contact contract",
  async (locale) => {
    const fetch = vi.fn(async (_url, init) =>
      ok({
        ...JSON.parse(init.body),
        complaintCaseNo: "PAX-owned",
        submittedAt: "2026-10-20T02:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const host = mount(
      <LanguageProvider defaultLocale={locale}>
        <PassengerEmbed
          context={{ ...context, screen: "completed" } as never}
          liveData={completedData() as never}
        />
      </LanguageProvider>,
    );
    expect(
      getByRole(host, "button", {
        name:
          locale === "en"
            ? "Trip complaints and lost property"
            : "行程申訴與遺失物",
      }),
    ).toBeTruthy();
    const receipt = host.querySelector<HTMLAnchorElement>(
      '[data-drt-operation="referral-receipt"]',
    )!;
    expect
      .soft(receipt.textContent)
      .toContain(locale === "en" ? "View receipt" : "查看收據");
    expect(new URL(receipt.href).searchParams.get("orderId")).toBe(
      "owned-order",
    );
    expect
      .soft(host.textContent)
      .toContain(locale === "en" ? "Ride again" : "再叫一次");
    const stars = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[data-drt-operation="referral-rate"]',
      ),
    ];
    expect
      .soft(stars.map((button) => button.getAttribute("aria-label")))
      .toEqual(
        [1, 2, 3, 4, 5].map((n) =>
          locale === "en" ? `Rate ${n} stars` : `評分 ${n} 星`,
        ),
      );
    flushSync(() => fireEvent.click(stars[1]!));
    const contact = getByRole(host, "switch", {
      name: "需要客服聯絡",
    }) as HTMLInputElement;
    expect(contact.checked).toBe(true);
    flushSync(() => fireEvent.click(contact));
    flushSync(() =>
      fireEvent.click(getByRole(host, "button", { name: "送出評分" })),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      orderId: "owned-order",
      score: 2,
      contactRequested: false,
      idempotencyKey: expect.any(String),
    });
  },
);

it.each(["zh", "en"] as const)(
  "localizes the actual %s cancelled rebooking action without creating rating or receipt actions",
  (locale) => {
    const host = mount(
      <LanguageProvider defaultLocale={locale}>
        <PassengerEmbed
          context={{ ...context, screen: "cancelled" } as never}
          liveData={completedData("cancelled") as never}
        />
      </LanguageProvider>,
    );
    const rebook = [
      ...host.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ].find((a) => new URL(a.href).searchParams.get("screen") === "book")!;
    expect
      .soft(rebook.textContent)
      .toContain(locale === "en" ? "Request another ride" : "重新叫車");
    expect(
      host.querySelector('[data-drt-operation="referral-rate"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-drt-operation="referral-receipt"]'),
    ).toBeNull();
    expect(host.textContent).toContain("Owned origin → Owned destination");
  },
);

for (const locale of ["zh", "en"] as const) {
  it.each(["fresh", "zero", "unknown", "stale", "on_trip"] as const)(
    `localizes the actual ${locale} Trip ETA/plate card with %s data without inventing values`,
    (mode) => {
      const at = "2026-10-27T02:00:00Z";
      const trip: ReferralPassengerTripSnapshot = {
        orderId: "owned-order",
        orderNo: "OWNED-1",
        status: mode === "on_trip" ? "on_trip" : "assigned",
        statusCode: mode === "on_trip" ? "on_trip" : "assigned",
        etaMin: mode === "unknown" ? null : mode === "zero" ? 0 : 2,
        cancelWindowMin: 0,
        pickupAddress: "Owned origin",
        dropoffAddress: "Owned destination",
        driverName: "Controlled driver",
        driverPhoneMasked: "09*****123",
        plateNumber: mode === "fresh" ? null : "TEST-1234",
        vehicleType: "standard",
        estimatedFare: 265,
        createdAt: at,
        updatedAt: at,
        rated: false,
        cancellationWindow: {
          canCancel: false,
          cancelableUntil: null,
          asOf: at,
        },
        liveTracking:
          mode === "unknown"
            ? null
            : {
                assignmentId: "controlled-assignment",
                driverId: "controlled-driver",
                vehicleId: "controlled-vehicle",
                observedAt: at,
                locationFreshness: mode === "stale" ? "stale" : "fresh",
                location: null,
                pickupEta: {
                  minutes: mode === "zero" ? 0 : 2,
                  calculatedAt: at,
                  estimatedArrivalAt: at,
                },
                dropoffRoute: {
                  remainingDistanceMeters: 1000,
                  remainingDurationSeconds: 420,
                  generatedAt: at,
                  estimatedArrivalAt: at,
                  provider: "controlled-route",
                },
              },
      };
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const host = mount(
        <LanguageProvider defaultLocale={locale}>
          <PassengerEmbed
            context={{ ...context, screen: "trip" } as never}
            liveData={{
              activeTrip: { active: true, trip },
              selectedOrderId: trip.orderId,
              history: null,
              receipt: null,
            }}
          />
        </LanguageProvider>,
      );
      // Scope assertions to the existing driver/ETA card, not the separate
      // live-tracking panel, which already has translated pending/ETA controls.
      const name = [...host.querySelectorAll("div")].find(
        (element) => element.textContent === "Controlled driver",
      )!;
      const card = name.closest("section")!;
      expect(card.textContent).toContain(
        locale === "en" ? "Standard" : "標準車",
      );
      expect(host.textContent).toContain(
        mode === "on_trip"
          ? locale === "en"
            ? "Trip in progress"
            : "行程中"
          : locale === "en"
            ? "Vehicle assigned"
            : "已派車",
      );
      expect
        .soft(card.textContent)
        .toContain(
          mode === "fresh"
            ? locale === "en"
              ? "Standard · Awaiting update"
              : "標準車 · 待更新"
            : "TEST-1234",
        );
      const eta = name.parentElement!.parentElement!.lastElementChild!;
      expect
        .soft(eta.firstElementChild?.textContent)
        .toBe(
          mode === "unknown" || mode === "stale"
            ? locale === "en"
              ? "Awaiting update"
              : "待更新"
            : mode === "on_trip"
              ? "7"
              : mode === "zero"
                ? "0"
                : "2",
        );
      expect
        .soft(eta.lastElementChild?.textContent)
        .toBe(locale === "en" ? "min · estimated" : "分鐘 · 估計");
      expect(
        (
          getByRole(host, "button", {
            name: locale === "en" ? "Cancel trip" : "取消行程",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
}
it("uses a default-ON native low-rating switch, explicit opt-out and same-order CRM receipt", async () => {
  const fetch = vi.fn(async (_url, init) => {
    const c = JSON.parse(init.body);
    return ok({
      ...c,
      complaintCaseNo: "PAX-owned",
      submittedAt: "2026-10-20T02:00:00Z",
    });
  });
  stubFeeAwareFetch("fetch", fetch);
  const host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "評分 2 星" })),
  );
  const control = getByRole(host, "switch", {
    name: "需要客服聯絡",
  }) as HTMLInputElement;
  expect(control.checked).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  flushSync(() => fireEvent.click(control));
  expect(control.checked).toBe(false);
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "送出評分" })),
  );
  await waitFor(() => expect(host.textContent).toContain("PAX-owned"));
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
    orderId: "owned-order",
    score: 2,
    contactRequested: false,
  });
  expect(control.disabled).toBe(true);
  expect(host.textContent).not.toContain("社區月結");
});
it("keeps an uncertain rating's original payload/key across remount and disables changing its contact choice", async () => {
  const calls: any[] = [];
  stubFeeAwareFetch(
    "fetch",
    vi.fn(async (_url, init) => {
      const c = JSON.parse(init.body);
      calls.push(c);
      if (calls.length === 1) throw new Error("controlled lost ACK");
      return ok({
        ...c,
        complaintCaseNo: "PAX-original",
        submittedAt: "2026-10-20T02:00:00Z",
      });
    }),
  );
  let host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "評分 1 星" })),
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "送出評分" })),
  );
  await waitFor(() => expect(host.textContent).toContain("重送原評分"));
  expect(
    (getByRole(host, "switch", { name: "需要客服聯絡" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  await waitFor(() =>
    expect(getByRole(host, "button", { name: "重送原評分" })).toBeTruthy(),
  );
  fireEvent.click(getByRole(host, "button", { name: "重送原評分" }));
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(calls[1]).toEqual(calls[0]);
});
it("does not enable rating or fabricate a completed trip from a completed screen query", () => {
  const host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData("confirmed") as never}
    />,
  );
  expect(host.querySelector('[data-drt-operation="referral-rate"]')).toBeNull();
  expect(host.textContent).not.toContain("為這趟行程評分");
});

it.each(["changed-scope", "unmounted"])(
  "ignores a late consent bootstrap navigation for an obsolete form: %s",
  async (mode) => {
    let finish!: (r: Response) => void;
    const assign = navigationPort();
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/referral/session")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return ok(quote("current-scope-quote"));
    });
    stubFeeAwareFetch("fetch", fetch);
    const host = mount(
      <BookScreen
        context={
          {
            ...context,
            session: { ...context.session, identityActive: false },
          } as never
        }
      />,
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    if (mode === "changed-scope") {
      flushSync(() =>
        root!.render(
          <BookScreen
            context={
              {
                ...context,
                session: {
                  ...context.session,
                  recoveryScope: "new-authorized-owner",
                },
              } as never
            }
          />,
        ),
      );
      await confirmCurrentOrder(host);
      await waitFor(() => expect(submit(host).disabled).toBe(false));
    } else {
      flushSync(() => root!.unmount());
      root = undefined;
    }
    finish(
      Response.json({ ok: true, nextPath: "/embed/old-entry?state=consent" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(assign).not.toHaveBeenCalled();
    if (mode === "changed-scope") {
      await confirmCurrentOrder(host);
      expect(submit(host).disabled).toBe(false);
    }
  },
);

it("reloads returning bootstrap into its canonical public scope before any quote and recovers its original lost-ACK command", async () => {
  const assign = navigationPort();
  const commands: any[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/referral/session")
      return Response.json({
        ok: true,
        session: {
          identityActive: true,
          recoveryScope: context.session.recoveryScope,
        },
      });
    if (url === "/api/referral/quote") return ok(quote());
    const command = JSON.parse(String(init?.body));
    commands.push(command);
    if (commands.length === 1)
      throw new Error("controlled committed reply loss");
    return ok({
      orderId: "original-returning-order",
      quote: {
        quoteId: command.quoteId,
        feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
        feeContentHash: PASSENGER_FEE_CONTENT_HASH,
      },
      confirmedAt: "2026-10-20T02:00:00Z",
      feeConfirmation: {
        orderId: "original-returning-order",
        quoteId: command.quoteId,
        disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
        contentHash: PASSENGER_FEE_CONTENT_HASH,
        feeConfirmedAt: "2026-10-20T02:00:01Z",
      },
    });
  });
  stubFeeAwareFetch("fetch", fetch);
  let host = mount(
    <BookScreen context={{ ...context, session: null } as never} />,
  );
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(assign).toHaveBeenCalledTimes(1);
  expect(
    fetch.mock.calls.every(([url]) => url === "/api/referral/session"),
  ).toBe(true);
  expect(submit(host).disabled).toBe(true);
  expect(
    sessionStorage.getItem(
      "referral.booking.recovery.v1:unverified:quote-entry",
    ),
  ).toBeNull();
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(<BookScreen context={context as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() => expect(host.textContent).toContain("重送原叫車要求"));
  expect(
    sessionStorage.getItem(
      `referral.booking.recovery.v1:${context.session.recoveryScope}`,
    ),
  ).not.toBeNull();
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(<BookScreen context={context as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1]).toEqual(commands[0]);
});

it("preserves the original command and asks for revalidation when the actual session-required code returns", async () => {
  navigationPort();
  stubFeeAwareFetch(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/referral/quote"
        ? ok(quote())
        : Response.json(
            { ok: false, error: { code: "REFERRAL_SESSION_REQUIRED" } },
            { status: 401 },
          ),
    ),
  );
  const host = mount(<BookScreen context={context as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() =>
    expect(host.textContent).toContain("請重新驗證身分，再重送原叫車要求"),
  );
  expect(
    sessionStorage.getItem(
      `referral.booking.recovery.v1:${context.session.recoveryScope}`,
    ),
  ).not.toBeNull();
});

it.each([
  ["created", "trip"],
  ["assigned", "trip"],
  ["on_trip", "trip"],
  ["completed", "completed"],
  ["cancelled", "cancelled"],
  ["dispatch_failed", "cancelled"],
  ["dispatch_timeout", "cancelled"],
  ["no_supply", "cancelled"],
])(
  "resumes the actual %s history card through its correct owned-order screen",
  (status, screen) => {
    const host = mount(
      <PassengerEmbed
        context={{ ...context, screen: "trips" } as never}
        liveData={completedData(status) as never}
      />,
    );
    const card = [...host.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
      (a) => new URL(a.href).searchParams.get("orderId") === "owned-order",
    )!;
    let clicked: URL | undefined;
    card.addEventListener("click", (event) => {
      event.preventDefault();
      clicked = new URL(card.href);
    });
    fireEvent.click(card);
    expect(clicked?.searchParams.get("orderId")).toBe("owned-order");
    expect(clicked?.searchParams.get("screen")).toBe(screen);
    expect(
      host.querySelector('[data-drt-operation="referral-rate"]'),
    ).toBeNull();
  },
);

function stubFeeAwareFetch(_name: "fetch", port: unknown) {
  if (typeof port !== "function")
    throw new Error("controlled original transport required");
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/referral/fees")
        return Response.json({
          ok: true,
          data: {
            disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            acknowledgedAt: "2026-10-20T00:00:00Z",
          },
        });
      return Reflect.apply(port, undefined, [input, init]);
    },
  );
}
async function confirmCurrentOrder(host: HTMLElement) {
  await waitFor(() => {
    if (host.textContent?.includes("重送原叫車要求")) return;
    const checkbox = getByRole(host, "checkbox", {
      name: "我已確認費用與優惠說明",
    }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
  });
  const checkbox = host.querySelector<HTMLInputElement>(
    '[data-drt-operation="referral-fee-confirm"]',
  );
  if (checkbox && !checkbox.checked) fireEvent.click(checkbox);
}

it("retains the original request and asks for revalidation for canonical JWT_INVALID", async () => {
  const assign = navigationPort();
  const commands: Array<{ body: Record<string, unknown>; key: string | null }> =
    [];
  let quotes = 0;
  stubFeeAwareFetch(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/referral/quote") {
        quotes++;
        return ok(quote());
      }
      expect(url).toBe("/api/referral/booking");
      commands.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get("Idempotency-Key"),
      });
      if (commands.length === 1)
        throw new Error("controlled lost original ACK");
      if (commands.length === 2) {
        // Actual BootstrapAuthGuard code, preserved by the booking BFF.
        return Response.json(
          { ok: false, error: { code: "JWT_INVALID" } },
          { status: 401 },
        );
      }
      return ok({
        orderId: "same-original-reauth-order",
        quote: {
          quoteId: commands[0]!.body.quoteId,
          feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          feeContentHash: PASSENGER_FEE_CONTENT_HASH,
        },
        confirmedAt: "2026-10-29T02:00:00Z",
        feeConfirmation: {
          orderId: "same-original-reauth-order",
          quoteId: commands[0]!.body.quoteId,
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          feeConfirmedAt: "2026-10-29T02:00:01Z",
        },
      });
    }),
  );
  let host = mount(<BookScreen context={context as never} />);
  await confirmCurrentOrder(host);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() => expect(host.textContent).toContain("重送原叫車要求"));
  expect(commands).toHaveLength(1);
  const saved = JSON.parse(
    sessionStorage.getItem(
      `referral.booking.recovery.v1:${context.session.recoveryScope}`,
    )!,
  );
  expect(saved.command).toEqual(commands[0]!.body);
  expect(saved.command.idempotencyKey).toBe(commands[0]!.key);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() => expect(commands).toHaveLength(2));
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  expect(commands[1]).toEqual(commands[0]);
  expect(host.textContent).toContain("請重新驗證身分，再重送原叫車要求");
  expect(
    JSON.parse(
      sessionStorage.getItem(
        `referral.booking.recovery.v1:${context.session.recoveryScope}`,
      )!,
    ).command,
  ).toEqual(saved.command);

  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  // Controlled same-subject SSR context after the existing handoff succeeds.
  // This supplies no real login/grant and changes no canonical recovery scope.
  host = mount(
    <BookScreen
      context={
        {
          ...context,
          session: {
            ...context.session,
            handoffId: "revalidated-same-subject-handoff",
          },
        } as never
      }
    />,
  );
  await waitFor(() =>
    expect(submit(host).textContent).toContain("重送原叫車要求"),
  );
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  flushSync(() => fireEvent.click(submit(host)));
  await waitFor(() => expect(assign).toHaveBeenCalledOnce());
  expect(commands).toHaveLength(3);
  expect(commands[2]).toEqual(commands[0]);
  expect(quotes).toBe(1);
  expect(assign.mock.calls[0]![0]).toContain(
    "orderId=same-original-reauth-order",
  );
  expect(
    sessionStorage.getItem(
      `referral.booking.recovery.v1:${context.session.recoveryScope}`,
    ),
  ).toBeNull();
});
