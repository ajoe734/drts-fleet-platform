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
    "DRTS_OPERATIONAL_MANIFEST is required; use operations/verification/run-operational-browser-acceptance.sh.",
  );
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

function target(surface: { id: string; urlEnv: string; path: string }) {
  const baseUrl = process.env[surface.urlEnv]?.replace(/\/$/, "");
  if (!baseUrl) throw new Error(`${surface.id} requires ${surface.urlEnv}`);
  return `${baseUrl}${surface.path}`;
}

function getIdentityToken(surface: { id: string; urlEnv?: string }): string | undefined {
  if (
    surface.id === "tenant-console-web" ||
    surface.urlEnv === "DRTS_OPERATIONAL_TENANT_CONSOLE_URL" ||
    surface.urlEnv === "DRTS_DEV_TENANT_CONSOLE_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN ||
      process.env.DRTS_DEV_TENANT_CONSOLE_ID_TOKEN
    );
  }
  if (
    surface.id === "bank-console-web" ||
    surface.urlEnv === "DRTS_OPERATIONAL_BANK_CONSOLE_URL" ||
    surface.urlEnv === "DRTS_DEV_BANK_CONSOLE_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN ||
      process.env.DRTS_DEV_BANK_CONSOLE_ID_TOKEN
    );
  }
  if (
    surface.id === "enterprise-dispatch-web" ||
    surface.urlEnv === "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_URL" ||
    surface.urlEnv === "DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN ||
      process.env.DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN
    );
  }
  return undefined;
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
    context,
  }) => {
    const url = target(surface);
    const idToken = getIdentityToken(surface);

    const httpHeaders: Record<string, string> = {};
    if (idToken) {
      httpHeaders["Authorization"] = `Bearer ${idToken}`;
    }

    const http = await request.get(url, {
      failOnStatusCode: false,
      headers: Object.keys(httpHeaders).length > 0 ? httpHeaders : undefined,
    });
    expect(http.status()).toBe(surface.expectedStatus);
    expect(http.headers()[manifest.responseHeader]).toBe(manifest.candidateSha);

    if (idToken) {
      await context.setExtraHTTPHeaders({
        Authorization: `Bearer ${idToken}`,
      });
    }

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

test("bank console demo login remains on the deployed public origin", async ({
  page,
  context,
}) => {
  const baseUrl = process.env.DRTS_OPERATIONAL_BANK_CONSOLE_URL;
  if (!baseUrl)
    throw new Error(
      "DRTS_OPERATIONAL_BANK_CONSOLE_URL is required for Bank Console acceptance.",
    );
  const expectedOrigin = new URL(baseUrl).origin;

  const idToken = getIdentityToken({
    id: "bank-console-web",
    urlEnv: "DRTS_OPERATIONAL_BANK_CONSOLE_URL",
  });
  if (idToken) {
    await context.setExtraHTTPHeaders({
      Authorization: `Bearer ${idToken}`,
    });
  }

  await page.goto(`${expectedOrigin}/login?bank=acme&locale=zh&signedOut=1`, {
    waitUntil: "domcontentloaded",
  });
  await Promise.all([
    page.waitForURL((url) => {
      return (
        url.origin === expectedOrigin &&
        url.pathname === "/" &&
        url.searchParams.get("bank") === "acme" &&
        url.searchParams.get("role") === "bank_program_admin"
      );
    }),
    page.getByRole("button", { name: "方案管理員" }).click(),
  ]);
});

for (const surface of manifest.retiredSurfaces) {
  test(`${surface.id} remains ${surface.state}`, async ({ request }) => {
    const response = await request.get(target(surface), {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(surface.expectedStatus);
  });
}
