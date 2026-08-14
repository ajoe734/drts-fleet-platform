import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

type Journey = {
  id: string;
  surface: string;
  baseUrlEnv: string;
  route: string;
  actorScope: string;
  operations: Array<{
    name: string;
    control: string;
    requestUrlIncludes: string;
    requestMethod: string;
    resultIdPath: string;
    readbackUrl: string;
    readbackIdPath: string;
    readbackStatePath: string;
    expectedReadbackState: string | number | boolean;
  }>;
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

function requiredOrigin(envName: string) {
  const value = process.env[envName]?.trim();
  if (!value)
    throw new Error(
      `${envName} is required: release acceptance must target a deployed candidate URL.`,
    );
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

test.afterAll(() => {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    path.join(evidenceDir, "operational-browser-evidence.json"),
    `${JSON.stringify({ candidateSha, manifest: path.basename(manifestPath), evidence }, null, 2)}\n`,
  );
});

test("requires a single immutable candidate SHA and complete formal journey manifest", () => {
  expect(
    candidateSha,
    "DRTS_CANDIDATE_SHA is mandatory; URL-only smoke is not release evidence.",
  ).toMatch(/^[0-9a-f]{7,64}$/i);
  expect(manifest.version).toBe(1);
  expect(
    manifest.candidateSha,
    "candidate manifest must bind its executable operations to one SHA",
  ).toBe(candidateSha);
  expect(manifest.journeys.map(({ id }) => id)).toEqual([
    "referral-create-read-cancel-rate-receipt",
    "enterprise-create-read-update-cancel",
    "fleet-submit-read-withdraw-resubmit",
    "admin-review-approve-readback",
    "tenant-ops-dispatch-downstream-read",
    "bank-statement-download-readback",
    "channel-statement-download-readback",
  ]);
  for (const journey of manifest.journeys) {
    expect(journey.actorScope, `${journey.id} actor scope`).not.toEqual("");
    expect(
      journey.operations.length,
      `${journey.id} operations`,
    ).toBeGreaterThan(0);
    for (const operation of journey.operations) {
      for (const value of [
        operation.name,
        operation.control,
        operation.requestUrlIncludes,
        operation.requestMethod,
        operation.resultIdPath,
        operation.readbackUrl,
        operation.readbackIdPath,
        operation.readbackStatePath,
      ]) {
        expect(value, `${journey.id} executable operation field`).not.toEqual(
          "",
        );
      }
      expect(operation.expectedReadbackState).not.toBeUndefined();
    }
  }
});

test("executes declared browser mutations and API readbacks", async ({
  page,
}) => {
  for (const journey of manifest.journeys) {
    const origin = requiredOrigin(journey.baseUrlEnv);
    await page.goto(new URL(journey.route, origin).toString(), {
      waitUntil: "domcontentloaded",
    });

    let lastResultId: unknown = null;

    for (const operation of journey.operations) {
      if (journey.surface === "enterprise") {
        if (operation.name === "update" && lastResultId) {
          await page.goto(
            new URL(
              `/bookings/new?bookingId=${encodeURIComponent(String(lastResultId))}`,
              origin,
            ).toString(),
            { waitUntil: "domcontentloaded" },
          );
        } else if (operation.name === "cancel" && lastResultId) {
          await page.goto(
            new URL(
              `/bookings/${encodeURIComponent(String(lastResultId))}`,
              origin,
            ).toString(),
            { waitUntil: "domcontentloaded" },
          );
        }
      }

      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === operation.requestMethod &&
          response.url().includes(operation.requestUrlIncludes),
      );
      await page.locator(operation.control).click();
      const mutationResponse = await responsePromise;
      expect(
        mutationResponse.ok(),
        `${journey.id}/${operation.name} mutation`,
      ).toBeTruthy();
      expectCandidateRevision(
        mutationResponse.headers(),
        `${journey.id}/${operation.name} mutation`,
      );
      const mutationBody = (await mutationResponse.json()) as unknown;
      const resultId = valueAtPath(mutationBody, operation.resultIdPath);
      expect(
        resultId,
        `${journey.id}/${operation.name} result ID`,
      ).toBeTruthy();
      lastResultId = resultId;

      const readbackPath = operation.readbackUrl.replace(
        "{resultId}",
        encodeURIComponent(String(resultId)),
      );
      const readbackUrl = new URL(readbackPath, origin).toString();
      // BrowserContext.request shares the authenticated browser cookie jar;
      // the global request fixture does not and would falsely 401 BFF routes.
      const readbackResponse = await page.context().request.get(readbackUrl);
      expect(
        readbackResponse.ok(),
        `${journey.id}/${operation.name} readback`,
      ).toBeTruthy();
      expectCandidateRevision(
        readbackResponse.headers(),
        `${journey.id}/${operation.name} readback`,
      );
      const readbackBody = (await readbackResponse.json()) as unknown;
      expect(valueAtPath(readbackBody, operation.readbackIdPath)).toBe(
        resultId,
      );
      const readbackState = valueAtPath(
        readbackBody,
        operation.readbackStatePath,
      );
      expect(
        readbackState,
        `${journey.id}/${operation.name} readback state`,
      ).toBe(operation.expectedReadbackState);
      record({
        kind: "mutation-readback",
        journey: journey.id,
        surface: journey.surface,
        actorScope: journey.actorScope,
        operation: operation.name,
        requestUrl: mutationResponse.url(),
        resultId,
        readbackUrl,
        readbackState,
      });
    }
  }
});

test("active deployed routes expose no fixture/degraded leakage and no enabled inert controls", async ({
  page,
}) => {
  for (const journey of manifest.journeys) {
    const origin = requiredOrigin(journey.baseUrlEnv);
    const response = await page.goto(
      new URL(journey.route, origin).toString(),
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.status(), `${journey.id} route`).toBeLessThan(400);
    expectCandidateRevision(response?.headers() ?? {}, `${journey.id} route`);
    await expect(
      page.locator("body"),
      `${journey.id} must not substitute a plausible fixture`,
    ).not.toContainText(
      /design sample data|preview fixture mode|fixture mode|demo fallback/i,
    );

    const inert = await page
      .locator(
        'button:not([disabled]):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), input[type="submit"]:not([disabled]), input[type="button"]:not([disabled])',
      )
      .evaluateAll((controls) =>
        controls.flatMap((control) => {
          if (control.hasAttribute("data-drt-operation")) return [];
          const nonOperational = control.closest("[data-drt-non-operational]");
          const reason = nonOperational?.getAttribute(
            "data-drt-non-operational-reason",
          );
          if (nonOperational && reason?.trim()) return [];
          return [
            {
              tag: control.tagName,
              text: (control.textContent ?? "").trim(),
              testId: control.getAttribute("data-testid"),
              nonOperationalReason: reason ?? null,
            },
          ];
        }),
      );
    expect(
      inert,
      `${journey.id}: every enabled control needs data-drt-operation, or data-drt-non-operational with an explicit reason.`,
    ).toEqual([]);
    record({
      kind: "route-census",
      journey: journey.id,
      surface: journey.surface,
      url: page.url(),
      actorScope: journey.actorScope,
      operations: journey.operations,
    });
  }
});

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
