// @vitest-environment jsdom

import { fireEvent, waitFor } from "@testing-library/dom";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

import { BookScreen } from "../../apps/referral-embed-web/components/passenger-embed";

const LEGACY_SHA = "03a1c98af9bddfacf3feb2b0b9b8bd00283717bf";

function makeContext() {
  return {
    entry: {
      entrySlug: "referral-demo-community",
      displayName: "法碧康雲峰",
      entryHost: "partner.example.test",
      brandingMetadata: {
        displayName: "法碧康雲峰",
        supportPhone: "0800-911-200",
      },
    },
    session: {
      handoffId: "handoff-ref-001",
      entryHost: "partner.example.test",
      partnerEntrySlug: "referral-demo-community",
      identityActive: true,
      navigationContext: null,
    },
    state: "handoff",
    screen: "book",
    requestedScreen: "book",
    handoff: {
      apiKey: null,
      partnerUserRef: null,
    },
    decision: {
      requestedEntryHost: "partner.example.test",
      block: false,
      blockReason: null,
      xFrameOptions: null,
    },
    accent: "#1A45AD",
    strings: {
      appName: "社區 App",
      displayName: "法碧康雲峰",
      supportPhone: "0800-911-200",
    },
    issues: [],
    fallbackEntry: null,
  };
}

function getInput(label: string) {
  const input = document.querySelector(
    `input[aria-label="${label}"]`,
  ) as HTMLInputElement | null;

  if (!input) {
    throw new Error(`expected input ${label}`);
  }

  return input;
}

const roots: Root[] = [];

function renderBookScreen() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  flushSync(() => {
    root.render(<BookScreen context={makeContext() as never} />);
  });
}

function submitButton() {
  const button = document.querySelector(
    '[data-drt-operation="referral-create"]',
  ) as HTMLButtonElement | null;

  if (!button) {
    throw new Error("expected referral create button");
  }

  return button;
}

describe("referral embed booking hydration readiness", () => {
  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      root?.unmount();
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("documents the immutable legacy 03a SSR-enabled booking controls before handlers existed", () => {
    const childProcess = process.getBuiltinModule(
      "child_process",
    ) as typeof import("node:child_process");
    const legacySource = childProcess.execFileSync(
      "git",
      [
        "show",
        `${LEGACY_SHA}:apps/referral-embed-web/components/passenger-embed.tsx`,
      ],
      { encoding: "utf8" },
    );
    const legacyBookScreen = legacySource.slice(
      legacySource.indexOf("function BookScreen"),
      legacySource.indexOf("const negativeScreens"),
    );

    expect(legacyBookScreen).toContain("onClick={handleSubmit}");
    expect(legacyBookScreen).toContain("disabled={isPending}");
    expect(legacyBookScreen).not.toContain("isMounted");
    expect(legacyBookScreen).not.toContain("bookingControlsDisabled");
  });

  it("SSR-renders booking inputs, vehicle choices, and submit disabled until mount readiness", async () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <BookScreen context={makeContext() as never} />,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;

    const serverButton = container.querySelector(
      '[data-drt-operation="referral-create"]',
    ) as HTMLButtonElement | null;
    const serverInputs = Array.from(container.querySelectorAll("input"));

    expect(serverButton?.hasAttribute("disabled")).toBe(true);
    expect(serverInputs.length).toBeGreaterThanOrEqual(7);
    expect(serverInputs.every((input) => input.hasAttribute("disabled"))).toBe(
      true,
    );

    renderBookScreen();

    const mountedButton = submitButton();
    await waitFor(() => expect(mountedButton.disabled).toBe(false));
    expect(getInput("上車地點").disabled).toBe(false);
    expect(getInput("下車地點").disabled).toBe(false);
    expect(getInput("用車時間").disabled).toBe(false);
    expect(getInput("聯絡電話").disabled).toBe(false);
    expect(getInput("六人座").disabled).toBe(false);
  });

  it("keeps mounted typed values and submits exactly one original booking command with idempotency and returned-order navigation", async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          orderId: "ord-returned-001",
          orderNo: "DRTS-20261009-001",
          status: "pending",
        },
      }),
    );
    const assignSpy = vi.fn();

    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "referral-booking-idempotency-001"),
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderBookScreen();

    const submit = submitButton();
    await waitFor(() => expect(submit.disabled).toBe(false));

    flushSync(() => {
      fireEvent.change(getInput("上車地點"), {
        target: { value: "測試社區大廳" },
      });
    });
    flushSync(() => {
      fireEvent.change(getInput("下車地點"), {
        target: { value: "台北醫院急診入口" },
      });
    });
    flushSync(() => {
      fireEvent.change(getInput("聯絡電話"), {
        target: { value: "09 1234 5820" },
      });
    });
    flushSync(() => {
      fireEvent.click(getInput("六人座"));
    });

    await waitFor(() =>
      expect(getInput("上車地點").value).toBe("測試社區大廳"),
    );
    expect(getInput("下車地點").value).toBe("台北醫院急診入口");
    expect(getInput("聯絡電話").value).toBe("09 1234 5820");
    await waitFor(() => expect(getInput("六人座").checked).toBe(true));

    const testWindow = Object.create(window) as Window & typeof globalThis;
    Object.defineProperty(testWindow, "location", {
      value: { assign: assignSpy },
      configurable: true,
    });
    vi.stubGlobal("window", testWindow);

    fireEvent.click(submit);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledTimes(1));

    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: string;
      },
    ];
    const command = JSON.parse(init.body);

    expect(url).toBe("/api/referral/booking");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": "referral-booking-idempotency-001",
    });
    expect(command).toEqual({
      entrySlug: "referral-demo-community",
      pickupAddress: "測試社區大廳",
      dropoffAddress: "台北醫院急診入口",
      vehicleType: "xl",
      idempotencyKey: "referral-booking-idempotency-001",
      passengerName: "李采縈",
      passengerPhone: "0912345820",
    });
    expect(assignSpy).toHaveBeenCalledWith(
      "/embed/referral-demo-community?entryHost=partner.example.test&screen=trip&state=handoff&orderId=ord-returned-001",
    );
  });
});
