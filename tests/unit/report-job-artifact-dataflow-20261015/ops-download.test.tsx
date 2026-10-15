// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ReportsPage from "../../../apps/ops-console-web/app/reports/page";

const client = vi.hoisted(() => ({
  listReportJobs: vi.fn(),
  listFilingPackages: vi.fn(async () => []),
  getReportJob: vi.fn(),
}));
vi.mock("../../../apps/ops-console-web/lib/api-client", () => ({
  getOpsClient: () => client,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function report(
  downloadUrl: unknown,
  status = "completed",
  expiresAt = "2099-01-01T00:00:00Z",
) {
  return {
    jobId: "JOB-123",
    jobType: "revenue_summary",
    format: "csv",
    status,
    filters: {},
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
    artifact: {
      artifactId: "ART-123",
      downloadUrl,
      expiresAt,
      downloadMetadata: { expiresAt },
    },
  };
}

describe("Ops completed-report download action", () => {
  it.each([
    [
      "/reports/JOB-123/artifact",
      "/control-plane-proxy/reports/JOB-123/artifact",
    ],
    [
      "/reports/JOB%20encoded/artifact?format=csv#file",
      "/control-plane-proxy/reports/JOB%20encoded/artifact?format=csv#file",
    ],
    [
      "https://downloads.example.test/report.csv?signature=retained",
      "https://downloads.example.test/report.csv?signature=retained",
    ],
    ["/downloads/legacy-report.csv", "/downloads/legacy-report.csv"],
    [
      "/control-plane-proxy/reports/JOB-123/artifact",
      "/control-plane-proxy/reports/JOB-123/artifact",
    ],
    ["/reports/JOB-123/other", "/reports/JOB-123/other"],
  ])("opens the actual target for %s", async (url, target) => {
    const job = report(url);
    client.listReportJobs.mockResolvedValue([job]);
    client.getReportJob.mockResolvedValue(job);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Download/ }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        target,
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(client.getReportJob).toHaveBeenCalledWith(job.jobId);
  });

  it.each([
    ["queued", "/reports/JOB-123/artifact", "2099-01-01T00:00:00Z"],
    ["completed", "/reports/JOB-123/artifact", "2000-01-01T00:00:00Z"],
    ["completed", null, "2099-01-01T00:00:00Z"],
    ["completed", 123, "2099-01-01T00:00:00Z"],
  ])("keeps %s/unavailable artifacts disabled", async (status, url, expiry) => {
    client.listReportJobs.mockResolvedValue([report(url, status, expiry)]);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ReportsPage />);
    const button = await screen.findByRole("button", { name: /^Download/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not open when the authoritative job read rejects access", async () => {
    client.listReportJobs.mockResolvedValue([
      report("/reports/JOB-123/artifact"),
    ]);
    client.getReportJob.mockRejectedValueOnce(
      new Error("EVIDENCE_ACCESS_FORBIDDEN"),
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Download/ }));
    await screen.findByText("EVIDENCE_ACCESS_FORBIDDEN");
    expect(open).not.toHaveBeenCalled();
  });
});
