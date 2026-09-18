import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DRV-SOS-001: No OS dialer or tel: Linking in apps/driver-app", () => {
  const driverAppRoot = path.resolve(__dirname, "../..");

  function scanDirectory(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".artifacts" ||
        entry.name === "dist" ||
        entry.name === ".expo" ||
        entry.name === "coverage" ||
        entry.name === "driver-sos-no-os-dialer.test.ts"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") ||
          entry.name.endsWith(".tsx") ||
          entry.name.endsWith(".js") ||
          entry.name.endsWith(".jsx"))
      ) {
        files.push(fullPath);
      }
    }

    return files;
  }

  it("verifies no file in apps/driver-app invokes Linking.openURL with tel: or calls native phone dialer", () => {
    const sourceFiles = scanDirectory(driverAppRoot);
    expect(sourceFiles.length).toBeGreaterThan(10);

    const violations: { file: string; match: string }[] = [];
    const telPattern = /Linking\.openURL\s*\(\s*[`'"]tel:/;
    const directTelPattern = /[`'"]tel:[^`'"]*[`'"]/;

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (telPattern.test(content)) {
        violations.push({ file: path.relative(driverAppRoot, filePath), match: "Linking.openURL('tel:...')" });
      }
      if (directTelPattern.test(content)) {
        violations.push({ file: path.relative(driverAppRoot, filePath), match: "tel: string" });
      }
    }

    expect(violations).toEqual([]);
  });
});
