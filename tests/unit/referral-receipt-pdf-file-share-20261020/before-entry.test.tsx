// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getByRole } from "@testing-library/dom";
import { pdfWire } from "./fixture";
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const f = await pdfWire();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const page = await f.view();
  await act(async () => root!.render(page));
  return host;
}
it("a genuinely completed same-order receipt exposes a direct PDF document download", async () => {
  expect(
    getByRole(await mount(), "link", { name: "下載 PDF 明細" }),
  ).toBeTruthy();
});
it("the genuine completed receipt exposes the preparation entry for actual file sharing", async () => {
  expect(
    getByRole(await mount(), "button", { name: "準備分享 PDF" }),
  ).toBeTruthy();
});
