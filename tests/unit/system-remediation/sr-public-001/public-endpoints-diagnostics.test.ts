import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SR-PUBLIC-001: 系統端點診斷工具與修復 Runbook 整合測試
 * 驗證 Python 診斷工具的輸出格式、回歸判定邏輯與 Runbook 完整性
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const DIAGNOSTIC_TOOL = path.join(
  REPO_ROOT,
  "tools/system-remediation/public-entry/system-remediation-endpoints.py",
);
const REPAIR_DOC = path.join(
  REPO_ROOT,
  "docs/04-uat/system-remediation-20260906/public-entry-repair.md",
);

describe("SR-PUBLIC-001: Python Diagnostic Tool Execution", () => {
  it("verifies diagnostic script exists and is executable", () => {
    expect(fs.existsSync(DIAGNOSTIC_TOOL)).toBe(true);
    const stats = fs.statSync(DIAGNOSTIC_TOOL);
    // User executable bit
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });

  it("runs --offline --mode json and outputs valid diagnostic JSON", () => {
    const rawOutput = execFileSync("python3", [DIAGNOSTIC_TOOL, "--offline", "--mode", "json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    const parsed = JSON.parse(rawOutput);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("active_entries");
    expect(parsed).toHaveProperty("retired_entries");

    const { summary, active_entries, retired_entries } = parsed;

    // Summary invariants
    expect(summary.active_entries_count).toBe(9);
    expect(summary.retired_entries_count).toBe(3);
    expect(summary.r01_reproduced_all_entries).toBe(true);
    expect(summary.r29_reproduced_all_entries).toBe(true);
    expect(summary.all_retired_clean_nxdomain).toBe(true);
    expect(summary.all_cloud_run_active_healthy).toBe(true);

    // Active entries detail
    expect(active_entries).toHaveLength(9);
    for (const entry of active_entries) {
      expect(entry).toHaveProperty("entry_id");
      expect(entry).toHaveProperty("subdomain");
      expect(entry).toHaveProperty("cloud_run_service");
      expect(entry).toHaveProperty("layer_root_causes");
      expect(entry.reproduced_r01).toBe(true);
      expect(entry.reproduced_r29).toBe(true);

      // Verify Cloud Run health mapping
      expect(entry.cloud_run_direct.active_healthy).toBe(true);
      expect([200, 307]).toContain(entry.cloud_run_direct.active_status);
      expect(entry.cloud_run_direct.stale_status).toBe(404);
      expect(entry.cloud_run_direct.stale_healthy).toBe(false);
    }

    // Retired entries detail
    expect(retired_entries).toHaveLength(3);
    const retiredSubdomains = retired_entries.map((r: { subdomain: string }) => r.subdomain);
    expect(retiredSubdomains).toContain("book.smarttransport.tw");
    expect(retiredSubdomains).toContain("ride.smarttransport.tw");
    expect(retiredSubdomains).toContain("concierge.smarttransport.tw");

    for (const r of retired_entries) {
      expect(r.is_clean_nxdomain).toBe(true);
    }
  });

  it("runs --offline --mode verify and returns exit code 0", () => {
    const result = execFileSync("python3", [DIAGNOSTIC_TOOL, "--offline", "--mode", "verify"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    expect(result).toContain("Status: PASS");
    expect(result).toContain("Active entries count: 9 (expected: 9)");
  });

  it("runs --offline --mode table and generates markdown table containing all 9 entries", () => {
    const tableOutput = execFileSync("python3", [DIAGNOSTIC_TOOL, "--offline", "--mode", "table"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    expect(tableOutput).toContain("| Subdomain | Target Service | Path |");
    expect(tableOutput).toContain("fleets.smarttransport.tw");
    expect(tableOutput).toContain("ops.smarttransport.tw");
    expect(tableOutput).toContain("partners.smarttransport.tw");
    expect(tableOutput).toContain("dispatch.smarttransport.tw");
    expect(tableOutput).toContain("bank.smarttransport.tw");
    expect(tableOutput).toContain("channel.smarttransport.tw");
    expect(tableOutput).toContain("tenant.smarttransport.tw");
    expect(tableOutput).toContain("refer.smarttransport.tw");
    expect(tableOutput).toContain("api.smarttransport.tw");
    expect(tableOutput).toContain("book.smarttransport.tw");
    expect(tableOutput).toContain("ride.smarttransport.tw");
    expect(tableOutput).toContain("concierge.smarttransport.tw");
  });
});

describe("SR-PUBLIC-001: Repair Runbook & Rollback Specification", () => {
  it("verifies public-entry-repair.md exists and contains required operational sections", () => {
    expect(fs.existsSync(REPAIR_DOC)).toBe(true);
    const content = fs.readFileSync(REPAIR_DOC, "utf-8");

    // Must cite R01 and R29
    expect(content).toContain("R01");
    expect(content).toContain("R29");

    // Must cite C001 and C124
    expect(content).toContain("C001");
    expect(content).toContain("C124");

    // Must contain 9-entry table
    expect(content).toContain("9 個公開入口分層對照表");
    expect(content).toContain("fleets.smarttransport.tw");
    expect(content).toContain("api.smarttransport.tw");

    // Must specify active Cloud Run suffix
    expect(content).toContain("lyo6ra57fq-uc.a.run.app");
    expect(content).toContain("4t7rg6fmeq-uc.a.run.app");

    // Must specify DNS target ghs.googlehosted.com. and stale IP 8.233.119.14
    expect(content).toContain("ghs.googlehosted.com");
    expect(content).toContain("8.233.119.14");

    // Must contain step-by-step runbook for SR-LIVE-ENTRY-001
    expect(content).toContain("SR-LIVE-ENTRY-001");
    expect(content).toContain("map-domain-service.sh");

    // Must contain explicit rollback plan
    expect(content).toContain("回滾計畫");

    // Must specify live gate boundary
    expect(content).toContain("權限邊界與 Live Gate 說明");
  });
});
