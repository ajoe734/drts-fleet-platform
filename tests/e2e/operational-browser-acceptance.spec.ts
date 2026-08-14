import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type SetupRequest = {
  path: string;
  method: HttpMethod;
  body?: Record<string, unknown>;
};
type JourneyStep =
  | { kind: "navigate"; path: string }
  | { kind: "click"; control: string };
type Readback = {
  url: string;
  idPath: string;
  statePath: string;
  expectedState: string | number | boolean;
};
type RequestOperation = {
  kind: "request";
  name: string;
  control: string;
  requestUrlIncludes: string;
  requestMethod: HttpMethod;
  responseKind: "json" | "download";
  before?: JourneyStep[];
  resultIdPath?: string;
  readback?: Readback;
  expectedContentTypeIncludes?: string;
};
type IntentOperation = {
  kind: "intent";
  name: string;
  control: string;
  targetBaseUrlEnv: string;
  expectedPathPattern: string;
};
type Operation = RequestOperation | IntentOperation;
type Journey = {
  id: string;
  surface: string;
  baseUrlEnv: string;
  route: string;
  actorScope: string;
  setup?: SetupRequest[];
  operations: Operation[];
};
type RetiredSurface = { id: string; baseUrlEnv: string; path: string };
type Manifest = {
  version: number;
  candidateSha: string;
  journeys: Journey[];
  retiredSurfaces: RetiredSurface[];
};

const manifestPath =
  process.env.DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE ??
  path.join(
    process.cwd(),
    "tests/e2e/fixtures/operational-browser-journeys.json",
  );
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const candidateSha = process.env.DRTS_CANDIDATE_SHA?.trim();
const evidenceDir =
  process.env.DRTS_OPERATIONAL_EVIDENCE_DIR ??
  path.join(process.cwd(), "test-results/operational-browser");
const evidence: Array<Record<string, unknown>> = [];
const interactionTimeoutMs = 10_000;

function requiredOrigin(envName: string) {
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(
      `${envName} is required: release acceptance must target a deployed candidate URL.`,
    );
  }
  return new URL(value).toString();
}

function record(entry: Record<string, unknown>) {
  evidence.push({
    candidateSha,
    recordedAt: new Date().toISOString(),
    ...entry,
  });
}

function expectCandidateRevision(
  headers: Record<string, string>,
  evidenceLabel: string,
) {
  expect(
    headers["x-drts-candidate-sha"],
    `${evidenceLabel} must report the deployed immutable candidate SHA`,
  ).toBe(candidateSha);
}

function valueAtPath(value: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function interpolatePath(template: string, resultId: unknown) {
  if (!template.includes("{resultId}")) return template;
  expect(
    resultId,
    `${template} requires a prior operation result ID`,
  ).toBeTruthy();
  return template.replace("{resultId}", encodeURIComponent(String(resultId)));
}

async function navigate(page: Page, origin: string, route: string) {
  await page.goto(new URL(route, origin).toString(), {
    waitUntil: "domcontentloaded",
  });
}

async function runSteps(
  page: Page,
  origin: string,
  steps: JourneyStep[],
  lastResultId: unknown,
) {
  for (const step of steps) {
    if (step.kind === "navigate") {
      await navigate(page, origin, interpolatePath(step.path, lastResultId));
      continue;
    }

    const control = page.locator(step.control).first();
    await expect(control, `${step.control} must be visible`).toBeVisible({
      timeout: interactionTimeoutMs,
    });
    await control.click();
  }
}

async function runSetup(page: Page, origin: string, journey: Journey) {
  for (const setup of journey.setup ?? []) {
    const response = await page
      .context()
      .request.fetch(new URL(setup.path, origin).toString(), {
        method: setup.method,
        maxRedirects: 0,
        ...(setup.body
          ? {
              data: setup.body,
              headers: { "Content-Type": "application/json" },
            }
          : {}),
      });
    expect(response.status(), `${journey.id} setup ${setup.path}`).toBeLessThan(
      400,
    );
    expectCandidateRevision(
      response.headers(),
      `${journey.id} setup ${setup.path}`,
    );
    record({
      kind: "setup",
      journey: journey.id,
      surface: journey.surface,
      actorScope: journey.actorScope,
      method: setup.method,
      url: response.url(),
      status: response.status(),
    });
  }
}

test.afterAll(() => {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    path.join(evidenceDir, "operational-browser-evidence.json"),
    `${JSON.stringify(
      { candidateSha, manifest: path.basename(manifestPath), evidence },
      null,
      2,
    )}\n`,
  );
});

test("requires a single immutable candidate SHA and complete formal journey manifest", () => {
  expect(
    candidateSha,
    "DRTS_CANDIDATE_SHA is mandatory; URL-only smoke is not release evidence.",
  ).toMatch(/^[0-9a-f]{7,64}$/i);
  expect(manifest.version).toBe(2);
  expect(
    manifest.candidateSha,
    "candidate manifest must bind its executable operations to one SHA",
  ).toBe(candidateSha);
  expect(manifest.journeys.map(({ id }) => id)).toEqual([
    "referral-create-read-cancel-rate-receipt",
    "enterprise-create-read-update-cancel",
    "fleet-submit-read-withdraw-resubmit",
    "admin-review-approve-readback",
    "tenant-ops-dispatch-intent",
    "bank-statement-download",
    "channel-statement-download",
  ]);

  for (const journey of manifest.journeys) {
    expect(journey.actorScope, `${journey.id} actor scope`).not.toEqual("");
    expect(
      journey.operations.length,
      `${journey.id} operations`,
    ).toBeGreaterThan(0);
    for (const operation of journey.operations) {
      expect(operation.name, `${journey.id} operation name`).not.toEqual("");
      expect(operation.control, `${journey.id} operation control`).not.toEqual(
        "",
      );
      if (operation.kind === "intent") {
        expect(operation.targetBaseUrlEnv).not.toEqual("");
        expect(operation.expectedPathPattern).not.toEqual("");
        continue;
      }

      expect(operation.requestUrlIncludes).not.toEqual("");
      expect(operation.requestMethod).not.toEqual("");
      if (operation.responseKind === "download") {
        expect(operation.expectedContentTypeIncludes).not.toEqual("");
        continue;
      }

      expect(operation.resultIdPath).not.toEqual("");
      expect(operation.readback).toBeDefined();
      expect(operation.readback?.url).not.toEqual("");
      expect(operation.readback?.idPath).not.toEqual("");
      expect(operation.readback?.statePath).not.toEqual("");
      expect(operation.readback?.expectedState).not.toBeUndefined();
    }
  }
});

for (const journey of manifest.journeys) {
  test(`${journey.id} executes its declared operational contract`, async ({
    page,
  }) => {
    const origin = requiredOrigin(journey.baseUrlEnv);
    await runSetup(page, origin, journey);
    await navigate(page, origin, journey.route);

    let lastResultId: unknown = null;
    for (const operation of journey.operations) {
      if (operation.kind === "intent") {
        const control = page.locator(operation.control).first();
        await expect(
          control,
          `${journey.id}/${operation.name} control`,
        ).toBeVisible({
          timeout: interactionTimeoutMs,
        });
        const href = await control.getAttribute("href");
        expect(href, `${journey.id}/${operation.name} target`).toBeTruthy();
        const target = new URL(href as string, origin);
        expect(
          target.origin,
          `${journey.id}/${operation.name} target origin`,
        ).toBe(new URL(requiredOrigin(operation.targetBaseUrlEnv)).origin);
        expect(
          target.pathname,
          `${journey.id}/${operation.name} target path`,
        ).toMatch(new RegExp(operation.expectedPathPattern));
        record({
          kind: "cross-app-intent",
          journey: journey.id,
          surface: journey.surface,
          actorScope: journey.actorScope,
          operation: operation.name,
          target: target.toString(),
        });
        continue;
      }

      await runSteps(page, origin, operation.before ?? [], lastResultId);
      const activeControl = page.locator(operation.control).first();
      await expect(
        activeControl,
        `${journey.id}/${operation.name} control after preconditions`,
      ).toBeVisible({ timeout: interactionTimeoutMs });

      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === operation.requestMethod &&
          response.url().includes(operation.requestUrlIncludes),
        { timeout: interactionTimeoutMs },
      );
      await activeControl.click();
      const response = await responsePromise;
      expect(
        response.ok(),
        `${journey.id}/${operation.name} response`,
      ).toBeTruthy();
      expectCandidateRevision(
        response.headers(),
        `${journey.id}/${operation.name} response`,
      );

      if (operation.responseKind === "download") {
        expect(
          response.headers()["content-type"] ?? "",
          `${journey.id}/${operation.name} content type`,
        ).toContain(operation.expectedContentTypeIncludes as string);
        expect(
          response.headers()["content-disposition"] ?? "",
          `${journey.id}/${operation.name} attachment`,
        ).toContain("attachment");
        expect(
          (await response.body()).byteLength,
          `${journey.id}/${operation.name} artifact body`,
        ).toBeGreaterThan(0);
        record({
          kind: "download",
          journey: journey.id,
          surface: journey.surface,
          actorScope: journey.actorScope,
          operation: operation.name,
          requestUrl: response.url(),
          contentType: response.headers()["content-type"],
        });
        continue;
      }

      const responseBody = (await response.json()) as unknown;
      const resultId = valueAtPath(
        responseBody,
        operation.resultIdPath as string,
      );
      expect(
        resultId,
        `${journey.id}/${operation.name} result ID`,
      ).toBeTruthy();
      lastResultId = resultId;
      const readback = operation.readback as Readback;
      const readbackPath = interpolatePath(readback.url, resultId);
      const readbackResponse = await page
        .context()
        .request.get(new URL(readbackPath, origin).toString());
      expect(
        readbackResponse.ok(),
        `${journey.id}/${operation.name} readback`,
      ).toBeTruthy();
      expectCandidateRevision(
        readbackResponse.headers(),
        `${journey.id}/${operation.name} readback`,
      );
      const readbackBody = (await readbackResponse.json()) as unknown;
      expect(valueAtPath(readbackBody, readback.idPath)).toBe(resultId);
      const readbackState = valueAtPath(readbackBody, readback.statePath);
      expect(
        readbackState,
        `${journey.id}/${operation.name} readback state`,
      ).toBe(readback.expectedState);
      record({
        kind: "mutation-readback",
        journey: journey.id,
        surface: journey.surface,
        actorScope: journey.actorScope,
        operation: operation.name,
        requestUrl: response.url(),
        resultId,
        readbackUrl: readbackResponse.url(),
        readbackState,
      });
    }
  });
}

for (const journey of manifest.journeys) {
  test(`${journey.id} route serves the candidate without fixture fallback`, async ({
    page,
  }) => {
    const origin = requiredOrigin(journey.baseUrlEnv);
    await runSetup(page, origin, journey);
    const response = await page.goto(
      new URL(journey.route, origin).toString(),
      {
        waitUntil: "domcontentloaded",
      },
    );
    expect(response?.status(), `${journey.id} route`).toBeLessThan(400);
    expectCandidateRevision(response?.headers() ?? {}, `${journey.id} route`);
    await expect(
      page.locator("body"),
      `${journey.id} must not substitute a plausible fixture`,
    ).not.toContainText(
      /design sample data|preview fixture mode|fixture mode|demo fallback/i,
    );
    record({
      kind: "route",
      journey: journey.id,
      surface: journey.surface,
      url: page.url(),
      actorScope: journey.actorScope,
    });
  });
}

test("paused Partner Booking and retired Concierge remain unreachable", async ({
  request,
}) => {
  for (const retired of manifest.retiredSurfaces) {
    const response = await request.get(
      new URL(retired.path, requiredOrigin(retired.baseUrlEnv)).toString(),
    );
    expect(response.status(), `${retired.id} must remain retired`).toBe(404);
    record({
      kind: "retired-surface",
      surface: retired.id,
      url: response.url(),
      status: response.status(),
    });
  }
});
