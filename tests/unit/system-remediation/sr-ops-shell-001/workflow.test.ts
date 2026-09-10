import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("SR-OPS-SHELL-001: Ops Shell Remote Acceptance Workflow", () => {
  const root = path.resolve(__dirname, "../../../..");
  const workflowFile = path.join(root, ".github", "workflows", "ops-shell-acceptance.yml");
  const e2eSpecFile = path.join(
    root,
    "tests",
    "e2e",
    "system-remediation",
    "sr-ops-shell-001",
    "ops-shell-acceptance.spec.ts",
  );

  it("workflow file exists and defines required triggers and timeout", () => {
    expect(fs.existsSync(workflowFile)).toBe(true);
    const content = fs.readFileSync(workflowFile, "utf-8");
    expect(content).toContain("workflow_dispatch:");
    expect(content).toContain("pull_request:");
    expect(content).toContain("push:");
    expect(content).toContain("timeout-minutes:");

    const timeoutMatch = content.match(/timeout-minutes:\s*(\d+)/);
    expect(timeoutMatch).not.toBeNull();
    const timeout = parseInt(timeoutMatch![1], 10);
    expect(timeout).toBeLessThanOrEqual(30);
  });

  it("workflow targets the designated e2e spec directory", () => {
    const content = fs.readFileSync(workflowFile, "utf-8");
    expect(content).toContain("tests/e2e/system-remediation/sr-ops-shell-001/");
  });

  it("e2e spec exists and covers required acceptance criteria", () => {
    expect(fs.existsSync(e2eSpecFile)).toBe(true);
    const specContent = fs.readFileSync(e2eSpecFile, "utf-8");
    expect(specContent).toContain("ops_cross_app_resource_navigation");
    expect(specContent).toContain("ops_widget_remote_viewport_keyboard");
    expect(specContent).toContain("resourceType");
    expect(specContent).toContain("resourceId");
    expect(specContent).toContain("1440");
    expect(specContent).toContain("390");
  });
});
