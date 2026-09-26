// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { statSync, readFileSync } from "node:fs";
import ts from "typescript";

const appRoot = resolve("apps/platform-admin-web");

function createCustomUiModuleLoader(appRoot: string, mocks: any = {}) {
  const cache = new Map();
  function load(path: string) {
    const file = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      `${path}/index.ts`,
      `${path}/index.tsx`,
    ].find((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (!file) throw new Error(`Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(appRoot, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      if (id.startsWith("@drts/")) {
        return load(
          resolve(appRoot, "../../packages", id.split("/")[1]!, "src"),
        );
      }
      return createRequire(file)(id);
    };
    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      output,
    );
    fn(module.exports, requireLocal, module, file, dirname(file));
    return module.exports;
  }
  return load;
}

// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockTransportClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};



vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => mockTransportClient,
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key.includes("manageGrant")) return "Manage Grant";
      if (key.includes("getStepUp")) return "Get step-up proof";
      if (key.includes("activateLabel")) return "Activate Emergency Session";
      if (key.includes("exitLabel")) return "Exit Emergency Access";
      if (key.includes("activeLabel")) return "Break-Glass Session Active";
      if (key.includes("expiresInLabel")) return "Expires In";
      return key;
    },
    locale: "en",
  }),
}));

class MockApiClientError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, MockApiClientError.prototype);
  }
}

const load = createCustomUiModuleLoader(appRoot, {

  "@/lib/admin-client": {
    usePlatformAdminClient: () => mockTransportClient,
    formatDateTime: (d: any) => String(d),
  },
  "@/lib/i18n": {
    useTranslation: () => ({
      t: (key: string) => {
        if (key.includes("manageGrant")) return "Manage Grant";
        if (key.includes("getStepUp")) return "Get step-up proof";
        if (key.includes("activateLabel")) return "Activate Emergency Session";
        if (key.includes("exitLabel")) return "Exit Emergency Access";
        if (key.includes("activeLabel")) return "Break-Glass Session Active";
        if (key.includes("expiresInLabel")) return "Expires In";
        return key;
      },
      locale: "en",
    }),
  },
  "@drts/api-client": {
    ApiClientError: MockApiClientError
  }
});

const { BreakGlassBanner, BreakGlassProvider } = load(
  resolve(appRoot, "components/break-glass-context.tsx"),
);
const { BreakGlassPanel } = load(
  resolve(appRoot, "app/users/users-governance-components.tsx"),
);

describe("BreakGlass R6b Regression Tests - True Provider Mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/identity/session-context")) {
        return {
          sessionActive: true,
          activeBreakGlassGrants: [{ grantId: "bg_123" }, { grantId: "bg_req_1" }],
        };
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return {
          items: [
            {
              grantId: "bg_req_1",
              status: "approved",
              requesterId: "u_1",
              version: 1,
              requestedScopes: ["identity:read"],
            },
          ],
        };
      }
      return {};
    });
    mockTransportClient.post.mockImplementation(async () => ({}));
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("should execute exitSession mutation on BreakGlassBanner exit click and clean up storage", async () => {
    const future = new Date(Date.now() + 300000).toISOString();
    sessionStorage.setItem(
      "drts_platform_break_glass_session",
      JSON.stringify({
        grant: {
          grantId: "bg_123",
          requesterId: "u_1",
          targetId: "env_1",
          version: 2,
        },
        accessToken: "token123",
        expiresAt: future,
        sessionBanner: "BREAK_GLASS_ACTIVE",
      }),
    );

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        return { required: true, stepUpReference: "proof_close_456" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_123/close")) {
        return {};
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassBanner, null),
      ),
    );

    const exitBtn = await screen.findByText(/Exit Emergency Access/i);
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(mockTransportClient.post).toHaveBeenCalledWith(
        "/identity/step-up-proofs",
        { body: { actionId: "platform:break-glass:close" } }
      );
      expect(mockTransportClient.post).toHaveBeenCalledWith(
        "/platform-admin/break-glass/requests/bg_123/close",
        { body: { mutation: { reasonCode: "operator_exit_cta", expectedVersion: 2, stepUpReference: "proof_close_456" } } }
      );
    });

    expect(
      sessionStorage.getItem("drts_platform_break_glass_session"),
    ).toBeNull();
    expect(screen.queryByText(/Exit Emergency Access/i)).toBeNull();
  });

  it("should fail exitSession cleanly on 403 step up required and preserve storage", async () => {
    const future = new Date(Date.now() + 300000).toISOString();
    const storedState = {
      grant: {
        grantId: "bg_123",
        requesterId: "u_1",
        targetId: "env_1",
        version: 1,
      },
      accessToken: "token123",
      expiresAt: future,
      sessionBanner: "BREAK_GLASS_ACTIVE",
    };
    sessionStorage.setItem(
      "drts_platform_break_glass_session",
      JSON.stringify(storedState),
    );

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        return { required: true, stepUpReference: "proof_close_expired" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_123/close")) {
        return Promise.reject({ code: "IAM_STEP_UP_REQUIRED" });
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassBanner, null),
      ),
    );

    const exitBtn = await screen.findByText(/Exit Emergency Access/i);
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(screen.getByText(/無法退出: 憑證已過期或被拒絕/)).toBeDefined();
    });

    expect(sessionStorage.getItem("drts_platform_break_glass_session")).toEqual(
      JSON.stringify(storedState),
    );
  });

  it("should activate session properly and call activateBreakGlass mutation", async () => {
    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassPanel, null),
        React.createElement(BreakGlassBanner, null),
      ),
    );

    await waitFor(() => {
      expect(mockTransportClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/platform-admin/break-glass/requests")
      );
    });

    const manageBtn = await screen.findByText(/Manage Grant/i);
    fireEvent.click(manageBtn);

    const getProofBtn = await screen.findByText(/Get step-up proof/i);
    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        return { required: true, stepUpReference: "proof_activate_789" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_req_1/activate")) {
        return {
          grant: { grantId: "bg_req_1", requesterId: "u_1", requestedScopes: ["identity:read"] },
          accessToken: "token999",
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        };
      }
      return {};
    });

    fireEvent.click(getProofBtn);

    await waitFor(() => {
      expect(mockTransportClient.post).toHaveBeenCalledWith(
        "/identity/step-up-proofs",
        { body: { actionId: "platform:break-glass:activate" } }
      );
    });

    const activateBtn = await screen.findByText(/Activate Emergency Session/i);
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(mockTransportClient.post).toHaveBeenCalledWith(
        "/platform-admin/break-glass/requests/bg_req_1/activate",
        { body: { mutation: { stepUpReference: "proof_activate_789", expectedVersion: 1, reasonCode: "BREAK_GLASS_ACTIVATED" }, requestId: "bg_req_1", requestedDurationMinutes: 30, requestedScope: ["identity:read"] } }
      );
    });

    await waitFor(() => {
      expect(
        sessionStorage.getItem("drts_platform_break_glass_session"),
      ).toContain("token999");
      expect(screen.getByText(/Exit Emergency Access/i)).toBeDefined();
    });
  });

  it("should clear session storage properly if IAM returns 401 on polling", async () => {
    const future = new Date(Date.now() + 300000).toISOString();
    sessionStorage.setItem(
      "drts_platform_break_glass_session",
      JSON.stringify({
        grant: { grantId: "bg_123" },
        accessToken: "token123",
        expiresAt: future,
        sessionBanner: "BREAK_GLASS_ACTIVE",
      }),
    );

    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/identity/session-context")) {
        return Promise.reject({ statusCode: 401 });
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassBanner, null),
      ),
    );

    await waitFor(
      () => {
        expect(mockTransportClient.get).toHaveBeenCalledWith("/identity/session-context");
        expect(
          sessionStorage.getItem("drts_platform_break_glass_session"),
        ).toBeNull();
      },
      { timeout: 3000 }
    );
  });

  it("should handle 409 IAM_CONCURRENCY_CONFLICT on approve, reload state, and invalidate proof", async () => {
    // We mock the get requests to first return requested, then approved (after reload)
    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/platform-admin/break-glass/requests/bg_req_409")) {
        return {
          grantId: "bg_req_409",
          status: "approved",
          requesterId: "u_1",
          version: 2,
          requestedScopes: ["identity:read"],
        };
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return {
          items: [
            {
              grantId: "bg_req_409",
              status: "requested",
              requesterId: "u_1",
              version: 1,
              requestedScopes: ["identity:read"],
            },
          ],
        };
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassPanel, null),
        React.createElement(BreakGlassBanner, null),
      ),
    );

    await waitFor(() => {
      expect(mockTransportClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/platform-admin/break-glass/requests")
      );
    });

    const manageBtn = await screen.findByText(/Manage Grant/i);
    fireEvent.click(manageBtn);

    const getProofBtn = await screen.findByText(/Get step-up proof/i);

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        return { required: true, stepUpReference: "proof_approve_409" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_req_409/approve")) {
        return Promise.reject(new MockApiClientError("Mock error", 409, "IAM_CONCURRENCY_CONFLICT"));
      }
      return {};
    });

    fireEvent.click(getProofBtn);

    await waitFor(() => {
      expect(mockTransportClient.post).toHaveBeenCalledWith(
        "/identity/step-up-proofs",
        { body: { actionId: "platform:break-glass:approve" } }
      );
    });

    const approveBtn = await screen.findByRole("button", { name: /Approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(screen.getByText(/狀態已變更，請重新整理 \(IAM_CONCURRENCY_CONFLICT\)。/)).toBeDefined();
    });

    expect(mockTransportClient.get).toHaveBeenCalledWith("/platform-admin/break-glass/requests/bg_req_409");

    // Wait for the modal state to update to approved.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Approve/i })).toBeNull();
      // Activate Emergency Session button should be present if it's approved
    });

    const newProofBtn = await screen.findByText(/Get step-up proof/i);
    expect(newProofBtn).toBeDefined(); // Proof was cleared, need to get a new one
  });

  it("should handle reload failure after 409, tag grant as sync error, and keep it disabled until manual retry", async () => {
    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/platform-admin/break-glass/requests/bg_req_409")) {
        return Promise.reject(new Error("Network failed"));
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return { items: [{ grantId: "bg_req_409", status: "requested", requesterId: "u_1", version: 1, requestedScopes: ["identity:read"] }] };
      }
      return {};
    });

    render(React.createElement(BreakGlassProvider, null, React.createElement(BreakGlassPanel, null)));
    await waitFor(() => expect(screen.getByText(/Manage Grant/i)).toBeDefined());

    fireEvent.click(screen.getByText(/Manage Grant/i));

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) { return { required: true, stepUpReference: "proof_1" }; }
      if (url.includes("/approve")) { return Promise.reject(new MockApiClientError("Mock error", 409, "IAM_CONCURRENCY_CONFLICT")); }
      return {};
    });

    fireEvent.click(screen.getByText(/Get step-up proof/i));
    await waitFor(() => expect(screen.getByDisplayValue("proof_1")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => {
      expect(screen.getByText(/狀態已變更，請重新整理/)).toBeDefined();
    });

    // The modal should close and the list should show Retry Sync because reload failed
    await waitFor(() => {
      expect(screen.getByText(/Retry Sync/i)).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /Approve/i })).toBeNull(); // Modal closed
  });

  it("should ignore late response for getBreakGlassRequest if dialog is closed", async () => {
    let resolveLateGet: (val: any) => void = () => {};
    const lateGetPromise = new Promise((resolve) => { resolveLateGet = resolve; });

    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/platform-admin/break-glass/requests/bg_req_409")) {
        return lateGetPromise;
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return { items: [{ grantId: "bg_req_409", status: "requested", requesterId: "u_1", version: 1, requestedScopes: ["identity:read"] }] };
      }
      return {};
    });

    render(React.createElement(BreakGlassProvider, null, React.createElement(BreakGlassPanel, null)));
    await waitFor(() => expect(screen.getByText(/Manage Grant/i)).toBeDefined());

    fireEvent.click(screen.getByText(/Manage Grant/i));

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) { return { required: true, stepUpReference: "proof_1" }; }
      if (url.includes("/approve")) { return Promise.reject(new MockApiClientError("Mock error", 409, "IAM_CONCURRENCY_CONFLICT")); }
      return {};
    });

    fireEvent.click(screen.getByText(/Get step-up proof/i));
    await waitFor(() => expect(screen.getByDisplayValue("proof_1")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => {
      expect(screen.getByText(/狀態已變更，請重新整理/)).toBeDefined();
    });

    // Close the dialog while the reload is still pending
    fireEvent.click(screen.getByText(/Close/i));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Now resolve the late GET response
    resolveLateGet({ grantId: "bg_req_409", status: "approved", requesterId: "u_1", version: 2, requestedScopes: ["identity:read"] });

    // Wait a bit to ensure the dialog does NOT reappear
    await new Promise((r) => setTimeout(r, 100));

    expect(screen.queryByRole("dialog")).toBeNull();

    // The list should have updated to show the new status in the background
    await waitFor(() => {
      expect(screen.getByText("approved")).toBeDefined();
    });
  });

  it("should prevent mutation and proof fetching while reload is pending (R12c A)", async () => {
    let getResolve: (val: any) => void = () => {};
    const getPromise = new Promise((r) => { getResolve = r; });

    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/platform-admin/break-glass/requests/bg_req_r12c_a")) {
        return getPromise;
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return {
          items: [
            {
              grantId: "bg_req_r12c_a",
              status: "requested",
              requesterId: "u_1",
              version: 1,
              requestedScopes: ["identity:read"],
            },
          ],
        };
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassPanel, null),
        React.createElement(BreakGlassBanner, null),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("bg_req_r12c_a")).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Manage Grant/i));

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        return { required: true, stepUpReference: "proof_1" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_req_r12c_a/approve")) {
        return Promise.reject(new MockApiClientError("Conflict", 409, "IAM_CONCURRENCY_CONFLICT"));
      }
      return {};
    });

    const getProofBtn = await screen.findByText(/Get step-up proof/i);
    fireEvent.click(getProofBtn);

    const approveBtn = await screen.findByRole("button", { name: /Approve/i });

    await waitFor(() => {
      expect(approveBtn.hasAttribute("disabled")).toBe(false);
    });

    fireEvent.click(approveBtn);

    try {
      // 409 triggers handleReloadGrant. It should be pending.
      await waitFor(() => {
        expect(mockTransportClient.get).toHaveBeenCalledWith("/platform-admin/break-glass/requests/bg_req_r12c_a");
      });

      // Proof button should be disabled because acting is true
      // Need to re-query as the component might have re-rendered and the old DOM node is detached
      expect(screen.getByText(/Get step-up proof/i).hasAttribute("disabled")).toBe(true);
      // Approve button should also be disabled or show Approving...
      expect(screen.getByRole("button", { name: /Approving/i }).hasAttribute("disabled")).toBe(true);
    } finally {
      getResolve({
        grantId: "bg_req_r12c_a",
        status: "requested",
        requesterId: "u_1",
        version: 2,
        requestedScopes: ["identity:read"],
      });
    }

    // After reload finishes, acting becomes false.
    await waitFor(() => {
      expect(screen.getByText(/Get step-up proof/i).hasAttribute("disabled")).toBe(false);
    });
  });

  it("should bind proof to action and disable Activate if proof is for approve (R12c B)", async () => {
    let getResolve: (val: any) => void = () => {};
    const getPromise = new Promise((r) => { getResolve = r; });

    mockTransportClient.get.mockImplementation(async (url) => {
      if (url.includes("/platform-admin/break-glass/requests/bg_req_r12c_b")) {
        return getPromise;
      }
      if (url.includes("/platform-admin/break-glass/requests")) {
        return {
          items: [
            {
              grantId: "bg_req_r12c_b",
              status: "requested",
              requesterId: "u_1",
              version: 1,
              requestedScopes: ["identity:read"],
            },
          ],
        };
      }
      return {};
    });

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassPanel, null),
        React.createElement(BreakGlassBanner, null),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("bg_req_r12c_b")).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Manage Grant/i));

    mockTransportClient.post.mockImplementation(async (url) => {
      if (url.includes("/identity/step-up-proofs")) {
        // Mock returning a proof
        return { required: true, stepUpReference: "proof_1" };
      }
      if (url.includes("/platform-admin/break-glass/requests/bg_req_r12c_b/approve")) {
        // Trigger reload grant to change state to approved
        return Promise.reject(new MockApiClientError("Conflict", 409, "IAM_CONCURRENCY_CONFLICT"));
      }
      return {};
    });

    const getProofBtn = await screen.findByText(/Get step-up proof/i);
    fireEvent.click(getProofBtn);

    // Wait for proof to be valid
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Approve/i }).hasAttribute("disabled")).toBe(false);
    });

    // Click Approve to trigger 409
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    // Wait for the detail GET to be called
    await waitFor(() => {
      expect(mockTransportClient.get).toHaveBeenCalledWith("/platform-admin/break-glass/requests/bg_req_r12c_b");
    });

    // Resolve the detail GET to move to 'approved' state
    getResolve({
      grantId: "bg_req_r12c_b",
      status: "approved",
      requesterId: "u_1",
      version: 2,
      requestedScopes: ["identity:read"],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Activate Emergency Session/i })).toBeDefined();
    });

    // The Activate button MUST be disabled initially since the proof was for approve
    const activateBtn = screen.getByRole("button", { name: /Activate Emergency Session/i });
    expect(activateBtn.hasAttribute("disabled")).toBe(true);

    // Get proof for activate
    const getProofActivateBtn = await screen.findByText(/Get step-up proof/i);
    fireEvent.click(getProofActivateBtn);

    await waitFor(() => {
      expect(activateBtn.hasAttribute("disabled")).toBe(false);
    });
  });
});
