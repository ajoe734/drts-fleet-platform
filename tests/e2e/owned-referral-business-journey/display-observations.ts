import { expect, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  EMBED_TRIP_FALLBACK_SCREENS,
  embedTripFallbackStates,
} from "../../../apps/referral-embed-web/lib/embed-fixtures";
import {
  Evidence,
  hash,
  object,
  requireFact,
  text,
  type CallOptions,
  type CallResult,
  type ObjectData,
} from "./protocol";

export type DisplayObservationsParams = {
  page: Page;
  referral: (path: string, options?: CallOptions) => Promise<CallResult>;
  evidence: Evidence;
  referralOrigin: string;
  entrySlug: string;
  entryHost: string;
  completedOrderId: string;
  unassignedCancelledOrderId: string | undefined;
  nonce: string;
  directory: string;
  definitionSha: string;
  runtimeSha: string;
};

export type DisplayObservations = {
  definitionSha: string;
  runtimeSha: string;
  terminalFareAndBadges: {
    result: "observed" | "unexecuted";
    orderId?: string;
  };
  manualComplaint: {
    result: "observed";
    orderId: string;
    caseNo: string;
    caseSource: "existing" | "synthetic";
    mobileScreenshot: string;
  };
  noUnsupportedPromises: { result: "observed"; screens: readonly string[] };
  fallbackScenesLabelled: { result: "observed"; screens: readonly string[] };
  negativeActionDestinations: {
    result: "observed";
    screens: readonly string[];
  };
};

// Existing product copy that must not promise an automatic ACK/redispatch the
// canonical order never issued (recipe UI05).
const FORBIDDEN_RECOVERY_PROMISES = [
  "系統也會嘗試自動為您補派",
  "您的請求已安全受理",
  "恢復後會自動繼續",
] as const;

const DEMO_SCENARIO_MARKER = /示範|模擬|測試|僅供展示|demo/i;
const TAIPEI_ZONE_WORDING = /台北|taipei|utc\+8|gmt\+8|\+08:00/i;

const NEGATIVE_SECONDARY_LINKS: Record<
  "nosupply" | "degraded" | "ineligible" | "denied",
  { label: string; destination: "entry" | "trips" | "tel" }
> = {
  nosupply: { label: "改約時間", destination: "entry" },
  degraded: { label: "查看狀態", destination: "trips" },
  ineligible: { label: "返回", destination: "entry" },
  denied: { label: "聯絡社區客服", destination: "tel" },
};

type GotoEmbed = (params: Record<string, string>) => Promise<unknown>;

/**
 * Supplemental observations on the same completed order/session, inspecting
 * surfaces the original owned journey never exercises: the manual complaint
 * panel, Taipei case timestamps, mobile rendering and the four negative/
 * fallback scenes. No new booking, order or session is created.
 */
export async function runDisplayObservations(
  p: DisplayObservationsParams,
): Promise<DisplayObservations> {
  const gotoEmbed: GotoEmbed = (params) =>
    p.page.goto(
      `${p.referralOrigin}/embed/${p.entrySlug}?${new URLSearchParams({
        state: "handoff",
        entryHost: p.entryHost,
        ...params,
      }).toString()}`,
    );

  const terminalFareAndBadges = await observeTerminalFareAndBadges(
    p,
    gotoEmbed,
  );
  const manualComplaint = await observeManualComplaintPanel(p, gotoEmbed);
  const noUnsupportedPromises = await observeNoUnsupportedPromises(
    p,
    gotoEmbed,
  );
  const fallbackScenesLabelled = await observeFallbackScenesLabelled(
    p,
    gotoEmbed,
  );
  const negativeActionDestinations = await observeNegativeActionDestinations(
    p,
    gotoEmbed,
  );

  p.evidence.record({
    stage: "display-observations-completed",
    orderId: p.completedOrderId,
    caseNo: manualComplaint.caseNo,
    result: "observed",
  });

  return {
    definitionSha: p.definitionSha,
    runtimeSha: p.runtimeSha,
    terminalFareAndBadges,
    manualComplaint,
    noUnsupportedPromises,
    fallbackScenesLabelled,
    negativeActionDestinations,
  };
}

// UI01 + UI02: reuse the existing unassigned-cancellation order; no extra
// booking/cancellation. Supplemental to the original terminal/history checks.
async function observeTerminalFareAndBadges(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["terminalFareAndBadges"]> {
  const orderId = p.unassignedCancelledOrderId;
  if (!orderId) return { result: "unexecuted" };

  await gotoEmbed({ screen: "cancelled", orderId });
  await expect(p.page.getByText("行程已取消", { exact: true })).toBeVisible();

  const genericFareRow = p.page
    .getByText("車資", { exact: true })
    .locator("..")
    .first();
  if (await genericFareRow.count()) {
    const genericFareText = text(
      await genericFareRow.innerText(),
      "unassigned-cancellation generic fare row text required",
    );
    requireFact(
      !genericFareText.includes("實際車資待確認"),
      "unassigned-cancellation top fare row must not claim a pending real fare",
    );
  }

  const feeRow = p.page
    .getByText("取消費", { exact: true })
    .locator("..")
    .first();
  await expect(feeRow).toContainText("不收");

  await gotoEmbed({ screen: "trips" });
  await expect(p.page.getByText("我的行程", { exact: true })).toBeVisible();
  const historyLink = p.page.locator(`a[href*="orderId=${orderId}"]`).first();
  await expect(historyLink).toBeVisible();
  const badgeText = text(
    await historyLink.innerText(),
    "own cancelled history card text required",
  );
  requireFact(
    badgeText.includes("已取消"),
    "own cancelled history card must show the localized cancelled badge, not a raw status code",
  );

  p.evidence.record({
    stage: "display-ui01-ui02-terminal-fare-and-badges",
    orderId,
    result: "observed",
  });
  return { result: "observed", orderId };
}

// UI03 + UI04: operate the actual manual complaint panel on the completed
// order, then inspect the same case detail's Taipei timestamps and mobile
// rendering.
async function observeManualComplaintPanel(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["manualComplaint"]> {
  const orderId = p.completedOrderId;
  await gotoEmbed({ screen: "completed", orderId });
  await expect(p.page.getByText("行程已完成", { exact: true })).toBeVisible();

  const toggle = p.page.getByRole("button", {
    name: "行程申訴與遺失物",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    p.page.getByRole("region", { name: "本行程申訴", exact: true }),
  ).toBeVisible();

  const complaintsUrl = `${p.referralOrigin}/api/referral/complaints/${encodeURIComponent(orderId)}`;
  const reload = p.page.getByRole("button", {
    name: "重新讀取案件",
    exact: true,
  });
  const existing = await reloadComplaintList(p, reload, complaintsUrl, orderId);

  let caseNo: string;
  let caseSource: "existing" | "synthetic";
  if (existing.length > 0) {
    caseNo = text(
      object(existing[0]).caseNo,
      "own manual case number required",
    );
    caseSource = "existing";
  } else {
    const submitted = await submitSyntheticComplaint(p, orderId);
    caseNo = submitted.caseNo;
    caseSource = "synthetic";
    await reloadComplaintList(p, reload, complaintsUrl, orderId);
  }

  const detailUrl = `${complaintsUrl}/${encodeURIComponent(caseNo)}`;
  const detailResponsePromise = p.page.waitForResponse(
    (response) =>
      response.url() === detailUrl && response.request().method() === "GET",
    { timeout: 15_000 },
  );
  await p.page
    .getByRole("button", { name: `查看案件 ${caseNo}`, exact: true })
    .click();
  const detailResponse = await detailResponsePromise;
  requireFact(detailResponse.ok(), "manual case detail read must succeed");
  const detailPayload = object(await detailResponse.json());
  requireFact(detailPayload.ok === true, "manual case detail envelope");
  const detail = object(detailPayload.data);
  requireFact(
    detail.orderId === orderId && detail.caseNo === caseNo,
    "selected own manual case detail binding",
  );

  const article = p.page.getByRole("article", {
    name: "申訴案件詳情",
    exact: true,
  });
  await expect(article).toBeVisible();
  await assertTaipeiTimestampLine(
    article.getByText(/^送出時間：/),
    "送出時間：",
    text(detail.submittedAt, "case submittedAt required"),
  );
  await assertTaipeiTimestampLine(
    article.getByText(/^案件更新：/),
    "案件更新：",
    text(detail.updatedAt, "case updatedAt required"),
  );

  const mobileScreenshot = await observeMobileComplaintRendering(p, toggle);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  p.evidence.record({
    stage: "display-ui03-ui04-manual-complaint-panel",
    orderId,
    caseNo,
    result: "observed",
  });
  return { result: "observed", orderId, caseNo, caseSource, mobileScreenshot };
}

async function reloadComplaintList(
  p: DisplayObservationsParams,
  reload: Locator,
  complaintsUrl: string,
  orderId: string,
): Promise<ObjectData[]> {
  const responsePromise = p.page.waitForResponse(
    (response) =>
      response.url() === complaintsUrl && response.request().method() === "GET",
    { timeout: 15_000 },
  );
  await reload.click();
  const response = await responsePromise;
  requireFact(response.ok(), "manual complaint list reload must succeed");
  const payload = object(await response.json());
  requireFact(payload.ok === true, "manual complaint list envelope");
  const data = object(payload.data);
  requireFact(
    data.orderId === orderId && Array.isArray(data.items),
    "manual complaint list exact own order",
  );
  return (data.items as unknown[]).map(object);
}

// Exactly one synthetic command, never resent: an unresolved ACK must fail
// the parent test rather than trigger a second submission.
async function submitSyntheticComplaint(
  p: DisplayObservationsParams,
  orderId: string,
): Promise<{ caseNo: string }> {
  await p.page
    .getByLabel("申訴內容", { exact: true })
    .fill(`display-observations ${p.nonce}`);
  const submitUrl = `${p.referralOrigin}/api/referral/complaints/${encodeURIComponent(orderId)}`;
  const requestPromise = p.page.waitForRequest(
    (request) => request.url() === submitUrl && request.method() === "POST",
    { timeout: 15_000 },
  );
  const responsePromise = p.page.waitForResponse(
    (response) =>
      response.url() === submitUrl && response.request().method() === "POST",
    { timeout: 15_000 },
  );
  await p.page.getByRole("button", { name: "送出申訴", exact: true }).click();
  const request = await requestPromise;
  const response = await responsePromise;
  requireFact(response.ok(), "synthetic manual complaint submit must succeed");
  const requestBody = object(request.postDataJSON());
  requireFact(
    requestBody.orderId === orderId && requestBody.contactRequested === false,
    "synthetic manual complaint command is same-order and contactfalse",
  );
  const payload = object(await response.json());
  requireFact(
    payload.ok === true,
    "synthetic manual complaint submit envelope",
  );
  const data = object(payload.data);
  requireFact(
    data.orderId === orderId &&
      typeof data.caseNo === "string" &&
      Boolean(data.caseNo) &&
      data.idempotencyKey === requestBody.idempotencyKey,
    "synthetic manual complaint ACK matches the same request",
  );
  p.evidence.record({
    stage: "display-manual-complaint-synthetic-submitted",
    orderId,
    caseNo: text(data.caseNo),
    sha256: hash(new TextEncoder().encode(JSON.stringify(requestBody))),
    result: "observed",
  });
  return { caseNo: text(data.caseNo) };
}

async function assertTaipeiTimestampLine(
  locator: Locator,
  prefix: string,
  sourceIso: string,
): Promise<void> {
  await expect(locator).toBeVisible();
  const rendered = text(
    await locator.innerText(),
    `${prefix} line text required`,
  );
  const value = rendered.slice(prefix.length).trim();
  requireFact(
    value !== sourceIso,
    `${prefix} must not render the raw ISO timestamp`,
  );
  requireFact(
    !/invalid date/i.test(value),
    `${prefix} must not render Invalid Date`,
  );
  requireFact(
    TAIPEI_ZONE_WORDING.test(value),
    `${prefix} must carry explicit Asia/Taipei zone wording`,
  );
  const taipeiParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(sourceIso));
  const part = (type: string) =>
    taipeiParts.find((entry) => entry.type === type)?.value ?? "";
  for (const expected of [
    part("month"),
    part("day"),
    part("hour"),
    part("minute"),
  ]) {
    requireFact(
      expected !== "" && value.includes(expected),
      `${prefix} must derive from the same Asia/Taipei source timestamp`,
    );
  }
}

// Mobile layout only; avoid brittle exact-color assertions. The viewport is
// restored afterwards.
async function observeMobileComplaintRendering(
  p: DisplayObservationsParams,
  toggle: Locator,
): Promise<string> {
  const previousViewport = p.page.viewportSize();
  await p.page.setViewportSize({ width: 390, height: 844 });
  try {
    const overflow = await p.page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    requireFact(
      !overflow,
      "mobile viewport must not introduce horizontal overflow on the completed-order screen",
    );
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    requireFact(
      box !== null && box.height >= 32 && box.width >= 32,
      "mobile complaint toggle must remain a visible touchable control",
    );
    await mkdir(`${p.directory}/display-observations`, { recursive: true });
    const screenshotPath = `${p.directory}/display-observations/manual-complaint-mobile.png`;
    await p.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } finally {
    if (previousViewport) await p.page.setViewportSize(previousViewport);
  }
}

// UI05: no_supply/degraded copy must not promise an automatic ACK/redispatch
// the canonical order never issued.
async function observeNoUnsupportedPromises(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["noUnsupportedPromises"]> {
  const screens = ["nosupply", "degraded"] as const;
  for (const screen of screens) {
    await gotoEmbed({ screen });
    const bodyText = text(
      await p.page.locator("body").innerText(),
      `${screen} scene body text required`,
    );
    for (const phrase of FORBIDDEN_RECOVERY_PROMISES)
      requireFact(
        !bodyText.includes(phrase),
        `${screen} scene must not promise "${phrase}" without a canonical order ACK`,
      );
  }
  p.evidence.record({
    stage: "display-ui05-no-unsupported-promises",
    result: "observed",
  });
  return { result: "observed", screens };
}

// UI06: the four fixture fallback scenes must visibly identify themselves as
// a demonstration; message codes/routes stay intact.
async function observeFallbackScenesLabelled(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["fallbackScenesLabelled"]> {
  for (const screen of EMBED_TRIP_FALLBACK_SCREENS) {
    await gotoEmbed({ screen });
    const expectedCode = embedTripFallbackStates[screen].titleCode;
    await expect(
      p.page.locator(`[data-message-code="${expectedCode}"]`).first(),
    ).toBeVisible();
    const bodyText = text(
      await p.page.locator("body").innerText(),
      `fallback scene ${screen} body text required`,
    );
    requireFact(
      DEMO_SCENARIO_MARKER.test(bodyText),
      `fallback scene ${screen} must visibly identify itself as a scenario demonstration with a synthetic order/ETA`,
    );
  }
  p.evidence.record({
    stage: "display-ui06-fallback-scenes-labelled",
    result: "observed",
  });
  return { result: "observed", screens: EMBED_TRIP_FALLBACK_SCREENS };
}

// UI07: change-time/return land back on the same entry's booking screen,
// view-status opens the own trips history, support dials the normalized
// number. Query selectors here are presentation proof only.
async function observeNegativeActionDestinations(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["negativeActionDestinations"]> {
  const screens = Object.keys(NEGATIVE_SECONDARY_LINKS) as Array<
    keyof typeof NEGATIVE_SECONDARY_LINKS
  >;
  for (const screen of screens) {
    const { label, destination } = NEGATIVE_SECONDARY_LINKS[screen];
    await gotoEmbed({ screen });
    const link = p.page.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    const href = text(
      await link.getAttribute("href"),
      `${screen} "${label}" link href required`,
    );
    if (destination === "tel") {
      requireFact(
        href === "tel:0229440985",
        `${screen} support link must dial the normalized 02-2944-0985 number`,
      );
      continue;
    }
    requireFact(
      !href.startsWith("tel:"),
      `${screen} "${label}" must not dial the phone`,
    );
    const expectedScreen = destination === "trips" ? "trips" : "book";
    await link.click();
    await p.page.waitForURL(
      (url) => url.searchParams.get("screen") === expectedScreen,
      { timeout: 15_000 },
    );
    requireFact(
      new URL(p.page.url()).searchParams.get("screen") === expectedScreen,
      `${screen} "${label}" must land on the expected ${destination === "trips" ? "own trips" : "same entry booking"} screen`,
    );
  }
  p.evidence.record({
    stage: "display-ui07-negative-action-destinations",
    result: "observed",
  });
  return { result: "observed", screens };
}
