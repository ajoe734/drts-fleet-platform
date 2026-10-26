import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
} from "@drts/contracts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { createOperationalEvidenceJournal } from "./operational-evidence-journal";
import {
  runSetup,
  runOperationalDocumentAcceptance,
  requiredOrigin,
  operationalRequestHeaders,
  fetchOperationalSurface,
  installOperationalBrowserHeaders,
  prepareOperationalFleetSession,
  type DocumentAcceptanceManifest,
  type FleetApplicationSetup,
  type PreparedOperationalFleetSession,
  valueAtPath,
  materializeString,
  type HttpMethod,
  type TemplateVariables,
  type SetupRequest,
} from "./operational-document-upload";
type JourneyStep =
  | { kind: "referral-fees"; control: string }
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
  resultIdQueryParam?: string;
  readback?: Readback;
  expectedContentTypeIncludes?: string;
};
type NavigationOperation = {
  kind: "navigation";
  name: string;
  control: string;
  before?: JourneyStep[];
  expectedPath: string;
  expectedQuery: Record<string, string>;
  readback?: Readback;
};
type IntentOperation = {
  kind: "intent";
  name: string;
  control: string;
  targetBaseUrlEnv: string;
  expectedPathPattern: string;
};
type AbsenceOperation = {
  kind: "absence";
  name: string;
  control: string;
};
type Operation =
  | RequestOperation
  | NavigationOperation
  | IntentOperation
  | AbsenceOperation;
type Journey = {
  id: string;
  surface: string;
  baseUrlEnv: string;
  route: string;
  actorScope: string;
  environmentVariables?: Record<string, string>;
  browserSession?: BrowserSession;
  setup?: SetupRequest[];
  operations: Operation[];
};
type RetiredSurface = { id: string; baseUrlEnv: string; path: string };
type Manifest = {
  version: number;
  candidateSha: string;
  fleetApplicationSetup: FleetApplicationSetup;
  journeys: Journey[];
  retiredSurfaces: RetiredSurface[];
  documentAcceptance: DocumentAcceptanceManifest;
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
const evidenceJournal = createOperationalEvidenceJournal(
  evidenceDir,
  candidateSha,
  manifestPath,
);
const interactionTimeoutMs = 10_000;

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
  const { workerIndex, testId, retry } = test.info();
  evidenceJournal.record({ ...entry, workerIndex, testId, retry });
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
  return materialized
    .split("{resultId}")
    .join(encodeURIComponent(String(resultId)));
}

async function navigate(page: Page, origin: string, route: string) {
  await page.goto(new URL(route, origin).toString(), {
    waitUntil: "domcontentloaded",
  });
}

function interpolateOperationValue(
  value: string,
  resultId: unknown,
  variables: TemplateVariables,
) {
  const materialized = materializeString(value, variables);
  if (!materialized.includes("{resultId}")) return materialized;
  expect(
    resultId,
    `${value} requires a prior operation result ID`,
  ).toBeTruthy();
  return materialized.split("{resultId}").join(String(resultId));
}

async function assertReadback(
  page: Page,
  origin: string,
  journey: Journey,
  operationName: string,
  requestUrl: string,
  resultId: unknown,
  readback: Readback,
  variables: TemplateVariables,
) {
  const readbackPath = interpolatePath(readback.url, resultId, variables);
  const readbackUrl = new URL(readbackPath, origin).toString();
  const readbackHeaders = operationalRequestHeaders(
    journey.baseUrlEnv,
    readbackUrl,
  );
  const readbackResponse = await fetchOperationalSurface(
    page.context().request,
    journey.baseUrlEnv,
    readbackUrl,
    {
      headers: readbackHeaders,
    },
  );
  expect(
    readbackResponse.ok(),
    `${journey.id}/${operationName} readback`,
  ).toBeTruthy();
  expectCandidateRevision(
    readbackResponse.headers(),
    `${journey.id}/${operationName} readback`,
  );
  const readbackBody = (await readbackResponse.json()) as unknown;
  expect(valueAtPath(readbackBody, readback.idPath)).toBe(resultId);
  const readbackState = valueAtPath(readbackBody, readback.statePath);
  expect(readbackState, `${journey.id}/${operationName} readback state`).toBe(
    readback.expectedState,
  );
  record({
    kind: "mutation-readback",
    journey: journey.id,
    surface: journey.surface,
    actorScope: journey.actorScope,
    operation: operationName,
    requestUrl,
    resultId,
    readbackUrl: readbackResponse.url(),
    readbackState,
  });
}

type FirstReferralVisit = {
  visitKey: string; // SHA-256 of the server-issued, owner-bound recoveryScope; not a credential.
  recoveryScope: string; // RAM only; compared against authenticated session readbacks.
  handoffId: string; // RAM only; never journal this identifier.
  fee?: {
    disclosureVersion: string;
    contentHash: string;
    acknowledgedAt: string;
  };
};

function referralSession(
  body: unknown,
  visit: FirstReferralVisit,
  active: boolean,
) {
  const root = body as {
    ok?: unknown;
    session?: Record<string, any>;
    data?: Record<string, any>;
  } | null;
  const session = root?.session;
  expect(root?.ok).toBe(true);
  expect(session?.handoffId).toBe(visit.handoffId);
  expect(session?.recoveryScope).toBe(visit.recoveryScope);
  expect(session?.partnerEntrySlug).toBe("yuhe-residence");
  expect(session?.identityActive).toBe(active);
  expect(
    session?.consent?.grantedAt === null,
    "initial privacy consent must be absent",
  ).toBe(!active);
  if (active) {
    expect(root?.data?.active).toBe(true);
    expect(root?.data?.identity?.recovery_scope).toBe(visit.recoveryScope);
    expect(root?.data?.identity?.handoff_id).toBe(visit.handoffId);
    expect(root?.data?.identity?.identity_active).toBe(true);
    expect(root?.data?.session?.recoveryScope).toBe(visit.recoveryScope);
    expect(typeof session?.consent?.grantedAt).toBe("string");
    expect(Number.isFinite(Date.parse(session?.consent?.grantedAt))).toBe(true);
  }
  return {
    identityActive: active,
    privacyGranted: active,
    consentBundleVersion: session?.consent?.bundleVersion,
  };
}

function referralFee(body: unknown) {
  const root = body as { ok?: unknown; data?: Record<string, unknown> } | null;
  expect(root?.ok).toBe(true);
  const data = root?.data;
  expect(data?.disclosureVersion).toBe(PASSENGER_FEE_DISCLOSURE_VERSION);
  expect(data?.contentHash).toBe(PASSENGER_FEE_CONTENT_HASH);
  expect(
    data?.acknowledgedAt === null ||
      (typeof data?.acknowledgedAt === "string" &&
        Number.isFinite(Date.parse(data.acknowledgedAt))),
  ).toBe(true);
  return data as {
    disclosureVersion: string;
    contentHash: string;
    acknowledgedAt: string | null;
  };
}

async function runSteps(
  page: Page,
  origin: string,
  steps: JourneyStep[],
  lastResultId: unknown,
  variables: TemplateVariables,
  visit?: FirstReferralVisit,
) {
  for (const step of steps) {
    if (step.kind === "referral-fees") {
      const url = new URL("/api/referral/fees", origin).toString();
      const response = await page.request.get(url, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expectCandidateRevision(response.headers(), "referral fee initial GET");
      const initial = referralFee(await response.json());
      expect(
        initial.acknowledgedAt,
        "returning fee consent is not first consent",
      ).toBeNull();
      expect(
        visit,
        "first-visit fee proof needs the setup owner",
      ).toBeDefined();
      record({
        kind: "referral-first-fee-initial",
        visitKey: visit!.visitKey,
        status: response.status(),
        path: "/api/referral/fees",
        ...initial,
      });
      const submitted = page.waitForResponse(
        (item) => item.url() === url && item.request().method() === "POST",
      );
      const control = page.locator(step.control);
      await expect(control).toBeVisible();
      await control.click();
      const post = await submitted;
      expect(post.status()).toBe(200);
      expectCandidateRevision(post.headers(), "referral fee first POST");
      const ack = referralFee(await post.json());
      expect(ack.acknowledgedAt).not.toBeNull();
      record({
        kind: "referral-first-fee-post",
        visitKey: visit!.visitKey,
        status: post.status(),
        path: "/api/referral/fees",
        ...ack,
      });
      const read = await page.request.get(url, { maxRedirects: 0 });
      expect(read.status()).toBe(200);
      expectCandidateRevision(read.headers(), "referral fee canonical GET");
      const persisted = referralFee(await read.json());
      expect(persisted).toEqual(ack);
      visit!.fee = ack as FirstReferralVisit["fee"];
      record({
        kind: "referral-first-fee-readback",
        visitKey: visit!.visitKey,
        status: read.status(),
        path: "/api/referral/fees",
        ...persisted,
      });
      continue;
    }
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

function installEnvironmentVariables(
  journey: Journey,
  variables: TemplateVariables,
) {
  for (const [name, envName] of Object.entries(
    journey.environmentVariables ?? {},
  )) {
    variables[name] = requiredEnvironmentValue(envName);
  }
}

let fleetSession: PreparedOperationalFleetSession | undefined;
test.beforeAll(async () => {
  fleetSession = await prepareOperationalFleetSession(
    manifest.fleetApplicationSetup,
  );
  record({ kind: "fleet-application-session", ...fleetSession.metadata });
});

test.afterAll(async () => {
  try {
    await fleetSession?.cleanup();
    if (fleetSession)
      record({
        kind: "fleet-application-session-cleanup",
        ...fleetSession.metadata,
        outcome:
          fleetSession.metadata.source === "provided-session"
            ? "provided-session-preserved"
            : "own-session-key-entry-revoked",
      });
  } catch (error) {
    if (fleetSession)
      record({
        kind: "fleet-application-session-cleanup",
        ...fleetSession.metadata,
        outcome: "failed",
      });
    throw error;
  } finally {
    evidenceJournal.flush();
  }
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
    "referral-create-read-cancel-receipt",
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

      if (operation.kind === "absence") {
        continue;
      }

      if (operation.kind === "navigation") {
        expect(operation.expectedPath).not.toEqual("");
        expect(Object.keys(operation.expectedQuery).length).toBeGreaterThan(0);
        if (operation.readback) {
          expect(operation.readback.url).not.toEqual("");
          expect(operation.readback.idPath).not.toEqual("");
          expect(operation.readback.statePath).not.toEqual("");
          expect(operation.readback.expectedState).not.toBeUndefined();
        }
        continue;
      }

      expect(operation.requestUrlIncludes).not.toEqual("");
      expect(operation.requestMethod).not.toEqual("");
      if (operation.responseKind === "download") {
        expect(operation.expectedContentTypeIncludes).not.toEqual("");
        continue;
      }

      expect(
        operation.resultIdPath || operation.resultIdQueryParam,
      ).not.toEqual("");
      expect(operation.readback).toBeDefined();
      expect(operation.readback?.url).not.toEqual("");
      expect(operation.readback?.idPath).not.toEqual("");
      expect(operation.readback?.statePath).not.toEqual("");
      expect(operation.readback?.expectedState).not.toBeUndefined();
    }
  }

  expect(manifest.documentAcceptance).toBeDefined();
  expect(manifest.documentAcceptance.id).toBe(
    "c125-document-storage-scan-readback-role-matrix",
  );
  expect(manifest.documentAcceptance.baseUrlEnv).toBe(
    "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
  );
  expect(manifest.documentAcceptance.setup.length).toBeGreaterThan(0);
});

for (const journey of manifest.journeys) {
  test(`${journey.id} executes its declared operational contract`, async ({
    page,
  }) => {
    const origin = requiredOrigin(journey.baseUrlEnv);
    const variables: TemplateVariables = {
      runId: `${journey.id}-${Date.now().toString(36)}`,
    };
    installEnvironmentVariables(journey, variables);
    await installOperationalBrowserHeaders(page, journey.baseUrlEnv);
    await installBrowserSession(page, journey, origin, variables);
    // Observe the normal runSetup request, not a second bootstrap. The real
    // APIRequestContext owns the cookie; only the response is inspected here.
    let bootstrap: APIResponse | undefined;
    const request = page.context().request;
    const setupRequest =
      journey.id === "referral-create-read-cancel-receipt"
        ? new Proxy(request, {
            get(target, key) {
              if (key === "fetch")
                return async (
                  ...args: Parameters<APIRequestContext["fetch"]>
                ) => {
                  const response = await target.fetch(...args);
                  if (
                    args[0] ===
                      new URL("/api/referral/session", origin).toString() &&
                    args[1]?.method === "POST"
                  )
                    bootstrap = response;
                  return response;
                };
              const value: unknown = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
        : request;
    await runSetup({ request: setupRequest, record }, journey, variables);
    let visit: FirstReferralVisit | undefined;
    if (journey.id === "referral-create-read-cancel-receipt") {
      expect(
        bootstrap,
        "normal setup must issue one Demo bootstrap",
      ).toBeDefined();
      expect(bootstrap!.status()).toBe(200);
      expectCandidateRevision(bootstrap!.headers(), "referral Demo bootstrap");
      const body = (await bootstrap!.json()) as {
        session?: { recoveryScope?: string; handoffId?: string };
      };
      const scope = body.session?.recoveryScope;
      const handoffId = body.session?.handoffId;
      expect(scope).toMatch(/^[0-9a-f]{64}$/);
      expect(handoffId).toMatch(/^[0-9a-f-]{36}$/i);
      visit = {
        recoveryScope: scope!,
        handoffId: handoffId!,
        visitKey: createHash("sha256").update(scope!).digest("hex"),
      };
      const state = referralSession(body, visit, false);
      record({
        kind: "referral-first-privacy-initial",
        visitKey: visit.visitKey,
        status: bootstrap!.status(),
        path: "/api/referral/session",
        ...state,
      });
    }
    await navigate(
      page,
      origin,
      interpolatePath(journey.route, null, variables),
    );
    if (visit) {
      await expect(
        page.locator(
          "form[action='/api/referral/session'] button[type='submit']",
        ),
      ).toBeVisible();
      const preConsent = await page.request.get(
        new URL("/api/referral/session", origin).toString(),
        { maxRedirects: 0 },
      );
      expect(preConsent.status()).toBe(401);
      expectCandidateRevision(
        preConsent.headers(),
        "referral unconsented session GET",
      );
      record({
        kind: "referral-first-privacy-inactive-read",
        visitKey: visit.visitKey,
        status: preConsent.status(),
        path: "/api/referral/session",
      });
    }

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

      if (operation.kind === "absence") {
        await expect(
          page.locator(operation.control),
          `${journey.id}/${operation.name} must not be offered`,
        ).toHaveCount(0);
        record({
          kind: "control-absence",
          journey: journey.id,
          surface: journey.surface,
          actorScope: journey.actorScope,
          operation: operation.name,
          control: operation.control,
        });
        continue;
      }

      await runSteps(
        page,
        origin,
        operation.before ?? [],
        lastResultId,
        variables,
        visit,
      );
      const activeControl = page.locator(operation.control).first();
      await expect(
        activeControl,
        `${journey.id}/${operation.name} control after preconditions`,
      ).toBeVisible({ timeout: interactionTimeoutMs });

      if (operation.kind === "navigation") {
        const expectedQuery = Object.fromEntries(
          Object.entries(operation.expectedQuery).map(([key, value]) => [
            key,
            interpolateOperationValue(value, lastResultId, variables),
          ]),
        );
        const navigation = page.waitForURL(
          (url) => {
            if (
              url.origin !== new URL(origin).origin ||
              url.pathname !== operation.expectedPath
            ) {
              return false;
            }
            return Object.entries(expectedQuery).every(
              ([key, value]) => url.searchParams.get(key) === value,
            );
          },
          { timeout: interactionTimeoutMs },
        );
        const consentResponse =
          visit && operation.name === "explicit-consent"
            ? page.waitForResponse(
                (response) =>
                  response.url() ===
                    new URL("/api/referral/session", origin).toString() &&
                  response.request().method() === "POST",
              )
            : null;
        await activeControl.click({ noWaitAfter: true });
        const privacyPost = await consentResponse;
        if (privacyPost && visit) {
          // The native HTML form redirects; it does not return a JSON consent
          // version or timestamp. Never read/log the form, cookie or redirect URL.
          expect(privacyPost.status()).toBe(307);
          expectCandidateRevision(
            privacyPost.headers(),
            "referral privacy POST",
          );
          record({
            kind: "referral-first-privacy-post",
            visitKey: visit.visitKey,
            status: privacyPost.status(),
            path: "/api/referral/session",
            outcome: "native-form-redirect",
          });
        }
        await navigation;
        if (privacyPost && visit) {
          const sessionResponse = await page.request.get(
            new URL("/api/referral/session", origin).toString(),
            { maxRedirects: 0 },
          );
          expect(sessionResponse.status()).toBe(200);
          expectCandidateRevision(
            sessionResponse.headers(),
            "referral privacy canonical GET",
          );
          const state = referralSession(
            await sessionResponse.json(),
            visit,
            true,
          );
          record({
            kind: "referral-first-privacy-readback",
            visitKey: visit.visitKey,
            status: sessionResponse.status(),
            path: "/api/referral/session",
            ...state,
          });
        }
        // URL convergence plus authority readback is the contract. Some target
        // screens keep background requests open and never become network-idle.
        const target = page.url();
        if (operation.readback) {
          await assertReadback(
            page,
            origin,
            journey,
            operation.name,
            target,
            lastResultId,
            operation.readback,
            variables,
          );
        }
        record({
          kind: "navigation",
          journey: journey.id,
          surface: journey.surface,
          actorScope: journey.actorScope,
          operation: operation.name,
          target,
        });
        continue;
      }

      if (operation.responseKind === "download") {
        const downloadPromise = page.waitForEvent("download", {
          timeout: interactionTimeoutMs,
        });
        await activeControl.click({ noWaitAfter: true });
        const download = await downloadPromise;
        expect(
          await download.failure(),
          `${journey.id}/${operation.name} download failure`,
        ).toBeNull();
        expect(
          (await download.createReadStream()) !== null,
          `${journey.id}/${operation.name} artifact stream`,
        ).toBeTruthy();

        const downloadUrl = download.url();
        const downloadHeaders = operationalRequestHeaders(
          journey.baseUrlEnv,
          downloadUrl,
        );
        const downloadResponse = await fetchOperationalSurface(
          page.context().request,
          journey.baseUrlEnv,
          downloadUrl,
          {
            headers: downloadHeaders,
          },
        );
        expect(
          downloadResponse.ok(),
          `${journey.id}/${operation.name} download response ok`,
        ).toBeTruthy();
        expectCandidateRevision(
          downloadResponse.headers(),
          `${journey.id}/${operation.name} download candidate revision`,
        );
        expect(
          downloadResponse.headers()["content-type"] ?? "",
          `${journey.id}/${operation.name} content type`,
        ).toContain(operation.expectedContentTypeIncludes as string);
        expect(
          downloadResponse.headers()["content-disposition"] ?? "",
          `${journey.id}/${operation.name} attachment`,
        ).toContain("attachment");

        record({
          kind: "download",
          journey: journey.id,
          surface: journey.surface,
          actorScope: journey.actorScope,
          operation: operation.name,
          requestUrl: downloadUrl,
          contentType: downloadResponse.headers()["content-type"],
        });
        continue;
      }

      const resultIdLocationPromise = operation.resultIdQueryParam
        ? page.waitForURL(
            (url) => url.searchParams.has(operation.resultIdQueryParam!),
            { timeout: interactionTimeoutMs },
          )
        : null;
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === operation.requestMethod &&
          response
            .url()
            .includes(
              interpolatePath(
                operation.requestUrlIncludes,
                lastResultId,
                variables,
              ),
            ),
        { timeout: interactionTimeoutMs },
      );
      // Begin reading before a mutation-triggered navigation can detach the
      // Chromium response body from its request identifier.
      const responseBodyPromise =
        operation.responseKind === "json" && !operation.resultIdQueryParam
          ? responsePromise.then(
              (response) => response.json() as Promise<unknown>,
            )
          : null;
      // Mutations can navigate the page. Do not wait for that navigation before
      // reading JSON, otherwise Chromium may discard the response body.
      await activeControl.click({ noWaitAfter: true });
      const response = await responsePromise;
      expect(
        response.ok(),
        `${journey.id}/${operation.name} response`,
      ).toBeTruthy();
      expectCandidateRevision(
        response.headers(),
        `${journey.id}/${operation.name} response`,
      );

      const resultId = operation.resultIdQueryParam
        ? await resultIdLocationPromise!.then(() =>
            new URL(page.url()).searchParams.get(operation.resultIdQueryParam!),
          )
        : valueAtPath(
            await responseBodyPromise!,
            operation.resultIdPath as string,
          );
      expect(
        resultId,
        `${journey.id}/${operation.name} result ID`,
      ).toBeTruthy();
      lastResultId = resultId;
      await assertReadback(
        page,
        origin,
        journey,
        operation.name,
        response.url(),
        resultId,
        operation.readback as Readback,
        variables,
      );
    }

    if (visit) {
      expect(
        visit.fee,
        "first fee POST and canonical GET must precede return",
      ).toBeDefined();
      // Same Playwright context, signed session cookie and owner-bound canonical
      // readback. Do not call demo-bootstrap, grant consent or fee POST again.
      await navigate(
        page,
        origin,
        "/embed/yuhe-residence?state=handoff&screen=book&entryHost=" +
          encodeURIComponent(String(variables.referralEntryHost)),
      );
      const sessionResponse = await page.request.get(
        new URL("/api/referral/session", origin).toString(),
        { maxRedirects: 0 },
      );
      expect(sessionResponse.status()).toBe(200);
      expectCandidateRevision(
        sessionResponse.headers(),
        "referral returning session GET",
      );
      const state = referralSession(await sessionResponse.json(), visit, true);
      const read = await page.request.get(
        new URL("/api/referral/fees", origin).toString(),
        { maxRedirects: 0 },
      );
      expect(read.status()).toBe(200);
      expectCandidateRevision(read.headers(), "referral returning fee GET");
      const persisted = referralFee(await read.json());
      expect(persisted).toEqual(visit.fee);
      record({
        kind: "referral-same-owner-return",
        visitKey: visit.visitKey,
        sessionStatus: sessionResponse.status(),
        feeStatus: read.status(),
        sessionPath: "/api/referral/session",
        feePath: "/api/referral/fees",
        ...state,
        ...persisted,
      });
    }
    if (journey.id === "admin-review-approve-readback") {
      await runOperationalDocumentAcceptance(
        { request: page.context().request, record },
        manifest.documentAcceptance,
        variables,
      );
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
    installEnvironmentVariables(journey, variables);
    await installOperationalBrowserHeaders(page, journey.baseUrlEnv);
    await installBrowserSession(page, journey, origin, variables);
    await runSetup(
      { request: page.context().request, record },
      journey,
      variables,
    );
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
