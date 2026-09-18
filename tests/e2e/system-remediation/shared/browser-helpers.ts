import type { Page, Request, Response, ConsoleMessage } from "@playwright/test";
import { UatEvidenceRecorder } from "./evidence-recorder";
import {
  generateAuthHeaders,
  type RolePersona,
  type TestEnvironmentMode,
} from "./role-personas";
import type { UatTenantContext } from "./namespace-manager";

export interface AttachCollectorOptions {
  page: Page;
  recorder: UatEvidenceRecorder;
  currentPersona?: RolePersona | undefined;
  includeRequestBody?: boolean | undefined;
  includeResponseBody?: boolean | undefined;
}

/**
 * Attaches real-time HTTP, console, and error listeners to a Playwright page,
 * piping all interactions into the UatEvidenceRecorder with automatic PII de-identification.
 *
 * Returns a teardown function to detach listeners.
 */
export function attachBrowserEvidenceCollector(
  options: AttachCollectorOptions,
): () => void {
  const { page, recorder, currentPersona } = options;
  const pendingRequests = new Map<Request, number>();

  const handleConsole = (msg: ConsoleMessage) => {
    const levelMap: Record<string, "log" | "info" | "warn" | "error"> = {
      warning: "warn",
      error: "error",
      info: "info",
      log: "log",
    };
    const level = levelMap[msg.type()] || "log";
    recorder.recordConsole(level, msg.text(), msg.location().url);
  };

  const handlePageError = (error: Error) => {
    recorder.recordConsole(
      "error",
      `Uncaught Page Error: ${error.message}`,
      error.stack,
    );
    recorder.recordError(error);
  };

  const handleRequest = (req: Request) => {
    pendingRequests.set(req, Date.now());
  };

  const handleResponse = async (res: Response) => {
    const req = res.request();
    const startTime = pendingRequests.get(req) || Date.now();
    pendingRequests.delete(req);
    const durationMs = Date.now() - startTime;

    let responseBody: unknown = undefined;
    if (options.includeResponseBody) {
      try {
        const text = await res.text();
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text.slice(0, 1024);
        }
      } catch {
        // Response body might not be readable (e.g. streaming or aborted)
      }
    }

    recorder.recordHttpCall({
      method: req.method(),
      url: req.url(),
      statusCode: res.status(),
      durationMs,
      requestHeaders: req.headers(),
      responseHeaders: res.headers(),
      requestBody: req.postDataJSON() ?? req.postData(),
      responseBody,
      actorRole: currentPersona?.actorType,
    });
  };

  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);
  page.on("request", handleRequest);
  page.on("response", handleResponse);

  return () => {
    page.off("console", handleConsole);
    page.off("pageerror", handlePageError);
    page.off("request", handleRequest);
    page.off("response", handleResponse);
  };
}

/**
 * Sets up authentication context for a Playwright page matching a role persona.
 *
 * For local/sandbox: sets extra HTTP headers.
 * For live: enforces valid tokens / credentials, rejecting synthetic fakeheaders.
 */
export async function setupPagePersona(
  page: Page,
  persona: RolePersona,
  mode: TestEnvironmentMode = "local",
): Promise<void> {
  const headers = generateAuthHeaders(persona, mode);
  await page.setExtraHTTPHeaders(headers);
}

/**
 * Public login helper for navigating and authenticating through standard entrypoints.
 */
export async function performPublicLogin(
  page: Page,
  options: {
    baseUrl?: string;
    loginPath?: string;
    persona?: RolePersona;
  },
): Promise<void> {
  const baseUrl = options.baseUrl || "http://localhost:3000";
  const loginPath = options.loginPath || "/login";
  const targetUrl = new URL(loginPath, baseUrl).toString();

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  if (options.persona) {
    await setupPagePersona(page, options.persona, "local");
  }
}

/**
 * Asserts that the page displays context only for the expected tenant,
 * and contains NO sensitive or visible leaks of the forbidden tenant.
 */
export async function assertTenantIsolationOnPage(
  page: Page,
  expectedTenant: UatTenantContext,
  forbiddenTenant: UatTenantContext,
): Promise<void> {
  const pageContent = await page.content();

  // Must not contain forbidden tenant's private identifiers
  if (pageContent.includes(forbiddenTenant.tenantId)) {
    throw new Error(
      `Tenant Isolation Breach: Page contains forbidden tenant ID ${forbiddenTenant.tenantId}`,
    );
  }

  if (pageContent.includes(forbiddenTenant.tenantCode)) {
    throw new Error(
      `Tenant Isolation Breach: Page contains forbidden tenant code ${forbiddenTenant.tenantCode}`,
    );
  }

  if (
    forbiddenTenant.brandName &&
    forbiddenTenant.brandName !== expectedTenant.brandName &&
    pageContent.includes(forbiddenTenant.brandName)
  ) {
    throw new Error(
      `Tenant Isolation Breach: Page contains forbidden tenant brand ${forbiddenTenant.brandName}`,
    );
  }
}
