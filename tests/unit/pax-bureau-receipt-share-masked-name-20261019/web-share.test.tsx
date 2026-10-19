/** @vitest-environment jsdom */
import { createHash } from "node:crypto";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Actions } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { t } from "../../../apps/passenger-app-web/components/ride/translations";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";
import type { MultiTaxiElectronicReceipt } from "@drts/contracts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window.navigator as any).canShare;
  delete (window.navigator as any).share;
});

// The only two legitimate producer shapes, from
// apps/api/src/modules/multi-taxi/multi-taxi.service.ts
// (getTrustedPassengerReceiptDownloads / getPassengerReceiptDownloads).
function accountArtifactPath(orderId: string, format: "pdf" | "html") {
  return `/api/passenger-app/rides/${encodeURIComponent(orderId)}/receipt/artifacts/${format}`;
}
function tokenArtifactPath(accessToken: string, format: "pdf" | "html") {
  return `/api/passenger-rides/${encodeURIComponent(accessToken)}/receipt/artifacts/${format}`;
}

const PDF_URL = accountArtifactPath("ETA-ORDER", "pdf");
const HTML_URL = accountArtifactPath("ETA-ORDER", "html");
const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\nunit-receipt-body\n%%EOF",
);

function receiptFixture(
  overrides: Partial<MultiTaxiElectronicReceipt["record"]> = {},
): MultiTaxiElectronicReceipt {
  return {
    receiptId: "RECEIPT-SHARE",
    orderId: "ETA-ORDER",
    receiptNo: "RECEIPT-SHARE-NO",
    amountMinor: 12000,
    currency: "TWD",
    issuedAt: "2026-10-19T00:00:00Z",
    record: {
      plateNo: "TEST-SHARE",
      pickupAt: "2026-10-19T00:00:00Z",
      dropoffAt: "2026-10-19T00:20:00Z",
      travelDurationSeconds: 1200,
      routeSummary: "unit origin to unit destination",
      distanceMeters: 3000,
      tollMinor: 0,
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "unit-authority",
      pdfUrl: PDF_URL,
      htmlUrl: HTML_URL,
      e04Snapshot: {
        fleetOperatorName: "unit-operator",
        driverSurname: "蔡",
        driverRegistrationMasked: "TEST***01",
        paymentMethodDisplay: "unit-pay",
        fareBreakdown: {
          startMinor: 100,
          distanceMinor: 200,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
      ...overrides,
    },
  } as unknown as MultiTaxiElectronicReceipt;
}

function buildP5_10Fixture(
  recordOverrides: Partial<MultiTaxiElectronicReceipt["record"]> = {},
) {
  const view = authority("completed");
  view.receipt = receiptFixture(recordOverrides);
  view.actions.canReadReceipt = true;
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "receipt",
  );
  return { view, fixture };
}

function pdfResponse(
  bytes: Uint8Array = PDF_BYTES,
  init: { status?: number; contentType?: string; fileName?: string } = {},
) {
  const {
    status = 200,
    contentType = "application/pdf",
    fileName = "MTX-SHARE.pdf",
  } = init;
  return new Response(bytes, {
    status,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function stubShareCapable(shareImpl?: (data: unknown) => Promise<void>) {
  const shareMock = vi.fn(shareImpl ?? (() => Promise.resolve()));
  Object.defineProperty(window.navigator, "canShare", {
    value: vi.fn(() => true),
    configurable: true,
  });
  Object.defineProperty(window.navigator, "share", {
    value: shareMock,
    configurable: true,
  });
  return shareMock;
}

function sha256(bytes: ArrayBuffer | Uint8Array) {
  return createHash("sha256")
    .update(Buffer.from(bytes as ArrayBuffer))
    .digest("hex");
}

async function prepareAndGetReady(fetchMock: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
  await waitFor(() => {
    expect(screen.getByText(t.SharePdfReady)).toBeTruthy();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
}

describe("receipt web file sharing (real Actions component, fetch/browser boundary mocked)", () => {
  it("renders the masked public surname through the real Web receipt mapper alongside the share action", () => {
    const { fixture } = buildP5_10Fixture();
    expect(fixture.screenId).toBe("P5-10");
    const rows = Object.fromEntries(
      (fixture.certificate as any).rows.map((row: any) => [
        row.label,
        row.value,
      ]),
    );
    expect(rows["駕駛"]).toBe("蔡○○");
  });

  it("keeps the original PDF/HTML download links mounted next to the new share action", () => {
    const { fixture } = buildP5_10Fixture();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    expect(
      screen.getByText(t.DownloadPdf).closest("a")?.getAttribute("href"),
    ).toBe(PDF_URL);
    expect(
      screen.getByText(t.DownloadHtml).closest("a")?.getAttribute("href"),
    ).toBe(HTML_URL);
    expect(screen.getByRole("button", { name: t.SharePdf })).toBeTruthy();
  });

  it("fetches the authorized same-origin PDF with no-store/same-origin/no-redirect before offering to share", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    await prepareAndGetReady(fetchMock);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      new URL(PDF_URL, window.location.origin).toString(),
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  });

  it("shares exact byte-identical File bytes with only files/title, no URL/text/token payload, on an explicit second click", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    const shareMock = stubShareCapable();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    await prepareAndGetReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shareMock).toHaveBeenCalledTimes(1);
    const payload = shareMock.mock.calls[0]![0] as {
      files: File[];
      title?: string;
    };
    expect(Object.keys(payload).sort()).toEqual(["files", "title"]);
    expect(payload.files).toHaveLength(1);
    const file = payload.files[0]!;
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("MTX-SHARE.pdf");
    const fileBytes = await file.arrayBuffer();
    expect(sha256(fileBytes)).toBe(sha256(PDF_BYTES));
    expect(JSON.stringify(payload)).not.toMatch(/token|bearer|\/api\//i);

    await waitFor(() => {
      expect(screen.getByText(t.ShareFinished)).toBeTruthy();
    });
  });

  it("reports cancellation honestly without claiming success", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable(() =>
      Promise.reject(new DOMException("cancelled", "AbortError")),
    );
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    await prepareAndGetReady(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareCancelled)).toBeTruthy();
    });
  });

  it("falls back to existing download links when the browser cannot share files", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareUnsupported)).toBeTruthy();
    });
    expect(screen.getByText(t.DownloadPdf)).toBeTruthy();
    expect(screen.getByText(t.DownloadHtml)).toBeTruthy();
  });

  it.each([
    ["denied", pdfResponse(PDF_BYTES, { status: 403 })],
    ["not ready", pdfResponse(PDF_BYTES, { status: 404 })],
    [
      "wrong MIME",
      pdfResponse(new TextEncoder().encode("<html></html>"), {
        contentType: "text/html",
      }),
    ],
    ["empty bytes", pdfResponse(new Uint8Array(0))],
    [
      "non-PDF bytes",
      pdfResponse(new TextEncoder().encode("not a pdf at all")),
    ],
  ])(
    "treats %s responses as an honest retryable failure, never a fabricated success",
    async (_label, response) => {
      const { fixture } = buildP5_10Fixture();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const shareMock = stubShareCapable();
      render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
      fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
      await waitFor(() => {
        expect(screen.getByText(t.ShareFailed)).toBeTruthy();
      });
      expect(screen.queryByText(t.SharePdfReady)).toBeNull();
      expect(shareMock).not.toHaveBeenCalled();
    },
  );

  it("ignores a stale in-flight fetch after the receipt/order identity changes", async () => {
    const { fixture: fixtureA } = buildP5_10Fixture();
    const { fixture: fixtureB } = buildP5_10Fixture({
      pdfUrl: accountArtifactPath("OTHER-ORDER", "pdf"),
    });
    let resolveFirst: (value: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    const { rerender } = render(
      <Actions fixture={fixtureA} token="ETA-ORDER" authMode="id" />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(<Actions fixture={fixtureB} token="OTHER-ORDER" authMode="id" />);
    resolveFirst(pdfResponse());
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText(t.SharePdfReady)).toBeNull();
  });

  it("does not throw or update state after unmount while a prepare request is still pending", async () => {
    const { fixture } = buildP5_10Fixture();
    let resolvePending: (value: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementation(
        () => new Promise<Response>((resolve) => (resolvePending = resolve)),
      );
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    const { unmount } = render(
      <Actions fixture={fixture} token="ETA-ORDER" authMode="id" />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    unmount();
    expect(() => resolvePending(pdfResponse())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("rejects an off-origin receipt descriptor before sending any request", async () => {
    const { fixture } = buildP5_10Fixture({
      pdfUrl: "https://evil.example/receipt.pdf",
    });
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareFailed)).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the share button while a share is pending so a second click cannot start a duplicate share", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    let resolveShare: () => void = () => {};
    const shareMock = stubShareCapable(
      () => new Promise<void>((resolve) => (resolveShare = resolve)),
    );
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    await prepareAndGetReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareInProgress)).toBeTruthy();
    });
    expect(
      (screen.getByRole("button", { name: t.SharePdf }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    expect(shareMock).toHaveBeenCalledTimes(1);

    resolveShare();
    await waitFor(() => {
      expect(screen.getByText(t.ShareFinished)).toBeTruthy();
    });
  });

  it("ignores a late share settlement after the receipt identity has already changed", async () => {
    const { fixture: fixtureA } = buildP5_10Fixture();
    const { fixture: fixtureB } = buildP5_10Fixture({
      pdfUrl: accountArtifactPath("OTHER-ORDER", "pdf"),
    });
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    let resolveShare: () => void = () => {};
    stubShareCapable(
      () => new Promise<void>((resolve) => (resolveShare = resolve)),
    );
    const { rerender } = render(
      <Actions fixture={fixtureA} token="ETA-ORDER" authMode="id" />,
    );
    await prepareAndGetReady(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareInProgress)).toBeTruthy();
    });

    rerender(<Actions fixture={fixtureB} token="OTHER-ORDER" authMode="id" />);
    resolveShare();
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText(t.ShareFinished)).toBeNull();
  });

  it("accepts a legitimate token-mode descriptor matching the current access token", async () => {
    const { fixture } = buildP5_10Fixture({
      pdfUrl: tokenArtifactPath("unit-access-token-1", "pdf"),
      htmlUrl: tokenArtifactPath("unit-access-token-1", "html"),
    });
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    render(
      <Actions
        fixture={fixture}
        token="unit-access-token-1"
        authMode="token"
      />,
    );
    await prepareAndGetReady(fetchMock);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      new URL(
        tokenArtifactPath("unit-access-token-1", "pdf"),
        window.location.origin,
      ).toString(),
    );
  });

  it("rejects a descriptor pointing at a different order than the one actually addressed", async () => {
    const { fixture } = buildP5_10Fixture({
      pdfUrl: accountArtifactPath("SOME-OTHER-ORDER", "pdf"),
    });
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareFailed)).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a descriptor shaped for the other auth mode even though it is otherwise same-origin", async () => {
    const { fixture } = buildP5_10Fixture({
      // Token-route shape for the same identifier, while the page is
      // actually addressed in account/id mode.
      pdfUrl: tokenArtifactPath("ETA-ORDER", "pdf"),
    });
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    stubShareCapable();
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareFailed)).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
