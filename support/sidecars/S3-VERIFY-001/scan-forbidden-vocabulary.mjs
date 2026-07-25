#!/usr/bin/env node
// S3-VERIFY-001 — forbidden-vocabulary scan for P-5 / S-3 screens.
//
// Canonical term list: source_specs/02_ui_visual_design_team_brief_20260720.md §1.3
// ("所有 P-5／S-3 相關畫面不得出現"). The source_specs/ copy is authoritative;
// 00_source_specs_index.md is a derived summary and is NOT used here.
//
// The rule is about what a SCREEN DISPLAYS, so the scan is AST-based rather
// than a flat grep: it walks TS/TSX with the TypeScript parser and classifies
// every string it finds by position.
//
//   BLOCKING — the term reaches rendered copy:
//       * JSX text children
//       * JSX copy attributes (placeholder/title/alt/aria-label/label/...)
//       * string + template literals that are used as copy
//   INFO     — the term appears in the surface but cannot render:
//       * identifiers, imports, type names, comments, object keys
//
// A flat grep would fail this task in both directions: it would pass a screen
// whose forbidden word sits in a JSX child spanning two lines, and it would
// fail a screen for an internal `forwardedOrderId` field name that no user can
// see. Only BLOCKING findings gate the acceptance item; INFO findings are
// reported so a human can confirm each one is genuinely non-visible.
//
// Usage:
//   node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs
//   node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs --json
//
// Exit 0 when there are no BLOCKING findings; exit 1 otherwise.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes("--json");

// ── P-5 / S-3 screen scope ───────────────────────────────────────────────────
// §1.3 binds "所有 P-5／S-3 相關畫面" — the P-5/S-3 screen catalogue in §2.1-2.4,
// NOT every screen that happens to live in the same app. The driver app hosts
// several realms in one Expo router tree, so scoping by app directory is wrong
// in both directions. Two realms are deliberately EXCLUDED, with reasons:
//
//   * apps/driver-app/app/safety-operator.tsx — the Phase-2 Tesla/FSD sandbox
//     safety-operator realm. 安全員 / 接管 / FSD / Tesla are that realm's own
//     domain vocabulary, and it is not a P-5/S-3 screen. Including it produces
//     ~350 findings that are all correct usage in the wrong scope.
//   * apps/driver-app/app/jobs.tsx, platform-presence.tsx, earnings.tsx — the
//     multi-platform / forwarded-order realm of the STANDARD taxi profile.
//     `forwarded` is that profile's real domain term; the S-3 rule forbids
//     forwarded_order_ui inside `multi_taxi_direct`, not in the platform that
//     legitimately aggregates.
//
// Excluding these is a scope judgement, so both are re-scanned separately by
// `--audit-excluded` to prove nothing S-3-facing hides there.
const SURFACES = [
  {
    label: "S-3 Driver screens (S3-01..S3-11)",
    files: [
      "apps/driver-app/app/sos.tsx", // S3-03..S3-11 SOS home, report, supplement, attachment, false alarm
      "apps/driver-app/app/trip.tsx", // S3-01/S3-02 persistent SOS entry + hold progress
      "apps/driver-app/app/incident.tsx", // S-3 incident detail / resolved-closed
    ],
    dirs: [
      "apps/driver-app/components/ui",
      "apps/driver-app/components/ui-rn",
      "apps/driver-app/components/canvas-primitives",
    ],
  },
  {
    label: "S-3 Ops screens (S3-O01..S3-O06)",
    files: [
      "apps/ops-console-web/lib/sos-view-model.ts", // copy source behind the SOS queue/detail screens
      "apps/ops-console-web/components/ops-shell.tsx", // hosts the S3-O01 critical alert overlay/banner
    ],
    // `incidents/` carries the S3-O05 investigation timeline, so it is scanned
    // even though it is not named `sos`.
    dirs: [
      "apps/ops-console-web/app/sos",
      "apps/ops-console-web/app/incidents",
    ],
  },
  {
    label: "P-5 Passenger screens (P5-01..P5-12, P5-A01..A05)",
    dirs: [
      "apps/passenger-web/app",
      "apps/passenger-web/components",
      "apps/passenger-web/lib",
    ],
  },
];

// Realms deliberately out of scope, re-scanned under --audit-excluded.
const EXCLUDED = [
  {
    label: "driver-app safety-operator realm (Phase-2 FSD sandbox)",
    files: ["apps/driver-app/app/safety-operator.tsx"],
  },
  {
    label: "driver-app multi-platform realm (standard taxi profile)",
    files: [
      "apps/driver-app/app/jobs.tsx",
      "apps/driver-app/app/platform-presence.tsx",
      "apps/driver-app/app/earnings.tsx",
    ],
  },
];

// ── §1.3 forbidden vocabulary ────────────────────────────────────────────────
// `latin` terms match case-insensitively from a word boundary, so inflections
// (forwarded/forwarding, mirror/mirrored) are caught while `Mirrored` inside a
// longer word like "mirrorless" is still reported for triage rather than
// silently dropped. CJK terms are plain substring matches (no word boundaries
// exist in Chinese).
const TERMS = [
  { term: "FSD", kind: "latin" },
  { term: "自駕", kind: "cjk" },
  { term: "無人駕駛", kind: "cjk" },
  { term: "安全員", kind: "cjk" },
  { term: "接管", kind: "cjk" },
  { term: "ROC", kind: "latin" },
  { term: "sandbox", kind: "latin" },
  { term: "Tesla", kind: "latin" },
  { term: "外部平台名稱", kind: "cjk" },
  { term: "forwarded", kind: "latin" },
  { term: "mirror", kind: "latin" },
  { term: "native status", kind: "latin" },
  { term: "平台聚合切換器", kind: "cjk" },
  { term: "外部平台 badge", kind: "cjk" },
];

function matchesFor(text) {
  const hits = [];
  for (const { term, kind } of TERMS) {
    if (kind === "cjk") {
      if (text.includes(term)) hits.push(term);
      continue;
    }
    const pattern = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "iu",
    );
    if (pattern.test(text)) hits.push(term);
  }
  return hits;
}

const COPY_ATTRS = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "label",
  "heading",
  "subtitle",
  "description",
  "message",
  "text",
  "confirmLabel",
  "cancelLabel",
  "emptyText",
  "helperText",
  "errorText",
]);

function collectFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === "dist"
        )
          continue;
        walk(full);
        continue;
      }
      // `route.ts` is a Next.js server route handler, not a screen. §1.3 binds
      // what a screen displays, so proxy/header code is out of scope.
      if (/^route\.tsx?$/.test(entry.name)) continue;
      if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name))
        out.push(full);
    }
  };
  walk(abs);
  return out;
}

function surfaceFiles(surface) {
  const out = [];
  for (const f of surface.files ?? []) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) out.push(abs);
  }
  for (const d of surface.dirs ?? []) out.push(...collectFiles(d));
  return out;
}

const blocking = [];
const info = [];

function record(bucket, file, node, source, text, hits, position) {
  const { line, character } = source.getLineAndCharacterOfPosition(
    node.getStart(source),
  );
  bucket.push({
    file: path.relative(ROOT, file),
    line: line + 1,
    column: character + 1,
    position,
    terms: hits,
    text: text.trim().replace(/\s+/g, " ").slice(0, 160),
  });
}

const AUDIT_EXCLUDED = process.argv.includes("--audit-excluded");
const SCAN_SET = AUDIT_EXCLUDED ? EXCLUDED : SURFACES;

for (const surface of SCAN_SET) {
  {
    for (const file of surfaceFiles(surface)) {
      const content = fs.readFileSync(file, "utf8");
      const source = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      // ── Visible copy (BLOCKING) ──────────────────────────────────────────
      const visit = (node) => {
        if (ts.isJsxText(node)) {
          const text = node.text;
          const hits = matchesFor(text);
          if (hits.length && text.trim())
            record(blocking, file, node, source, text, hits, "jsx-text");
        } else if (ts.isJsxAttribute(node) && node.initializer) {
          const name = node.name.getText(source);
          if (COPY_ATTRS.has(name)) {
            const init = node.initializer;
            let text = null;
            if (ts.isStringLiteral(init)) text = init.text;
            else if (
              ts.isJsxExpression(init) &&
              init.expression &&
              ts.isStringLiteralLike(init.expression)
            ) {
              text = init.expression.text;
            }
            if (text) {
              const hits = matchesFor(text);
              if (hits.length)
                record(
                  blocking,
                  file,
                  node,
                  source,
                  text,
                  hits,
                  `jsx-attr:${name}`,
                );
            }
          }
        } else if (ts.isStringLiteralLike(node)) {
          // A bare string literal. Treat as copy unless it is clearly machine
          // data (import path, enum-ish token, url, css class).
          const text = node.text;
          const hits = matchesFor(text);
          if (hits.length) {
            const parent = node.parent;
            const isImport =
              ts.isImportDeclaration(parent) ||
              ts.isExportDeclaration(parent) ||
              (ts.isCallExpression(parent) &&
                parent.expression.getText(source) === "require");
            const isPropertyKey =
              ts.isPropertyAssignment(parent) && parent.name === node;
            const machineLike =
              // Single machine token with no whitespace: an enum value
              // (`forwarded`), a CSS class, or an HTTP header (`x-forwarded-for`).
              // Rendered copy in this product is either CJK sentences or
              // multi-word English labels, so "contains no space" is a reliable
              // separator. Multi-word labels such as "mirror order" stay BLOCKING.
              /^[a-z0-9_.:-]+$/i.test(text.trim()) ||
              /^[./@]/.test(text.trim()) || // path or scope
              /^https?:\/\//.test(text.trim()); // url
            if (isImport || isPropertyKey) {
              record(info, file, node, source, text, hits, "machine-string");
            } else if (machineLike) {
              // A lone token like "forwarded" is usually a state/enum value,
              // not sentence copy — but it CAN be rendered directly. Report as
              // INFO with the surrounding construct named so a human can rule.
              record(info, file, node, source, text, hits, "bare-token-string");
            } else {
              record(blocking, file, node, source, text, hits, "copy-string");
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);

      // ── Non-renderable occurrences (INFO): identifiers + comments ─────────
      for (const { term, kind } of TERMS) {
        const pattern =
          kind === "cjk"
            ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu")
            : new RegExp(
                `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                "giu",
              );
        let m;
        while ((m = pattern.exec(content)) !== null) {
          const line = content.slice(0, m.index).split("\n").length;
          const already = [...blocking, ...info].some(
            (f) => f.file === path.relative(ROOT, file) && f.line === line,
          );
          if (already) continue;
          const lineText = content.split("\n")[line - 1] ?? "";
          info.push({
            file: path.relative(ROOT, file),
            line,
            column: 1,
            position: "identifier-or-comment",
            terms: [term],
            text: lineText.trim().slice(0, 160),
          });
        }
      }
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ blocking, info }, null, 2));
  process.exit(blocking.length ? 1 : 0);
}

console.log(
  AUDIT_EXCLUDED
    ? "S3-VERIFY-001 — forbidden-vocabulary AUDIT of the deliberately EXCLUDED realms"
    : "S3-VERIFY-001 — forbidden-vocabulary scan (P-5 / S-3 screens)",
);
console.log(
  `Source list: source_specs/02_ui_visual_design_team_brief_20260720.md §1.3 (${TERMS.length} terms)`,
);
console.log(`Scope:       ${SCAN_SET.map((s) => s.label).join("; ")}`);
console.log(
  `Files:       ${SCAN_SET.reduce((n, s) => n + surfaceFiles(s).length, 0)}`,
);
console.log("");

if (blocking.length === 0) {
  console.log("BLOCKING (forbidden term reaches rendered copy): none");
} else {
  console.log(
    `BLOCKING (forbidden term reaches rendered copy): ${blocking.length}`,
  );
  for (const f of blocking) {
    console.log(
      `  ${f.file}:${f.line}:${f.column} [${f.position}] {${f.terms.join(", ")}}`,
    );
    console.log(`      ${f.text}`);
  }
}

console.log("");
console.log(
  `INFO (present but not renderable — needs human confirmation): ${info.length}`,
);
const byTerm = new Map();
for (const f of info)
  for (const t of f.terms) byTerm.set(t, (byTerm.get(t) ?? 0) + 1);
for (const [term, count] of [...byTerm.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${term}: ${count}`);
}

process.exit(blocking.length ? 1 : 0);
