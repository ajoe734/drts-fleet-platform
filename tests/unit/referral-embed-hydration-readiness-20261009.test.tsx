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
const LEGACY_PASSENGER_EMBED_BLOB = "4e9f1d3861f0773b7bdf313265443054b4abc3aa";
const LEGACY_PASSENGER_EMBED_SHA256 =
  "e97fba39534b1f6b21ddd77ebfe13c5360f82a273f49345e6c27f9331516143f";
const LEGACY_BOOK_SCREEN_SSR_SHA256 =
  "3b7dd143ac650d0812a7c79c9ac4c50a0298f4e09e230d6fc5620478323e45f7";
const LEGACY_BOOK_SCREEN_SSR_HTML = `<main style="min-height:100dvh;background:#ECEEF3;display:flex;justify-content:center;padding:0 0 24px;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif"><div style="width:100%;max-width:392px;min-height:812px;background:#F0FDFA;color:#10203A;display:flex;flex-direction:column;box-shadow:0 22px 54px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.08)"><div style="height:44px;background:#1A45AD;color:#FFFFFF;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 6px;font-size:12.5px;font-weight:600;flex-shrink:0"><span>9:41</span><span style="display:inline-flex;gap:5px;align-items:center;opacity:0.9"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"></path></svg><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"></path></svg></span></div><div style="background:#1A45AD;color:#FFFFFF;padding:4px 12px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span aria-hidden="true" style="width:30px;height:30px;border-radius:15px;background:rgba(255,255,255,.16);display:inline-flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg></span><div style="flex:1;line-height:1.2"><div style="font-size:14.5px;font-weight:700">社區叫車</div><div style="font-size:10px;opacity:0.78">社區 App · 法碧康雲峰</div></div><span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-family:&quot;JetBrains Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;opacity:0.78;background:rgba(255,255,255,.14);padding:4px 8px;border-radius:999px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10V7a5 5 0 0110 0v3"></path><path d="M5 10h14v9H5z"></path></svg>partner.example.test</span></div><div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#FFFFFF;border-bottom:1px solid #E5E9F1;font-size:10.5px;color:#64748B;flex-shrink:0"><span style="width:6px;height:6px;border-radius:999px;background:#0F7B5A;flex-shrink:0"></span><span style="font-family:&quot;JetBrains Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">webview</span><span style="color:#8C96A8">· embedded · /embed/referral-demo-community</span></div><div style="flex:1;display:grid;gap:13px;padding:16px"><div style="display:flex;align-items:center;gap:11px;padding:10px 12px;background:#FFFFFF;border:1px solid #E5E9F1;border-radius:12px"><span style="width:34px;height:34px;border-radius:10.625px;background:linear-gradient(150deg, #1A45AD, #1A45AD);color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:14.28px;font-weight:800;flex-shrink:0">法</span><div style="flex:1;line-height:1.25"><div style="font-size:13.5px;font-weight:700">李采縈 · A 棟 12F-3</div><div style="font-size:11px;color:#64748B">法碧康雲峰</div></div><span style="display:inline-flex;align-items:center;gap:6px;width:fit-content;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;color:#0F7B5A;background:#E5F4ED;border:1px solid #A7D7C2"><span style="width:6px;height:6px;border-radius:999px;background:#0F7B5A;flex-shrink:0"></span>已驗證</span></div><section style="display:grid;gap:10px;padding:15px;border-radius:16px;background:#FFFFFF;border:1px solid #E5E9F1"><div style="display:grid;gap:3px"><div style="font-size:14px;font-weight:700;color:#10203A">行程</div><div style="font-size:11.5px;color:#64748B">上車 · 下車 · 時間</div></div><div style="display:grid;gap:10px"><label style="display:grid;gap:6px"><span style="font-size:11.5px;color:#64748B;font-weight:600">上車地點</span><span style="display:flex;align-items:center;gap:8px;min-height:42px;border-radius:12px;padding:0 12px;background:#FFFFFF;border:1px solid #E5E9F1;color:#334155"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6-5.33 6-11a6 6 0 10-12 0c0 5.67 6 11 6 11z"></path><path d="M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"></path></svg><input aria-label="上車地點" type="text" style="flex:1;border:none;outline:none;background:transparent;color:#10203A;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif;font-size:14px;padding:11px 0" name="pickupAddress" value="法碧康雲峰 A 棟 1F 大廳"/></span></label><label style="display:grid;gap:6px"><span style="font-size:11.5px;color:#64748B;font-weight:600">下車地點</span><span style="display:flex;align-items:center;gap:8px;min-height:42px;border-radius:12px;padding:0 12px;background:#FFFFFF;border:1px solid #E5E9F1;color:#334155"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6-5.33 6-11a6 6 0 10-12 0c0 5.67 6 11 6 11z"></path><path d="M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"></path></svg><input aria-label="下車地點" type="text" style="flex:1;border:none;outline:none;background:transparent;color:#10203A;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif;font-size:14px;padding:11px 0" name="dropoffAddress" value="台北榮民總醫院 · 門診大樓"/></span></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label style="display:grid;gap:6px"><span style="font-size:11.5px;color:#64748B;font-weight:600">用車時間</span><span style="display:flex;align-items:center;gap:8px;min-height:42px;border-radius:12px;padding:0 12px;background:#FFFFFF;border:1px solid #E5E9F1;color:#334155"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v5l3 2"></path><path d="M12 21a9 9 0 100-18 9 9 0 000 18z"></path></svg><input aria-label="用車時間" type="text" style="flex:1;border:none;outline:none;background:transparent;color:#10203A;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif;font-size:14px;padding:11px 0" name="scheduledAt" value="現在出發"/></span></label><label style="display:grid;gap:6px"><span style="font-size:11.5px;color:#64748B;font-weight:600">聯絡電話</span><span style="display:flex;align-items:center;gap:8px;min-height:42px;border-radius:12px;padding:0 12px;background:#FFFFFF;border:1px solid #E5E9F1;color:#334155"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 2.5a16 16 0 006 6L17 15l5 2v4a2 2 0 01-2 2C10.6 23 1 13.4 1 2a2 2 0 012-2h2z"></path></svg><input aria-label="聯絡電話" type="tel" inputMode="tel" autoComplete="tel" style="flex:1;border:none;outline:none;background:transparent;color:#10203A;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif;font-size:14px;padding:11px 0" name="passengerPhone" value="0912345820"/></span></label></div></div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:11px"><span style="font-size:11.5px;color:#64748B;background:#F7F9FC;border:1px solid #E5E9F1;padding:4px 9px;border-radius:999px">社區大廳</span><span style="font-size:11.5px;color:#64748B;background:#F7F9FC;border:1px solid #E5E9F1;padding:4px 9px;border-radius:999px">台北車站</span><span style="font-size:11.5px;color:#64748B;background:#F7F9FC;border:1px solid #E5E9F1;padding:4px 9px;border-radius:999px">榮總醫院</span></div></section><section style="display:grid;gap:10px;padding:15px;border-radius:16px;background:#FFFFFF;border:1px solid #E5E9F1"><div style="display:grid;gap:3px"><div style="font-size:14px;font-weight:700;color:#10203A">車種</div><div style="font-size:11.5px;color:#64748B">owned mobility</div></div><div style="display:grid;gap:8px"><label style="position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:1px solid #E5E9F1;background:#FFFFFF"><input type="radio" aria-label="標準車" style="position:absolute;inset:0;margin:0;opacity:0;cursor:pointer" name="vehicleType"/><span style="color:#64748B"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16l1.5-5a2 2 0 011.93-1.43h7.14A2 2 0 0117.5 11L19 16"></path><path d="M6 16h12"></path><path d="M7 18.5h.01"></path><path d="M17 18.5h.01"></path><path d="M8 16v2"></path><path d="M16 16v2"></path></svg></span><div style="flex:1"><div style="font-size:13.5px;font-weight:700">標準車</div><div style="font-size:11px;color:#64748B">1–4 人</div></div></label><label style="position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:1px solid #1A45AD;background:#EBF1FE"><input type="radio" aria-label="舒適車" style="position:absolute;inset:0;margin:0;opacity:0;cursor:pointer" name="vehicleType" checked=""/><span style="color:#1A45AD"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16l1.5-5a2 2 0 011.93-1.43h7.14A2 2 0 0117.5 11L19 16"></path><path d="M6 16h12"></path><path d="M7 18.5h.01"></path><path d="M17 18.5h.01"></path><path d="M8 16v2"></path><path d="M16 16v2"></path></svg></span><div style="flex:1"><div style="font-size:13.5px;font-weight:700">舒適車</div><div style="font-size:11px;color:#64748B">1–4 人 · 大空間</div></div><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#1A45AD" aria-hidden="true"><path d="M5 12l4 4 10-10"></path></svg></label><label style="position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:1px solid #E5E9F1;background:#FFFFFF"><input type="radio" aria-label="六人座" style="position:absolute;inset:0;margin:0;opacity:0;cursor:pointer" name="vehicleType"/><span style="color:#64748B"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16l1.5-5a2 2 0 011.93-1.43h7.14A2 2 0 0117.5 11L19 16"></path><path d="M6 16h12"></path><path d="M7 18.5h.01"></path><path d="M17 18.5h.01"></path><path d="M8 16v2"></path><path d="M16 16v2"></path></svg></span><div style="flex:1"><div style="font-size:13.5px;font-weight:700">六人座</div><div style="font-size:11px;color:#64748B">5–6 人 · 行李多</div></div></label></div></section></div><div style="display:grid;gap:9px;padding:14px;background:#FFFFFF;border-top:1px solid #E5E9F1;flex-shrink:0"><div style="display:flex;justify-content:space-between;align-items:center;font-size:12px"><span style="color:#64748B">預估車資</span><span style="font-size:16px;font-weight:700;color:#10203A;font-family:&quot;JetBrains Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">約 NT$ 290</span></div><button type="button" data-drt-operation="referral-create" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;border-radius:12px;padding:11px 14px;font-family:&quot;Inter&quot;,&quot;Noto Sans TC&quot;,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,system-ui,sans-serif;font-size:14px;font-weight:700;text-decoration:none;opacity:1;background:#1A45AD;color:#FFFFFF;border:1px solid #1A45AD;cursor:pointer"><span>確認叫車</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></button></div></div></main>`;

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

function sha256(value: string) {
  const { createHash } = process.getBuiltinModule(
    "crypto",
  ) as typeof import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
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

  it("documents the immutable legacy 03a SSR output exposed booking controls before handlers existed", () => {
    expect(LEGACY_SHA).toBe("03a1c98af9bddfacf3feb2b0b9b8bd00283717bf");
    expect(LEGACY_PASSENGER_EMBED_BLOB).toBe(
      "4e9f1d3861f0773b7bdf313265443054b4abc3aa",
    );
    expect(LEGACY_PASSENGER_EMBED_SHA256).toBe(
      "e97fba39534b1f6b21ddd77ebfe13c5360f82a273f49345e6c27f9331516143f",
    );
    expect(sha256(LEGACY_BOOK_SCREEN_SSR_HTML)).toBe(
      LEGACY_BOOK_SCREEN_SSR_SHA256,
    );

    const container = document.createElement("div");
    container.innerHTML = LEGACY_BOOK_SCREEN_SSR_HTML;
    const legacyButton = container.querySelector(
      '[data-drt-operation="referral-create"]',
    ) as HTMLButtonElement | null;
    const legacyInputs = Array.from(container.querySelectorAll("input"));

    expect(LEGACY_BOOK_SCREEN_SSR_HTML).toContain("確認叫車");
    expect(legacyButton).not.toBeNull();
    expect(legacyButton?.hasAttribute("disabled")).toBe(false);
    expect(
      legacyInputs.map((input) => input.getAttribute("aria-label")),
    ).toEqual([
      "上車地點",
      "下車地點",
      "用車時間",
      "聯絡電話",
      "標準車",
      "舒適車",
      "六人座",
    ]);
    expect(legacyInputs).toHaveLength(7);
    expect(legacyInputs.every((input) => !input.hasAttribute("disabled"))).toBe(
      true,
    );
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
