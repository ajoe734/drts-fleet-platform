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

  it("accounts for each of the 30 findings and 14 gaps with reproducible evidence or specific blocking reason", () => {
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
        expect(item.commit_sha).toMatch(/^[0-9a-f]{40}$/);
        expect(item.regression_test).toBeTruthy();
        expect(item.test_command).toBeTruthy();
        expect(item.result).toBeTruthy();
        const testFiles = item.regression_test
          .split(";")
          .map((f: string) => f.trim())
          .filter(Boolean);
        for (const file of testFiles) {
          expect(fs.existsSync(path.join(root, file))).toBe(true);
        }
      } else {
        expect(item.repro_command_or_evidence).toBeTruthy();
        expect(item.repro_command_or_evidence.length).toBeGreaterThan(15);
        expect(item.blocking_reason).toBeTruthy();
        expect(item.next_task).toBeTruthy();
      }
    }
  });

  it("defines concrete role, persona, tenant namespace, domain records, and missing evidence for all 134 capabilities", () => {
    expect(capabilities).toHaveLength(134);
    const capItems = readiness.capability_role_test_data_requirement.items;
    expect(capItems).toHaveLength(134);

    const itemsById = new Map<string, any>(
      capItems.map((item: any) => [item.id, item]),
    );

    for (const cap of capabilities) {
      const item = itemsById.get(cap.ID);
      expect(item).toBeDefined();
      expect(item.role).toBe(cap.角色);
      expect(item.required_persona).toBeTruthy();
      expect(typeof item.required_persona).toBe("string");
      expect(item.tenant_namespace).toBeTruthy();
      expect(typeof item.tenant_namespace).toBe("string");
      expect(Array.isArray(item.required_records)).toBe(true);
      expect(item.required_records.length).toBeGreaterThanOrEqual(1);
      expect(item.missing_evidence).toBeTruthy();
      expect(typeof item.missing_evidence).toBe("string");
    }

    expect(readiness.capability_role_test_data_requirement.policy).toContain(
      "isolated persona",
    );
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

  it("tracks all 11 merged remediation tasks with valid commit SHAs and verified regression suites", () => {
    const mergedTasks = readiness.merged_task_evidence;
    const taskIds = Object.keys(mergedTasks);
    expect(taskIds.length).toBe(11);
    for (const [taskId, sha] of Object.entries(mergedTasks)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
    const mergedIssues = readiness.issue_inventory.items.filter(
      (item: any) => item.status === "current_evidence_merged",
    );
    expect(mergedIssues).toHaveLength(13);
    for (const issue of mergedIssues) {
      const referencedTasks = issue.task_id
        .split(";")
        .map((t: string) => t.trim());
      for (const t of referencedTasks) {
        expect(mergedTasks[t]).toBeDefined();
      }
    }
  });
});
