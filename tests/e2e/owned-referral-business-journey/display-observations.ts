import {
  expect,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  EMBED_TRIP_FALLBACK_SCREENS,
  embedTripFallbackStates,
} from "../../../apps/referral-embed-web/lib/embed-fixtures";
import {
  Evidence,
  hash,
  object,
  persistPrivateJson,
  records,
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

// The exact disclosure phrases the fixture fallback scenes must carry, not a
// broad synonym match that a baseline screen could coincidentally pass.
const DEMO_SCENARIO_DISCLOSURE = "情境示範";
const DEMO_SCENARIO_NOT_REAL_TRIP_DISCLOSURE = "非您目前的真實行程";
const TAIPEI_ZONE_WORDING = /台北|臺北|taipei|utc\+8|gmt\+8|\+08:00/i;

type NegativeActionDestination = "book" | "trips" | "tel-support";
// Mirrors negativeScreens/negativeScreenHref in passenger-embed.tsx: every
// action resolves through an explicit per-kind primaryAction/secondaryAction,
// never a uniform book/tel guess.
const NEGATIVE_SCREEN_ACTIONS: Record<
  "nosupply" | "degraded" | "ineligible" | "denied",
  Array<{ label: string; destination: NegativeActionDestination }>
> = {
  denied: [
    { label: "聯絡社區客服", destination: "tel-support" },
    { label: "重新叫車", destination: "book" },
  ],
  ineligible: [
    { label: "聯絡社區客服", destination: "tel-support" },
    { label: "返回", destination: "book" },
  ],
  nosupply: [
    { label: "改約時間", destination: "book" },
    { label: "稍後重試", destination: "book" },
  ],
  degraded: [
    { label: "查看狀態", destination: "trips" },
    { label: "重試", destination: "book" },
  ],
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

  const historyPayload = object(
    (await p.referral("/api/referral/history")).data,
  );
  const historyRecord = records(historyPayload.items).find(
    (item) => item.orderId === orderId,
  );
  requireFact(
    historyRecord !== undefined,
    "same owned unassigned-cancellation history record required",
  );
  requireFact(
    historyRecord.orderId === orderId && historyRecord.status === "cancelled",
    "same source order/cancelled status required before comparing its fare",
  );
  const fareTotal = historyRecord.fareTotal;
  const hasFiniteFare =
    typeof fareTotal === "number" && Number.isFinite(fareTotal);
  const expectedFareValue = hasFiniteFare
    ? text(
        historyRecord.formattedFare,
        "finite fare must carry an actual formatted representation",
      )
    : "—";

  await gotoEmbed({ screen: "cancelled", orderId });
  await expect(p.page.getByText("行程已取消", { exact: true })).toBeVisible();

  // The exact value span, not the whole label+value row: other rows on the
  // same card can contain "—" or digits that a substring match would accept.
  const genericFareValue = p.page
    .getByText("車資", { exact: true })
    .locator("xpath=following-sibling::span[1]")
    .first();
  await expect(genericFareValue).toBeVisible();
  const genericFareValueText = text(
    await genericFareValue.innerText(),
    "unassigned-cancellation top fare value required",
  ).trim();
  requireFact(
    genericFareValueText === expectedFareValue,
    "unassigned-cancellation top fare value must exactly match the same history record's actual fare",
  );

  const feeRow = p.page
    .getByText("取消費", { exact: true })
    .locator("..")
    .first();
  await expect(feeRow).toContainText("不收");

  await gotoEmbed({ screen: "trips" });
  await expect(p.page.getByText("我的行程", { exact: true })).toBeVisible();
  const historyLink = p.page.locator(`a[href*="orderId=${orderId}"]`).first();
  await expect(historyLink).toBeVisible();
  // getByText with exact:true already requires the localized "已取消" label,
  // not a raw status code, to be present as this element's full text.
  const historyBadge = historyLink.getByText("已取消", { exact: true });
  await expect(historyBadge).toBeVisible();
  // The fare value div is the badge's own next sibling in the same
  // right-aligned column (TripsScreen), not an includes() over the whole
  // card, which other fields (dates, dashes) could coincidentally satisfy.
  const historyFareValue = historyBadge.locator(
    "xpath=following-sibling::div[1]",
  );
  await expect(historyFareValue).toBeVisible();
  const historyFareValueText = text(
    await historyFareValue.innerText(),
    "own cancelled history card fare value required",
  ).trim();
  requireFact(
    historyFareValueText === expectedFareValue,
    "own cancelled history card fare value must exactly match the same history record's actual fare",
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

  const viewCaseButton = p.page.getByRole("button", {
    name: `查看案件 ${caseNo}`,
    exact: true,
  });
  const mobileScreenshot = await observeMobileComplaintRendering(p, [
    { label: "toggle", locator: toggle },
    { label: "reload", locator: reload },
    { label: "view-case", locator: viewCaseButton },
  ]);

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

// Exactly one synthetic command, never resent: the actual request body/key is
// persisted before the ACK is awaited, so a lost response still leaves a
// recoverable unknown-ACK journal instead of silently losing it in cleanup.
export async function submitSyntheticComplaint(
  p: DisplayObservationsParams,
  orderId: string,
): Promise<{ caseNo: string }> {
  await p.page
    .getByLabel("申訴內容", { exact: true })
    .fill(`display-observations ${p.nonce}`);
  const submitUrl = `${p.referralOrigin}/api/referral/complaints/${encodeURIComponent(orderId)}`;
  // A same-URL response filter alone cannot tell the original POST apart from
  // a stray duplicate that happens to echo the same orderId/idempotencyKey,
  // so every matching request is tracked by object identity and the ACK is
  // bound to the exact captured Request via request.response() rather than
  // to "any POST response for this URL".
  const matchingRequests: Request[] = [];
  const onRequest = (candidate: Request): void => {
    if (candidate.url() === submitUrl && candidate.method() === "POST") {
      matchingRequests.push(candidate);
    }
  };
  p.page.on("request", onRequest);
  try {
    const requestPromise = p.page.waitForRequest(
      (request) => request.url() === submitUrl && request.method() === "POST",
      { timeout: 15_000 },
    );
    void requestPromise.catch(() => undefined);
    await p.page.getByRole("button", { name: "送出申訴", exact: true }).click();
    const request = await requestPromise;
    const requestBody = object(request.postDataJSON());
    requireFact(
      requestBody.orderId === orderId && requestBody.contactRequested === false,
      "synthetic manual complaint command is same-order and contactfalse",
    );
    const idempotencyKey = text(
      requestBody.idempotencyKey,
      "synthetic manual complaint idempotency key required",
    );
    const bodySha256 = hash(
      new TextEncoder().encode(JSON.stringify(requestBody)),
    );
    // The -facts.json suffix matches the existing cancellations/*-facts.json
    // glob already in ci-integ.yml's artifact allowlist, so this is genuinely
    // retained, not just written to a path nobody uploads. The actual request
    // body is persisted (not only its hash/key): a hash alone cannot
    // reconstruct the original command for recovery.
    await mkdir(`${p.directory}/cancellations`, { recursive: true });
    const journalPath = `${p.directory}/cancellations/manual-complaint-command-facts.json`;
    await persistPrivateJson(journalPath, {
      state: "ack_unknown",
      orderId,
      idempotencyKey,
      bodySha256,
      definitionSha: p.definitionSha,
      runtimeSha: p.runtimeSha,
      requestBody,
      recovery:
        "Possible own write. Preserve this exact body/key; do not resend a replacement command or key.",
    });

    const response = await request.response().catch(() => null);
    if (response === null) {
      p.evidence.record({
        stage: "display-manual-complaint-ACK-unknown",
        orderId,
        sha256: bodySha256,
        result: "retained",
      });
      throw new Error(
        "synthetic manual complaint request produced no response",
      );
    }
    requireFact(
      response.ok(),
      "synthetic manual complaint submit must succeed",
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
        data.idempotencyKey === idempotencyKey,
      "synthetic manual complaint ACK matches the same request",
    );
    const caseNo = text(data.caseNo);
    // Re-checked here, after every await that could race with a late-arriving
    // duplicate, not before response.json(): a second matching POST observed
    // while awaiting the body must still block the ACK from being recorded,
    // not just one observed before the body was read.
    requireFact(
      matchingRequests.length === 1 && matchingRequests[0] === request,
      "exactly one same-order manual complaint POST was observed",
    );
    await persistPrivateJson(journalPath, {
      state: "acknowledged",
      orderId,
      idempotencyKey,
      bodySha256,
      definitionSha: p.definitionSha,
      runtimeSha: p.runtimeSha,
      requestBody,
      caseNo,
    });
    p.evidence.record({
      stage: "display-manual-complaint-synthetic-submitted",
      orderId,
      caseNo,
      sha256: bodySha256,
      result: "observed",
    });
    return { caseNo };
  } finally {
    p.page.off("request", onRequest);
  }
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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(sourceIso));
  const part = (type: string) =>
    taipeiParts.find((entry) => entry.type === type)?.value ?? "";
  const year = part("year"),
    month = part("month"),
    day = part("day"),
    hour = part("hour"),
    minute = part("minute");
  requireFact(
    [year, month, day, hour, minute].every((fragment) => fragment !== ""),
    `${prefix} requires a resolvable Asia/Taipei source timestamp`,
  );
  // Match the full contiguous year+month+day+hour+minute digit sequence, not
  // independent fragments; a lone coincidental repeated digit must not pass,
  // and the year is mandatory, not an optional fallback.
  const renderedDigits = value.replace(/[^0-9]/g, "");
  const expectedDigits = `${year}${month}${day}${hour}${minute}`;
  requireFact(
    renderedDigits.includes(expectedDigits),
    `${prefix} must derive from the same complete Asia/Taipei source timestamp, including the year`,
  );
}

const MOBILE_TOUCH_TARGET_PX = 44;

// Mobile layout only; avoid brittle exact-color assertions. The viewport is
// restored afterwards. Checks all three controls the panel actually changes
// (toggle, reload, view-case), not just the toggle, so pre-fix default
// browser button styling cannot pass by accident on the untested ones.
async function observeMobileComplaintRendering(
  p: DisplayObservationsParams,
  controls: Array<{ label: string; locator: Locator }>,
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
    for (const { label, locator } of controls) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      requireFact(
        box !== null &&
          box.height >= MOBILE_TOUCH_TARGET_PX &&
          box.width >= MOBILE_TOUCH_TARGET_PX,
        `mobile complaint ${label} control must be a usable ${MOBILE_TOUCH_TARGET_PX}px touch target`,
      );
      const boundary = await locator.evaluate((node) => {
        const computed = getComputedStyle(node as HTMLElement);
        return {
          hasBorder:
            computed.borderStyle !== "none" &&
            parseFloat(computed.borderWidth) > 0,
          hasBackground: computed.backgroundColor !== "rgba(0, 0, 0, 0)",
        };
      });
      requireFact(
        boundary.hasBorder || boundary.hasBackground,
        `mobile complaint ${label} control must show a themed visible boundary or background`,
      );
    }
    // Matches the existing cancellations/*.png glob already in the ci-integ.yml
    // artifact allowlist, so the screenshot is genuinely retained, not just
    // written to a path nobody uploads.
    await mkdir(`${p.directory}/cancellations`, { recursive: true });
    const screenshotPath = `${p.directory}/cancellations/manual-complaint-mobile.png`;
    await p.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } finally {
    if (previousViewport) await p.page.setViewportSize(previousViewport);
  }
}

// UI05: no_supply/degraded copy must not promise an automatic ACK/redispatch
// the canonical order never issued. The scene title is verified first so a
// forbidden-copy check can never pass by landing on the wrong page.
async function observeNoUnsupportedPromises(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["noUnsupportedPromises"]> {
  const screens = ["nosupply", "degraded"] as const;
  const expectedTitle: Record<(typeof screens)[number], string> = {
    nosupply: "附近暫無可派車輛",
    degraded: "服務暫時不穩定",
  };
  for (const screen of screens) {
    await gotoEmbed({ screen });
    await expect(
      p.page.getByText(expectedTitle[screen], { exact: true }),
    ).toBeVisible();
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
// a demonstration, including that the data is not the rider's real trip;
// message codes/routes stay intact. Both exact disclosure phrases are
// required (not a broad synonym match); there is no baseline-screen veto,
// since the rider's own history can legitimately contain arbitrary text.
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
      bodyText.includes(DEMO_SCENARIO_DISCLOSURE) &&
        bodyText.includes(DEMO_SCENARIO_NOT_REAL_TRIP_DISCLOSURE),
      `fallback scene ${screen} must carry both the "${DEMO_SCENARIO_DISCLOSURE}" and "${DEMO_SCENARIO_NOT_REAL_TRIP_DISCLOSURE}" disclosures`,
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
// number. Both primary and secondary actions on all four negative screens
// are exercised, so a contact-labelled action wired to the wrong
// destination (e.g. a label implying a phone call that instead opens the
// booking form) fails genuinely. Query selectors here are presentation
// proof only.
async function observeNegativeActionDestinations(
  p: DisplayObservationsParams,
  gotoEmbed: GotoEmbed,
): Promise<DisplayObservations["negativeActionDestinations"]> {
  const screens = Object.keys(NEGATIVE_SCREEN_ACTIONS) as Array<
    keyof typeof NEGATIVE_SCREEN_ACTIONS
  >;
  for (const screen of screens) {
    for (const { label, destination } of NEGATIVE_SCREEN_ACTIONS[screen]) {
      await gotoEmbed({ screen });
      const link = p.page.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      const href = text(
        await link.getAttribute("href"),
        `${screen} "${label}" link href required`,
      );
      if (destination === "tel-support") {
        requireFact(
          href === "tel:0229440985",
          `${screen} "${label}" support link must dial the normalized 02-2944-0985 number`,
        );
        continue;
      }
      requireFact(
        !href.startsWith("tel:"),
        `${screen} "${label}" must not dial the phone`,
      );
      await link.click();
      if (destination === "trips") {
        await expect(
          p.page.getByText("我的行程", { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          p.page.getByText("上車地點", { exact: true }),
        ).toBeVisible();
      }
      const landed = new URL(p.page.url());
      const expectedOrigin = new URL(p.referralOrigin).origin;
      requireFact(
        landed.origin === expectedOrigin &&
          landed.pathname === `/embed/${p.entrySlug}` &&
          landed.searchParams.get("entryHost") === p.entryHost &&
          landed.searchParams.get("screen") ===
            (destination === "trips" ? "trips" : "book"),
        `${screen} "${label}" must land on the same entry's ${destination === "trips" ? "own trips" : "booking"} screen, not a different origin/entry`,
      );
    }
  }
  p.evidence.record({
    stage: "display-ui07-negative-action-destinations",
    result: "observed",
  });
  return { result: "observed", screens };
}
