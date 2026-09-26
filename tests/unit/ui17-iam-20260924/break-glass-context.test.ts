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
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockIamClient = {
  createStepUpProof: vi.fn(),
  closeBreakGlass: vi.fn(),
  listBreakGlassRequests: vi.fn(),
  activateBreakGlass: vi.fn(),
};

vi.mock("@/lib/platform-admin-iam-client", () => ({
  createPlatformAdminIamClient: () => mockIamClient,
}));

vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => ({}),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

let mockBreakGlassContextValue: any = {
  isBreakGlassActive: false,
  grant: null,
  secondsRemaining: 0,
  exitSession: vi.fn(),
};

const load = createCustomUiModuleLoader(appRoot, {
  "@/lib/platform-admin-iam-client": {
    createPlatformAdminIamClient: () => mockIamClient,
  },
  "@/lib/admin-client": {
    usePlatformAdminClient: () => ({}),
    formatDateTime: (d: any) => String(d),
  },
  "@/lib/i18n": {
    useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
  },
});

const { BreakGlassBanner, BreakGlassContext } = load(
  resolve(appRoot, "components/break-glass-context.tsx"),
);
const breakGlassCtx = load(
  resolve(appRoot, "components/break-glass-context.tsx"),
);
breakGlassCtx.useBreakGlass = () => mockBreakGlassContextValue;
const { BreakGlassPanel } = load(
  resolve(appRoot, "app/users/users-governance-components.tsx"),
);

describe("BreakGlass R3/R4 Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreakGlassContextValue = {
      isBreakGlassActive: false,
      grant: null,
      secondsRemaining: 0,
      exitSession: vi.fn(),
    };
  });

  it("R4: ActiveBreakGlassBanner should request step-up proof before exiting", async () => {
    mockBreakGlassContextValue = {
      isBreakGlassActive: true,
      grant: { grantId: "bg_123", requesterId: "u_1", targetId: "env_1" },
      secondsRemaining: 300,
      exitSession: vi.fn().mockResolvedValue(undefined),
    };

    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_close_456",
    });

    render(
      React.createElement(
        BreakGlassContext.Provider,
        { value: mockBreakGlassContextValue },
        React.createElement(BreakGlassBanner, null),
      ),
    );

    const exitBtn = screen.getByText(/Exit Emergency Access/i);
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:close",
      });
      expect(mockBreakGlassContextValue.exitSession).toHaveBeenCalledWith(
        "operator_exit_cta",
        "proof_close_456",
      );
    });
  });

  it("R3: BreakGlassPanel should request step-up proof for activate when approved", async () => {
    mockIamClient.listBreakGlassRequests.mockResolvedValue({
      items: [
        {
          grantId: "bg_req_1",
          status: "approved",
          requesterId: "u_1",
        },
      ],
    });

    render(React.createElement(BreakGlassPanel, null));

    await waitFor(() => {
      expect(mockIamClient.listBreakGlassRequests).toHaveBeenCalled();
    });

    // We can't fully mock the internals of Canvas elements without a lot of setup,
    // but we can check if handleGetStepUpProof is wired up for 'approved' status.
    // The panel should render a Manage Grant button for the approved grant.
    // Let's just simulate the internal state or rely on the UI if possible.
    const manageBtn = screen.getByText(/Manage Grant/i);
    fireEvent.click(manageBtn);

    // After clicking Manage Grant, it should show the step-up required banner
    // with the lock icon for getStepUpProof. The text for getStepUpProof is from stepUpCopy.
    const getProofBtn = await screen.findByText(/Get step-up proof/i);
    expect(getProofBtn).toBeDefined();

    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_activate_789",
    });

    fireEvent.click(getProofBtn);

    await waitFor(() => {
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:activate",
      });
    });
  });
});
