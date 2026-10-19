// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComplaintCaseRecord } from "@drts/contracts";
import ComplaintsPage from "../../../apps/ops-console-web/app/complaints/page";
import ComplaintDetailPage from "../../../apps/ops-console-web/app/complaints/[caseNo]/page";

// C045-F1: the backend's assertCaseOpenForAction rejects add_note/assign on a
// resolved case with 409 COMPLAINT_NOT_ACTIONABLE. Both Ops surfaces must not
// offer those as live CTAs once a case is resolved (only "close" remains).
const client = vi.hoisted(() => ({
  listComplaints: vi.fn(),
  getComplaintTimeline: vi.fn(async () => []),
  getComplaintExportView: vi.fn(async () => null),
  getComplaint: vi.fn(),
}));
vi.mock("../../../apps/ops-console-web/lib/api-client", () => ({
  getOpsClient: () => client,
}));
vi.mock("../../../apps/ops-console-web/components/ops-assistant", () => ({
  useAssistantActionBridgeRegistration: () => {},
  useAssistantSelection: () => ({
    setAssistantSelection: () => {},
    clearAssistantSelection: () => {},
  }),
}));
vi.mock("../../../apps/ops-console-web/lib/api-client.server", () => ({
  getServerOpsClient: async () => client,
}));
vi.mock("../../../apps/ops-console-web/lib/server-locale", () => ({
  getServerLocale: async () => "en",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function resolvedCase(): ComplaintCaseRecord {
  const now = new Date().toISOString();
  return {
    caseNo: "C-20261015-000099",
    caseSource: "ops",
    relatedOrderId: null,
    relatedCallId: null,
    relatedIncidentId: null,
    category: "driver_service",
    severity: "normal",
    description: "Resolved case used for the F1 CTA regression.",
    assigneeId: "AGENT-OPS-002",
    status: "resolved",
    slaDueAt: now,
    slaBreach: false,
    reopenCount: 0,
    resolutionCode: "resolved_driver_warning",
    closingNote: "Driver warned.",
    createdAt: now,
    updatedAt: now,
  };
}

describe("C045-F1: Ops complaint surfaces only offer actions the backend actually accepts", () => {
  it("list page offers close but not add_note/assign for a resolved case (fallback action derivation)", async () => {
    const record = resolvedCase();
    client.listComplaints.mockResolvedValue([record]);
    client.getComplaintExportView.mockResolvedValue({
      complaintCase: record,
      timeline: [],
      exportGeneratedAt: record.updatedAt,
      readyForAudit: false,
    });

    render(<ComplaintsPage />);

    await waitFor(() => expect(client.listComplaints).toHaveBeenCalled());
    await screen.findByRole("button", { name: /^Close$/ });

    expect(screen.queryByRole("button", { name: /^Add note/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Assign/ })).toBeNull();
  });

  it("detail page's available-actions list marks add_note/assign disabled for a resolved case", async () => {
    const record = resolvedCase();
    client.getComplaint.mockResolvedValue(record);

    const element = await ComplaintDetailPage({
      params: Promise.resolve({ caseNo: record.caseNo }),
    });
    render(element);

    const addNote = screen.getByText("Add note").closest("span");
    const assign = screen.getByText("Assign / reassign").closest("span");
    const close = screen.getByText("Close").closest("span");

    expect(addNote?.getAttribute("title")).toBe(
      "Not available in the current case status.",
    );
    expect(assign?.getAttribute("title")).toBe(
      "Not available in the current case status.",
    );
    expect(close?.getAttribute("title")).toBeNull();
  });
});
