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
});
