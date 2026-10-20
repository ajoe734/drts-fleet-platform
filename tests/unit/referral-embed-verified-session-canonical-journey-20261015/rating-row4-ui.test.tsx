// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { waitFor, fireEvent, getByRole } from "@testing-library/dom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
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
  screen: "completed",
  requestedScreen: "completed",
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
});
function data(rating?: any) {
  return {
    selectedOrderId: "owned-order",
    activeTrip: null,
    receipt: null,
    history: {
      items: [
        {
          orderId: "owned-order",
          orderNo: "OWNED-1",
          status: "completed",
          pickupAddress: "Owned origin",
          dropoffAddress: "Owned destination",
          fareTotal: null,
          formattedFare: "實際車資待確認",
          createdAt: "2026-10-20T01:00:00Z",
          completedAt: "2026-10-20T02:00:00Z",
          ...(rating ? { rating } : {}),
        },
      ],
    },
  };
}
function mount(rating?: any) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      <PassengerEmbed
        context={context as never}
        liveData={data(rating) as never}
      />,
    ),
  );
  return host;
}
function click(host: HTMLElement, role: string, name: string) {
  flushSync(() => fireEvent.click(getByRole(host, role as any, { name })));
}
function ack(c: any) {
  return Response.json({
    ok: true,
    data: {
      ...c,
      tags: [
        ...new Set((c.tags ?? []).map((t: string) => t.trim()).filter(Boolean)),
      ].sort(),
      comment: c.comment?.trim() || null,
      complaintCaseNo: c.score <= 2 ? "PAX-original" : null,
      submittedAt: "2026-10-20T02:00:00Z",
    },
  });
}
function fill(host: HTMLElement, comment: string) {
  const t = getByRole(host, "textbox", {
    name: "意見（最多200字）",
  }) as HTMLTextAreaElement;
  flushSync(() => fireEvent.change(t, { target: { value: comment } }));
  return t;
}
const storageKey = "referral.rating.recovery.v1:opaque-scope-a:owned-order";
it("new rating without optional tags or opinion preserves the original four-field command", async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      const command = JSON.parse(init.body);
      calls.push(command);
      return ack(command);
    }),
  );
  const host = mount();
  click(host, "button", "評分 2 星");
  expect(
    (getByRole(host, "switch", { name: "需要客服聯絡" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  click(host, "button", "送出評分");
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(calls).toHaveLength(1);
  expect(Object.keys(calls[0]).sort()).toEqual([
    "contactRequested",
    "idempotencyKey",
    "orderId",
    "score",
  ]);
  expect(calls[0]).toEqual({
    orderId: "owned-order",
    score: 2,
    contactRequested: true,
    idempotencyKey: expect.any(String),
  });
  expect(host.textContent).toContain("評價標籤：未選擇");
});
it("row4 proposal: selects multiple existing tags and limits new opinion to200 with count and same-order submitted readback", async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      const c = JSON.parse(init.body);
      calls.push(c);
      return ack(c);
    }),
  );
  const host = mount();
  click(host, "button", "評分 2 星");
  click(host, "checkbox", "車內整潔");
  click(host, "checkbox", "駕駛態度");
  const t = fill(host, "意".repeat(201));
  expect(t.maxLength).toBe(200);
  expect(t.value).toHaveLength(200);
  expect(host.textContent).toContain("200/200 字");
  click(host, "switch", "需要客服聯絡");
  click(host, "button", "送出評分");
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    orderId: "owned-order",
    score: 2,
    tags: ["車內整潔", "駕駛態度"],
    comment: "意".repeat(200),
    contactRequested: false,
  });
  expect(host.textContent).toContain("評價標籤：車內整潔、駕駛態度");
  expect(host.textContent).toContain("意見：" + "意".repeat(200));
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});
it("row4 proposal: lostACK remount retries byte-identical original tags/comment/body/key and locks all original controls", async () => {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      bodies.push(init.body);
      if (bodies.length === 1) throw new Error("controlled lostACK");
      return ack(JSON.parse(init.body));
    }),
  );
  let host = mount();
  click(host, "button", "評分 1 星");
  click(host, "checkbox", "車內氣味");
  click(host, "checkbox", "遲到");
  fill(host, "  原始意見  ");
  click(host, "button", "送出評分");
  await waitFor(() => expect(host.textContent).toContain("重送原評分"));
  expect(
    (
      getByRole(host, "textbox", {
        name: "意見（最多200字）",
      }) as HTMLTextAreaElement
    ).matches(":disabled"),
  ).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual(
    JSON.parse(bodies[0]!),
  );
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount();
  await waitFor(() =>
    expect(getByRole(host, "button", { name: "重送原評分" })).toBeTruthy(),
  );
  expect(
    (getByRole(host, "checkbox", { name: "車內氣味" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (
      getByRole(host, "textbox", {
        name: "意見（最多200字）",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("  原始意見  ");
  expect(
    (getByRole(host, "checkbox", { name: "遲到" }) as HTMLInputElement).matches(
      ":disabled",
    ),
  ).toBe(true);
  click(host, "button", "重送原評分");
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(bodies[1]).toBe(bodies[0]);
  expect(JSON.parse(bodies[0]!).idempotencyKey).toEqual(expect.any(String));
  expect(host.textContent).toContain("意見：原始意見");
});
it("row4 proposal: reload renders canonical submitted tags/comment including legacy values without a second POST or200 truncation", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const comment = "舊".repeat(250);
  const host = mount({
    orderId: "owned-order",
    score: 4,
    tags: ["既有自訂標籤", "準時到達"],
    comment,
    contactRequested: false,
    complaintCaseNo: null,
    submittedAt: "2026-10-20T02:00:00Z",
  });
  expect(host.textContent).toContain("評價標籤：既有自訂標籤、準時到達");
  expect(host.textContent).toContain("意見：" + comment);
  expect(
    (getByRole(host, "button", { name: "評分已送出" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it("row4 proposal: old saved original command without optional fields replays unchanged", async () => {
  const old = {
    orderId: "owned-order",
    score: 2,
    contactRequested: false,
    idempotencyKey: "original-legacy-key",
  };
  sessionStorage.setItem(storageKey, JSON.stringify(old));
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      calls.push(JSON.parse(init.body));
      return ack(calls.at(-1));
    }),
  );
  const host = mount();
  await waitFor(() =>
    expect(getByRole(host, "button", { name: "重送原評分" })).toBeTruthy(),
  );
  click(host, "button", "重送原評分");
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(calls).toEqual([old]);
});
it("row4 proposal: a409 stays an error and preserves original extended command rather than reporting submitted success", async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json(
        { ok: false, error: { code: "PASSENGER_RATING_ALREADY_SUBMITTED" } },
        { status: 409 },
      );
    }),
  );
  const host = mount();
  click(host, "button", "評分 2 星");
  click(host, "checkbox", "駕駛違規");
  fill(host, "原要求");
  click(host, "button", "送出評分");
  await waitFor(() => expect(host.textContent).toContain("本行程已有評分"));
  expect(host.textContent).not.toContain("已收到您的評分");
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual(calls[0]);
  expect(getByRole(host, "link", { name: "重新讀取本行程" })).toBeTruthy();
});
