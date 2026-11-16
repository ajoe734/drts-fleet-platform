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
import {
  Actions,
  RideContent,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { t } from "../../../apps/passenger-app-web/components/ride/translations";
import {
  fetchPassengerReceipt,
  mapPassengerRideAuthorityToFixture,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";
import type { MultiTaxiElectronicReceipt } from "@drts/contracts";

type PassengerRideFixture = ReturnType<
  typeof mapPassengerRideAuthorityToFixture
>;

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

  it.each([
    ["蔡**", "蔡**"],
    ["蔡＊＊", "蔡＊＊"],
  ])(
    "does not double-mask an already masked driver surname %s through the real Web receipt mapper",
    (rawSurname, expectedMasked) => {
      const { fixture } = buildP5_10Fixture({
        e04Snapshot: {
          fleetOperatorName: "unit-operator",
          driverSurname: rawSurname,
          driverRegistrationMasked: "TEST***01",
          paymentMethodDisplay: "unit-pay",
          fareBreakdown: {
            startMinor: 100,
            distanceMinor: 200,
            delayMinor: 0,
            nightMinor: 0,
          },
        },
      } as any);
      const rows = Object.fromEntries(
        (fixture.certificate as any).rows.map((row: any) => [
          row.label,
          row.value,
        ]),
      );
      expect(rows["駕駛"]).toBe(expectedMasked);
    },
  );

  it("keeps the original PDF download link mounted next to the share action (E-04: 下載 PDF / 分享)", () => {
    const { fixture } = buildP5_10Fixture();
    expect(fixture.certificate?.htmlUrl).toBe(HTML_URL);
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    expect(
      screen.getByText(t.DownloadPdf).closest("a")?.getAttribute("href"),
    ).toBe(PDF_URL);
    // The plan shows PDF and 分享 only; HTML is offered only without a PDF.
    expect(screen.queryByText(t.DownloadHtml)).toBeNull();
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

  it("falls back to the existing PDF download link when the browser cannot share files", async () => {
    const { fixture } = buildP5_10Fixture();
    const fetchMock = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<Actions fixture={fixture} token="ETA-ORDER" authMode="id" />);
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareUnsupported)).toBeTruthy();
    });
    expect(
      screen.getByText(t.DownloadPdf).closest("a")?.getAttribute("href"),
    ).toBe(PDF_URL);
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

const SIM_ORDER_ID = "11111111-2222-4333-8444-555555555555";
const SIM_OTHER_ORDER_ID = "22222222-3333-4444-8555-666666666666";
const SIM_CERT_ID = "99999999-8888-4777-8666-555555555555";
const SIM_RECEIPT_NO = "MTX-20261019-SIM0001";
const SIM_MASKED_FOOTNOTE = "證明編號 MTX-202610••-••0001 · 個資已遮碼";
const SIM_ACCOUNT_HTML_URL = accountArtifactPath(SIM_ORDER_ID, "html");
const SIM_ACCOUNT_PDF_URL = accountArtifactPath(SIM_ORDER_ID, "pdf");
const SIM_ADMIN_HTML_URL = `/control-plane-proxy/platform-admin/multi-taxi/certificates/${SIM_CERT_ID}/artifacts/html`;
const SIM_ADMIN_PDF_URL = `/control-plane-proxy/platform-admin/multi-taxi/certificates/${SIM_CERT_ID}/artifacts/pdf`;
const SIM_PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\nSIM-synthetic-passenger-receipt-pdf\n%%EOF",
);

function buildPendingAccountReceiptFixture(
  orderId: string = SIM_ORDER_ID,
): PassengerRideFixture {
  const view = authority("completed");
  view.order.orderId = orderId;
  view.order.orderNo = "ORD-SIM-0001";
  view.receipt = null;
  view.actions.canReadReceipt = true;
  return mapPassengerRideAuthorityToFixture(view, orderId, "receipt");
}

function buildPersistedRideSnakeEnvelope(orderId: string = SIM_ORDER_ID) {
  return {
    data: {
      ride: {
        order: {
          order_id: orderId,
          order_no: "ORD-SIM-0001",
          status: "completed",
          timing_mode: "immediate",
          requested_pickup_at: "2026-10-19T00:00:00Z",
          pickup: { address: "SIM起點" },
          dropoff: { address: "SIM終點" },
          cancelable_until: null,
          cancelled_at: null,
          completed_at: "2026-10-19T00:20:00Z",
        },
        assignment: null,
        rating: null,
        payment: {
          status: "captured",
          amount: { currency: "TWD", amount_minor: 32000 },
        },
        receipt: {
          receipt_id: SIM_CERT_ID,
          order_id: orderId,
          receipt_no: SIM_RECEIPT_NO,
          amount_minor: 32000,
          currency: "TWD",
          issued_at: "2026-10-19T00:21:00Z",
          record: {
            trip_id: "33333333-4444-4555-8666-777777777777",
            plate_no: "SIM-8888",
            pickup_at: "2026-10-19T00:00:00Z",
            dropoff_at: "2026-10-19T00:20:00Z",
            travel_duration_seconds: 1200,
            route_summary: "SIM起點 → SIM終點",
            distance_meters: 4500,
            toll_minor: 0,
            consumer_service_phone: "02-2944-0985",
            authority_complaint_phone: "1999",
            certificate_version: "1",
            certificate_state: "available",
            html_url: SIM_ADMIN_HTML_URL,
            pdf_url: SIM_ADMIN_PDF_URL,
            generated_from: "owned_mobility_completion",
            e04_snapshot: {
              fleet_operator_name: "SIM-測試車隊",
              driver_surname: "蔡",
              driver_registration_masked: "SIM***01",
              payment_method_display: "SIM信用卡 ••••1234",
              fare_breakdown: {
                start_minor: 8500,
                distance_minor: 20500,
                delay_minor: 3000,
                night_minor: 0,
              },
            },
          },
        },
        actions: {
          can_cancel: false,
          can_rate: false,
          can_contact: false,
          can_read_receipt: true,
        },
      },
    },
  };
}

function renderLiveReceiptSurface(
  orderId: string = SIM_ORDER_ID,
  authMode: "id" | "token" = "id",
) {
  let currentFixture = buildPendingAccountReceiptFixture(orderId);
  const handleCertificateUpdate = (
    certificate: NonNullable<PassengerRideFixture["certificate"]>,
  ) => {
    currentFixture = { ...currentFixture, certificate };
    mounted.rerender(
      <RideContent
        fixture={currentFixture}
        token={orderId}
        authMode={authMode}
        onCertificateUpdate={handleCertificateUpdate}
      />,
    );
  };
  const mounted = render(
    <RideContent
      fixture={currentFixture}
      token={orderId}
      authMode={authMode}
      onCertificateUpdate={handleCertificateUpdate}
    />,
  );
  return mounted;
}

describe("normal account receipt downloads wire -> mapper -> CertificateCard/Actions/ReceiptShareActions", () => {
  it("consumes documented snake_case /receipt/downloads, projects lawful same-order passenger URLs into record over platform-admin descriptors, and completes PDF download + two-click SIM file share", async () => {
    window.localStorage.removeItem("drts.passenger.functional-demo.v1");
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt` &&
        method === "GET"
      ) {
        return Response.json({
          data: { receipt_url: SIM_ACCOUNT_HTML_URL },
        });
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}` &&
        method === "GET"
      ) {
        return Response.json(buildPersistedRideSnakeEnvelope(SIM_ORDER_ID));
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt/downloads` &&
        method === "GET"
      ) {
        return Response.json({
          data: {
            receipt_url: SIM_ACCOUNT_HTML_URL,
            html_url: SIM_ACCOUNT_HTML_URL,
            pdf_url: SIM_ACCOUNT_PDF_URL,
            certificate_id: SIM_CERT_ID,
            order_id: SIM_ORDER_ID,
          },
        });
      }
      if (
        url ===
          new URL(SIM_ACCOUNT_PDF_URL, window.location.origin).toString() &&
        method === "GET"
      ) {
        return pdfResponse(SIM_PDF_BYTES, {
          fileName: `${SIM_RECEIPT_NO}.pdf`,
        });
      }
      throw new Error(`Unexpected HTTP call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const shareMock = stubShareCapable();

    renderLiveReceiptSurface(SIM_ORDER_ID, "id");

    expect(screen.getByText(t.ReceiptPreparing)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));

    await waitFor(() => {
      expect(screen.getByText("SIM-測試車隊")).toBeTruthy();
    });
    expect(screen.getByText("蔡○○")).toBeTruthy();
    expect(screen.getByText("執登證號 SIM***01")).toBeTruthy();
    expect(screen.getByText("NT$ 320")).toBeTruthy();
    expect(screen.getByText("SIM信用卡 ••••1234")).toBeTruthy();
    expect(screen.getByText(SIM_MASKED_FOOTNOTE)).toBeTruthy();
    expect(screen.queryByText(SIM_RECEIPT_NO)).toBeNull();

    const pdfLink = screen.getByText(t.DownloadPdf).closest("a");
    expect(pdfLink?.getAttribute("href")).toBe(SIM_ACCOUNT_PDF_URL);
    expect(screen.queryByText(t.DownloadHtml)).toBeNull();
    expect(document.querySelector('a[href*="control-plane-proxy"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.SharePdfReady)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareFinished)).toBeTruthy();
    });
    expect(shareMock).toHaveBeenCalledTimes(1);
    const sharedPayload = shareMock.mock.calls[0]![0] as {
      files: File[];
      title?: string;
    };
    expect(sharedPayload.files).toHaveLength(1);
    expect(sha256(await sharedPayload.files[0]!.arrayBuffer())).toBe(
      sha256(SIM_PDF_BYTES),
    );
  });

  it("consumes legacy camelCase /receipt/downloads descriptors, projects lawful same-order URLs into record, and preserves token-mode receipt fetches unchanged", async () => {
    window.localStorage.removeItem("drts.passenger.functional-demo.v1");
    const tokenAccess = "sim-access-token-20261114";
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt` &&
        method === "GET"
      ) {
        return Response.json({
          data: { receiptUrl: SIM_ACCOUNT_HTML_URL },
        });
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}` &&
        method === "GET"
      ) {
        return Response.json(buildPersistedRideSnakeEnvelope(SIM_ORDER_ID));
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt/downloads` &&
        method === "GET"
      ) {
        return Response.json({
          data: {
            receiptUrl: SIM_ACCOUNT_HTML_URL,
            htmlUrl: SIM_ACCOUNT_HTML_URL,
            pdfUrl: SIM_ACCOUNT_PDF_URL,
            certificateId: SIM_CERT_ID,
            orderId: SIM_ORDER_ID,
          },
        });
      }
      if (
        url ===
          new URL(SIM_ACCOUNT_PDF_URL, window.location.origin).toString() &&
        method === "GET"
      ) {
        return pdfResponse(SIM_PDF_BYTES, {
          fileName: `${SIM_RECEIPT_NO}.pdf`,
        });
      }
      if (
        url === `/api/passenger-rides/${tokenAccess}/receipt` &&
        method === "GET"
      ) {
        return Response.json({
          data: {
            receipt_id: SIM_CERT_ID,
            order_id: SIM_ORDER_ID,
            receipt_no: SIM_RECEIPT_NO,
            amount_minor: 32000,
            currency: "TWD",
            receipt_url: tokenArtifactPath(tokenAccess, "html"),
            html_url: tokenArtifactPath(tokenAccess, "html"),
            pdf_url: tokenArtifactPath(tokenAccess, "pdf"),
          },
        });
      }
      throw new Error(`Unexpected HTTP call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const shareMock = stubShareCapable();

    const accountReceipt = await fetchPassengerReceipt(SIM_ORDER_ID, false);
    expect(accountReceipt).toMatchObject({
      receiptId: SIM_CERT_ID,
      orderId: SIM_ORDER_ID,
      receiptNo: SIM_RECEIPT_NO,
      amountMinor: 32000,
      currency: "TWD",
      receiptUrl: SIM_ACCOUNT_HTML_URL,
      htmlUrl: SIM_ACCOUNT_HTML_URL,
      pdfUrl: SIM_ACCOUNT_PDF_URL,
      record: {
        htmlUrl: SIM_ACCOUNT_HTML_URL,
        pdfUrl: SIM_ACCOUNT_PDF_URL,
      },
    });

    const tokenReceipt = await fetchPassengerReceipt(tokenAccess, true);
    expect(tokenReceipt).toMatchObject({
      receiptId: SIM_CERT_ID,
      orderId: SIM_ORDER_ID,
      receiptNo: SIM_RECEIPT_NO,
      receiptUrl: tokenArtifactPath(tokenAccess, "html"),
      htmlUrl: tokenArtifactPath(tokenAccess, "html"),
      pdfUrl: tokenArtifactPath(tokenAccess, "pdf"),
    });

    renderLiveReceiptSurface(SIM_ORDER_ID, "id");
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));

    await waitFor(() => {
      expect(
        screen.getByText(t.DownloadPdf).closest("a")?.getAttribute("href"),
      ).toBe(SIM_ACCOUNT_PDF_URL);
    });
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.SharePdfReady)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: t.SharePdf }));
    await waitFor(() => {
      expect(screen.getByText(t.ShareFinished)).toBeTruthy();
    });
    expect(shareMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to authorized HTML download and preserves E-04 receipt facts without leaking platform-admin PDF/share when /receipt/downloads fails", async () => {
    window.localStorage.removeItem("drts.passenger.functional-demo.v1");
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt` &&
        method === "GET"
      ) {
        return Response.json({
          data: { receipt_url: SIM_ACCOUNT_HTML_URL },
        });
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}` &&
        method === "GET"
      ) {
        return Response.json(buildPersistedRideSnakeEnvelope(SIM_ORDER_ID));
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt/downloads` &&
        method === "GET"
      ) {
        return Response.json(
          { error: { code: "PASSENGER_RECEIPT_DOWNLOADS_UNAVAILABLE" } },
          { status: 503 },
        );
      }
      throw new Error(`Unexpected HTTP call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const shareMock = stubShareCapable();

    renderLiveReceiptSurface(SIM_ORDER_ID, "id");

    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));

    await waitFor(() => {
      expect(screen.getByText("SIM-測試車隊")).toBeTruthy();
    });
    expect(screen.getByText("蔡○○")).toBeTruthy();
    expect(screen.getByText("NT$ 320")).toBeTruthy();
    expect(screen.getByText(SIM_MASKED_FOOTNOTE)).toBeTruthy();

    const htmlLink = screen.getByText(t.DownloadHtml).closest("a");
    expect(htmlLink?.getAttribute("href")).toBe(SIM_ACCOUNT_HTML_URL);
    expect(screen.queryByText(t.DownloadPdf)).toBeNull();
    expect(screen.queryByRole("button", { name: t.SharePdf })).toBeNull();
    expect(document.querySelector('a[href*="control-plane-proxy"]')).toBeNull();
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("rejects mismatched-order download descriptors and preserves pending HTML fallback when record enrichment fails", async () => {
    window.localStorage.removeItem("drts.passenger.functional-demo.v1");
    let failGetRide = false;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt` &&
        method === "GET"
      ) {
        return Response.json({
          data: { receipt_url: SIM_ACCOUNT_HTML_URL },
        });
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}` &&
        method === "GET"
      ) {
        if (failGetRide) {
          return Response.json(
            { error: { code: "PASSENGER_RIDE_READ_FAILED" } },
            { status: 502 },
          );
        }
        return Response.json(buildPersistedRideSnakeEnvelope(SIM_ORDER_ID));
      }
      if (
        url === `/api/passenger-app/rides/${SIM_ORDER_ID}/receipt/downloads` &&
        method === "GET"
      ) {
        return Response.json({
          data: {
            receiptUrl: accountArtifactPath(SIM_OTHER_ORDER_ID, "html"),
            htmlUrl: accountArtifactPath(SIM_OTHER_ORDER_ID, "html"),
            pdfUrl: accountArtifactPath(SIM_OTHER_ORDER_ID, "pdf"),
            certificateId: SIM_CERT_ID,
            orderId: SIM_OTHER_ORDER_ID,
          },
        });
      }
      throw new Error(`Unexpected HTTP call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const mismatchedResult = await fetchPassengerReceipt(SIM_ORDER_ID, false);
    expect(mismatchedResult.pdfUrl).toBeUndefined();
    expect(mismatchedResult.record?.pdfUrl).toBeUndefined();
    expect(mismatchedResult.record?.htmlUrl).toBe(SIM_ACCOUNT_HTML_URL);

    failGetRide = true;
    renderLiveReceiptSurface(SIM_ORDER_ID, "id");
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));

    await waitFor(() => {
      expect(
        screen.getByText(t.DownloadHtml).closest("a")?.getAttribute("href"),
      ).toBe(SIM_ACCOUNT_HTML_URL);
    });
    expect(screen.getByText(t.ReceiptPreparing)).toBeTruthy();
    expect(screen.queryByText(t.DownloadPdf)).toBeNull();
    expect(screen.queryByRole("button", { name: t.SharePdf })).toBeNull();
  });
});
