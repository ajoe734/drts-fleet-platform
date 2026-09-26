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

const mockIamClient = {
  createStepUpProof: vi.fn(),
  closeBreakGlass: vi.fn(),
  listBreakGlassRequests: vi.fn(),
  activateBreakGlass: vi.fn(),
  getIdentitySessionContext: vi.fn(),
};

vi.mock("@/lib/platform-admin-iam-client", () => ({
  createPlatformAdminIamClient: () => mockIamClient,
}));

vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => ({}),
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

const load = createCustomUiModuleLoader(appRoot, {
  "@/lib/platform-admin-iam-client": {
    createPlatformAdminIamClient: () => mockIamClient,
  },
  "@/lib/admin-client": {
    usePlatformAdminClient: () => ({}),
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
    mockIamClient.getIdentitySessionContext.mockResolvedValue({
      sessionActive: true,
      activeBreakGlassGrants: [{ grantId: "bg_123" }, { grantId: "bg_req_1" }],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("should execute exitSession mutation on BreakGlassBanner exit click and clean up storage", async () => {
    // Set up active break glass state
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

    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_close_456",
    });
    mockIamClient.closeBreakGlass.mockResolvedValue({});

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
      // 1. Proof is requested
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:close",
      });
      // 2. Mutation is executed
      expect(mockIamClient.closeBreakGlass).toHaveBeenCalledWith("bg_123", {
        mutation: {
          reasonCode: "operator_exit_cta",
          expectedVersion: 2,
          stepUpReference: "proof_close_456",
        },
      });
    });

    // 3. Storage is cleaned up on success
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

    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_close_expired",
    });
    mockIamClient.closeBreakGlass.mockRejectedValue({
      code: "IAM_STEP_UP_REQUIRED",
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

    // Wait for the failure message
    await waitFor(() => {
      expect(screen.getByText(/無法退出: 憑證已過期或被拒絕/)).toBeDefined();
    });

    // State is preserved
    expect(sessionStorage.getItem("drts_platform_break_glass_session")).toEqual(
      JSON.stringify(storedState),
    );
  });

  it("should activate session properly and call activateBreakGlass mutation", async () => {
    mockIamClient.listBreakGlassRequests.mockResolvedValue({
      items: [
        {
          grantId: "bg_req_1",
          status: "approved",
          requesterId: "u_1",
          version: 1,
        },
      ],
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
      expect(mockIamClient.listBreakGlassRequests).toHaveBeenCalled();
    });

    const manageBtn = await screen.findByText(/Manage Grant/i);
    fireEvent.click(manageBtn);

    const getProofBtn = await screen.findByText(/Get step-up proof/i);
    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_activate_789",
    });
    fireEvent.click(getProofBtn);

    // Now step up proof is obtained, activate button should be visible (mocked flow)
    await waitFor(() => {
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:activate",
      });
    });

    const activateBtn = await screen.findByText(/Activate Emergency Session/i);

    mockIamClient.activateBreakGlass.mockResolvedValue({
      grant: { grantId: "bg_req_1", requesterId: "u_1" },
      accessToken: "token999",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });

    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(mockIamClient.activateBreakGlass).toHaveBeenCalledWith(
        "bg_req_1",
        {
          mutation: {
            stepUpReference: "proof_activate_789",
            expectedVersion: 1,
            reasonCode: "BREAK_GLASS_ACTIVATED",
          },
          requestId: "bg_req_1",
          requestedDurationMinutes: 30,
          requestedScope: undefined,
        },
      );
    });

    // Verify session storage was updated and banner is active
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

    mockIamClient.getIdentitySessionContext.mockImplementation(() =>
      Promise.reject({ statusCode: 401 })
    );

    render(
      React.createElement(
        BreakGlassProvider,
        null,
        React.createElement(BreakGlassBanner, null),
      ),
    );

    // The provider automatically clears expired sessions on tick or 401.
    await waitFor(
      () => {
        expect(mockIamClient.getIdentitySessionContext).toHaveBeenCalled();
        expect(
          sessionStorage.getItem("drts_platform_break_glass_session"),
        ).toBeNull();
      },
      { timeout: 3000 }
    );
  });
});
