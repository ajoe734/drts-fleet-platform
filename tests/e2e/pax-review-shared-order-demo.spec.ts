import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
  type Response as BrowserResponse,
} from "@playwright/test";
import { trackInterruptedRehearsal } from "./pax-review-shared-order/interrupted-rehearsal-finalizer";
import type { ActionReceipt } from "@drts/contracts";
import { readFile } from "node:fs/promises";
import { recordOrderEvidence } from "./pax-review-shared-order/evidence";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import { bookingResponseDiagnostic } from "./pax-review-shared-order/booking-diagnostic";
import { dispatchResponseDiagnostic } from "./pax-review-shared-order/dispatch-diagnostic";

type JourneyStep = ReturnType<typeof createJourneyProgress>["step"];

const sharedDev = process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true";
const PAX = process.env.PAX_REVIEW_PASSENGER_ORIGIN || "http://localhost:3319";
const OPS = process.env.PAX_REVIEW_OPS_ORIGIN || "http://127.0.0.1:3202";
const PLATFORM_ADMIN =
  process.env.PAX_REVIEW_PLATFORM_ADMIN_ORIGIN ||
  (sharedDev ? "" : "http://127.0.0.1:3204");
const DRIVER = sharedDev ? `${PAX}/review-driver` : "http://127.0.0.1:3101";
const camel = (value: any): any =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            camel(entry),
          ]),
        )
      : value;

async function authority(page: Page, id: string) {
  const response = await page.request.get(
    `${PAX}/api/passenger-app/rides/${id}`,
  );
  expect(response.status()).toBe(200);
  return camel(await response.json()).data.ride;
}

async function registerDriver(
  ops: Page,
  driver: Page,
  base: string,
  step: JourneyStep,
) {
  const code = await step("Ops invite driver device", async () => {
    await ops
      .getByLabel("演練司機", { exact: true })
      .selectOption("pax-review-driver-a");
    const invitation = ops.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/driver/device/invite") &&
        r.request().method() === "POST",
    );
    await ops.getByRole("button", { name: "發出既有司機裝置註冊碼" }).click();
    const response = await invitation;
    expect(response.status()).toBeLessThan(300);
    const code = camel(await response.json()).data.registrationCode;
    expect(typeof code).toBe("string");
    return code;
  });
  await step("Driver open onboarding", () => driver.goto(`${base}/onboarding`));
  await step("Driver submit registration code", async () => {
    await driver.getByLabel("裝置註冊碼", { exact: true }).fill(code);
    const registration = driver.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/driver/device/register") &&
        r.request().method() === "POST",
    );
    await driver
      .getByRole("button", { name: "註冊此裝置", exact: true })
      .click();
    expect((await registration).status()).toBeLessThan(300);
    await expect(driver.getByLabel("裝置註冊碼", { exact: true })).toHaveCount(
      0,
    );
  });
  await step("Driver open jobs after registration", async () => {
    await driver.getByText("任務", { exact: true }).first().click();
    await expect(driver).toHaveURL(/\/jobs$/);
    await ops.getByRole("button", { name: "隱藏註冊碼" }).click();
  });
}

async function bind(page: Page, scenario: "success" | "retry_once") {
  await page.goto(`${PAX}/account/payment-methods`);
  await page
    .getByLabel("模擬 PSP 結果", { exact: true })
    .selectOption(scenario);
  await page.getByRole("button", { name: "新增信用卡", exact: true }).click();
  const bound = page.waitForResponse(
    (r) =>
      r.url().endsWith("/payment-methods") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "綁定卡片", exact: true }).click();
  const result = camel(await (await bound).json()).data;
  expect(result.status).toBe("completed");
  return result.method.paymentMethodId as string;
}

async function book(
  page: Page,
  paymentMethodId: string,
  unpaidRejection = false,
) {
  await page.goto(`${PAX}/`);
  const ack = page.getByRole("button", { name: "我已閱讀並同意", exact: true });
  await expect(page.getByText("建立乘車需求", { exact: true })).toBeVisible();
  // AuthScreen's P5Header renders the title as text. Settings load separately;
  // wait for the actual disclosure or form before deciding whether to agree.
  await expect(
    ack.or(page.getByLabel("示範上車地點", { exact: true })),
  ).toBeVisible();
  if (await ack.isVisible()) await ack.click();
  await page
    .getByLabel("示範上車地點", { exact: true })
    .selectOption("review-banqiao");
  await page
    .getByLabel("示範下車地點", { exact: true })
    .selectOption("review-city-hall");
  // The review runtime explicitly selects the existing one-minute lead
  // configuration. Keep enough real margin for quote/confirmation and wait
  // until that scheduled instant before the actual Driver UI starts the trip.
  const localTime = await page.evaluate(() => {
    const date = new Date(Math.ceil((Date.now() + 120_000) / 60_000) * 60_000);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await page.getByLabel("預約時間", { exact: true }).fill(localTime);
  await page.getByRole("button", { name: "試算車資", exact: true }).click();
  await expect(page.getByText(/NT\$ (85|105)/).first()).toBeVisible();
  // The existing confirmation sheet owns payment selection. Require the
  // newly bound method itself; selecting another card would change B's PSP case.
  const choice = page.locator(`input[value="${paymentMethodId}"]`);
  await expect(choice).toBeVisible();
  await choice.check();
  await page.getByRole("checkbox", { name: "我已確認費用與優惠說明" }).check();
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/passenger-app/rides") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "確認叫車", exact: true }).click();
  const response = await created;
  if (unpaidRejection) {
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("pending_payment_block");
    await expect(
      page.getByText("您有一筆行程扣款失敗，請結清後再繼續叫車。").first(),
    ).toBeVisible();
    return "";
  }
  expect(
    response.status(),
    await bookingResponseDiagnostic(response),
  ).toBeLessThan(300);
  const id = camel(await response.json()).data.ride.order.orderId as string;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(new RegExp(`/rides/${id}$`));
  await expect(page.getByTestId("review-order-id")).toHaveText(id);
  return id;
}

async function opsRead(ops: Page, orderId: string) {
  await ops.getByLabel("訂單 UUID", { exact: true }).fill(orderId);
  await ops.getByRole("button", { name: "讀回同單", exact: true }).click();
  await expect(ops.getByTestId("ops-review-order-id")).toHaveText(orderId);
}

async function readCompletedByOps(ops: Page, orderId: string) {
  await opsRead(ops, orderId);
  await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
    "completed",
  );
  const response = await ops.request.get(
    `${OPS}/control-plane-proxy/orders/${orderId}`,
  );
  expect(response.status()).toBe(200);
  expect(camel(await response.json()).data).toMatchObject({
    orderId,
    status: "completed",
  });
}

async function submitLostItemForCompletedRide(
  pax: Page,
  ops: Page,
  orderId: string,
  info: TestInfo,
) {
  const description = "演練遺失物：藍色虛構雨傘（無真人失物）";
  const content = "同一趟已完成行程的遺失物演練，請依原客服流程處理。";
  await pax
    .getByRole("button", { name: "客訴與遺失物表單", exact: true })
    .click();
  await pax.getByRole("combobox").selectOption("lost_item");
  await pax.getByPlaceholder("遺失物描述", { exact: true }).fill(description);
  await pax
    .getByPlaceholder("請描述您的問題，如為遺失物請說明特徵...", {
      exact: true,
    })
    .fill(content);
  await pax.getByRole("checkbox", { name: /同意客服人員/ }).check();
  const submitted = pax.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/passenger-app/rides/${orderId}/complaints` &&
      response.request().method() === "POST",
  );
  await pax.getByRole("button", { name: "確認送出", exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBeLessThan(300);
  const caseNo = camel(await response.json()).data.complaintId as string;
  expect(caseNo).toMatch(/^PAX-[0-9a-f-]{36}$/);
  await expect(
    pax.getByText("我們已收到您的問題", { exact: true }),
  ).toBeVisible();
  await info.attach("A-lost-item-submitted-pax", {
    body: await pax.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  const readback = await ops.request.get(
    `${OPS}/control-plane-proxy/complaints/${caseNo}`,
  );
  expect(readback.status()).toBe(200);
  const complaint = camel(await readback.json()).data;
  expect(complaint).toMatchObject({
    caseNo,
    caseSource: "app",
    relatedOrderId: orderId,
    category: "lost_and_found",
    status: "new",
  });
  expect(complaint.description).toContain(description);
  expect(complaint.description).toContain(content);
  expect(complaint.description).toContain("同意客服聯繫：是");
  await ops.goto(`${OPS}/complaints/${caseNo}`);
  await expect(
    ops.locator(`a[href="/dispatch/${orderId}"]`).first(),
  ).toBeVisible();
  await expect(
    ops.getByText(description, { exact: false }).first(),
  ).toBeVisible();
  const timelineResponse = await ops.request.get(
    `${OPS}/control-plane-proxy/complaints/${caseNo}/timeline`,
  );
  expect(timelineResponse.status()).toBe(200);
  const timeline = camel(await timelineResponse.json()).data.items;
  expect(timeline).toHaveLength(1);
  expect(timeline[0].action).toBe("case_created");
  await expect(ops.getByText("轉入合規佇列", { exact: true })).toHaveCount(0);
  const progress = ops.getByTestId("complaint-progress");
  await expect(progress.getByText("complete", { exact: true })).toHaveCount(1);
  await expect(progress.getByText("current", { exact: true })).toHaveCount(1);
  await expect(progress.getByText("upcoming", { exact: true })).toHaveCount(2);
  await info.attach("A-lost-item-case-ops", {
    body: await ops.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await info.attach("A-lost-item-same-order-case-facts", {
    body: JSON.stringify({
      orderId,
      caseNo,
      category: complaint.category,
      caseSource: complaint.caseSource,
      status: complaint.status,
      relatedOrderId: complaint.relatedOrderId,
      contactConsent: true,
      content,
      lostItemDescription: description,
      actualTimelineActions: timeline.map(
        (entry: { action: string }) => entry.action,
      ),
      actualProgress: { complete: 1, current: 1, upcoming: 2 },
      scope: "Passenger real form POST, Ops real case API and actual case page",
      resolvedOrReturned: false,
    }),
    contentType: "application/json",
  });
  const listTimelineRequest = ops.waitForResponse(
    (response) =>
      response.url().endsWith(`/complaints/${caseNo}/timeline`) &&
      response.request().method() === "GET",
  );
  await ops.goto(`${OPS}/complaints?caseNo=${encodeURIComponent(caseNo)}`);
  const listTimelineResponse = await listTimelineRequest;
  expect(listTimelineResponse.status()).toBe(200);
  const listTimeline = camel(await listTimelineResponse.json()).data.items;
  expect(listTimeline).toEqual(timeline);
  await expect(
    ops.locator(`a[href="/dispatch?orderId=${orderId}"]`).first(),
  ).toBeVisible();
  await expect(
    ops
      .getByTestId("complaint-list-activity")
      .getByText(timeline[0].note, { exact: true }),
  ).toBeVisible();
  await info.attach("A-lost-item-case-list-ops", {
    body: await ops.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await info.attach("A-lost-item-case-list-facts", {
    body: JSON.stringify({
      orderId,
      caseNo,
      timelineActions: listTimeline.map(
        (entry: { action: string }) => entry.action,
      ),
      displayedNote: timeline[0].note,
      scope: "ordinary complaints workspace, actual SDK/BFF timeline and DOM",
      resolvedOrReturned: false,
    }),
    contentType: "application/json",
  });
  const handlingNote = `演練處理備註：已核對同單 ${orderId}；真人聯繫另驗。`;
  await ops
    .getByTestId("complaint-list-actions")
    .getByRole("button", { name: "新增備註", exact: true })
    .click();
  await ops.getByLabel("調查備註", { exact: true }).fill(handlingNote);
  const noteRequest = ops.waitForResponse(
    (response) =>
      response.url().endsWith(`/complaints/${caseNo}/notes`) &&
      response.request().method() === "POST",
  );
  await ops.getByRole("button", { name: "確認", exact: true }).click();
  expect((await noteRequest).status()).toBeLessThan(300);
  await verifyRealCaseAudit(
    ops,
    await noteRequest,
    info,
    orderId,
    caseNo,
    "add_complaint_case_note",
    "add-note",
  );
  // Keep this page mounted: a reload would hide a stale workspace defect.
  await expect(
    ops
      .getByTestId("complaint-list-activity")
      .getByText(handlingNote, { exact: true }),
  ).toBeVisible();
  const updatedCaseResponse = await ops.request.get(
    `${OPS}/control-plane-proxy/complaints/${caseNo}`,
  );
  expect(updatedCaseResponse.status()).toBe(200);
  const updatedCase = camel(await updatedCaseResponse.json()).data;
  expect(updatedCase).toMatchObject({
    caseNo,
    relatedOrderId: orderId,
    status: "under_investigation",
  });
  const updatedTimelineResponse = await ops.request.get(
    `${OPS}/control-plane-proxy/complaints/${caseNo}/timeline`,
  );
  expect(updatedTimelineResponse.status()).toBe(200);
  const updatedTimeline = camel(await updatedTimelineResponse.json()).data
    .items;
  expect(
    updatedTimeline.map((entry: { action: string }) => entry.action),
  ).toEqual(["case_created", "case_note_added"]);
  expect(updatedTimeline[1].note).toBe(handlingNote);
  await info.attach("A-lost-item-case-list-after-note-ops", {
    body: await ops.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await info.attach("A-lost-item-case-list-after-note-facts", {
    body: JSON.stringify({
      orderId,
      caseNo,
      status: updatedCase.status,
      relatedOrderId: updatedCase.relatedOrderId,
      actualTimelineActions: updatedTimeline.map(
        (entry: { action: string }) => entry.action,
      ),
      displayedNote: handlingNote,
      samePageWithoutReload: true,
      resolvedOrReturned: false,
      scope: "real Ops note POST and same mounted ordinary case workspace",
    }),
    contentType: "application/json",
  });
  await completeInternalLostItemCase(ops, info, orderId, caseNo);
  await pax.getByRole("button", { name: "返回行程", exact: true }).click();
  await ops.goto(`${OPS}/review`);
  await readCompletedByOps(ops, orderId);
}

async function completeInternalLostItemCase(
  ops: Page,
  info: TestInfo,
  orderId: string,
  caseNo: string,
) {
  const assigneeId = "AGENT-OPS-002";
  const steps = [
    {
      action: "assign",
      label: "指派 / 重新指派",
      status: "assigned",
      event: "case_assigned",
      note: `演練指派：既有示範處理人核對同單 ${orderId}，未通知真人。`,
    },
    {
      action: "resolve",
      label: "結案處理",
      status: "resolved",
      event: "case_resolved",
      note: "演練處理完成：虛構雨傘案例；沒有真人聯絡或實物返還。",
    },
    {
      action: "close",
      label: "關閉案件",
      status: "closed",
      event: "case_closed",
      note: "關閉內部演練案件：未致電、未取回實物，不代表真實失物結案。",
    },
  ];
  const expectedEvents = ["case_created", "case_note_added"];
  const observed = [];
  for (const step of steps) {
    await ops
      .getByTestId("complaint-list-actions")
      .getByRole("button", { name: step.label, exact: true })
      .click();
    if (step.action === "assign") {
      await ops.getByLabel("負責人 ID", { exact: true }).fill(assigneeId);
      await ops.getByLabel("指派備註", { exact: true }).fill(step.note);
    } else {
      // Playwright includes option text in this implicit label's text.
      const resolutionField = ops.getByLabel("處理代碼");
      await expect(resolutionField).toBeVisible();
      await expect(
        resolutionField.locator('option[value="resolved_other"]'),
      ).toHaveCount(1);
      await resolutionField.selectOption("resolved_other");
      // Closing reuses the resolution note, which is also implicit label text.
      const closingNoteField = ops.getByLabel("結案備註");
      await expect(closingNoteField).toBeVisible();
      await closingNoteField.fill(step.note);
    }
    const write = ops.waitForResponse(
      (response) =>
        response.url().endsWith(`/complaints/${caseNo}/${step.action}`) &&
        response.request().method() === "POST",
    );
    await ops.getByRole("button", { name: "確認", exact: true }).click();
    expect((await write).status()).toBeLessThan(300);
    await verifyRealCaseAudit(
      ops,
      await write,
      info,
      orderId,
      caseNo,
      `${step.action}_complaint_case`,
      step.action,
    );
    // Do not navigate or reload: every action must update this same workspace.
    await expect(
      ops
        .getByTestId("complaint-list-activity")
        .getByText(step.note, { exact: true }),
    ).toBeVisible();
    const read = await ops.request.get(
      `${OPS}/control-plane-proxy/complaints/${caseNo}`,
    );
    expect(read.status()).toBe(200);
    const record = camel(await read.json()).data;
    expect(record).toMatchObject({
      caseNo,
      relatedOrderId: orderId,
      assigneeId,
      status: step.status,
    });
    if (step.action !== "assign") {
      expect(record).toMatchObject({
        resolutionCode: "resolved_other",
        closingNote: step.note,
      });
    }
    const timelineResponse = await ops.request.get(
      `${OPS}/control-plane-proxy/complaints/${caseNo}/timeline`,
    );
    expect(timelineResponse.status()).toBe(200);
    const timeline = camel(await timelineResponse.json()).data.items;
    expectedEvents.push(step.event);
    expect(timeline.map((entry: { action: string }) => entry.action)).toEqual(
      expectedEvents,
    );
    expect(timeline.at(-1).note).toBe(step.note);
    observed.push({ action: step.action, record, timeline });
    await info.attach(`A-lost-item-internal-case-${step.action}-facts`, {
      body: JSON.stringify({
        orderId,
        caseNo,
        action: step.action,
        status: record.status,
        assigneeId: record.assigneeId,
        timelineActions: timeline.map(
          (entry: { action: string }) => entry.action,
        ),
      }),
      contentType: "application/json",
    });
  }
  await expect(
    ops
      .getByTestId("complaint-list-actions")
      .getByRole("button", { name: "新增備註", exact: true }),
  ).toHaveCount(0);
  const exportResponse = await ops.request.get(
    `${OPS}/control-plane-proxy/complaints/${caseNo}/export`,
  );
  expect(exportResponse.status()).toBe(200);
  const exported = camel(await exportResponse.json()).data;
  expect(exported.readyForAudit).toBe(true);
  expect(exported.complaintCase).toMatchObject({
    caseNo,
    relatedOrderId: orderId,
    status: "closed",
  });
  expect(
    exported.timeline.map((entry: { action: string }) => entry.action),
  ).toEqual(expectedEvents);
  await expect(ops.getByText("可生成審計封包", { exact: true })).toBeVisible();
  await expect(
    ops.locator(`a[href="/dispatch?orderId=${orderId}"]`).first(),
  ).toBeVisible();
  const explicitExport = ops.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith(`/complaints/${caseNo}/export`) &&
      url.searchParams.get("action_receipt") === "true" &&
      response.request().method() === "GET"
    );
  });
  await ops
    .getByTestId("complaint-list-actions")
    .getByRole("button", { name: "匯出案件視圖", exact: true })
    .click();
  const exportReceipt = await verifyRealCaseAudit(
    ops,
    await explicitExport,
    info,
    orderId,
    caseNo,
    "export_complaint_case_view",
    "export",
  );
  await visitActualAuditDestination(ops, info, orderId, caseNo, exportReceipt);
  await info.attach("A-lost-item-internal-case-closed-ops", {
    body: await ops.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await info.attach("A-lost-item-internal-case-lifecycle-facts", {
    body: JSON.stringify({
      orderId,
      caseNo,
      observed,
      finalTimelineActions: expectedEvents,
      readyForAudit: exported.readyForAudit,
      samePageWithoutReload: true,
      internalStatus: "closed",
      humanContacted: false,
      physicalItemReturned: false,
      auditReceiptOrLinkVerified: true,
      auditDestinationPageRendered: true,
      scope:
        "real ordinary Ops forms and persisted API; external outcome is explicitly fictional",
    }),
    contentType: "application/json",
  });
}

async function verifyRealCaseAudit(
  ops: Page,
  response: BrowserResponse,
  info: TestInfo,
  orderId: string,
  caseNo: string,
  expectedAction: string,
  label: string,
): Promise<ActionReceipt> {
  expect(response.ok()).toBe(true);
  const envelope = camel(await response.json());
  const receipt = envelope.meta.actionReceipt as ActionReceipt;
  expect(receipt).toMatchObject({
    resourceType: "complaint_case",
    resourceId: caseNo,
    status: "completed",
  });
  expect(receipt.auditId).toMatch(
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
  );
  expect(receipt.actionId).toBeTruthy();
  let auditRecord: any;
  await expect
    .poll(async () => {
      const read = await ops.request.get(
        `${OPS}/control-plane-proxy/audit?auditId=${encodeURIComponent(receipt.auditId)}`,
      );
      expect(read.status()).toBe(200);
      const records = camel(await read.json()).data.items;
      auditRecord = records.find(
        (record: { auditId: string }) => record.auditId === receipt.auditId,
      );
      return auditRecord?.auditId;
    })
    .toBe(receipt.auditId);
  expect(auditRecord).toMatchObject({
    auditId: receipt.auditId,
    requestId: receipt.actionId,
    moduleName: "complaint",
    actionName: expectedAction,
    resourceType: "complaint_case",
    resourceId: caseNo,
  });
  const target = new URL("/audit", PLATFORM_ADMIN);
  target.searchParams.set("auditId", receipt.auditId);
  target.searchParams.set("resourceType", "complaint_case");
  target.searchParams.set("resourceId", caseNo);
  await expect(ops.getByTestId("complaint-action-audit-link")).toHaveAttribute(
    "href",
    target.toString(),
  );
  await info.attach(`A-lost-item-real-audit-${label}-facts`, {
    body: JSON.stringify({
      orderId,
      caseNo,
      receipt,
      auditRecord: {
        auditId: auditRecord.auditId,
        requestId: auditRecord.requestId,
        actionName: auditRecord.actionName,
        resourceType: auditRecord.resourceType,
        resourceId: auditRecord.resourceId,
        createdAt: auditRecord.createdAt,
      },
      auditHref: target.toString(),
      actualBackendRead: true,
    }),
    contentType: "application/json",
  });
  return receipt;
}

async function visitActualAuditDestination(
  ops: Page,
  info: TestInfo,
  orderId: string,
  caseNo: string,
  receipt: ActionReceipt,
) {
  const request = ops.context().waitForEvent("response", {
    timeout: 30_000,
    predicate: (response) => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(PLATFORM_ADMIN).origin &&
        url.pathname.endsWith("/control-plane-proxy/audit") &&
        url.searchParams.get("auditId") === receipt.auditId
      );
    },
  });
  const opened = ops.context().waitForEvent("page", { timeout: 30_000 });
  await ops.getByTestId("complaint-action-audit-link").click();
  const audit = await opened;
  try {
    const actualRead = await request;
    expect(actualRead.status()).toBe(200);
    const items = camel(await actualRead.json()).data.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      auditId: receipt.auditId,
      resourceId: caseNo,
      actionName: "export_complaint_case_view",
      requestId: receipt.actionId,
    });
    await expect(audit).toHaveURL(
      (url) =>
        url.pathname === "/audit" &&
        url.searchParams.get("auditId") === receipt.auditId,
    );
    await expect(
      audit
        .getByRole("table")
        .getByText("export_complaint_case_view", { exact: true }),
    ).toBeVisible();
    await expect(audit.locator("body")).toContainText(receipt.auditId);
    await expect(audit.locator("body")).toContainText(caseNo);
    await info.attach("A-lost-item-audit-destination-ops", {
      body: await audit.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await info.attach("A-lost-item-audit-destination-facts", {
      body: JSON.stringify({
        orderId,
        caseNo,
        auditId: receipt.auditId,
        actionId: receipt.actionId,
        actualURL: audit.url(),
        actualPageRendered: true,
        actualOwningAppAPIRead: true,
        APIInstance: sharedDev ? "shared CloudRun" : "second real API instance",
      }),
      contentType: "application/json",
    });
  } finally {
    await audit.close();
  }
}

async function createDispatch(ops: Page, orderId: string) {
  await opsRead(ops, orderId);
  const job = ops.waitForResponse(
    (r) =>
      r.url().endsWith(`/orders/${orderId}/dispatch`) &&
      r.request().method() === "POST",
  );
  await ops.getByRole("button", { name: "建立同單派遣", exact: true }).click();
  expect((await job).status()).toBeLessThan(300);
  await expect(ops.getByTestId("ops-review-job-id")).toBeVisible();
}

async function assign(
  ops: Page,
  driverId = "pax-review-driver-a",
  reassign = false,
) {
  const response = ops.waitForResponse(
    (r) =>
      r.url().endsWith(reassign ? "/dispatch/reassign" : "/dispatch/assign") &&
      r.request().method() === "POST",
  );
  await ops
    .getByRole("button", {
      name: `${reassign ? "改派" : "指派"} ${driverId}`,
      exact: true,
    })
    .click();
  const result = await response;
  expect(
    result.status(),
    await dispatchResponseDiagnostic(result, reassign),
  ).toBeLessThan(300);
  return camel(await result.json()).data;
}

async function readAssignedTripAndAccept(
  driver: Page,
  base: string,
  orderId: string,
  step: JourneyStep,
) {
  // These are ordinary UI operations, each with a finite wait. Keeping their
  // progress separate prevents an absent control or pending navigation from
  // consuming the entire three-order case without identifying the operation.
  await step("Driver navigate to assigned jobs", () =>
    driver.goto(`${base}/jobs`, { timeout: 30_000 }),
  );
  await step("Driver open current trip from jobs", () =>
    driver
      .getByText("開啟目前行程", { exact: true })
      .first()
      .click({ timeout: 30_000 }),
  );
  await step("Driver verify assigned trip UUID", async () => {
    await expect(driver).toHaveURL(/\/trip$/);
    await expect(
      driver.getByText(orderId, { exact: false }).first(),
    ).toBeVisible();
  });
  await step(
    "Driver submit acceptance and receive authority response",
    async () => {
      // Install the response listener before the click. Consume both promises
      // together so a failed click cannot leave a rejected listener unobserved.
      const [response] = await Promise.all([
        driver.waitForResponse(
          (r) =>
            /\/driver\/tasks\/[^/]+\/accept$/.test(r.url()) &&
            r.request().method() === "POST",
          { timeout: 30_000 },
        ),
        driver
          .getByRole("button", { name: "接受任務", exact: true })
          .first()
          .click({ timeout: 30_000 }),
      ]);
      expect(response.status()).toBeLessThan(300);
    },
  );
}

async function finish(
  driver: Page,
  base: string,
  pax: Page,
  orderId: string,
  ops: Page,
  step: JourneyStep,
  stale = false,
) {
  await step("Driver read assigned trip and accept", async () => {
    await readAssignedTripAndAccept(driver, base, orderId, step);
  });
  for (const [label, action] of [
    ["前往接送點", "depart"],
    ["抵達上車點", "arrived_pickup"],
    ["開始行程", "start"],
  ] as const) {
    await step(`Driver ${action}`, async () => {
      if (action === "start") {
        const scheduledAt = Date.parse(
          (await authority(pax, orderId)).order.requestedPickupAt,
        );
        await expect
          .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
          .toBeGreaterThanOrEqual(scheduledAt);
      }
      const response = driver.waitForResponse(
        (r) =>
          r.url().endsWith(`/${action}`) && r.request().method() === "POST",
      );
      await driver.getByRole("button", { name: label, exact: true }).click();
      expect((await response).status()).toBeLessThan(300);
    });
  }
  await expect
    .poll(async () => (await authority(pax, orderId)).order.status)
    .toBe("on_trip");
  // The producer takes 8 real-time steps; no direct completion facts or fake
  // tracking authority are injected into either page or API.
  await step("Driver receives live tracked distance", () =>
    expect(driver.getByText(/0\.[2-9]\d km/).first()).toBeVisible({
      timeout: 40_000,
    }),
  );
  if (stale) {
    await step(
      "Driver pause until real GPS freshness expires and resume",
      async () => {
        await driver
          .getByRole("button", { name: "暫停模擬定位", exact: true })
          .click();
        await expect(
          driver.getByText(/已停止；等待真 freshness 過期/),
        ).toBeVisible();
        await expect
          .poll(
            async () => {
              const response = await ops.request.get(
                `${OPS}/control-plane-proxy/driver/tracking-status?driverId=pax-review-driver-a`,
              );
              expect(response.status()).toBe(200);
              return camel(await response.json()).data.locationFreshness;
            },
            { timeout: 105_000, intervals: [5000] },
          )
          .toBe("stale");
        await driver
          .getByRole("button", { name: "恢復模擬定位", exact: true })
          .click();
      },
    );
  }
  // Distance can reach this short route's threshold before twenty seconds.
  // Wait for the same live UI clock used by completion instead of submitting
  // facts that would fail the unchanged persisted-duration assertion below.
  await step(
    "Driver waits for live trip duration above twenty seconds",
    async () => {
      const duration = driver
        .getByText("時長", { exact: true })
        .locator("..")
        .getByText(/^\d{2}:\d{2}:\d{2}$/);
      await expect
        .poll(
          async () => {
            const [hours, minutes, seconds] = (
              await duration.innerText()
            ).split(":");
            return (
              Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
            );
          },
          { timeout: 30_000, intervals: [1000] },
        )
        .toBeGreaterThan(20);
    },
  );
  // Explicit simulated meter facts, consistent with this sub-1.25km route
  // and the approved engine's minimum, not the old local demo tariff.
  await step(
    "Driver meter input and complete with actual tracked facts",
    async () => {
      const bookedQuote = (await authority(pax, orderId)).bookingQuote;
      const minimum = bookedQuote.estimatedMin as number;
      const baseFare = bookedQuote.tariffSnapshot.baseFare as number;
      for (const [label, value] of [
        ["實際起步費", String(baseFare)],
        ["實際里程費", "0"],
        ["實際延滯費", "0"],
        ["實際夜間加成", String(minimum - baseFare)],
        ["實際車資總額", String(minimum)],
      ] as const) {
        const field = driver
          .getByText(label, { exact: true })
          .locator("../..")
          .getByRole("textbox");
        await field.fill(value);
      }
      const complete = driver.waitForResponse(
        (r) =>
          /\/driver\/tasks\/[^/]+\/complete$/.test(r.url()) &&
          r.request().method() === "POST",
      );
      await driver
        .getByRole("button", { name: "完成行程", exact: true })
        .click();
      const completed = await complete;
      expect(completed.status()).toBeLessThan(300);
      await expect
        .poll(async () => (await authority(pax, orderId)).order.status)
        .toBe("completed");
    },
  );
}

async function download(pax: Page, orderId: string, info: TestInfo) {
  await expect
    .poll(
      async () =>
        (await authority(pax, orderId)).receipt?.record?.e04Snapshot
          ?.fleetOperatorName,
    )
    .toBe("虛構演練派遣業者（合成・非正式）");
  const ride = await authority(pax, orderId);
  const snapshot = ride.receipt.record.e04Snapshot;
  expect(ride.receipt.orderId).toBe(orderId);
  expect(snapshot.driverSurname).toBe("演練");
  expect(snapshot.driverRegistrationMasked).toMatch(/^[•*●Xx]{4,}900[12]$/);
  expect(snapshot.paymentMethodDisplay).toMatch(/••••[0-9]{4}$/);
  expect(snapshot.fareBreakdown).toEqual(
    ride.receipt.record.actualFareBreakdown,
  );
  for (const field of [
    "startMinor",
    "distanceMinor",
    "delayMinor",
    "nightMinor",
  ])
    expect(Number.isSafeInteger(snapshot.fareBreakdown[field])).toBe(true);
  // Read the normal passenger E04 API and actual receipt UI, as well as the
  // existing explicitly nonformal rehearsal record below.
  const downloads = await pax.request.get(
    `${PAX}/api/passenger-app/rides/${orderId}/receipt/downloads`,
  );
  expect(downloads.status()).toBe(200);
  const metadata = camel(await downloads.json()).data;
  expect(metadata.orderId).toBe(orderId);
  const e04 = await pax.request.get(`${PAX}${metadata.htmlUrl}`);
  expect(e04.status()).toBe(200);
  const e04Html = await e04.text();
  expect(e04Html).toContain("合成・非正式");
  expect(e04Html).toContain(snapshot.driverRegistrationMasked);
  await info.attach(`same-order-${orderId}-e04`, {
    body: e04Html,
    contentType: "text/html",
  });
  await pax.goto(`${PAX}/rides/${orderId}/receipt`);
  await expect(
    pax.getByText(snapshot.fleetOperatorName, { exact: true }),
  ).toBeVisible();
  await expect(
    pax.getByText("PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING", { exact: true }),
  ).toHaveCount(0);
  await pax.goto(`${PAX}/review/records/${orderId}`);
  const waiting = pax.waitForEvent("download");
  await pax.getByRole("button", { name: "下載演練紀錄 HTML" }).click();
  const downloaded = await waiting;
  const file = info.outputPath(`review-${orderId}.html`);
  await downloaded.saveAs(file);
  const html = await readFile(file, "utf8");
  expect(html).toContain(orderId);
  expect(html).toContain("非正式憑證");
  expect(html).toContain("新北");
  await info.attach(`same-order-${orderId}-document`, {
    path: file,
    contentType: "text/html",
  });
  await pax.goto(`${PAX}/rides/${orderId}`);
}

function assertCompletedFacts(rows: any[], orderId: string) {
  const completed = rows.filter((row) => row.started_at && row.completed_at);
  expect(completed.length).toBeGreaterThan(0);
  for (const row of completed) {
    expect(row.order_id).toBe(orderId);
    expect(Date.parse(row.started_at)).toBeGreaterThanOrEqual(
      Date.parse(row.requested_pickup_at),
    );
    expect(Date.parse(row.completed_at)).toBeGreaterThanOrEqual(
      Date.parse(row.started_at),
    );
    expect(Number(row.actual_distance_km)).toBeGreaterThan(0.2);
    expect(Number(row.actual_distance_km)).toBeLessThan(0.5);
    expect(Number(row.actual_duration_sec)).toBeGreaterThan(20);
    expect(Number(row.amount_minor)).toBeGreaterThanOrEqual(8500);
  }
}

test("three new PG orders travel through real Passenger, Ops and Driver UIs, including retry/case, cancellation and exception controls", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const newRole = async (role: "pax" | "ops" | "driver") => {
    const outerToken =
      role === "ops"
        ? process.env.PAX_REVIEW_OPS_ID_TOKEN
        : process.env.PAX_REVIEW_PASSENGER_ID_TOKEN;
    if (sharedDev && !outerToken)
      throw new Error(
        `Missing existing private-service access credential for ${role}`,
      );
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Taipei",
      ...(outerToken
        ? {
            extraHTTPHeaders: {
              "X-Serverless-Authorization": `Bearer ${outerToken}`,
            },
          }
        : {}),
    });
    if (role === "ops" && sharedDev) {
      const platformToken = process.env.PAX_REVIEW_PLATFORM_ADMIN_ID_TOKEN;
      if (!PLATFORM_ADMIN || !platformToken)
        throw new Error(
          "Missing existing Platform Admin URL or private-service access credential",
        );
      await c.route(`${PLATFORM_ADMIN}/**`, (route) =>
        route.continue({
          headers: {
            ...route.request().headers(),
            "x-serverless-authorization": `Bearer ${platformToken}`,
          },
        }),
      );
    }
    contexts.push(c);
    return c.newPage();
  };
  const pax = await step("Passenger browser context", () => newRole("pax")),
    ops = await step("Ops browser context", () => newRole("ops")),
    driver = await step("Driver browser context", () => newRole("driver"));
  let activeDriver = { page: driver, base: DRIVER };
  const finalizeInterruptedOrders = trackInterruptedRehearsal(pax, info, PAX);
  const requests: {
    role: string;
    method: string;
    path: string;
    status: number;
  }[] = [];
  const observe = (role: "pax" | "ops" | "driver", page: Page) =>
    page.on("response", (r) => {
      progress.response(role, r.request().method(), r.url(), r.status());
      const url = new URL(r.url());
      if (
        /\/(?:rides|orders|dispatch|driver\/tasks)(?:\/|$)/.test(
          url.pathname,
        ) &&
        !url.pathname.includes("auth")
      )
        requests.push({
          role,
          method: r.request().method(),
          path: url.pathname,
          status: r.status(),
        });
    });
  observe("pax", pax);
  observe("ops", ops);
  observe("driver", driver);
  try {
    await step("Ops prepare real persisted rehearsal supply", async () => {
      await ops.goto(`${OPS}/review`);
      const preparing = ops.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith("/ops/review-demo/prepare") &&
          r.request().method() === "POST",
      );
      await ops.getByRole("button", { name: "準備虛構演練車司" }).click();
      const preparedResponse = await preparing;
      let prepareFailure = "unclassified";
      if (!preparedResponse.ok()) {
        const body = await preparedResponse.json().catch(() => null);
        if (body?.error?.code === "review_supply_unavailable") {
          const reasons: Record<string, string> = {
            "Rehearsal product storage is unavailable.": "product-storage",
            "Reservation product is unavailable.": "reservation-product",
            "Established rehearsal supply templates are unavailable.":
              "supply-templates",
          };
          prepareFailure =
            reasons[body.error.message] ?? "review_supply_unavailable";
        }
      }
      expect(
        preparedResponse.ok(),
        `Ops prepare status=${preparedResponse.status()} reason=${prepareFailure}`,
      ).toBe(true);
      await expect(
        ops.getByText("已準備兩組合成車司；未建立訂單、派遣或付款。"),
      ).toBeVisible();
    });
    await registerDriver(ops, driver, DRIVER, step);
    await step("Passenger genuine OTP login and account", async () => {
      await pax.goto(`${PAX}/review`);
      await pax
        .getByLabel("演練手機", { exact: true })
        .fill(
          `09000000${String(Number(process.env.GITHUB_RUN_ID ?? 1) % 100).padStart(2, "0")}`,
        );
      await pax.getByRole("checkbox").check();
      const requestedOtp = pax.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/api/passenger-app/review-demo/otp" &&
          response.request().method() === "POST",
      );
      await pax.getByRole("button", { name: "取得模擬簡訊" }).click();
      const otpResponse = await requestedOtp;
      let failureCode = "unclassified";
      if (!otpResponse.ok()) {
        const body = await otpResponse.json().catch(() => null);
        // Report only this fixed known code; never print OTPs or raw bodies.
        if (body?.error === "CSRF_CHECK_FAILED")
          failureCode = "CSRF_CHECK_FAILED";
      }
      expect(
        otpResponse.ok(),
        `Review OTP status=${otpResponse.status()} code=${failureCode}`,
      ).toBe(true);
      await pax.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
      await expect(pax.getByTestId("review-passenger-id")).toBeVisible();
      expect(
        await pax.evaluate(() =>
          localStorage.getItem("drts.passenger.functional-demo.v1"),
        ),
      ).toBeNull();
    });
    const firstMethod = await step("A bind successful simulated PSP", () =>
      bind(pax, "success"),
    );
    const normal = await step("A Passenger book", () => book(pax, firstMethod));
    await step("A Ops create dispatch", () => createDispatch(ops, normal));
    await step(
      "A Ops assign then reassign while Passenger offline",
      async () => {
        await assign(ops, "pax-review-driver-b");
        await expect
          .poll(
            async () =>
              (await authority(pax, normal)).assignment?.driver.driverId,
          )
          .toBe("pax-review-driver-b");
        await pax.context().setOffline(true);
        await assign(ops, "pax-review-driver-a", true);
        await pax.context().setOffline(false);
        await expect(
          pax.getByText("SIM-1001", { exact: false }).first(),
        ).toBeVisible();
      },
    );
    if (!sharedDev) {
      const cookie = (await pax.context().cookies()).find(
        (c) => c.name === "pax_session",
      );
      expect(cookie).toBeTruthy();
      const peer = await pax.request.get(
        `http://127.0.0.1:3002/api/passenger-app/rides/${normal}`,
        { headers: { Authorization: `Bearer ${cookie!.value}` } },
      );
      expect(peer.status()).toBe(200);
      expect(camel(await peer.json()).data.ride.order.orderId).toBe(normal);
    }
    await finish(driver, DRIVER, pax, normal, ops, step, true);
    await step(
      "A captured payment, high rating, document and relational facts",
      async () => {
        await expect
          .poll(async () => (await authority(pax, normal)).payment?.status)
          .toBe("captured");
        await pax.getByRole("button", { name: "5 星", exact: true }).click();
        await pax
          .getByRole("button", { name: "送出評價", exact: true })
          .click();
        await expect
          .poll(async () => (await authority(pax, normal)).rating?.score)
          .toBe(5);
        await download(pax, normal, info);
        await readCompletedByOps(ops, normal);
        const normalFacts = await recordOrderEvidence(
          normal,
          "A-completed-high-rating",
          { pax, ops, driver },
          info,
        );
        assertCompletedFacts(normalFacts, normal);
        expect(
          normalFacts.some(
            (r) =>
              r.payment_status === "captured" &&
              r.score === 5 &&
              r.order_id === normal,
          ),
        ).toBe(true);
        await submitLostItemForCompletedRide(pax, ops, normal, info);
      },
    );

    const retryMethod = await step("B bind retry-once simulated PSP", () =>
      bind(pax, "retry_once"),
    );
    const retry = await step("B Passenger book", () => book(pax, retryMethod));
    expect(retry).not.toBe(normal);
    await step("B Ops create dispatch and assign", async () => {
      await createDispatch(ops, retry);
      await assign(ops);
    });
    // Also exercise the production export mounted in the same private PAX
    // service, including its real driver BFF and SQLite/WASM headers.
    const mountedDriver = await newRole("driver");
    observe("driver", mountedDriver);
    activeDriver = { page: mountedDriver, base: `${PAX}/review-driver` };
    await registerDriver(ops, mountedDriver, `${PAX}/review-driver`, step);
    await finish(mountedDriver, `${PAX}/review-driver`, pax, retry, ops, step);
    await step(
      "B failed payment, same-payment retry, low-rating CRM and document",
      async () => {
        await expect
          .poll(async () => (await authority(pax, retry)).payment?.status)
          .toBe("failed");
        expect((await authority(pax, retry)).actions.canRate).toBe(false);
        await readCompletedByOps(ops, retry);
        const failedFacts = await recordOrderEvidence(
          retry,
          "B-first-capture-failed",
          { pax, ops, driver: mountedDriver },
          info,
        );
        expect(
          failedFacts.some(
            (r) => r.attempt_count === 1 && r.payment_status === "failed",
          ),
        ).toBe(true);
        // A fourth booking attempt is rejected by the real unpaid obligation
        // guard; only the three accepted journeys may create backend orders.
        expect(await book(pax, retryMethod, true)).toBe("");
        await pax.goto(`${PAX}/rides/${retry}`);
        await pax
          .getByRole("button", { name: "依既有政策重試演練付款" })
          .click();
        await expect
          .poll(async () => (await authority(pax, retry)).payment?.status, {
            timeout: 75_000,
            intervals: [2000],
          })
          .toBe("captured");
        await pax.getByRole("button", { name: "1 星", exact: true }).click();
        await pax
          .getByRole("checkbox", { name: "需要客服與您聯繫嗎？" })
          .check();
        await pax
          .getByRole("button", { name: "送出評價", exact: true })
          .click();
        await expect
          .poll(async () => (await authority(pax, retry)).rating?.score)
          .toBe(1);
        const retriedFacts = await recordOrderEvidence(
          retry,
          "B-captured-low-rating-case",
          { pax, ops, driver: mountedDriver },
          info,
        );
        assertCompletedFacts(retriedFacts, retry);
        const row = retriedFacts.find((r) => r.complaint_case_no);
        expect(row?.attempt_count).toBe(2);
        expect(row?.payment_id).toBe(
          failedFacts.find((r) => r.payment_id)?.payment_id,
        );
        expect(row?.contact_requested).toBe(true);
        await ops.goto(`${OPS}/complaints/${row!.complaint_case_no}`);
        await expect(
          ops.getByText(row!.complaint_case_no, { exact: false }).first(),
        ).toBeVisible();
        await expect(
          ops.locator(`a[href="/dispatch/${retry}"]`).first(),
        ).toBeVisible();
        await ops.screenshot({
          path: info.outputPath("same-order-CRM-case.png"),
          fullPage: true,
        });
        await download(pax, retry, info);
      },
    );

    await ops.goto(`${OPS}/review`);
    const cancelled = await step("C Passenger book", () =>
      book(pax, firstMethod),
    );
    expect(new Set([normal, retry, cancelled]).size).toBe(3);
    await step(
      "C no supply, redispatch and cancellation across roles",
      async () => {
        await ops.getByRole("button", { name: "暫停演練供給" }).click();
        await createDispatch(ops, cancelled);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "redispatch_required",
        );
        // This is a reservation outside its confirmation window. The real
        // no-supply branch queues it for redispatch rather than escalating a
        // realtime order. Verify that authority and the empty candidate list.
        const queued = await ops.request.get(
          `${OPS}/control-plane-proxy/orders/${cancelled}`,
        );
        expect(queued.status()).toBe(200);
        expect(camel(await queued.json()).data).toMatchObject({
          orderId: cancelled,
          status: "redispatch_required",
          dispatchSemantics: "reservation",
          reservationHoldStatus: "redispatch_queue",
        });
        const queuedJob = await ops
          .getByTestId("ops-review-job-id")
          .innerText();
        const noCandidates = await ops.request.get(
          `${OPS}/control-plane-proxy/dispatch/tasks/${queuedJob}/candidates`,
        );
        expect(noCandidates.status()).toBe(200);
        expect(camel(await noCandidates.json()).data.items).toEqual([]);
        await ops.getByRole("button", { name: "恢復演練供給" }).click();
        await ops.getByRole("button", { name: "依原流程重新派遣" }).click();
        const cancelledAssignment = await assign(ops);
        activeDriver = { page: driver, base: DRIVER };
        await driver.goto(`${DRIVER}/jobs`);
        await driver
          .getByRole("button")
          .filter({
            has: driver.getByText(cancelledAssignment.taskId, { exact: true }),
          })
          .click();
        const cancellationHeader = `${cancelledAssignment.taskId} · ${cancelled}`;
        await expect(
          driver.getByText(cancellationHeader, { exact: true }),
        ).toBeVisible();
        pax.on("dialog", (dialog) => void dialog.accept());
        await pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first()
          .click();
        await expect
          .poll(async () => (await authority(pax, cancelled)).order.status)
          .toBe("cancelled");
        await pax.reload();
        await expect(
          pax.getByText("此行程已取消", { exact: false }).first(),
        ).toBeVisible();
        await opsRead(ops, cancelled);
        await driver.reload();
        await expect(
          driver.getByText(cancellationHeader, { exact: true }),
        ).toBeVisible();
        await expect(driver.getByText(/已取消|平台取消/).first()).toBeVisible();
        for (const name of ["接受任務", "開始行程", "完成行程"]) {
          for (const button of await driver
            .getByRole("button", { name, exact: true })
            .all())
            await expect(button).toBeDisabled();
        }
        const cancelledFacts = await recordOrderEvidence(
          cancelled,
          "C-cancelled-history",
          { pax, ops, driver },
          info,
        );
        expect(cancelledFacts.length).toBeGreaterThan(0);
        expect(
          cancelledFacts.every(
            (r) => r.payment_status !== "captured" && r.rating_id == null,
          ),
        ).toBe(true);
      },
    );
    await step(
      "All three independent orders in refreshed Passenger history",
      async () => {
        const history = await pax.request.get(`${PAX}/api/passenger-app/rides`);
        expect(history.status()).toBe(200);
        const historyText = await history.text();
        for (const id of [normal, retry, cancelled])
          expect(historyText).toContain(id);
        await pax.goto(`${PAX}/rides`);
        await pax.reload();
        for (const id of [normal, retry, cancelled])
          await expect(pax.locator(`a[href="/rides/${id}"]`)).toBeVisible();
        await expect(
          pax
            .locator(`a[href="/rides/${cancelled}"]`)
            .getByText("乘客取消", { exact: true }),
        ).toBeVisible();
        await info.attach("history-after-refresh", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await info.attach("cross-role-safe-response-journal", {
          body: JSON.stringify(requests, null, 2),
          contentType: "application/json",
        });
      },
    );
  } catch (error) {
    // Only these post-registration Driver pages are safe to capture. Never
    // record onboarding, invitation fields, session storage or HTTP bodies.
    const { page: failedDriver, base: failedDriverBase } = activeDriver;
    const closed = failedDriver.isClosed();
    // A redirect outside jobs/trip used to leave no evidence at all. Project
    // only fixed route names, never the actual URL, query or page contents.
    const failedUrl = new URL(failedDriver.url());
    const driverBaseUrl = new URL(failedDriverBase);
    const route = ["jobs", "trip", "onboarding", ""].find(
      (name) =>
        failedUrl.origin === driverBaseUrl.origin &&
        failedUrl.pathname.replace(/\/$/, "") ===
          `${driverBaseUrl.pathname.replace(/\/$/, "")}/${name}`.replace(
            /\/$/,
            "",
          ),
    );
    const workspace = route === "jobs" || route === "trip";
    const queryPresent = Boolean(failedUrl.search || failedUrl.hash);
    const visible = async (label: string) =>
      workspace && !closed && !queryPresent
        ? failedDriver
            .getByText(label, { exact: true })
            .first()
            .isVisible()
            .catch(() => null)
        : null;
    const [loading, empty, openCurrentTrip] = await Promise.all([
      visible("載入任務中…"),
      visible("此篩選條件下沒有任務"),
      visible("開啟目前行程"),
    ]);
    await info
      .attach("driver-failure-state", {
        body: JSON.stringify({
          route: route === "" ? "index" : (route ?? "other"),
          closed,
          queryPresent,
          loading,
          empty,
          openCurrentTrip,
        }),
        contentType: "application/json",
      })
      .catch(() => undefined);
    if (
      workspace &&
      !queryPresent &&
      !failedDriver.isClosed() &&
      failedDriver.url() === failedUrl.href
    ) {
      const screenshot = await failedDriver
        .screenshot({ fullPage: true, timeout: 5000 })
        .catch(() => null);
      if (screenshot)
        await info
          .attach("driver-assigned-trip-failure", {
            body: screenshot,
            contentType: "image/png",
          })
          .catch(() => undefined);
    }
    await finalizeInterruptedOrders().catch(() =>
      info
        .attach("interrupted-rehearsal-finalization-unavailable", {
          body: "Original journey remains failed; the original owner finalization could not finish.",
          contentType: "text/plain",
        })
        .catch(() => undefined),
    );
    await Promise.allSettled(contexts.map((c) => c.close()));
    throw error;
  }
  await Promise.all(contexts.map((c) => c.close()));
});
