import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";

const ENABLED_PROJECT = "ops-assistant-on";
const DISABLED_PROJECT = "ops-assistant-off";
const CASE_NO = "CMP-001";
const FORCE_DISABLED_KEY = "ops-console.assistant.force-disabled";

function buildEnvelope<T>(data: T) {
  return {
    data,
    meta: {
      requestId: "pw-request",
      timestamp: new Date("2026-06-03T00:00:00.000Z").toISOString(),
    },
  };
}

const complaintRecord = {
  caseNo: CASE_NO,
  caseSource: "ops",
  relatedOrderId: "ORD-9001",
  relatedCallId: "CALL-7788",
  relatedIncidentId: null,
  category: "fare_dispute",
  severity: "high",
  description: "Passenger disputes surcharge after manual dispatch.",
  assigneeId: "AGENT-OPS-002",
  status: "under_investigation",
  slaDueAt: "2026-06-03T01:00:00.000Z",
  slaBreach: false,
  reopenCount: 0,
  resolutionCode: null,
  closingNote: null,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:05:00.000Z",
  availableActions: [
    {
      action: "escalate_to_incident",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "export_view",
      enabled: true,
      riskLevel: "low",
    },
  ],
  slaStatus: "warning",
} as const;

const complaintTimeline = [
  {
    entryId: "tl-1",
    caseNo: CASE_NO,
    action: "case_created",
    note: "Case created from ops console.",
    createdAt: "2026-06-03T00:00:00.000Z",
  },
];

const complaintExport = {
  complaintCase: complaintRecord,
  timeline: complaintTimeline,
  exportGeneratedAt: "2026-06-03T00:05:00.000Z",
  readyForAudit: true,
};

function isEnabledProject(testInfo: TestInfo) {
  return testInfo.project.name === ENABLED_PROJECT;
}

function isDisabledProject(testInfo: TestInfo) {
  return testInfo.project.name === DISABLED_PROJECT;
}

async function primeProjectState(page: Page, testInfo: TestInfo) {
  await page.addInitScript(
    ({
      forceDisabledKey,
      disabled,
    }: {
      forceDisabledKey: string;
      disabled: boolean;
    }) => {
      if (disabled) {
        window.localStorage.setItem(forceDisabledKey, "true");
      } else {
        window.localStorage.removeItem(forceDisabledKey);
      }
    },
    {
      forceDisabledKey: FORCE_DISABLED_KEY,
      disabled: isDisabledProject(testInfo),
    },
  );
}

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}

async function registerComplaintMocks(page: Page) {
  await page.route("**/complaints**", async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== "fetch" && resourceType !== "xhr") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === "GET" && path.endsWith("/complaints")) {
      await fulfillJson(route, buildEnvelope([complaintRecord]));
      return;
    }

    if (method === "GET" && path.endsWith(`/complaints/${CASE_NO}/timeline`)) {
      await fulfillJson(route, buildEnvelope(complaintTimeline));
      return;
    }

    if (method === "GET" && path.endsWith(`/complaints/${CASE_NO}/export`)) {
      await fulfillJson(route, buildEnvelope(complaintExport));
      return;
    }

    if (
      method === "POST" &&
      path.endsWith(`/complaints/${CASE_NO}/escalate-to-incident`)
    ) {
      await fulfillJson(
        route,
        buildEnvelope({
          complaintCase: complaintRecord,
          incident: {
            incidentId: "INC-9001",
            title: "Escalated from complaint",
            severity: "high",
            status: "open",
            createdAt: "2026-06-03T00:06:00.000Z",
            updatedAt: "2026-06-03T00:06:00.000Z",
          },
        }),
      );
      return;
    }

    await route.fallback();
  });

  await page.route("**/assistant/tools/propose-action**", async (route) => {
    await fulfillJson(
      route,
      buildEnvelope({
        type: "action_intent",
        tool: "propose_action",
        resourceKind: "complaint",
        resourceId: CASE_NO,
        action: "escalate_to_incident",
        args: {},
        confirmationRequired: true,
        mutates: true,
      }),
    );
  });
}

async function gotoComplaints(page: Page) {
  await registerComplaintMocks(page);
  await page.goto("/complaints", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Complaint Center|客訴中心/ }),
  ).toBeVisible();
  await expect(page.getByText(/載入客訴中…/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: CASE_NO }).first(),
  ).toBeVisible();
}

async function openAssistant(page: Page) {
  const launcher = page.getByTestId("ops-assistant-launcher");
  const panel = page.getByTestId("ops-assistant-panel");
  if ((await panel.count()) === 0) {
    await launcher.click();
  }
  await expect(panel).toBeVisible();
  return { launcher, panel };
}

test.describe("ops assistant verification", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await primeProjectState(page, testInfo);
  });

  test("kill switch off hides assistant launcher", async ({
    page,
  }, testInfo) => {
    test.skip(!isDisabledProject(testInfo));

    await gotoComplaints(page);
    await expect(page.getByTestId("ops-assistant-launcher")).toHaveCount(0);
    await expect(page.getByTestId("ops-assistant-panel")).toHaveCount(0);
  });

  test("widget move/minimize/close persists across routes and reload", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));
    test.setTimeout(90_000);

    await gotoComplaints(page);
    const { launcher, panel } = await openAssistant(page);
    const dragHandle = page.getByTestId("ops-assistant-drag-handle");

    const beforeDrag = await panel.boundingBox();
    const handleBox = await dragHandle.boundingBox();
    expect(beforeDrag).not.toBeNull();
    expect(handleBox).not.toBeNull();
    if (!beforeDrag || !handleBox) {
      throw new Error("Assistant geometry unavailable.");
    }

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - 150,
      handleBox.y + handleBox.height / 2 - 80,
      { steps: 10 },
    );
    await page.mouse.up();

    const afterDrag = await panel.boundingBox();
    expect(afterDrag).not.toBeNull();
    expect(Math.abs((afterDrag?.x ?? 0) - beforeDrag.x)).toBeGreaterThan(40);
    expect(Math.abs((afterDrag?.y ?? 0) - beforeDrag.y)).toBeGreaterThan(40);

    await page.goto("/feature-flags", { waitUntil: "domcontentloaded" });
    await expect(panel).toBeVisible();
    const afterRouteChange = await panel.boundingBox();
    expect(afterRouteChange).not.toBeNull();
    expect(
      Math.abs((afterRouteChange?.x ?? 0) - (afterDrag?.x ?? 0)),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs((afterRouteChange?.y ?? 0) - (afterDrag?.y ?? 0)),
    ).toBeLessThanOrEqual(4);

    await panel
      .getByRole("button", { name: /Minimize assistant|最小化/ })
      .click();
    await expect(
      page.getByText("Minimized. Expand to resume the live mock stream."),
    ).toBeVisible();
    await expect(page.getByTestId("ops-assistant-restore")).toBeVisible();

    await page.getByTestId("ops-assistant-restore").click();
    const restoredPanel = page.getByTestId("ops-assistant-panel");
    await expect(restoredPanel).toBeVisible();
    await restoredPanel
      .getByRole("button", { name: /Close assistant|關閉/ })
      .click();
    await expect(restoredPanel).toBeHidden();
    await expect(launcher).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.getByTestId("ops-assistant-panel")).toBeVisible();
    const afterReload = await page
      .getByTestId("ops-assistant-panel")
      .boundingBox();
    expect(afterReload).not.toBeNull();
    expect(
      Math.abs((afterReload?.x ?? 0) - (afterDrag?.x ?? 0)),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs((afterReload?.y ?? 0) - (afterDrag?.y ?? 0)),
    ).toBeLessThanOrEqual(4);
  });

  test("tier0 answers carry citations and tier1 answers stay caller-scoped", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));

    await gotoComplaints(page);
    await openAssistant(page);

    await page
      .getByTestId("ops-assistant-composer")
      .fill("What refresh tier does this page use?");
    await page.getByTestId("ops-assistant-send").click();
    await expect(
      page.getByText(
        "Citation: apps/ops-console-web/app/dashboard/page.tsx:1645",
      ),
    ).toBeVisible();

    await page
      .getByTestId("ops-assistant-composer")
      .fill("What actions are available for the current case?");
    await page.getByTestId("ops-assistant-send").click();
    await expect(
      page.getByText(`Scoped to complaint:${CASE_NO}.`),
    ).toBeVisible();
    await expect(
      page.getByText(/availableActions: escalate_to_incident/),
    ).toBeVisible();
  });

  test("tier2 actions stay confirm-gated and emit audit evidence", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));

    await gotoComplaints(page);
    await openAssistant(page);

    await page.getByTestId("ops-assistant-action-escalate_to_incident").click();
    await expect(
      page.getByText("Pending intent · escalate_to_incident"),
    ).toBeVisible();
    await page.getByTestId("ops-assistant-open-confirmation").click();

    const confirmButton = page.getByRole("button", { name: /Confirm|確認/ });
    await expect(confirmButton).toBeDisabled();
    await page
      .getByLabel(/Escalation reason|升級原因/)
      .fill("Safety escalation required for callback failure.");
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(
      page.getByText(/auditId audit-CMP-001-escalate_to_incident/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /View audit/ })).toBeVisible();
  });

  test("degraded LLM path falls back to curated help search", async ({
    page,
  }, testInfo) => {
    test.skip(!isEnabledProject(testInfo));

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "ops-console.assistant.force-degraded",
        "true",
      );
    });
    await gotoComplaints(page);
    await openAssistant(page);

    await page
      .getByTestId("ops-assistant-composer")
      .fill("How does incident confirmation work?");
    await page.getByTestId("ops-assistant-send").click();
    await expect(
      page.getByText("LLM degraded. Showing curated help-search fallback."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Citation: apps/ops-console-web/app/incidents/[incidentId]/incident-detail-action-panel.tsx:257",
      ),
    ).toBeVisible();
  });
});
