import { expect, test } from "@playwright/test";

const evidenceDir = "support/sidecars/MTX-AUTH-UI-001/screenshots";
const proxyBase =
  "/control-plane-proxy/platform-admin/multi-taxi/authorizations";

test("captures the authenticated six-screen authorization flow", async ({
  page,
  request,
}) => {
  const now = Date.now();
  const authorityCode = `AUTH-EVIDENCE-${now}`;
  const effectiveFrom = new Date(now - 60_000).toISOString();
  const effectiveUntil = new Date(now + 86_400_000 * 180).toISOString();

  const createResponse = await request.post(proxyBase, {
    data: {
      operatorId: `operator-evidence-${now}`,
      authorityCode,
      businessPlanVersion: "v1.2",
      serviceAreaCodes: ["TPE", "NPT"],
      activeFareVersionId: "fare-evidence-2026",
      effectiveFrom,
      effectiveUntil,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const createPayload = (await createResponse.json()) as {
    data: { authorization_id?: string; authorizationId?: string };
  };
  const authorizationId =
    createPayload.data.authorizationId ?? createPayload.data.authorization_id;
  expect(authorizationId).toBeTruthy();

  const vehicleResponse = await request.post(
    `${proxyBase}/${encodeURIComponent(authorizationId!)}/vehicles`,
    {
      data: {
        vehicleId: `vehicle-evidence-${now}`,
        effectiveFrom,
        effectiveUntil,
      },
    },
  );
  const vehicleResponseBody = await vehicleResponse.text();
  expect(vehicleResponse.ok(), vehicleResponseBody).toBe(true);

  await page.goto("/multi-taxi-authorizations");

  const registry = page.locator('[data-screen-id="MTX-AUTH-UI-01"]');
  const detail = page.locator('[data-screen-id="MTX-AUTH-UI-02"]');
  const vehicles = page.locator('[data-screen-id="MTX-AUTH-UI-05"]');
  await expect(registry).toBeVisible();
  await expect(detail).toBeVisible();
  await expect(vehicles).toBeVisible();

  await registry.screenshot({
    path: `${evidenceDir}/01-authorization-registry.png`,
    animations: "disabled",
  });
  await detail.screenshot({
    path: `${evidenceDir}/02-authorization-detail.png`,
    animations: "disabled",
  });
  await vehicles.screenshot({
    path: `${evidenceDir}/04-authorized-vehicles.png`,
    animations: "disabled",
  });

  await page
    .getByRole("button", { name: /Create draft|建立草稿/ })
    .first()
    .click();
  const draft = page.locator('[data-screen-id="MTX-AUTH-UI-03"]').last();
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: /Create draft|建立草稿/ }).click();
  await expect(draft.getByRole("alert").first()).toBeVisible();
  await draft.screenshot({
    path: `${evidenceDir}/03-draft-validation-error.png`,
    animations: "disabled",
  });

  await registry.getByRole("button", { name: authorityCode }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: /Activate|啟用/ }).click();
  const confirmation = page.locator('[data-screen-id="MTX-AUTH-UI-04"]');
  await expect(confirmation).toBeVisible();
  await confirmation.screenshot({
    path: `${evidenceDir}/05-lifecycle-confirmation.png`,
    animations: "disabled",
  });
  await confirmation.getByRole("button", { name: /Cancel|取消/ }).click();

  await page.route(`**${proxyBase}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: {
          code: "AUTH_SCOPE_DENIED",
          message: "The authenticated actor no longer has this capability.",
        },
      }),
    });
  });
  await page.reload();

  const permissionState = page.locator('[data-screen-id="MTX-AUTH-UI-06"]');
  await expect(permissionState).toBeVisible();
  await permissionState.screenshot({
    path: `${evidenceDir}/06-conflict-permission-state.png`,
    animations: "disabled",
  });
});
