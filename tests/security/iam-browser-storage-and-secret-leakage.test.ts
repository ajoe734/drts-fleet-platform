import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "../../");
const SOURCE_ROOTS = ["apps", "packages"] as const;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const SECRET_STORAGE_PATTERN =
  /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([\s\S]{0,160}?(?:access[_-]?token|refresh[_-]?token|bearer|authorization|api[_-]?key|plaintext[_-]?key|webhook[_-]?secret|password|credential|secret)\b/i;
const COOKIE_SECRET_PATTERN =
  /document\.cookie[\s\S]{0,160}?(?:access[_-]?token|refresh[_-]?token|bearer|authorization|api[_-]?key|plaintext[_-]?key|webhook[_-]?secret|password|credential|secret)\b/i;
const RAW_SECRET_PATTERN =
  /\b(?:sk-proj-[A-Za-z0-9_-]{10,}|sk-ant-api03-[A-Za-z0-9_-]{10,}|whsec_[A-Za-z0-9_-]{10,}|Authorization:\s*Bearer\s+\S+)/;

function listSourceFiles() {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) {
    walk(path.join(ROOT_DIR, sourceRoot));
  }

  return files;
}

describe("IAM browser-storage and secret-leakage scan", () => {
  it("does not persist auth secrets in browser storage or cookies", () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles()) {
      const source = readFileSync(filePath, "utf8");
      if (
        SECRET_STORAGE_PATTERN.test(source) ||
        COOKIE_SECRET_PATTERN.test(source)
      ) {
        offenders.push(path.relative(ROOT_DIR, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps IAM-UAT-001 evidence free of raw secret literals", () => {
    const evidenceDir = path.join(ROOT_DIR, "support/sidecars/IAM-UAT-001");
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const source = readFileSync(fullPath, "utf8");
        if (RAW_SECRET_PATTERN.test(source)) {
          offenders.push(path.relative(ROOT_DIR, fullPath));
        }
      }
    }

    walk(evidenceDir);
    expect(offenders).toEqual([]);
  });
});
