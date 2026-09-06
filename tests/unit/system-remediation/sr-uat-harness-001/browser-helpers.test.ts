import { describe, it, expect, vi } from "vitest";
import type { Page, Request, Response, ConsoleMessage } from "@playwright/test";
import {
  attachBrowserEvidenceCollector,
  setupPagePersona,
  assertTenantIsolationOnPage,
} from "../../../e2e/system-remediation/shared/browser-helpers";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared/evidence-recorder";
import { BASELINE_PERSONAS } from "../../../e2e/system-remediation/shared/role-personas";
import type { UatTenantContext } from "../../../e2e/system-remediation/shared/namespace-manager";

describe("SR-UAT-HARNESS-001: Browser Helpers and Event Listeners", () => {
  const tenantA: UatTenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    tenantCode: "TEN_ALPHA",
    tenantName: "Alpha Logistics",
    tenantType: "enterprise",
    brandName: "Alpha Corp",
    defaultAreaId: "00000000-0000-0000-0000-000000000101",
  };

  const tenantB: UatTenantContext = {
    tenantId: "22222222-2222-2222-2222-222222222222",
    tenantCode: "TEN_BETA",
    tenantName: "Beta Cards",
    tenantType: "credit_card",
    brandName: "Beta VIP",
    defaultAreaId: "00000000-0000-0000-0000-000000000102",
  };

  it("attaches browser event listeners and captures console logs and network traffic", async () => {
    const recorder = new UatEvidenceRecorder({ taskId: "SR-UAT-HARNESS-001" });

    // Mock Playwright Page event emitter
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockPage = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      }),
      setExtraHTTPHeaders: vi.fn(),
    } as unknown as Page;

    const detach = attachBrowserEvidenceCollector({
      page: mockPage,
      recorder,
      currentPersona: BASELINE_PERSONAS.platform_admin,
    });

    expect(mockPage.on).toHaveBeenCalledWith("console", expect.any(Function));
    expect(mockPage.on).toHaveBeenCalledWith("pageerror", expect.any(Function));
    expect(mockPage.on).toHaveBeenCalledWith("request", expect.any(Function));
    expect(mockPage.on).toHaveBeenCalledWith("response", expect.any(Function));

    // Simulate a console message with PII
    const mockConsoleMsg = {
      type: () => "warning",
      text: () => "Customer phone 0912-345-678 needs review",
      location: () => ({ url: "http://localhost:3000/app.js" }),
    } as unknown as ConsoleMessage;

    listeners["console"]?.forEach((fn) => fn(mockConsoleMsg));

    // Simulate network request/response
    const mockReq = {
      method: () => "GET",
      url: () => "http://localhost:3000/api/profile?email=driver@acme.example",
      headers: () => ({ accept: "application/json" }),
      postDataJSON: () => undefined,
      postData: () => undefined,
    } as unknown as Request;

    const mockRes = {
      request: () => mockReq,
      status: () => 200,
      headers: () => ({ "content-type": "application/json" }),
      text: vi.fn().mockResolvedValue('{"status":"ok"}'),
    } as unknown as Response;

    listeners["request"]?.forEach((fn) => fn(mockReq));
    await Promise.all(listeners["response"]?.map((fn) => fn(mockRes)) ?? []);

    const bundle = recorder.finalize("passed");

    // Verify console log was redacted
    expect(bundle.consoleLogs[0]!.level).toBe("warn");
    expect(bundle.consoleLogs[0]!.message).toBe(
      "Customer phone 0912-***-678 needs review",
    );

    // Verify HTTP call was redacted
    expect(bundle.httpCalls[0]!.url).toContain("d***@acme.example");

    // Detach and verify off was called
    detach();
    expect(mockPage.off).toHaveBeenCalledWith("console", expect.any(Function));
  });

  it("sets extra HTTP headers for page persona", async () => {
    const mockPage = {
      setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await setupPagePersona(mockPage, BASELINE_PERSONAS.platform_admin, "local");
    expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        "x-actor-type": "platform_admin",
        "x-realm": "platform",
      }),
    );
  });

  it("assertTenantIsolationOnPage checks that forbidden tenant identifiers do not leak", async () => {
    const cleanPage = {
      content: vi.fn().mockResolvedValue(`
        <html>
          <body>
            <h1>Welcome to Alpha Corp</h1>
            <div>Tenant: TEN_ALPHA (${tenantA.tenantId})</div>
          </body>
        </html>
      `),
    } as unknown as Page;

    // Clean page should pass
    await expect(
      assertTenantIsolationOnPage(cleanPage, tenantA, tenantB),
    ).resolves.toBeUndefined();

    // Contaminated page with Tenant B leaking
    const contaminatedPage = {
      content: vi.fn().mockResolvedValue(`
        <html>
          <body>
            <h1>Welcome to Alpha Corp</h1>
            <div>Cross-tenant leak: ${tenantB.tenantId}</div>
          </body>
        </html>
      `),
    } as unknown as Page;

    await expect(
      assertTenantIsolationOnPage(contaminatedPage, tenantA, tenantB),
    ).rejects.toThrow(
      /Tenant Isolation Breach: Page contains forbidden tenant ID/,
    );
  });
});
