import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

type ActiveSurface = {
  id: string;
  urlEnv: string;
  path: string;
  expectedStatus: 200;
  kind: "api" | "web";
};
type RetiredSurface = {
  id: string;
  urlEnv: string;
  path: string;
  expectedStatus: number;
  state: "paused" | "retired";
};
type Manifest = {
  schemaVersion: 1;
  taskId: "S1F-REL-001-PREDEPLOY";
  candidateSha: string;
  responseHeader: "x-drts-candidate-sha";
  activeSurfaces: ActiveSurface[];
  retiredSurfaces: RetiredSurface[];
};

const manifestPath = process.env.DRTS_OPERATIONAL_MANIFEST;
if (!manifestPath)
  throw new Error(
    "DRTS_OPERATIONAL_MANIFEST is required; use scripts/run-operational-browser-acceptance.sh.",
  );
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

function target(surface: { id: string; urlEnv: string; path: string }) {
  const baseUrl = process.env[surface.urlEnv]?.replace(/\/$/, "");
  if (!baseUrl) throw new Error(`${surface.id} requires ${surface.urlEnv}`);
  return `${baseUrl}${surface.path}`;
}

test("candidate manifest is executable and candidate-bound", () => {
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.taskId).toBe("S1F-REL-001-PREDEPLOY");
  expect(manifest.candidateSha).toMatch(/^[0-9a-f]{40}$/);
  expect(manifest.responseHeader).toBe("x-drts-candidate-sha");
  expect(manifest.activeSurfaces.length).toBeGreaterThan(0);
});

for (const surface of manifest.activeSurfaces) {
  test(`${surface.id} serves the immutable candidate through HTTP and browser`, async ({
    page,
    request,
  }) => {
    const url = target(surface);
    const http = await request.get(url, { failOnStatusCode: false });
    expect(http.status()).toBe(surface.expectedStatus);
    expect(http.headers()[manifest.responseHeader]).toBe(manifest.candidateSha);

    const browserResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
    });
    expect(
      browserResponse,
      `${surface.id} returned no browser response`,
    ).not.toBeNull();
    expect(browserResponse?.status()).toBe(surface.expectedStatus);
    expect(browserResponse?.headers()[manifest.responseHeader]).toBe(
      manifest.candidateSha,
    );
    await expect(page.locator("body")).not.toBeEmpty();
  });
}

for (const surface of manifest.retiredSurfaces) {
  test(`${surface.id} remains ${surface.state}`, async ({ request }) => {
    const response = await request.get(target(surface), {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(surface.expectedStatus);
  });
}
