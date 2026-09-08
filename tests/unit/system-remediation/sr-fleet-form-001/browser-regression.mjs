// Local browser verification with intercepted API responses, never live submission evidence.
// Start fleet Next dev on 3317 with DRTS_FLEET_PARTNER_ID=sr-fleet-form-browser-test.
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const base = process.env.FLEET_TEST_URL ?? "http://127.0.0.1:3317";
page.on("pageerror", error => console.log("PAGEERROR", error.message));
let dialogs = 0;
page.on("dialog", async (dialog) => {
  dialogs++;
  await dialog.accept();
});
try {
  await page.goto(`${base}/supply/drivers/new`);
  const name = page.locator("#form-new-driver-name");
  await expect(name).toBeVisible();
  await name.focus();
  await page.keyboard.type("SR-FLEET keyboard test");
  await page.keyboard.press("Tab");
  await expect(page.locator("#form-new-driver-mobile")).toBeFocused();
  await page.keyboard.type("0900000000");
  for (const [id, value] of Object.entries({
    licenseNo: "TEST-LICENSE",
    licenseExpiry: "2028-01-01",
    registrationNo: "TEST-REG",
    registrationArea: "test",
    registrationExpiry: "2028-01-01",
  })) {
    await page.locator(`#form-new-driver-${id}`).fill(value);
  }
  const accessibility = await page
    .locator("form")
    .evaluate((form) =>
      [...form.querySelectorAll("input,select,textarea")].map((el) => ({
        id: el.id,
        labels: [...el.labels].map((l) => l.textContent.trim()).join(" "),
        required: el.required,
      })),
    );
  expect(accessibility.every((field) => field.labels.length > 0)).toBe(true);
  expect(
    accessibility.find((field) => field.id.endsWith("-name")).required,
  ).toBe(true);
  const colors = await name.evaluate((el) => ({
    text: window.getComputedStyle(el.labels[0]).color,
    surface: window.getComputedStyle(el).backgroundColor,
  }));
  await page.reload();
  await expect(name).toHaveValue("SR-FLEET keyboard test");
  // Full navigation and browser back exercise restoration independent of the header button.
  await page.goto(`${base}/supply/vehicles/new`);
  await expect(page.locator("#form-new-vehicle-plateNo")).toBeVisible();
  await page.locator("#form-new-vehicle-color").fill("optional-only");
  console.log("before back", await page.evaluate(() => ({...sessionStorage})));
  await page.goBack();
  console.log("after back", await page.evaluate(() => ({ storage: {...sessionStorage}, ready: document.readyState, name: document.querySelector("#form-new-driver-name")?.outerHTML })));
  await expect(name).toHaveValue("SR-FLEET keyboard test");
  let requests = 0;
  await page.route(
    "**/fleet-partner/supply-submissions/drivers",
    async (route) => {
      requests++;
      expect(route.request().postDataJSON().name).toBe(
        "SR-FLEET keyboard test",
      );
      await route.fulfill({
        status: 422,
        json: { error: { message: "TEST_API_REJECTED" } },
      });
    },
  );
  await name.press("Enter");
  await expect(page.getByRole("alert")).toContainText("TEST_API_REJECTED");
  expect(requests).toBe(1);
  await page.reload();
  await expect(name).toHaveValue("SR-FLEET keyboard test");
  await page.unroute("**/fleet-partner/supply-submissions/drivers");
  await page.route("**/fleet-partner/supply-submissions/drivers", (route) =>
    route.fulfill({
      json: { data: { submission: { submissionId: "test-only-submission" } } },
    }),
  );
  await name.press("Enter");
  await expect(page).toHaveURL(/supply\/submissions\/test-only-submission/);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter(
        (key) => key.startsWith("supply-draft:") && key.endsWith(":driver"),
      ),
    ),
  ).toEqual([]);
  await page.goto(`${base}/supply/drivers/new`);
  await expect(name).toHaveValue("");
  await page.goto(`${base}/supply/vehicles/new`);
  await expect(page.locator("#form-new-vehicle-color")).toHaveValue(
    "optional-only",
  );
  console.log(
    JSON.stringify({
      result: "passed",
      accessibility,
      colors,
      dialogs,
      interceptedResourceId: "test-only-submission",
      liveResourceId: null,
    }),
  );
} finally {
  await browser.close();
}
