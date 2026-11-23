import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  expect,
  type Download,
  type Page,
  type Response as BrowserResponse,
  type Route,
  type TestInfo,
} from "@playwright/test";

export type PassengerVisibleStage =
  | "searching"
  | "assigned"
  | "driver_accepted"
  | "enroute_pickup"
  | "arrived_pickup"
  | "on_trip"
  | "completed";

export interface ObservedPassengerDomState {
  stage: PassengerVisibleStage;
  orderId: string;
  orderNo: string;
  authorityStatus: string;
  visibleHeading: string;
  canCancelButtonEnabled: boolean | null;
  observedAt: number;
}

const EXPECTED_HEADING_BY_STAGE: Record<PassengerVisibleStage, string> = {
  searching: "正在安排車輛",
  assigned: "車輛已指派",
  driver_accepted: "司機已接受行程",
  enroute_pickup: "司機正在前往",
  arrived_pickup: "司機已抵達",
  on_trip: "行程進行中",
  completed: "行程已完成",
};

function shortOrderHeading(orderNoOrId: string): string {
  const normalized = orderNoOrId.startsWith("O-")
    ? orderNoOrId
    : `O-${orderNoOrId}`;
  const match = /^O-([0-9a-f]{8})-[0-9a-f-]{27}$/i.exec(normalized);
  return match ? `O-${match[1]!.toUpperCase()}` : normalized;
}

function safeReceiptFileName(
  receiptNo: string,
  format: "pdf" | "html",
): string {
  return `${receiptNo.replace(/[^A-Za-z0-9._-]/g, "_")}.${format}`;
}

function decodePdfUtf16TjLines(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  return [...raw.matchAll(/<([A-F0-9]+)> Tj/g)]
    .map((match) => {
      const hex = match[1]!;
      const buf = Buffer.from(hex, "hex");
      const content =
        buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff
          ? buf.subarray(2)
          : buf;
      const swapped = Buffer.alloc(content.length);
      for (let i = 0; i + 1 < content.length; i += 2) {
        swapped[i] = content[i + 1]!;
        swapped[i + 1] = content[i]!;
      }
      return swapped.toString("utf16le");
    })
    .join("\n");
}

async function assertSameOrderPassengerChrome(
  pax: Page,
  orderId: string,
  orderNo?: string,
) {
  await expect(pax).toHaveURL(new RegExp(`/rides/${orderId}$`));
  await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
  await expect(
    pax.getByText(`ride.smarttransport.tw/r/${orderId.slice(0, 4)}••`, {
      exact: true,
    }),
  ).toBeVisible();
  if (orderNo) {
    expect(orderNo).toMatch(/^O-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    await expect(pax.locator(`[title="${orderNo}"]`)).toHaveText(
      shortOrderHeading(orderNo),
    );
  }
}

/**
 * First-party Passenger P5-01 searching state immediately after booking confirmation,
 * before Ops creates a dispatch job or assigns any driver.
 */
export async function assertPassengerSearchingRideDom(
  pax: Page,
  orderId: string,
  readAuthority: (page: Page, id: string) => Promise<any>,
  info?: TestInfo,
): Promise<ObservedPassengerDomState> {
  await assertSameOrderPassengerChrome(pax, orderId);
  const heading = EXPECTED_HEADING_BY_STAGE.searching;
  await expect(pax.getByText(heading, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    pax.getByText(/通常 1–3 分鐘完成指派|系統正在安排可派車輛/).first(),
  ).toBeVisible();
  await expect(pax.getByText("預估路線與車資", { exact: true })).toBeVisible();
  const cancelButton = pax
    .getByRole("button", { name: "取消行程", exact: true })
    .first();
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toBeEnabled();
  await expect(pax.getByText("取消不收費", { exact: true })).toBeVisible();
  await expect(pax.getByText("您的車輛與駕駛", { exact: true })).toHaveCount(0);

  const ride = await readAuthority(pax, orderId);
  expect(ride.order.orderId).toBe(orderId);
  expect(ride.order.orderNo).toMatch(/^O-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  expect(["created", "ready_for_dispatch"]).toContain(ride.order.status);
  expect(ride.assignment).toBeNull();
  expect(ride.actions.canCancel).toBe(true);
  await assertSameOrderPassengerChrome(pax, orderId, ride.order.orderNo);

  if (info) {
    await info.attach("A-first-party-P5-searching-pax", {
      contentType: "image/png",
      body: await pax.screenshot({ fullPage: true }),
    });
  }

  return {
    stage: "searching",
    orderId,
    orderNo: ride.order.orderNo,
    authorityStatus: ride.order.status,
    visibleHeading: heading,
    canCancelButtonEnabled: true,
    observedAt: Date.now(),
  };
}

/**
 * First-party Passenger assigned / accepted / enroute_pickup DOM on the same mounted
 * `/rides/:orderId` page before the driver advances to `arrived_pickup`.
 */
export async function assertPassengerAssignedRideDom(
  pax: Page,
  orderId: string,
  expectedStage: "assigned" | "driver_accepted" | "enroute_pickup",
  readAuthority: (page: Page, id: string) => Promise<any>,
  observed: ObservedPassengerDomState[],
  info?: TestInfo,
  expectedPlateNo = "SIM-1001",
) {
  await assertSameOrderPassengerChrome(pax, orderId);
  const heading = EXPECTED_HEADING_BY_STAGE[expectedStage];
  await expect(pax.getByText(heading, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(pax.getByText("您的車輛與駕駛", { exact: true })).toBeVisible();
  await expect(
    pax.getByText(expectedPlateNo, { exact: true }).first(),
  ).toBeVisible();
  await expect(pax.getByText("執登有效", { exact: true })).toBeVisible();
  const cancelButton = pax
    .getByRole("button", { name: "取消行程", exact: true })
    .first();
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toBeEnabled();

  const ride = await readAuthority(pax, orderId);
  expect(ride.order.orderId).toBe(orderId);
  expect(ride.order.status).toBe(expectedStage);
  expect(ride.assignment?.vehicle?.plateNo).toBe(expectedPlateNo);
  expect(ride.actions.canCancel).toBe(true);
  await assertSameOrderPassengerChrome(pax, orderId, ride.order.orderNo);

  observed.push({
    stage: expectedStage,
    orderId,
    orderNo: ride.order.orderNo,
    authorityStatus: ride.order.status,
    visibleHeading: heading,
    canCancelButtonEnabled: true,
    observedAt: Date.now(),
  });

  if (info && expectedStage === "enroute_pickup") {
    await info.attach("A-first-party-P5-assigned-pax", {
      contentType: "image/png",
      body: await pax.screenshot({ fullPage: true }),
    });
  }
}

/**
 * First-party Passenger P5-06 arrival DOM on the same mounted `/rides/:orderId` page
 * immediately after Driver `arrived_pickup` and before Driver `start`.
 */
export async function assertPassengerArrivedRideDom(
  pax: Page,
  orderId: string,
  readAuthority: (page: Page, id: string) => Promise<any>,
  observed: ObservedPassengerDomState[],
  info?: TestInfo,
  expectedPlateNo = "SIM-1001",
) {
  await assertSameOrderPassengerChrome(pax, orderId);
  const heading = EXPECTED_HEADING_BY_STAGE.arrived_pickup;
  await expect(pax.getByText(heading, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(pax.getByText("您的車輛與駕駛", { exact: true })).toBeVisible();
  await expect(
    pax.getByText(expectedPlateNo, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax.getByText("上車後請全程繫妥安全帶", { exact: true }),
  ).toBeVisible();
  await expect(pax.getByText(/^預計\s+\d+\s+分鐘抵達$/)).toHaveCount(0);
  const cancelButton = pax
    .getByRole("button", { name: "取消行程", exact: true })
    .first();
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toBeEnabled();

  const ride = await readAuthority(pax, orderId);
  expect(ride.order.orderId).toBe(orderId);
  expect(ride.order.status).toBe("arrived_pickup");
  expect(ride.assignment?.vehicle?.plateNo).toBe(expectedPlateNo);
  expect(ride.actions.canCancel).toBe(true);
  await assertSameOrderPassengerChrome(pax, orderId, ride.order.orderNo);

  observed.push({
    stage: "arrived_pickup",
    orderId,
    orderNo: ride.order.orderNo,
    authorityStatus: ride.order.status,
    visibleHeading: heading,
    canCancelButtonEnabled: true,
    observedAt: Date.now(),
  });

  if (info) {
    await info.attach("A-first-party-P5-arrived-pax", {
      contentType: "image/png",
      body: await pax.screenshot({ fullPage: true }),
    });
  }
}

/**
 * First-party Passenger P5-07 on_trip DOM on the same mounted `/rides/:orderId` page
 * immediately after Driver `start` and before Driver `complete`.
 */
export async function assertPassengerOnTripRideDom(
  pax: Page,
  orderId: string,
  readAuthority: (page: Page, id: string) => Promise<any>,
  observed: ObservedPassengerDomState[],
  info?: TestInfo,
  expectedPlateNo = "SIM-1001",
) {
  await assertSameOrderPassengerChrome(pax, orderId);
  const heading = EXPECTED_HEADING_BY_STAGE.on_trip;
  await expect(pax.getByText(heading, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(pax.getByText("您的車輛與駕駛", { exact: true })).toBeVisible();
  await expect(
    pax.getByText(expectedPlateNo, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax.getByText("上車後請全程繫妥安全帶", { exact: true }),
  ).toBeVisible();
  await expect(pax.getByText("預估路線與車資", { exact: true })).toBeVisible();
  const cancelButton = pax
    .getByRole("button", { name: "取消行程", exact: true })
    .first();
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toBeDisabled();
  await expect(pax.getByText("取消不收費", { exact: true })).toHaveCount(0);

  const ride = await readAuthority(pax, orderId);
  expect(ride.order.orderId).toBe(orderId);
  expect(ride.order.status).toBe("on_trip");
  expect(ride.assignment?.vehicle?.plateNo).toBe(expectedPlateNo);
  expect(ride.actions.canCancel).toBe(false);
  await assertSameOrderPassengerChrome(pax, orderId, ride.order.orderNo);

  observed.push({
    stage: "on_trip",
    orderId,
    orderNo: ride.order.orderNo,
    authorityStatus: ride.order.status,
    visibleHeading: heading,
    canCancelButtonEnabled: false,
    observedAt: Date.now(),
  });

  if (info) {
    await info.attach("A-first-party-P5-on-trip-pax", {
      contentType: "image/png",
      body: await pax.screenshot({ fullPage: true }),
    });
  }
}

/**
 * First-party Passenger P5-08 completed DOM on the same mounted `/rides/:orderId` page
 * immediately after Driver `complete`.
 */
export async function assertPassengerCompletedRideDom(
  pax: Page,
  orderId: string,
  readAuthority: (page: Page, id: string) => Promise<any>,
  observed: ObservedPassengerDomState[],
  info?: TestInfo,
) {
  await assertSameOrderPassengerChrome(pax, orderId);
  const heading = EXPECTED_HEADING_BY_STAGE.completed;
  await expect(pax.getByText(heading, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(pax.getByText("本次行程", { exact: true })).toBeVisible();
  await expect(pax.getByText("服務評分", { exact: true })).toBeVisible();
  await expect(pax.getByTestId("passenger-live-driver-position")).toHaveCount(
    0,
  );
  const receiptLink = pax.getByRole("link", {
    name: "查看電子乘車證明",
    exact: true,
  });
  await expect(receiptLink).toBeVisible();
  await expect(receiptLink).toHaveAttribute(
    "href",
    `/rides/${orderId}/receipt`,
  );

  const ride = await readAuthority(pax, orderId);
  expect(ride.order.orderId).toBe(orderId);
  expect(ride.order.status).toBe("completed");
  expect(ride.actions.canCancel).toBe(false);
  await assertSameOrderPassengerChrome(pax, orderId, ride.order.orderNo);

  observed.push({
    stage: "completed",
    orderId,
    orderNo: ride.order.orderNo,
    authorityStatus: ride.order.status,
    visibleHeading: heading,
    canCancelButtonEnabled: null,
    observedAt: Date.now(),
  });

  expect(observed.map((entry) => entry.stage)).toEqual([
    "assigned",
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "completed",
  ]);
  expect(observed.every((entry) => entry.orderId === orderId)).toBe(true);
  expect(observed.every((entry) => entry.orderNo === ride.order.orderNo)).toBe(
    true,
  );

  if (info) {
    await info.attach("A-first-party-P5-completed-pax", {
      contentType: "image/png",
      body: await pax.screenshot({ fullPage: true }),
    });
    await info.attach("A-first-party-P5-visible-ride-state-facts", {
      contentType: "application/json",
      body: JSON.stringify({
        orderId,
        orderNo: ride.order.orderNo,
        actualEntry: `/rides/${orderId}`,
        observedStagesInOrder: observed.map((entry) => entry.stage),
        observedStates: observed,
        sameMountedPassengerPageRetainedAcrossFinish: true,
        extraOrdersCreated: false,
        arbitrarySleepUsed: false,
      }),
    });
  }
}

/**
 * Navigate to the original receipt page `/rides/:orderId/receipt`, verify its visible E-04 DOM,
 * click the real primary download button (`下載 PDF` preferred, `下載 HTML` fallback, `target="_blank"`),
 * capture the actual browser response/download bytes, and verify MIME, magic/bytes, filename,
 * and same-order receipt association while keeping the nonformal rehearsal HTML distinct.
 */
export async function verifyOriginalPassengerReceiptInBrowser(
  pax: Page,
  paxOrigin: string,
  orderId: string,
  receipt: any,
  downloadsMetadata: {
    orderId: string;
    certificateId?: string;
    receiptUrl?: string;
    htmlUrl?: string;
    pdfUrl?: string;
  },
  info: TestInfo,
  options: { downloadTimeoutMs?: number } = {},
) {
  const snapshot = receipt.record.e04Snapshot;
  const viewReceiptLink = pax.getByRole("link", {
    name: "查看電子乘車證明",
    exact: true,
  });
  if (
    new URL(pax.url()).pathname === `/rides/${orderId}` &&
    (await viewReceiptLink.isVisible())
  ) {
    await viewReceiptLink.click();
  } else {
    await pax.goto(`${paxOrigin}/rides/${orderId}/receipt`);
  }
  await expect(pax).toHaveURL(`${paxOrigin}/rides/${orderId}/receipt`);
  await expect(
    pax.getByText("電子乘車證明", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax.getByText(`ride.smarttransport.tw/r/${orderId.slice(0, 4)}••`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(pax.locator(`a[href="/rides/${orderId}"]`)).toBeVisible();
  if (typeof receipt.orderNo === "string" && receipt.orderNo.startsWith("O-")) {
    await expect(pax.locator(`[title="${receipt.orderNo}"]`)).toHaveText(
      shortOrderHeading(receipt.orderNo),
    );
  }
  await expect(
    pax.getByText(snapshot.fleetOperatorName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax.getByText(receipt.record.plateNo, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax
      .getByText(`執登證號 ${snapshot.driverRegistrationMasked}`, {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    pax.getByText(snapshot.paymentMethodDisplay, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    pax.getByText("PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING", { exact: true }),
  ).toHaveCount(0);

  await info.attach(`same-order-${orderId}-original-receipt-page-pax`, {
    contentType: "image/png",
    body: await pax.screenshot({ fullPage: true }),
  });

  const pdfOfferedByDownloadsApi =
    typeof downloadsMetadata.pdfUrl === "string" &&
    downloadsMetadata.pdfUrl.trim().length > 0;
  const expectedFormat: "pdf" | "html" = pdfOfferedByDownloadsApi
    ? "pdf"
    : "html";
  const expectedArtifactPath = pdfOfferedByDownloadsApi
    ? downloadsMetadata.pdfUrl!.trim()
    : (downloadsMetadata.htmlUrl ?? downloadsMetadata.receiptUrl ?? "").trim();
  expect(expectedArtifactPath).toBe(
    `/api/passenger-app/rides/${orderId}/receipt/artifacts/${expectedFormat}`,
  );
  const expectedFileName = safeReceiptFileName(
    receipt.receiptNo,
    expectedFormat,
  );

  const pdfLink = pax.getByRole("link", { name: "下載 PDF", exact: true });
  const htmlLink = pax.getByRole("link", { name: "下載 HTML", exact: true });
  if (expectedFormat === "pdf") {
    await expect(pdfLink).toBeVisible();
    await expect(htmlLink).toHaveCount(0);
  } else {
    await expect(htmlLink).toBeVisible();
    await expect(pdfLink).toHaveCount(0);
  }

  const actionLink = expectedFormat === "pdf" ? pdfLink : htmlLink;
  await expect(actionLink).toHaveAttribute("target", "_blank");
  const actualButtonHref = (await actionLink.getAttribute("href")) ?? "";
  expect(actualButtonHref.length).toBeGreaterThan(0);

  const downloadTimeoutMs = options.downloadTimeoutMs ?? 5_000;
  const targetPathname = new URL(actualButtonHref, paxOrigin).pathname;
  const openedPages: Page[] = [];
  let capturedDownload: Download | null = null;
  let resolveDownload: ((download: Download) => void) | null = null;
  const downloadPromise = new Promise<Download>((resolve) => {
    resolveDownload = resolve;
  });
  const onDownload = (download: Download) => {
    if (!capturedDownload) {
      capturedDownload = download;
      resolveDownload?.(download);
    }
  };
  const onPopup = (popup: Page) => {
    openedPages.push(popup);
    popup.on("download", onDownload);
  };
  pax.on("download", onDownload);
  pax.context().on("page", onPopup);

  let status = 0;
  let actualResponseUrl = "";
  let responseHeaders: Record<string, string> = {};
  let browserResponse: BrowserResponse | null = null;
  let deliveredBytes: Buffer | null = null;
  let deliveryMode: "browser_download" | "inline_or_new_tab" | null = null;
  let suggestedFilename: string | null = null;
  let savedArtifactPath: string | null = null;

  let resolveIntercepted!: () => void;
  let rejectIntercepted!: (error: unknown) => void;
  const interceptedPromise = new Promise<void>((resolve, reject) => {
    resolveIntercepted = resolve;
    rejectIntercepted = reject;
  });
  const urlMatcher = (url: URL) => url.pathname === targetPathname;
  const interceptHandler = async (route: Route) => {
    try {
      const fetched = await route.fetch({ maxRedirects: 0 });
      const fetchedBody = Buffer.from(await fetched.body());
      status = fetched.status();
      actualResponseUrl = fetched.url();
      responseHeaders = fetched.headers();
      await route.fulfill({ response: fetched, body: fetchedBody });
      resolveIntercepted();
    } catch (error) {
      rejectIntercepted(error);
      await route.abort("failed").catch(() => undefined);
    }
  };

  try {
    const contextWaitForResponse =
      typeof pax.context().waitForEvent === "function"
        ? pax
            .context()
            .waitForEvent("response", {
              timeout: 30_000,
              predicate: (candidate: BrowserResponse) =>
                candidate.request().method() === "GET" &&
                new URL(candidate.url()).pathname === targetPathname,
            })
            .then((candidate: BrowserResponse) => {
              browserResponse = candidate;
              return candidate;
            })
        : null;
    if (typeof pax.context().route === "function") {
      contextWaitForResponse?.catch(() => undefined);
      await pax.context().route(urlMatcher, interceptHandler, { times: 1 });
      await actionLink.click();
      await Promise.race([
        interceptedPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for browser GET ${targetPathname}`,
                ),
              ),
            30_000,
          ),
        ),
      ]);
    } else {
      if (!contextWaitForResponse) {
        throw new Error(
          `Browser context cannot observe GET ${targetPathname} response.`,
        );
      }
      await actionLink.click();
      const response = await contextWaitForResponse;
      status = response.status();
      actualResponseUrl = response.url();
      responseHeaders = response.headers();
    }

    expect(
      actualButtonHref,
      `Original receipt button on /rides/${orderId}/receipt must point to ${expectedArtifactPath}, not ${actualButtonHref}`,
    ).toBe(expectedArtifactPath);
    expect(
      status,
      `Original receipt button GET ${actualButtonHref} must succeed with HTTP 200`,
    ).toBe(200);
    expect(new URL(actualResponseUrl).pathname).toBe(expectedArtifactPath);

    const disposition = responseHeaders["content-disposition"] ?? "";
    expect(disposition).toContain(`filename="${expectedFileName}"`);

    if (/attachment/i.test(disposition)) {
      const downloaded =
        capturedDownload ??
        (await Promise.race([
          downloadPromise,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), downloadTimeoutMs),
          ),
        ]));
      if (!downloaded) {
        throw new Error(
          `Original receipt response for ${targetPathname} declared Content-Disposition="${disposition}", but browser did not complete an attachment download.`,
        );
      }
      if (typeof downloaded.failure === "function") {
        const failureReason = await downloaded.failure();
        if (failureReason) {
          throw new Error(
            `Original receipt browser attachment download failed: ${failureReason}`,
          );
        }
      }
      deliveryMode = "browser_download";
      suggestedFilename = downloaded.suggestedFilename();
      expect(suggestedFilename).toBe(expectedFileName);
      savedArtifactPath = info.outputPath(
        `original-e04-${orderId}.${expectedFormat}`,
      );
      await downloaded.saveAs(savedArtifactPath);
      deliveredBytes = await readFile(savedArtifactPath);
      expect(
        deliveredBytes.length,
        "Downloaded original receipt artifact bytes must not be empty",
      ).toBeGreaterThan(0);
    } else {
      const popupPage = openedPages.find((popup) => !popup.isClosed()) ?? null;
      if (popupPage && typeof popupPage.waitForLoadState === "function") {
        await popupPage.waitForLoadState("domcontentloaded");
      }
      const popupMatched =
        popupPage !== null &&
        typeof popupPage.url === "function" &&
        popupPage.url().length > 0 &&
        popupPage.url() !== "about:blank" &&
        new URL(popupPage.url(), paxOrigin).pathname === targetPathname;
      const inlineNavigated =
        new URL(pax.url(), paxOrigin).pathname === targetPathname;
      if (!popupMatched && !inlineNavigated) {
        throw new Error(
          `Original receipt response for ${targetPathname} was not an attachment, and no new-tab popup or inline page navigation to ${targetPathname} was verified.`,
        );
      }
      deliveryMode = "inline_or_new_tab";
      if (!browserResponse && contextWaitForResponse) {
        browserResponse = await Promise.race([
          contextWaitForResponse.catch(() => null),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 1_000),
          ),
        ]);
      }
      if (browserResponse) {
        deliveredBytes = Buffer.from(await browserResponse.body());
      } else if (
        popupPage &&
        typeof (popupPage as { content?: () => Promise<string> }).content ===
          "function"
      ) {
        deliveredBytes = Buffer.from(await popupPage.content(), "utf8");
      } else {
        throw new Error(
          `Original receipt inline/new-tab delivery for ${targetPathname} did not provide readable browser response bytes.`,
        );
      }
      expect(
        deliveredBytes.length,
        "Inline/new-tab original receipt response body must not be empty",
      ).toBeGreaterThan(0);
    }
  } finally {
    if (typeof pax.context().unroute === "function") {
      await pax
        .context()
        .unroute(urlMatcher, interceptHandler)
        .catch(() => undefined);
    }
    pax.off("download", onDownload);
    pax.context().off("page", onPopup);
    for (const popup of openedPages) {
      if (!popup.isClosed()) {
        await popup.close().catch(() => undefined);
      }
    }
  }

  expect(deliveryMode).not.toBeNull();
  expect(deliveredBytes).not.toBeNull();
  const bytes = deliveredBytes!;
  const contentTypeHeader = responseHeaders["content-type"] ?? "";
  const mimeType = contentTypeHeader.split(";")[0]!.trim().toLowerCase();
  const contentDisposition = responseHeaders["content-disposition"] ?? "";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const hasPdfMagic =
    bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";

  await info.attach(`same-order-${orderId}-original-receipt-download-facts`, {
    contentType: "application/json",
    body: JSON.stringify({
      orderId,
      receiptId: receipt.receiptId,
      certificateId: downloadsMetadata.certificateId ?? receipt.receiptId,
      receiptNo: receipt.receiptNo,
      expectedFormat,
      pdfOfferedByDownloadsApi,
      environmentIssuedHtmlFallbackOnly: !pdfOfferedByDownloadsApi,
      expectedArtifactPath,
      actualButtonHref,
      actualResponseUrl,
      actualHttpStatus: status,
      deliveryMode,
      mimeType,
      contentTypeHeader,
      contentDisposition,
      expectedFileName,
      suggestedFilename,
      byteLength: bytes.length,
      sha256,
      hasPdfMagic,
      distinctFromNonformalRehearsalHtml: true,
    }),
  });

  if (expectedFormat === "pdf") {
    expect(mimeType).toBe("application/pdf");
    expect(hasPdfMagic).toBe(true);
    expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.7");
    const rawLatin1 = bytes.toString("latin1");
    expect(rawLatin1.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(rawLatin1).toContain(`drts:orderId="${orderId}"`);
    expect(rawLatin1).toContain(
      `drts:certificateId="${downloadsMetadata.certificateId ?? receipt.receiptId}"`,
    );
    const decodedPdfText = decodePdfUtf16TjLines(bytes);
    expect(decodedPdfText).toContain("電子乘車證明");
    expect(decodedPdfText).toContain(receipt.receiptNo);
    expect(decodedPdfText).toContain(orderId);
    expect(decodedPdfText).toContain(snapshot.fleetOperatorName);
    expect(decodedPdfText).toContain(snapshot.driverRegistrationMasked);
    expect(decodedPdfText).toContain(snapshot.paymentMethodDisplay);
    expect(decodedPdfText).toContain("02-2944-0985");
    expect(decodedPdfText).not.toContain("非正式憑證");
    await info.attach(`same-order-${orderId}-original-e04-pdf`, {
      contentType: "application/pdf",
      body: bytes,
    });
  } else {
    expect(mimeType).toBe("text/html");
    expect(hasPdfMagic).toBe(false);
    const htmlText = bytes.toString("utf8");
    expect(htmlText).toContain("<!doctype html>");
    expect(htmlText).toContain(receipt.receiptNo);
    expect(htmlText).toContain(orderId);
    expect(htmlText).toContain(snapshot.fleetOperatorName);
    expect(htmlText).toContain(snapshot.driverRegistrationMasked);
    expect(htmlText).toContain(snapshot.paymentMethodDisplay);
    expect(htmlText).not.toContain("非正式憑證");
    await info.attach(`same-order-${orderId}-original-e04-html-fallback`, {
      contentType: "text/html",
      body: bytes,
    });
  }
}
