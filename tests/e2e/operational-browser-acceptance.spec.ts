import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type TemplateVariables = Record<string, unknown>;
type SetupRequest = {
  baseUrlEnv?: string;
  path: string;
  method: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  capture?: Record<string, string>;
};
type JourneyStep =
  | { kind: "navigate"; path: string }
  | { kind: "click"; control: string }
  | { kind: "fill"; control: string; value: string };
type BrowserSession = {
  cookieName: string;
  tokenEnv: string;
  templateVariable: string;
};
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
  browserSession?: BrowserSession;
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

function requiredEnvironmentValue(envName: string) {
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(
      `${envName} is required for this browser session's deployed candidate evidence.`,
    );
  }
  return value;
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

function variableValue(name: string, variables: TemplateVariables) {
  const value = variables[name];
  expect(value, `template variable ${name}`).not.toBeUndefined();
  return value;
}

function materializeString(template: string, variables: TemplateVariables) {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_, name) =>
    String(variableValue(name, variables)),
  );
}

function materializeValue(
  value: unknown,
  variables: TemplateVariables,
): unknown {
  if (typeof value === "string") {
    const wholeVariable = value.match(/^\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}$/);
    return wholeVariable
      ? variableValue(wholeVariable[1]!, variables)
      : materializeString(value, variables);
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeValue(item, variables));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        materializeValue(item, variables),
      ]),
    );
  }
  return value;
}

function interpolatePath(
  template: string,
  resultId: unknown,
  variables: TemplateVariables,
) {
  const materialized = materializeString(template, variables);
  if (!materialized.includes("{resultId}")) return materialized;
  expect(
    resultId,
    `${materialized} requires a prior operation result ID`,
  ).toBeTruthy();
  return materialized.replaceAll(
    "{resultId}",
    encodeURIComponent(String(resultId)),
  );
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
  variables: TemplateVariables,
) {
  for (const step of steps) {
    if (step.kind === "navigate") {
      await navigate(
        page,
        origin,
        interpolatePath(step.path, lastResultId, variables),
      );
      continue;
    }

    const control = page.locator(step.control).first();
    await expect(control, `${step.control} must be visible`).toBeVisible({
      timeout: interactionTimeoutMs,
    });
    if (step.kind === "fill") {
      await control.fill(materializeString(step.value, variables));
    } else {
      await control.click();
    }
  }
}

async function runSetup(
  page: Page,
  journey: Journey,
  variables: TemplateVariables,
) {
  for (const setup of journey.setup ?? []) {
    const origin = requiredOrigin(setup.baseUrlEnv ?? journey.baseUrlEnv);
    const body = setup.body
      ? materializeValue(setup.body, variables)
      : undefined;
    const headers = setup.headers
      ? (materializeValue(setup.headers, variables) as Record<string, string>)
      : undefined;
    const response = await page
      .context()
      .request.fetch(
        new URL(materializeString(setup.path, variables), origin).toString(),
        {
          method: setup.method,
          maxRedirects: 0,
          ...(body
            ? {
                data: body,
                headers: { "Content-Type": "application/json", ...headers },
              }
            : headers
              ? { headers }
              : {}),
        },
      );
    expect(response.status(), `${journey.id} setup ${setup.path}`).toBeLessThan(
      400,
    );
    expectCandidateRevision(
      response.headers(),
      `${journey.id} setup ${setup.path}`,
    );
    if (setup.capture) {
      const responseBody = (await response.json()) as unknown;
      for (const [name, valuePath] of Object.entries(setup.capture)) {
        const value = valueAtPath(responseBody, valuePath);
        expect(
          value,
          `${journey.id} setup ${setup.path} capture ${name}`,
        ).toBeTruthy();
        variables[name] = value;
      }
    }
    record({
      kind: "setup",
      journey: journey.id,
      surface: journey.surface,
      actorScope: journey.actorScope,
      method: setup.method,
      url: response.url(),
      status: response.status(),
      captures: setup.capture ? Object.keys(setup.capture) : [],
    });
  }
}

async function installBrowserSession(
  page: Page,
  journey: Journey,
  origin: string,
  variables: TemplateVariables,
) {
  const session = journey.browserSession;
  if (!session) {
    return;
  }

  const token = requiredEnvironmentValue(session.tokenEnv);
  variables[session.templateVariable] = token;
  await page.context().addCookies([
    {
      name: session.cookieName,
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  record({
    kind: "browser-session",
    journey: journey.id,
    surface: journey.surface,
    actorScope: journey.actorScope,
    tokenSource: session.tokenEnv,
  });
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
    if (journey.browserSession) {
      expect(journey.browserSession.cookieName).not.toEqual("");
      expect(journey.browserSession.tokenEnv).not.toEqual("");
      expect(journey.browserSession.templateVariable).not.toEqual("");
    }
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
    const variables: TemplateVariables = {
      runId: `${journey.id}-${Date.now().toString(36)}`,
    };
    await installBrowserSession(page, journey, origin, variables);
    await runSetup(page, journey, variables);
    await navigate(
      page,
      origin,
      interpolatePath(journey.route, null, variables),
    );

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

      await runSteps(
        page,
        origin,
        operation.before ?? [],
        lastResultId,
        variables,
      );
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
      // A successful mutation can navigate immediately. Begin consuming the
      // response before navigation disposes its CDP request body.
      const responseBodyPromise =
        operation.responseKind === "json"
          ? responsePromise.then(
              (response) => response.json() as Promise<unknown>,
            )
          : null;
      const downloadPromise =
        operation.responseKind === "download"
          ? page.waitForEvent("download", { timeout: interactionTimeoutMs })
          : null;
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
        const download = await downloadPromise!;
        expect(
          response.headers()["content-type"] ?? "",
          `${journey.id}/${operation.name} content type`,
        ).toContain(operation.expectedContentTypeIncludes as string);
        expect(
          response.headers()["content-disposition"] ?? "",
          `${journey.id}/${operation.name} attachment`,
        ).toContain("attachment");
        expect(
          await download.failure(),
          `${journey.id}/${operation.name} download failure`,
        ).toBeNull();
        expect(
          (await download.createReadStream()) !== null,
          `${journey.id}/${operation.name} artifact stream`,
        ).toBeTruthy();
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

      const responseBody = await responseBodyPromise!;
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
      const readbackPath = interpolatePath(readback.url, resultId, variables);
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
    const variables: TemplateVariables = {
      runId: `${journey.id}-route-${Date.now().toString(36)}`,
    };
    await installBrowserSession(page, journey, origin, variables);
    await runSetup(page, journey, variables);
    const response = await page.goto(
      new URL(
        interpolatePath(journey.route, null, variables),
        origin,
      ).toString(),
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
