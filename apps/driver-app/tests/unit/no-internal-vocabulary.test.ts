import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for DRV-TEXT-001: no internal system, spec, or
 * integration vocabulary may reach a user-visible string anywhere in the
 * driver app. This statically scans source files for the same patterns a
 * human reviewer would flag, rather than rendering every screen (many of
 * which need heavy native/router mocking to mount).
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"];
const SCAN_FILES = ["lib/strings.ts", "lib/operational-labels.ts"];

const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/;
const SPEC_MARKER =
  /§|(?:^|[^a-zA-Z])packet(?:[^a-zA-Z]|$)|Phase\s*\d|\bSO_[A-Za-z]+\b|\bQ-DRV\d+\b|\bMOB-APP-\d+\b|\bSD §|\bSA §/i;

// Mixed-case identifier: an uppercase-led word followed directly by another
// uppercase-led word with no space, e.g. "DeviceNotProvisioned". Plain
// acronyms (all caps, e.g. "SOS", "API") and single Capitalized words
// ("Fresh") do not match this.
const PASCAL_CASE = /\b[A-Z][a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/;

// Real-world proper nouns / widely understood tech acronyms that are
// allowed to appear verbatim in user-facing copy.
const ALLOWED_TOKENS = new Set([
  "FSD",
  "DRTS",
  "OAuth",
  "GrabTaiwan",
]);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }
    if (
      [".ts", ".tsx"].includes(extname(full)) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx")
    ) {
      files.push(full);
    }
  }
  return files;
}

function extractCandidateStrings(source: string): string[] {
  const candidates: string[] = [];

  // JSX text nodes: text sitting directly between a closing `>` and the
  // next `<`, with no braces (braces mean it's an expression, not literal
  // text).
  for (const match of source.matchAll(/>([^<>{}\n]{2,200}?)</g)) {
    const text = match[1].trim();
    if (text) {
      candidates.push(text);
    }
  }

  // Common copy-bearing props/object keys, both JSX (`label="..."`) and
  // object-literal (`label: "..."`) forms, single/double-quoted or
  // template-literal.
  const propNames =
    "label|title|subtitle|eyebrow|placeholder|description|accessibilityLabel|" +
    "accessibilityHint|authorityLabel|body|detail|meta|hint|notice|badge|" +
    "caption|helpText";
  const propPattern = new RegExp(
    `\\b(?:${propNames})\\s*[:=]\\s*(["'\`])((?:(?!\\1)[^\\\\]|\\\\.)*?)\\1`,
    "g",
  );
  for (const match of source.matchAll(propPattern)) {
    const text = match[2].trim();
    if (text) {
      candidates.push(text);
    }
  }

  return candidates;
}

describe("no internal vocabulary reaches user-visible strings", () => {
  const files = [
    ...SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir))),
    ...SCAN_FILES.map((f) => join(ROOT, f)),
  ];

  it("scans at least the known driver-app screens and shared string tables", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    const relPath = relative(ROOT, file);

    it(`renders no snake_case, PascalCase, or spec-marker leaks in ${relPath}`, () => {
      const source = stripComments(readFileSync(file, "utf8"));
      const candidates = extractCandidateStrings(source);
      const violations: string[] = [];

      for (const candidate of candidates) {
        if (SNAKE_CASE.test(candidate)) {
          violations.push(`snake_case: "${candidate}"`);
          continue;
        }
        if (SPEC_MARKER.test(candidate)) {
          violations.push(`spec marker: "${candidate}"`);
          continue;
        }
        const pascalMatches = candidate.match(new RegExp(PASCAL_CASE, "g"));
        if (pascalMatches) {
          const unexpected = pascalMatches.filter(
            (token) => !ALLOWED_TOKENS.has(token),
          );
          if (unexpected.length > 0) {
            violations.push(
              `PascalCase: "${candidate}" (${unexpected.join(", ")})`,
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
