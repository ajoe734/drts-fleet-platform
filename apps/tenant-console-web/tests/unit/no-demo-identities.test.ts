import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function findFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (
        file === "node_modules" ||
        file === ".next" ||
        file === "dist" ||
        file === ".turbo" ||
        file === "coverage" ||
        file === "tests" // exclude test files themselves
      ) {
        continue;
      }
      findFiles(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe("No Demo Identities Regression Guard", () => {
  it("ensures zero occurrences of demo identity tokens across apps/tenant-console-web source", () => {
    const rootDir = path.resolve(__dirname, "../../");
    const sourceFiles = findFiles(rootDir);

    const forbiddenPatterns = [
      /\bDEMO_ACTOR_ID\b/,
      /\bDEMO_TENANT_ID\b/,
      /\bcreateTenantClient\b/,
      /\bdemo-tenant-user\b/,
      /\btenant-demo-001\b/,
    ];

    const violations: { file: string; match: string; line: number }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(rootDir, file),
              match: pattern.source,
              line: i + 1,
            });
          }
        }
      }
    }

    expect(
      violations,
      `Found forbidden demo identity tokens in tenant-console-web source files:\n${violations
        .map((v) => `  - ${v.file}:${v.line} matches ${v.match}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
