// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getByText } from "@testing-library/dom";
import { liveWire } from "./fixture";
let root: Root | undefined, host: HTMLDivElement | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("the real same-order controller read includes the current assigned Driver pickup estimate", async () => {
  const f = await liveWire();
  const data = await f.service.getReferralPassengerActiveTrip(f.identity);
  expect(data.trip?.liveTracking?.pickupEta).toMatchObject({
    minutes: 3,
    estimatedArrivalAt: "2026-10-20T08:03:00.000Z",
  });
});
it("the real SSR trip screen shows the actual estimated pickup clock instead of the creation clock", async () => {
  const f = await liveWire();
  const page = await f.view();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(page));
  expect(getByText(host, "16:03")).toBeTruthy();
  expect(getByText(host, /25.06100, 121.52100/)).toBeTruthy();
});
