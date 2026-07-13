import { expect, test, type Page } from "@playwright/test";

const GOOGLE_MAP_ERROR =
  /InvalidKeyMapError|RefererNotAllowedMapError|ApiNotActivatedMapError|Google Maps JavaScript API error/i;

function watchGoogleMapErrors(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && GOOGLE_MAP_ERROR.test(message.text())) {
      failures.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (GOOGLE_MAP_ERROR.test(error.message)) {
      failures.push(error.message);
    }
  });
  return failures;
}

async function expectReadyGoogleMap(page: Page) {
  const layer = page.locator("[data-google-map-base-layer]").first();
  await expect(layer).toHaveAttribute("data-google-map-status", "ready", {
    timeout: 45_000,
  });
  await expect(layer.locator(".gm-style")).toBeVisible({ timeout: 15_000 });
}

test("deployed Ops and Callcenter render the live Google base map", async ({
  page,
  request,
}) => {
  const failures = watchGoogleMapErrors(page);
  const configResponse = await request.get("/api/map-provider-config");
  expect(configResponse.ok()).toBe(true);
  await expect(configResponse.json()).resolves.toMatchObject({
    provider: "google",
    enabled: true,
    reasonCode: null,
  });

  await page.goto("/dispatch", { waitUntil: "domcontentloaded" });
  await expectReadyGoogleMap(page);

  await page.goto("/callcenter", { waitUntil: "domcontentloaded" });
  await expectReadyGoogleMap(page);
  await expect(
    page.locator(
      '[data-callcenter-interactive-map="callcenter-pickup-map-interactive-map"]',
    ),
  ).toBeVisible();

  expect(failures).toEqual([]);
});
