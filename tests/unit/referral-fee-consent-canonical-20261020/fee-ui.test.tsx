// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, getByText, waitFor } from "@testing-library/dom";
import { renderToString } from "react-dom/server";
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
import {
  BookScreen,
  PassengerEmbed,
} from "../../../apps/referral-embed-web/components/passenger-embed";
import {
  PASSENGER_FEE_DISCLOSURE_VERSION as version,
  PASSENGER_FEE_CONTENT_HASH as contentHash,
  PASSENGER_FEE_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  type ReferralPassengerHistoryItem,
  type ReferralPassengerReceipt,
} from "@drts/contracts";
const context = {
  entry: {
    entrySlug: "fee-entry",
    displayName: "測試合作入口",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "fee-handoff",
    recoveryScope: "fee-scope",
    identityActive: true,
    partnerEntrySlug: "fee-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "book",
  requestedScreen: "book",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#123456",
  strings: {
    appName: "測試社區",
    displayName: "測試合作入口",
    supportPhone: "02-2944-0985",
  },
  issues: [],
  fallbackEntry: null,
};
let root: Root | undefined;
afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
function setup({
  already = false,
  ackReadbackMismatch = false,
  bookingLost = false,
  feeReadUnavailable = false,
  bookingAcknowledgement,
  home = false,
  quoteVehicleType,
}: {
  already?: boolean;
  ackReadbackMismatch?: boolean;
  bookingLost?: boolean;
  feeReadUnavailable?: boolean;
  bookingAcknowledgement?: Record<string, unknown>;
  home?: boolean;
  quoteVehicleType?: string;
} = {}) {
  let acknowledged = already,
    quoteNo = 0,
    postAck = false;
  const bookings: Record<string, unknown>[] = [],
    events: string[] = [];
  const fetch = vi.fn(
    async (url: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(url);
      events.push((init.method ?? "GET") + " " + path);
      const data = () => ({
        disclosureVersion: version,
        contentHash,
        acknowledgedAt: acknowledged ? "2026-10-20T00:00:00Z" : null,
      });
      if (path === "/api/referral/fees") {
        if (feeReadUnavailable)
          return Response.json(
            { ok: false, error: { code: "FEE_DISCLOSURE_UNAVAILABLE" } },
            { status: 503 },
          );
        if (init.method === "POST") {
          acknowledged = true;
          postAck = true;
          return Response.json({ ok: true, data: data() });
        }
        return Response.json({
          ok: true,
          data:
            ackReadbackMismatch && postAck
              ? { ...data(), acknowledgedAt: "2026-10-20T00:01:00Z" }
              : data(),
        });
      }
      if (path === "/api/referral/quote") {
        const input = JSON.parse(String(init.body));
        return Response.json({
          ok: true,
          data: {
            ...input,
            vehicleType: quoteVehicleType ?? input.vehicleType,
            quoteId: "fee-quote-" + ++quoteNo,
            feeDisclosureVersion: version,
            feeContentHash: contentHash,
            quotedFareRuleVersion: "published-taxi-v1",
            fixedPrice: false,
            isGuaranteed: false,
            estimatedMin: 300,
            estimatedMax: 400,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            requestedScheduledAt: input.scheduledAt ?? null,
          },
        });
      }
      if (path === "/api/referral/booking") {
        const command = JSON.parse(String(init.body));
        bookings.push(command);
        if (bookingLost)
          throw new Error("controlled original ACK transport loss");
        return Response.json({
          ok: true,
          data: bookingAcknowledgement ?? {
            orderId: "own-fee-order",
            quote: {
              quoteId: command.quoteId,
              feeDisclosureVersion: command.feeDisclosureVersion,
              feeContentHash: contentHash,
            },
            confirmedAt: "2026-10-20T00:00:00Z",
            feeConfirmation: {
              orderId: "own-fee-order",
              quoteId: command.quoteId,
              disclosureVersion: command.feeDisclosureVersion,
              contentHash,
              feeConfirmedAt: "2026-10-20T00:00:01Z",
            },
          },
        });
      }
      throw new Error("unexpected controlled UI transport");
    },
  );
  vi.stubGlobal("fetch", fetch);
  const assign = vi.fn(),
    testWindow = Object.create(window);
  Object.defineProperty(testWindow, "location", {
    value: { assign },
    configurable: true,
  });
  vi.stubGlobal("window", testWindow);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      home ? (
        <PassengerEmbed
          context={{ ...context, requestedScreen: null } as never}
        />
      ) : (
        <BookScreen context={context as never} />
      ),
    ),
  );
  return { host, fetch, bookings, events, assign };
}
function create(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>(
    '[data-drt-operation="referral-create"]',
  )!;
}
async function enterRoute(host: HTMLElement) {
  fireEvent.change(getByRole(host, "textbox", { name: "上車地點" }), {
    target: { name: "pickupAddress", value: "合成上車地址" },
  });
  fireEvent.change(getByRole(host, "textbox", { name: "下車地點" }), {
    target: { name: "dropoffAddress", value: "合成下車地址" },
  });
  await waitFor(() =>
    expect(
      getByRole(host, "checkbox", { name: "我已確認費用與優惠說明" }),
    ).toBeTruthy(),
  );
}
it("SSR starts unconfirmed and cannot book or invent a canonical agreement", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(<BookScreen context={context as never} />);
  expect(create(host).disabled).toBe(true);
  expect(host.textContent).toContain("費用告知");
});
it("shows eight exact first-use rows then requires genuine per-order checkbox after canonical readback", async () => {
  const s = setup();
  const agree = await waitFor(() =>
    getByRole(s.host, "button", { name: "我已閱讀並同意" }),
  );
  await waitFor(() =>
    expect((agree as HTMLButtonElement).disabled).toBe(false),
  );
  for (const [label, value] of PASSENGER_FEE_ROWS) {
    expect(s.host.textContent).toContain(label);
    expect(s.host.textContent).toContain(value);
  }
  expect(s.events.some((e) => e.includes("/quote"))).toBe(false);
  fireEvent.click(agree);
  await enterRoute(s.host);
  const check = getByRole(s.host, "checkbox", {
    name: "我已確認費用與優惠說明",
  }) as HTMLInputElement;
  expect(check.checked).toBe(false);
  expect(create(s.host).disabled).toBe(true);
  fireEvent.click(create(s.host));
  expect(s.bookings).toHaveLength(0);
  fireEvent.click(check);
  await waitFor(() => expect(create(s.host).disabled).toBe(false));
  fireEvent.click(create(s.host));
  await waitFor(() => expect(s.assign).toHaveBeenCalled());
  expect(s.bookings).toHaveLength(1);
  expect(s.bookings[0]).toMatchObject({
    feeConfirmed: true,
    feeDisclosureVersion: version,
  });
  expect(s.bookings[0]).not.toHaveProperty("feeConfirmedAt");
  expect(s.events.filter((e) => e === "POST /api/referral/fees")).toHaveLength(
    1,
  );
});
it("does not accept a mismatched acknowledgement readback", async () => {
  const s = setup({ ackReadbackMismatch: true });
  const agree = await waitFor(() =>
    getByRole(s.host, "button", { name: "我已閱讀並同意" }),
  );
  await waitFor(() =>
    expect((agree as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(agree);
  await waitFor(() =>
    expect(s.host.textContent).toContain("費用同意回讀尚未確認"),
  );
  expect(create(s.host).disabled).toBe(true);
  expect(s.bookings).toHaveLength(0);
});
it("a remembered first agreement never preselects the next order, and quote changes reset the checkbox", async () => {
  const s = setup({ already: true });
  await enterRoute(s.host);
  let check = getByRole(s.host, "checkbox", {
    name: "我已確認費用與優惠說明",
  }) as HTMLInputElement;
  expect(check.checked).toBe(false);
  fireEvent.click(check);
  await waitFor(() => expect(create(s.host).disabled).toBe(false));
  fireEvent.change(getByRole(s.host, "textbox", { name: "下車地點" }), {
    target: { name: "dropoffAddress", value: "合成另一目的地" },
  });
  await waitFor(() => expect(s.host.textContent).toContain("合成另一目的地"));
  await waitFor(() => {
    check = getByRole(s.host, "checkbox", {
      name: "我已確認費用與優惠說明",
    }) as HTMLInputElement;
    expect(check.checked).toBe(false);
  });
  expect(create(s.host).disabled).toBe(true);
  expect(s.bookings).toHaveLength(0);
  expect(s.events).not.toContain("POST /api/referral/fees");
});
it("preserves the exact original new fee command/key through an unknown ACK and normal retry", async () => {
  const s = setup({ already: true, bookingLost: true });
  await enterRoute(s.host);
  fireEvent.click(
    getByRole(s.host, "checkbox", { name: "我已確認費用與優惠說明" }),
  );
  await waitFor(() => expect(create(s.host).disabled).toBe(false));
  fireEvent.click(create(s.host));
  await waitFor(() => expect(s.bookings).toHaveLength(1));
  await waitFor(() => expect(s.host.textContent).toContain("尚未確認叫車結果"));
  const original = JSON.stringify(s.bookings[0]);
  const saved = JSON.parse(
    sessionStorage.getItem("referral.booking.recovery.v1:fee-scope")!,
  );
  expect(JSON.stringify(saved.command)).toBe(original);
  const retry = await waitFor(() =>
    getByRole(s.host, "button", { name: "重送原叫車要求" }),
  );
  fireEvent.click(retry);
  await waitFor(() => expect(s.bookings).toHaveLength(2));
  expect(JSON.stringify(s.bookings[1])).toBe(original);
});

it("renders only the persisted fee time and leaves historical absence explicit", () => {
  const liveData = {
    activeTrip: null,
    receipt: null,
    selectedOrderId: null,
    history: {
      items: [
        {
          orderId: "own-fee",
          orderNo: "FEE-1",
          status: "created",
          pickupAddress: "合成上車",
          dropoffAddress: "合成下車",
          fareTotal: null,
          formattedFare: "未完程",
          completedAt: null,
          createdAt: "2026-09-01T00:00:00Z",
          confirmedAt: "2026-09-02T00:00:00Z",
          feeConfirmation: { feeConfirmedAt: "2026-10-20T04:05:00Z" },
        },
        {
          orderId: "legacy",
          orderNo: "OLD-1",
          status: "created",
          pickupAddress: "舊上車",
          dropoffAddress: "舊下車",
          fareTotal: null,
          formattedFare: "未完程",
          completedAt: null,
          createdAt: "2026-09-01T00:00:00Z",
          confirmedAt: "2026-09-02T00:00:00Z",
        },
      ],
    },
  };
  const markup = renderToString(
    <PassengerEmbed
      context={{ ...context, screen: "trips" } as never}
      liveData={liveData as never}
    />,
  );
  const parsed = document.createElement("div");
  parsed.innerHTML = markup;
  expect(parsed.textContent).toContain("費用確認時間：10-20 12:05");
  expect(parsed.textContent).not.toContain("費用確認時間：10-20 04:05");
  expect(parsed.textContent).toContain("未提供確認紀錄");
  expect(parsed.textContent).not.toContain("費用確認時間：09-02");
});

function storedOriginalCommand(versionValue?: string) {
  const command = {
    entrySlug: context.entry.entrySlug,
    quoteId: "persisted-original-quote",
    idempotencyKey: "persisted-original-key",
    pickupAddress: "合成原上車地址",
    dropoffAddress: "合成原下車地址",
    passengerName: "合成測試乘客",
    passengerPhone: "0912345678",
    vehicleType: "business_vehicle",
    ...(versionValue
      ? { feeDisclosureVersion: versionValue, feeConfirmed: true }
      : {}),
  };
  sessionStorage.setItem(
    "referral.booking.recovery.v1:fee-scope",
    JSON.stringify({
      scope: "fee-scope",
      command,
      form: {
        passengerName: command.passengerName,
        passengerPhone: command.passengerPhone,
        pickupAddress: command.pickupAddress,
        dropoffAddress: command.dropoffAddress,
        scheduledAt: "",
        vehicleType: command.vehicleType,
      },
    }),
  );
  return command;
}
function originalAck(
  command: ReturnType<typeof storedOriginalCommand>,
  quoteVersion?: string,
  quoteHash?: string,
  snapshotHash = quoteHash,
) {
  return {
    orderId: "persisted-original-order",
    replayed: true,
    quote: {
      quoteId: command.quoteId,
      ...(quoteVersion ? { feeDisclosureVersion: quoteVersion } : {}),
      ...(quoteHash ? { feeContentHash: quoteHash } : {}),
    },
    confirmedAt: "2026-09-01T00:00:00Z",
    feeConfirmation: command.feeConfirmed
      ? {
          orderId: "persisted-original-order",
          quoteId: command.quoteId,
          disclosureVersion: command.feeDisclosureVersion,
          contentHash: snapshotHash,
          feeConfirmedAt: "2026-09-01T00:00:01Z",
        }
      : null,
  };
}
it.each(["pre-fee", "prior-fee-version"] as const)(
  "recovers mounted %s original body/key before an unavailable current fee gate without a new quote or consent",
  async (kind) => {
    const priorVersion =
      kind === "pre-fee" ? undefined : "referral-e19-prior-v1";
    const command = storedOriginalCommand(priorVersion),
      bytes = JSON.stringify(command);
    const s = setup({
      feeReadUnavailable: true,
      bookingAcknowledgement: originalAck(
        command,
        priorVersion,
        priorVersion ? "a".repeat(64) : undefined,
      ),
    });
    const retry = await waitFor(() =>
      getByRole(s.host, "button", { name: "重送原叫車要求" }),
    );
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(retry);
    await waitFor(() => expect(s.assign).toHaveBeenCalledOnce());
    expect(s.bookings).toHaveLength(1);
    expect(JSON.stringify(s.bookings[0])).toBe(bytes);
    const sent = s.fetch.mock.calls.find(
      ([url]) => String(url) === "/api/referral/booking",
    )!;
    expect(sent[1]?.body).toBe(bytes);
    expect(sent[1]?.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": command.idempotencyKey,
    });
    expect(s.events).not.toContain("POST /api/referral/fees");
    expect(s.events).not.toContain("POST /api/referral/quote");
    expect(s.assign.mock.calls[0]![0]).toContain(
      "orderId=persisted-original-order",
    );
    expect(
      sessionStorage.getItem("referral.booking.recovery.v1:fee-scope"),
    ).toBeNull();
  },
);
it.each([
  {
    name: "prior snapshot/quote hash mismatch",
    version: "referral-e19-prior-v1",
    quoteVersion: "referral-e19-prior-v1",
    hash: "a".repeat(64),
    snapshotHash: "b".repeat(64),
  },
  {
    name: "invalid persisted hash",
    version: "referral-e19-prior-v1",
    quoteVersion: "referral-e19-prior-v1",
    hash: "not-a-content-hash",
    snapshotHash: "not-a-content-hash",
  },
  {
    name: "persisted quote version mismatch",
    version: "referral-e19-prior-v1",
    quoteVersion: version,
    hash: contentHash,
    snapshotHash: contentHash,
  },
  {
    name: "current version with unknown content",
    version,
    quoteVersion: version,
    hash: "a".repeat(64),
    snapshotHash: "a".repeat(64),
  },
])("retains original recovery without navigation for $name", async (row) => {
  const command = storedOriginalCommand(row.version),
    bytes = JSON.stringify(command);
  const s = setup({
    feeReadUnavailable: true,
    bookingAcknowledgement: originalAck(
      command,
      row.quoteVersion,
      row.hash,
      row.snapshotHash,
    ),
  });
  const retry = await waitFor(() =>
    getByRole(s.host, "button", { name: "重送原叫車要求" }),
  );
  await waitFor(() =>
    expect((retry as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(retry);
  await waitFor(() => expect(s.host.textContent).toContain("尚未確認叫車結果"));
  await waitFor(() =>
    expect(
      (
        getByRole(s.host, "button", {
          name: "重送原叫車要求",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(s.bookings).toHaveLength(1);
  expect(s.assign).not.toHaveBeenCalled();
  expect(
    JSON.stringify(
      JSON.parse(
        sessionStorage.getItem("referral.booking.recovery.v1:fee-scope")!,
      ).command,
    ),
  ).toBe(bytes);
  expect(s.events).not.toContain("POST /api/referral/fees");
  expect(s.events).not.toContain("POST /api/referral/quote");
});
it.each(["home", "returning-book"] as const)(
  "keeps a fixed complete fee disclosure reader on %s without creating an agreement or booking",
  async (surface) => {
    const s = setup({ already: true, home: surface === "home" });
    if (surface === "returning-book")
      await waitFor(() => expect(s.events).toContain("GET /api/referral/fees"));
    const entry = getByText(s.host, "費用與優惠說明"),
      details = entry.closest("details")!;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    fireEvent.click(entry);
    expect(details.open).toBe(true);
    for (const [label, value] of PASSENGER_FEE_ROWS) {
      expect(details.textContent).toContain(label);
      expect(details.textContent).toContain(value);
    }
    expect(details.textContent).toContain("02-2944-0985");
    fireEvent.click(entry);
    expect(details.open).toBe(false);
    expect(s.events).not.toContain("POST /api/referral/fees");
    expect(s.events).not.toContain("POST /api/referral/booking");
    expect(s.bookings).toHaveLength(0);
  },
);

it("renders a scheduled Taipei pickup and a known vehicle name while preserving the original wire values", async () => {
  const s = setup({ already: true });
  await enterRoute(s.host);
  const scheduledAt = "2026-10-21T17:45:00.000Z";
  fireEvent.change(getByRole(s.host, "textbox", { name: "用車時間" }), {
    target: { name: "scheduledAt", value: scheduledAt },
  });
  fireEvent.click(getByRole(s.host, "radio", { name: "標準車" }));
  await waitFor(() => {
    const summary = getByRole(s.host, "region", { name: "本次行程與費用確認" });
    expect(summary.textContent).toContain("10-22 01:45（臺北時間）");
    expect(summary.textContent).toContain("標準車");
    expect(summary.textContent).not.toContain(scheduledAt);
    expect(summary.textContent).not.toContain("standard");
  });
  fireEvent.click(
    getByRole(s.host, "checkbox", { name: "我已確認費用與優惠說明" }),
  );
  await waitFor(() => expect(create(s.host).disabled).toBe(false));
  fireEvent.click(create(s.host));
  await waitFor(() => expect(s.assign).toHaveBeenCalledOnce());
  expect(s.bookings).toHaveLength(1);
  expect(s.bookings[0]).toMatchObject({
    scheduledAt,
    vehicleType: "standard",
    feeDisclosureVersion: version,
    feeConfirmed: true,
  });
});
it.each(["business_vehicle", "unrecognized_vehicle_code"])(
  "uses a neutral summary label for unknown vehicle %s without exposing its wire code",
  async (wireCode) => {
    const s = setup({ already: true, quoteVehicleType: wireCode });
    await enterRoute(s.host);
    const summary = getByRole(s.host, "region", { name: "本次行程與費用確認" });
    expect(summary.textContent).toContain("車型待確認");
    expect(summary.textContent).not.toContain(wireCode);
    expect(summary.textContent).toContain("現在出發");
    expect(s.bookings).toHaveLength(0);
  },
);

const cancelledHistory: ReferralPassengerHistoryItem = {
  orderId: "own-cancelled-time",
  orderNo: "CANCEL-TIME-1",
  status: "cancelled",
  pickupAddress: "合成上車",
  dropoffAddress: "合成下車",
  fareTotal: 999,
  formattedFare: "NT$ 999",
  createdAt: "2026-10-19T01:01:00.000Z",
  completedAt: "2026-10-20T06:02:00.000Z",
  cancelledAt: "2026-10-20T16:00:15.000Z",
};
function renderHistoryScreen(
  item: ReferralPassengerHistoryItem,
  screen: "cancelled" | "trips" | "receipt" = "cancelled",
  receipt: ReferralPassengerReceipt | null = null,
) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <PassengerEmbed
      context={{ ...context, screen } as never}
      liveData={{
        activeTrip: null,
        history: { items: [item] },
        receipt,
        selectedOrderId: item.orderId,
      }}
    />,
  );
  return host;
}
function detailText(host: HTMLElement, label: string) {
  const row = getByText(host, label, { exact: true }).parentElement;
  expect(row).not.toBeNull();
  return row?.textContent ?? "";
}
it("renders SSOT free cancellation and only actual cancelledAt across a Taipei date boundary", () => {
  const host = renderHistoryScreen(cancelledHistory);
  expect(host.textContent).toContain(PASSENGER_FREE_CANCELLATION_NOTICE);
  expect(host.textContent).not.toContain("酌收費用");
  expect(detailText(host, "取消費")).toBe("取消費不收");
  expect(detailText(host, "取消費")).not.toContain("999");
  expect(detailText(host, "取消時間")).toBe("取消時間10-21 00:00");
  expect(detailText(host, "取消時間")).not.toContain("10-19");
  expect(detailText(host, "取消時間")).not.toContain("14:02");
});
it("does not substitute createdAt or completedAt for missing cancellation metadata", () => {
  const host = renderHistoryScreen({ ...cancelledHistory, cancelledAt: null });
  expect(detailText(host, "取消時間")).toBe("取消時間時間待更新");
  expect(detailText(host, "取消時間")).not.toContain("10-");
  expect(detailText(host, "取消費")).toBe("取消費不收");
});
it.each(["no_supply", "dispatch_failed", "dispatch_timeout"])(
  "does not label a %s outcome with a fabricated cancellation time",
  (status) => {
    const host = renderHistoryScreen({ ...cancelledHistory, status });
    expect(host.textContent).not.toContain("取消時間");
    expect(host.textContent).not.toContain("此行程已取消");
  },
);
it("shows history cancellation time and completed receipt time in Taipei without changing the underlying timestamps", () => {
  const history = renderHistoryScreen(cancelledHistory, "trips");
  expect(history.textContent).toContain("10-21 00:00");
  expect(history.textContent).not.toContain("10-20 14:02");
  const receipt: ReferralPassengerReceipt = {
    orderId: "own-completed-receipt",
    orderNo: "RECEIPT-TPE",
    status: "completed",
    completedAt: "2026-10-20T16:05:00.000Z",
    passengerNameMasked: "測○○",
    passengerPhoneMasked: "0912***678",
    driverName: null,
    plateNumber: null,
    vehicleType: "standard",
    pickupAddress: "合成上車",
    dropoffAddress: "合成下車",
    fareBase: 85,
    fareDistance: 20,
    fareTime: 10,
    fareNight: 5,
    totalFare: 120,
    formattedTotal: "NT$ 120",
    paymentChannel: "付款及結算狀態未提供",
  };
  const completed = {
    ...cancelledHistory,
    orderId: receipt.orderId,
    status: "completed",
  };
  const host = renderHistoryScreen(completed, "receipt", receipt);
  expect(host.textContent).toContain("10-21 00:05");
  expect(host.textContent).not.toContain("10-20 16:05");
  expect(receipt.completedAt).toBe("2026-10-20T16:05:00.000Z");
});
