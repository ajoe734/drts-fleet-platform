import type { Page } from "@playwright/test";

const MOCK_MAP_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eef7f1"/><path d="M0 128h256M128 0v256" stroke="#8fb9a4" stroke-width="4"/><circle cx="128" cy="128" r="18" fill="#0f766e"/></svg>`;

export async function installMockMapTileRoutes(page: Page) {
  await page.route("**/mock-map-tiles/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "image/svg+xml",
      },
      body: MOCK_MAP_TILE_SVG,
    });
  });
}
