import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../../../");
const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T;

describe("SR-READINESS-001 repository-only readiness inventory", () => {
  const readiness = read<any>(
    "docs/04-uat/system-remediation-20260906/readiness.json",
  );
  const findings = read<Array<{ 編號: string }>>(
    "docs/04-uat/system-remediation-20260906/source/findings.json",
  );
  const gaps = read<Array<{ ID: string }>>(
    "docs/04-uat/system-remediation-20260906/source/new-gaps.json",
  );
  const capabilities = read<Array<{ ID: string; 角色: string }>>(
    "docs/04-uat/system-remediation-20260906/source/capabilities.json",
  );

  it("makes the base explicit and refuses to treat the historical audit SHA as current truth", () => {
    expect(readiness.inspection.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(readiness.inspection.historical_audit_is_not_current_truth).toBe(
      true,
    );
    expect(readiness.inspection.candidate_sha).toBeNull();
    expect(readiness.inspection.candidate_sha_evidence).toContain("handoff");
  });

  it("accounts for each of the 30 findings and 14 gaps without calling an unrun check a pass", () => {
    const expected = [
      ...findings.map((item) => item.編號),
      ...gaps.map((item) => item.ID),
    ].sort();
    const actual = readiness.issue_inventory.items
      .map((item: any) => item.id)
      .sort();
    expect(expected).toHaveLength(44);
    expect(actual).toEqual(expected);
    for (const item of readiness.issue_inventory.items) {
      expect([
        "not_run",
        "not_run_live",
        "not_run_device",
        "not_run_live_device",
        "current_evidence_merged",
      ]).toContain(item.status);
      expect(item.status).not.toBe("passed");
      if (item.status === "current_evidence_merged") {
        expect(item.evidence).toBeTruthy();
        for (const taskId of item.evidence.match(/SR-[A-Z-]+-\d+/g) ?? []) {
          expect(readiness.merged_task_evidence[taskId]).toMatch(
            /^[0-9a-f]{40}$/,
          );
        }
      }
    }
  });

  it("sets a role, isolated data, and live-evidence rule for all 134 source capabilities", () => {
    expect(capabilities).toHaveLength(134);
    expect(
      capabilities.every(
        (capability) => capability.ID && capability.角色.trim(),
      ),
    ).toBe(true);
    expect(readiness.capability_role_test_data_requirement.selection).toBe(
      "C001-C134 inclusive; derive the role string for each capability directly from source/capabilities.json at test execution",
    );
    expect(
      readiness.capability_role_test_data_requirement.requirement,
    ).toContain("isolated persona");
  });

  it("keeps all unprovided live gates missing and assigns owner, readback, and resource requirements", () => {
    expect(readiness.live_gates.length).toBeGreaterThanOrEqual(10);
    for (const gate of readiness.live_gates) {
      expect(gate.status).toBe("missing");
      expect(gate.owner).toBeTruthy();
      expect(gate.readback).toBeTruthy();
      expect(gate.requires.length).toBeGreaterThan(0);
    }
    expect(
      readiness.live_gates.find((gate: any) => gate.id === "cti_voice")
        .readback,
    ).toContain("UV-EXEC-027");
  });
});
