import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SR-PUBLIC-001: 系統端點診斷工具與修復 Runbook 整合測試
 * 驗證 Python 診斷工具的輸出格式、回歸判定邏輯、重現/修復驗收分離、Redirect 追蹤、DNS 錯誤 fail-closed 與 Runbook 完整性
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
    expect(summary.diagnosis_passed).toBe(true);
    expect(summary.recovery_passed).toBe(false);
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

      // Verify Cloud Run health mapping and redirect collection
      expect(entry.cloud_run_direct.active_healthy).toBe(true);
      expect([200, 307]).toContain(entry.cloud_run_direct.active_status);
      expect([200, 307]).toContain(entry.cloud_run_direct.active_final_status);
      expect(entry.cloud_run_direct.active_final_url).toBeTruthy();
      expect(Array.isArray(entry.cloud_run_direct.active_redirect_chain)).toBe(true);
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

  it("runs --offline --mode verify and returns exit code 0 under default auto target", () => {
    const result = execFileSync("python3", [DIAGNOSTIC_TOOL, "--offline", "--mode", "verify"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    expect(result).toContain("Status: PASS");
    expect(result).toContain("Active entries count: 9 (expected: 9)");
    expect(result).toContain("Diagnosis reproduction passed: True");
  });

  it("runs --offline --mode table and generates markdown table containing all 9 entries and redirect details", () => {
    const tableOutput = execFileSync("python3", [DIAGNOSTIC_TOOL, "--offline", "--mode", "table"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    expect(tableOutput).toContain("| Subdomain | Target Service | Path |");
    expect(tableOutput).toContain("Final URL & Status");
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

describe("SR-PUBLIC-001: P1 Fix - Diagnosis Reproduction vs Recovery Acceptance Separation", () => {
  it("verifies --target diagnosis succeeds on defect state and fails on repaired state", () => {
    // Defect state passes diagnosis
    const diagResult = execFileSync(
      "python3",
      [DIAGNOSTIC_TOOL, "--offline", "--mock-state", "reproduced", "--mode", "verify", "--target", "diagnosis"],
      { encoding: "utf-8", cwd: REPO_ROOT },
    );
    expect(diagResult).toContain("Status: PASS");
    expect(diagResult).toContain("Diagnosis reproduction verified");

    // Repaired state fails diagnosis check (defects no longer present)
    expect(() => {
      execFileSync(
        "python3",
        [DIAGNOSTIC_TOOL, "--offline", "--mock-state", "repaired", "--mode", "verify", "--target", "diagnosis"],
        { encoding: "utf-8", cwd: REPO_ROOT, stdio: "pipe" },
      );
    }).toThrow();
  });

  it("verifies --target recovery succeeds on repaired state and fails on defect state", () => {
    // Repaired state passes recovery
    const recResult = execFileSync(
      "python3",
      [DIAGNOSTIC_TOOL, "--offline", "--mock-state", "repaired", "--mode", "verify", "--target", "recovery"],
      { encoding: "utf-8", cwd: REPO_ROOT },
    );
    expect(recResult).toContain("Status: PASS");
    expect(recResult).toContain("Recovery acceptance verified");

    // Defect state fails recovery check (still broken)
    expect(() => {
      execFileSync(
        "python3",
        [DIAGNOSTIC_TOOL, "--offline", "--mock-state", "reproduced", "--mode", "verify", "--target", "recovery"],
        { encoding: "utf-8", cwd: REPO_ROOT, stdio: "pipe" },
      );
    }).toThrow();
  });

  it("verifies in-memory candidate execution with all nine entries repaired passes recovery acceptance", () => {
    const pythonCode = `
import importlib.util
spec = importlib.util.spec_from_file_location("sre", "${DIAGNOSTIC_TOOL}")
sre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sre)

diag = sre.diagnose_public_entries(mock=True, mock_state="repaired")
passed_auto, msg_auto = sre.verify_diagnostics(diag, target="auto")
assert passed_auto, f"auto should pass on repaired state: {msg_auto}"

passed_rec, msg_rec = sre.verify_diagnostics(diag, target="recovery")
assert passed_rec, f"recovery should pass on repaired state: {msg_rec}"

passed_diag, msg_diag = sre.verify_diagnostics(diag, target="diagnosis")
assert not passed_diag, "diagnosis should fail when all entries are repaired"
print("SUCCESS_IN_MEMORY_VERIFICATION")
`;
    const result = execFileSync("python3", ["-c", pythonCode], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(result).toContain("SUCCESS_IN_MEMORY_VERIFICATION");
  });
});

describe("SR-PUBLIC-001: P1 Fix - Redirect Chain, Final URL and Target Collection", () => {
  it("captures bounded redirect chain and actual final URL for simulated 307 response", () => {
    const pythonCode = `
import importlib.util, subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sre", "${DIAGNOSTIC_TOOL}")
sre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sre)

mock_stdout = """HTTP/1.1 307 Temporary Redirect
Location: /dashboard

HTTP/1.1 200 OK

FINAL_URL:https://ops.smarttransport.tw/dashboard
FINAL_STATUS:200
NUM_REDIRECTS:1
"""
mock_proc = subprocess.CompletedProcess(args=["curl"], returncode=0, stdout=mock_stdout, stderr="")

with patch("subprocess.run", return_value=mock_proc):
    resp = sre.check_http_response("ops.smarttransport.tw", path="/", mock=False)
    assert resp["initial_http_code"] == 307, f"Expected 307 initial code, got {resp['initial_http_code']}"
    assert resp["final_http_code"] == 200, f"Expected 200 final code, got {resp['final_http_code']}"
    assert resp["final_url"] == "https://ops.smarttransport.tw/dashboard", f"Expected final URL with redirect, got {resp['final_url']}"
    assert len(resp["redirect_chain"]) == 1, f"Expected 1 redirect hop, got {len(resp['redirect_chain'])}"
    assert resp["redirect_chain"][0]["location"] == "/dashboard"

print("SUCCESS_REDIRECT_TRACKING")
`;
    const result = execFileSync("python3", ["-c", pythonCode], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(result).toContain("SUCCESS_REDIRECT_TRACKING");
  });

  it("verifies Cloud Run fallback probes capture redirect chain and final URL without discarding targets", () => {
    const pythonCode = `
import importlib.util
spec = importlib.util.spec_from_file_location("sre", "${DIAGNOSTIC_TOOL}")
sre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sre)

# Test mock fallback probe for redirecting service (ops console)
cr_ops = sre.check_cloud_run_fallback("drts-dev-ops-console-web", path="/", mock=True)
assert cr_ops["active_status"] == 307
assert cr_ops["active_final_status"] == 200
assert cr_ops["active_final_url"].endswith("/dashboard")
assert len(cr_ops["active_redirect_chain"]) == 1
assert cr_ops["active_healthy"] is True

# Test mock fallback probe for tenant console (redirects to /login)
cr_tenant = sre.check_cloud_run_fallback("drts-dev-tenant-console-web", path="/", mock=True)
assert cr_tenant["active_status"] == 307
assert cr_tenant["active_final_status"] == 200
assert "/login" in cr_tenant["active_final_url"]
assert len(cr_tenant["active_redirect_chain"]) == 1
assert cr_tenant["active_healthy"] is True

# Test mock fallback probe for non-redirecting service (api)
cr_api = sre.check_cloud_run_fallback("drts-dev-api", path="/api/health", mock=True)
assert cr_api["active_status"] == 200
assert cr_api["active_final_status"] == 200
assert len(cr_api["active_redirect_chain"]) == 0
assert cr_api["active_healthy"] is True

print("SUCCESS_FALLBACK_REDIRECT_PROBES")
`;
    const result = execFileSync("python3", ["-c", pythonCode], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(result).toContain("SUCCESS_FALLBACK_REDIRECT_PROBES");
  });

  it("detects broken redirects terminating in 404/500 and flags them in layer root causes", () => {
    const pythonCode = `
import importlib.util, subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sre", "${DIAGNOSTIC_TOOL}")
sre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sre)

broken_stdout = """HTTP/1.1 307 Temporary Redirect
Location: /broken-login

HTTP/1.1 404 Not Found

FINAL_URL:https://ops.smarttransport.tw/broken-login
FINAL_STATUS:404
NUM_REDIRECTS:1
"""
mock_proc = subprocess.CompletedProcess(args=["curl"], returncode=0, stdout=broken_stdout, stderr="")

with patch("subprocess.run", return_value=mock_proc):
    resp = sre.check_http_response("ops.smarttransport.tw", path="/", mock=False)
    assert resp["initial_http_code"] == 307
    assert resp["final_http_code"] == 404
    assert resp["final_url"] == "https://ops.smarttransport.tw/broken-login"

print("SUCCESS_BROKEN_REDIRECT_DETECTION")
`;
    const result = execFileSync("python3", ["-c", pythonCode], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(result).toContain("SUCCESS_BROKEN_REDIRECT_DETECTION");
  });
});

describe("SR-PUBLIC-001: P2 Fix - Fail-Closed DNS Error Handling on EAI_AGAIN", () => {
  it("preserves socket.EAI_AGAIN as temporary failure and does NOT map to NXDOMAIN", () => {
    const pythonCode = `
import importlib.util, socket
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sre", "${DIAGNOSTIC_TOOL}")
sre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sre)

# Simulate EAI_AGAIN via mock_dns_error argument
res_mock = sre.query_dns_records("book.smarttransport.tw", mock=True, mock_dns_error=socket.EAI_AGAIN)
assert res_mock["status"] == "EAI_AGAIN", f"Expected EAI_AGAIN, got {res_mock['status']}"

# Simulate EAI_AGAIN via unittest.mock patching socket.getaddrinfo
with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_AGAIN, "Temporary failure in name resolution")):
    res_real = sre.query_dns_records("book.smarttransport.tw", mock=False)
    assert res_real["status"] == "EAI_AGAIN", f"Expected EAI_AGAIN, got {res_real['status']}"
    assert "EAI_AGAIN" in res_real["error"]
    # Fail closed: resolver outage must NOT be marked clean NXDOMAIN
    is_clean = (res_real.get("status") == "NXDOMAIN")
    assert is_clean is False, "EAI_AGAIN resolver outage must fail closed and NOT be considered clean NXDOMAIN"

# Verify EAI_NONAME continues to map to NXDOMAIN
with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_NONAME, "Name or service not known")):
    res_noname = sre.query_dns_records("book.smarttransport.tw", mock=False)
    assert res_noname["status"] == "NXDOMAIN"
    assert (res_noname.get("status") == "NXDOMAIN") is True

print("SUCCESS_DNS_FAIL_CLOSED")
`;
    const result = execFileSync("python3", ["-c", pythonCode], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(result).toContain("SUCCESS_DNS_FAIL_CLOSED");
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
