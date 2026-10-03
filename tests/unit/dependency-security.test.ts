import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Dependency Security Exceptions", () => {
  it("should be valid JSON with correct fields", () => {
    const exceptionsPath = path.resolve(
      __dirname,
      "../../tools/ci/dependency-security-exceptions.json",
    );
    const exceptions = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
    expect(Array.isArray(exceptions)).toBe(true);
    for (const exc of exceptions) {
      expect(exc.module_name).toBeDefined();
      expect(typeof exc.module_name).toBe("string");
      expect(exc.expires_at).toBeDefined();
      expect(typeof exc.expires_at).toBe("string");
      // Should be a valid date
      expect(!isNaN(Date.parse(exc.expires_at))).toBe(true);
    }
  });
});
