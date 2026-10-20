// @vitest-environment jsdom
import { it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { manualWire } from "./fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  delete (globalThis as any).__cancellationPorts;
});
it("BEFORE_MANUAL completed original-order screen exposes voluntary complaint workflow", async () => {
  const f = await manualWire();
  const node = await f.page();
  expect(node.props.liveData!.selectedOrderId).toBe(f.orderId);
  expect(
    node.props.liveData!.history!.items.some(
      (row: any) => row.orderId === f.orderId,
    ),
  ).toBe(true);
  render(node);
  expect(screen.getByRole("button", { name: "行程申訴與遺失物" })).toBeTruthy();
});
it("BEFORE_MANUAL history selected completed order retains a complaint entry distinct from star rating", async () => {
  const f = await manualWire();
  const history = await f.page("trips");
  const view = render(history);
  const link = view.container.querySelector(`a[href*="orderId=${f.orderId}"]`);
  expect(link).toBeTruthy();
  expect(link!.getAttribute("href")).toContain("screen=completed");
  view.rerender(await f.page());
  expect(screen.getByRole("button", { name: "行程申訴與遺失物" })).toBeTruthy();
});
