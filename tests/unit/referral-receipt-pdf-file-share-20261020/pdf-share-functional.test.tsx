import fs from "node:fs";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  getByRole,
  getByText,
  queryByText,
  waitFor as waitForDOM,
} from "@testing-library/dom";
import { createHash } from "node:crypto";
import { pdfWire } from "./fixture";
const waitFor = <T,>(callback: () => T) =>
  waitForDOM(callback, { timeout: 4000 });
let root: Root | undefined, host: HTMLDivElement | undefined;
const restoreNavigator: Array<() => void> = [];
afterEach(async () => {
  if (process.env.REFERRAL_PDF_DIAGNOSTICS)
    fs.appendFileSync(
      process.env.REFERRAL_PDF_DIAGNOSTICS,
      JSON.stringify({
        stage: "final-dom",
        name: expect.getState().currentTestName,
        section: host?.querySelector('[aria-label="PDF乘車明細與分享"]')
          ?.textContent,
        sections: host?.querySelectorAll('[aria-label="PDF乘車明細與分享"]')
          .length,
        mainCount: host?.querySelectorAll("main").length,
        sectionParents: [
          ...(host?.querySelectorAll('[aria-label="PDF乘車明細與分享"]') ?? []),
        ].map((n) => ({
          parent: n.parentElement?.tagName,
          href: n.querySelector("a")?.getAttribute("href"),
          parentSections: n.parentElement?.querySelectorAll(
            '[aria-label="PDF乘車明細與分享"]',
          ).length,
        })),
        shareType: typeof navigator.share,
        canShareType: typeof navigator.canShare,
      }) + "\n",
    );
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (restoreNavigator.length) restoreNavigator.pop()!();
});
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function mount(f: Awaited<ReturnType<typeof pdfWire>>) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const page = await f.view();
  await act(async () => root!.render(page));
  return host;
}
async function click(h: HTMLElement, name: string) {
  await act(async () => {
    getByRole(h, "button", { name }).click();
    await Promise.resolve();
  });
}
function fileBytes(file: File) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}
it("the actual mounted original receipt adds direct PDF actions and keeps the original TXT footer", async () => {
  const f = await pdfWire();
  const h = await mount(f);
  expect(
    (
      getByRole(h, "link", { name: "下載 PDF 明細" }) as HTMLAnchorElement
    ).getAttribute("href"),
  ).toBe(`/api/referral/receipt/${f.orderId}/pdf`);
  expect(
    (
      getByRole(h, "link", { name: "下載收據" }) as HTMLAnchorElement
    ).getAttribute("href"),
  ).toBe(`/api/referral/receipt/${f.orderId}/download`);
  expect(f.pdfCalls).toHaveLength(0);
});
function nativeShare(
  handler: (data: ShareData) => Promise<void> = async () => {},
  supported = true,
) {
  const share = vi.fn(handler),
    canShare = vi.fn(() => supported);
  for (const [key, value] of Object.entries({ share, canShare })) {
    const old = Object.getOwnPropertyDescriptor(navigator, key);
    Object.defineProperty(navigator, key, { configurable: true, value });
    restoreNavigator.push(() => {
      if (old) Object.defineProperty(navigator, key, old);
      else delete (navigator as any)[key];
    });
  }
  return { share, canShare };
}
it("file preparation never auto-shares; the second actual click sends the genuine PDF bytes to the native share API", async () => {
  const f = await pdfWire();
  const { share } = nativeShare();
  const h = await mount(f);
  await click(h, "準備分享 PDF");
  await waitFor(() =>
    expect(getByRole(h, "button", { name: "分享 PDF 明細" })).toBeTruthy(),
  );
  expect(share).not.toHaveBeenCalled();
  await click(h, "分享 PDF 明細");
  await waitFor(() => expect(getByText(h, "已完成分享操作。")).toBeTruthy());
  expect(share).toHaveBeenCalledTimes(1);
  const data = share.mock.calls[0]![0];
  expect(data.title).toContain("非正式稅務憑證");
  expect(data.files).toHaveLength(1);
  const file = data.files![0]!;
  expect(file.name).toBe(`receipt-${f.orderId}.pdf`);
  expect(file.type).toBe("application/pdf");
  expect(hash(await fileBytes(file))).toBe(f.pdfDocuments.at(-1).sha256);
});
it("unsupported native sharing gives a genuine download path without claiming the file was shared", async () => {
  const f = await pdfWire();
  const { share } = nativeShare(async () => {}, false);
  const h = await mount(f);
  await click(h, "準備分享 PDF");
  await waitFor(() =>
    expect(getByText(h, /此瀏覽器不支援檔案分享/)).toBeTruthy(),
  );
  expect(share).not.toHaveBeenCalled();
  expect(getByRole(h, "link", { name: "下載 PDF 明細" })).toBeTruthy();
  expect(queryByText(h, "已完成分享操作。")).toBeNull();
});
it.each(["AbortError", "NotAllowedError"])(
  "a native %s stays cancelled/failed and offers explicit preparation retry",
  async (name) => {
    const f = await pdfWire();
    nativeShare(async () => {
      throw new DOMException("controlled native outcome", name);
    });
    const h = await mount(f);
    await click(h, "準備分享 PDF");
    await waitFor(() =>
      expect(getByRole(h, "button", { name: "分享 PDF 明細" })).toBeTruthy(),
    );
    await click(h, "分享 PDF 明細");
    await waitFor(() =>
      expect(getByRole(h, "button", { name: "重新準備分享 PDF" })).toBeTruthy(),
    );
    expect(queryByText(h, "已完成分享操作。")).toBeNull();
  },
);
it("a real download error cannot prepare a share file, and explicit retry uses the same original order URL", async () => {
  const f = await pdfWire();
  const { share } = nativeShare();
  const h = await mount(f);
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) =>
      String(i).endsWith("/pdf")
        ? Response.json({ ok: false }, { status: 503 })
        : original(i, init),
    ),
  );
  await click(h, "準備分享 PDF");
  await waitFor(() =>
    expect(getByRole(h, "button", { name: "重新準備分享 PDF" })).toBeTruthy(),
  );
  expect(share).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", original);
  await click(h, "重新準備分享 PDF");
  await waitFor(() =>
    expect(getByRole(h, "button", { name: "分享 PDF 明細" })).toBeTruthy(),
  );
  expect(f.pdfCalls.at(-1)).toBe(`/api/referral/receipt/${f.orderId}/pdf`);
});
it("a non-PDF transport response is not passed off as a successful share file", async () => {
  const f = await pdfWire();
  const { share } = nativeShare();
  const h = await mount(f);
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) =>
      String(i).endsWith("/pdf")
        ? new Response("<html>not a PDF</html>", {
            headers: { "Content-Type": "application/pdf" },
          })
        : original(i, init),
    ),
  );
  await click(h, "準備分享 PDF");
  await waitFor(() =>
    expect(getByRole(h, "button", { name: "重新準備分享 PDF" })).toBeTruthy(),
  );
  expect(share).not.toHaveBeenCalled();
});
it("unmount aborts preparation and a late completed PDF never starts native sharing", async () => {
  const f = await pdfWire();
  const { share } = nativeShare();
  const h = await mount(f);
  const original = globalThis.fetch;
  let release: () => void = () => {},
    arrived: () => void = () => {};
  const held = new Promise<void>((r) => {
      release = r;
    }),
    got = new Promise<void>((r) => {
      arrived = r;
    });
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) => {
      const response = await original(i, init);
      if (
        String(i).startsWith("/api/referral/receipt/") &&
        String(i).endsWith("/pdf")
      ) {
        signal = init?.signal as AbortSignal;
        arrived();
        await held;
      }
      return response;
    }),
  );
  await click(h, "準備分享 PDF");
  await got;
  await act(async () => root!.unmount());
  root = undefined;
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    release();
    await held;
  });
  expect(share).not.toHaveBeenCalled();
});
it("switching completed orders discards the old pending PDF and keeps the new original order addressed", async () => {
  const f = await pdfWire();
  const { share } = nativeShare();
  const h = await mount(f);
  const original = globalThis.fetch;
  let release: () => void = () => {},
    arrived: () => void = () => {};
  const held = new Promise<void>((r) => {
      release = r;
    }),
    got = new Promise<void>((r) => {
      arrived = r;
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) => {
      const response = await original(i, init);
      if (String(i) === `/api/referral/receipt/${f.orderId}/pdf`) {
        arrived();
        await held;
      }
      return response;
    }),
  );
  await click(h, "準備分享 PDF");
  await got;
  const second = await pdfWire();
  const page = await second.view();
  await act(async () => root!.render(page));
  await act(async () => {
    release();
    await held;
  });
  expect(
    (
      getByRole(h, "link", { name: "下載 PDF 明細" }) as HTMLAnchorElement
    ).getAttribute("href"),
  ).toBe(`/api/referral/receipt/${second.orderId}/pdf`);
  expect(queryByText(h, "PDF 已準備完成，請按分享。")).toBeNull();
  expect(share).not.toHaveBeenCalled();
});
