import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BreakGlassBanner } from "../../../apps/platform-admin-web/components/break-glass-context";
import { BreakGlassPanel } from "../../../apps/platform-admin-web/app/users/users-governance-components";

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

vi.mock("../../../apps/platform-admin-web/components/break-glass-context", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useBreakGlass: () => mockBreakGlassContextValue,
  };
});

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

    render(React.createElement(BreakGlassBanner, null));

    const exitBtn = screen.getByText("breakGlass.banner.exitAction");
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:close",
      });
      expect(mockBreakGlassContextValue.exitSession).toHaveBeenCalledWith(
        "operator_exit_cta",
        "proof_close_456"
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
        }
      ]
    });

    render(React.createElement(BreakGlassPanel, null));

    await waitFor(() => {
      expect(mockIamClient.listBreakGlassRequests).toHaveBeenCalled();
    });

    // We can't fully mock the internals of Canvas elements without a lot of setup,
    // but we can check if handleGetStepUpProof is wired up for 'approved' status.
    // The panel should render a Manage Grant button for the approved grant.
    // Let's just simulate the internal state or rely on the UI if possible.
    const manageBtn = screen.getByText("manageGrant");
    fireEvent.click(manageBtn);

    // After clicking Manage Grant, it should show the step-up required banner
    // with the lock icon for getStepUpProof. The text for getStepUpProof is from stepUpCopy.
    const getProofBtn = await screen.findByText("getStepUpProof");
    expect(getProofBtn).toBeDefined();

    mockIamClient.createStepUpProof.mockResolvedValue({
      required: true,
      stepUpReference: "proof_activate_789"
    });

    fireEvent.click(getProofBtn);

    await waitFor(() => {
      expect(mockIamClient.createStepUpProof).toHaveBeenCalledWith({
        actionId: "platform:break-glass:activate"
      });
    });
  });
});
