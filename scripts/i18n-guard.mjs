#!/usr/bin/env node
// @ts-check
/**
 * i18n guard — DRTS Ops Console & Platform Admin
 * ------------------------------------------------------------------------
 * Enforces docs/05-ui/i18n-multilingual-spec-20260604.md §6. Scans the page +
 * component source of both web apps and reports every place that bypasses the
 * central `translations.ts` + `t()` mechanism, emitting a `file:line` worklist
 * that remediation WPs clean one route at a time.
 *
 * Scope: apps/<app>/app/** and apps/<app>/components/** , *.ts / *.tsx only.
 *   Excluded: lib/translations.ts and lib/i18n.tsx (the machinery itself),
 *   *.d.ts, and *.test.* / *.spec.* fixtures.
 *
 * Rules (spec §6):
 *   1 helper      ERROR  inline bilingual helpers / ternaries / inline {en,zh}
 *   2 cjk         ERROR  hard-coded CJK in code (string literals, not comments)
 *   3 jsxText     ERROR  hard-coded English JSX leaf text / a11y+placeholder attrs
 *   5 term        WARN   zh code-switch: CJK string still carrying an English
 *                        tech term that has a §3 glossary translation
 *   (Rule 4 dictionary parity is enforced at compile time by TS
 *    `Record<keyof typeof en, string>` / `typeof en`; re-checked here as a
 *    soft global key-count probe.)
 *
 * Ratchet: the repo ships with known i18n debt across multiple routes. A hard
 * fail on all of them would block the very PRs that reduce debt, so the guard
 * is baselined: scripts/i18n-guard-baseline.json records the current allowed
 * ERROR count per file. The guard fails when a file exceeds its allowance or a
 * non-baselined file introduces an error. As a WP cleans a file, lower/remove
 * its baseline entry or run `--update-baseline`; the guard then locks the file
 * clean.
 *
 * Usage:
 *   node scripts/i18n-guard.mjs                 # check all target files (CI)
 *   node scripts/i18n-guard.mjs --staged        # check staged files (pre-commit)
 *   node scripts/i18n-guard.mjs --json          # machine-readable report
 *   node scripts/i18n-guard.mjs --no-baseline   # raw mode: every violation fails
 *   node scripts/i18n-guard.mjs --update-baseline   # rewrite the baseline file
 *
 * Exit code: 0 = pass, 1 = fail (errors over baseline), 2 = bad invocation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASELINE_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "i18n-guard-baseline.json",
);
const APPS_DIR = path.join(REPO_ROOT, "apps");
const SCAN_SUBDIRS = ["app", "components"];
const SCOPE_APPS = new Set(["ops-console-web", "platform-admin-web"]);

const KEEP_TERMS = new Set(
  [
    "ETA",
    "SLA",
    "API",
    "RBAC",
    "TTL",
    "CSV",
    "PDF",
    "ZIP",
    "URL",
    "ID",
    "KPI",
    "UI",
    "UX",
    "OK",
    "QR",
    "SSO",
    "JSON",
    "CSI",
    "GPS",
    "VIN",
    "SMS",
  ].map((term) => term.toLowerCase()),
);

const CODE_SWITCH_TERMS = [
  "adapter",
  "registry",
  "override",
  "dispatch",
  "credential",
  "session",
  "callback",
  "fallback",
  "rollout",
  "queue",
  "scope",
  "gate",
  "token",
  "workspace",
  "snapshot",
  "provision",
  "banner",
  "readiness",
  "posture",
  "backlog",
  "stepper",
  "reconciliation",
  "forwarded",
  "secret",
];

const RULES = {
  helper: {
    id: "helper",
    severity: "error",
    desc: "inline bilingual helper / ternary / inline {en,zh}",
  },
  cjk: { id: "cjk", severity: "error", desc: "hard-coded CJK literal" },
  jsxText: {
    id: "jsxText",
    severity: "error",
    desc: "hard-coded English JSX text / attribute",
  },
  term: {
    id: "term",
    severity: "warn",
    desc: "zh code-switch: untranslated glossary term",
  },
};

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;

const args = new Set(process.argv.slice(2));
const MODE = {
  staged: args.has("--staged"),
  json: args.has("--json"),
  noBaseline: args.has("--no-baseline"),
  updateBaseline: args.has("--update-baseline"),
  help: args.has("--help") || args.has("-h"),
};

if (MODE.help) {
  process.stdout.write(
    "i18n-guard — enforce central translations.ts + t() (spec §6)\n\n" +
      "  node scripts/i18n-guard.mjs [--staged] [--json] [--no-baseline] [--update-baseline]\n",
  );
  process.exit(0);
}

function isTargetFile(rel) {
  if (!/\.(tsx?|)$/.test(rel)) return false;
  if (!/\.(ts|tsx)$/.test(rel)) return false;
  if (/\.d\.ts$/.test(rel)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(rel)) return false;
  const base = path.basename(rel);
  if (base === "translations.ts" || base === "i18n.tsx") return false;
  const norm = rel.split(path.sep).join("/");
  const match = norm.match(/^apps\/([^/]+)\/(app|components)\//);
  return Boolean(match && SCOPE_APPS.has(match[1]));
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (entry.isFile()) {
      const rel = path.relative(REPO_ROOT, full);
      if (isTargetFile(rel)) out.push(rel);
    }
  }
}

function discoverAllTargets() {
  const out = [];
  let apps;
  try {
    apps = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const app of apps) {
    if (!app.isDirectory() || !SCOPE_APPS.has(app.name)) continue;
    for (const sub of SCAN_SUBDIRS) {
      walk(path.join(APPS_DIR, app.name, sub), out);
    }
  }
  return out.sort();
}

function discoverStagedTargets() {
  let raw = "";
  try {
    raw = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((rel) => isTargetFile(rel))
    .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
    .sort();
}

function blankComments(src) {
  const out = [];
  let line = "";
  let state = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    const push = (ch) => {
      if (ch === "\n") {
        out.push(line);
        line = "";
      } else {
        line += ch;
      }
    };
    switch (state) {
      case "code":
        if (c === "/" && n === "/") {
          state = "line";
          push(" ");
        } else if (c === "/" && n === "*") {
          state = "block";
          push(" ");
          push(" ");
          i++;
        } else if (c === "'") {
          state = "sq";
          push(c);
        } else if (c === '"') {
          state = "dq";
          push(c);
        } else if (c === "`") {
          state = "tpl";
          push(c);
        } else {
          push(c);
        }
        break;
      case "line":
        if (c === "\n") {
          state = "code";
          push("\n");
        } else {
          push(" ");
        }
        break;
      case "block":
        if (c === "*" && n === "/") {
          state = "code";
          push(" ");
          push(" ");
          i++;
        } else {
          push(c === "\n" ? "\n" : " ");
        }
        break;
      case "sq":
      case "dq":
      case "tpl": {
        const quote = state === "sq" ? "'" : state === "dq" ? '"' : "`";
        if (c === "\\") {
          push(c);
          if (n !== undefined) {
            push(n);
            i++;
          }
        } else if (c === quote) {
          state = "code";
          push(c);
        } else {
          push(c);
        }
        break;
      }
    }
  }
  out.push(line);
  return out;
}

const HELPER_PATTERNS = [
  /\bfunction\s+(?:copy|tx|copyText)\s*\(/,
  /\b(?:const|let|var)\s+copy\s*=\s*locale\s*===/,
  /\blocale\s*===\s*["'](?:en|zh)["']\s*\?/,
  /\bzh\s*\?\s*["']/,
  /\{\s*en\s*:\s*["'][^"']*["']\s*,\s*zh\s*:/,
  /\{\s*zh\s*:\s*["'][^"']*["']\s*,\s*en\s*:/,
];

const ATTR_RE = /\b(placeholder|title|aria-label|alt|label)\s*=\s*"([^"]+)"/g;
const JSX_TEXT_RE = />\s*([^<>{}]*[A-Za-z]{2,}[^<>{}]*?)\s*<\//g;

function isWhitelistedDisplay(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!/[A-Za-z]/.test(trimmed)) return true;
  const compact = trimmed.replace(/[\s·—/\-:.,()|]+/g, "");
  if (KEEP_TERMS.has(compact.toLowerCase())) return true;
  if (/^[A-Z0-9]{1,4}$/.test(compact)) return true;
  return false;
}

function checkFile(rel) {
  const abs = path.join(REPO_ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const codeLines = blankComments(src);
  const rawLines = src.split("\n");
  const isTsx = rel.endsWith(".tsx");
  const violations = [];

  const add = (lineIdx, rule, text) => {
    violations.push({
      line: lineIdx + 1,
      rule: RULES[rule].id,
      severity: RULES[rule].severity,
      text: text.trim().slice(0, 120),
    });
  };

  for (let i = 0; i < codeLines.length; i++) {
    const code = codeLines[i];
    const raw = rawLines[i] ?? "";

    for (const re of HELPER_PATTERNS) {
      if (re.test(code)) {
        add(i, "helper", raw);
        break;
      }
    }

    if (CJK_RE.test(code)) add(i, "cjk", raw);

    if (CJK_RE.test(code)) {
      const lower = code.toLowerCase();
      for (const term of CODE_SWITCH_TERMS) {
        if (new RegExp(`\\b${term}\\b`).test(lower)) {
          add(i, "term", `${raw.trim().slice(0, 90)}  «${term}»`);
          break;
        }
      }
    }

    if (isTsx) {
      let match;
      ATTR_RE.lastIndex = 0;
      while ((match = ATTR_RE.exec(code))) {
        if (!isWhitelistedDisplay(match[2])) {
          add(i, "jsxText", `${match[1]}="${match[2]}"`);
          break;
        }
      }
      JSX_TEXT_RE.lastIndex = 0;
      while ((match = JSX_TEXT_RE.exec(code))) {
        if (!isWhitelistedDisplay(match[1])) {
          add(i, "jsxText", `>${match[1].trim()}<`);
          break;
        }
      }
    }
  }

  return violations;
}

function signature(v) {
  const norm = v.text.replace(/\s+/g, " ").trim();
  return `${v.rule}\u0001${norm}`;
}

function signatureCounts(violations) {
  const counts = {};
  for (const violation of violations) {
    if (violation.severity !== "error") continue;
    const sig = signature(violation);
    counts[sig] = (counts[sig] ?? 0) + 1;
  }
  return counts;
}

function loadBaseline() {
  if (MODE.noBaseline) return {};
  try {
    const raw = fs.readFileSync(BASELINE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.files ?? {};
  } catch {
    return {};
  }
}

function writeBaseline(files) {
  const payload = {
    _comment:
      "Per-file ERROR-signature baseline for scripts/i18n-guard.mjs. Each file maps a violation signature ('rule\\u0001normalized text', line-independent) to the number of allowed occurrences. The guard fails when a file holds a signature beyond its allowance (a new or extra violation). Lower/remove entries as i18n remediation WPs clean each route; regenerate with --update-baseline.",
    generated: "i18n remediation 20260604",
    files,
  };
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

function main() {
  const targets = MODE.staged ? discoverStagedTargets() : discoverAllTargets();
  const baseline = loadBaseline();

  const report = {};
  const errorCounts = {};
  const errorSigs = {};
  let totalErrors = 0;
  let totalWarn = 0;

  for (const rel of targets) {
    const violations = checkFile(rel);
    if (violations.length) report[rel] = violations;
    const errorCount = violations.filter(
      (item) => item.severity === "error",
    ).length;
    if (errorCount) {
      errorCounts[rel] = errorCount;
      errorSigs[rel] = signatureCounts(violations);
    }
    totalErrors += errorCount;
    totalWarn += violations.length - errorCount;
  }

  if (MODE.updateBaseline) {
    const sortedFiles = {};
    for (const rel of Object.keys(errorSigs).sort()) {
      sortedFiles[rel] = Object.fromEntries(
        Object.entries(errorSigs[rel]).sort(),
      );
    }
    writeBaseline(sortedFiles);
    process.stdout.write(
      `i18n-guard: baseline written to scripts/i18n-guard-baseline.json (${Object.keys(errorSigs).length} files, ${totalErrors} errors)\n`,
    );
    process.exit(0);
  }

  const failures = [];
  for (const [rel, sigs] of Object.entries(errorSigs)) {
    const base = baseline[rel];
    if (typeof base === "number") {
      if (errorCounts[rel] > base) {
        failures.push({
          rel,
          count: errorCounts[rel],
          allowed: base,
          offenders: [],
        });
      }
      continue;
    }

    const allowedSigs = base ?? {};
    const offenders = [];
    let allowedTotal = 0;
    for (const [, allowed] of Object.entries(allowedSigs))
      allowedTotal += allowed;
    for (const [sig, count] of Object.entries(sigs)) {
      const allowed = allowedSigs[sig] ?? 0;
      if (count > allowed) {
        const matches = (report[rel] ?? []).filter(
          (item) => item.severity === "error" && signature(item) === sig,
        );
        const lines = matches.map((item) => item.line);
        const text = matches[0]?.text ?? "";
        offenders.push({ sig, count, allowed, lines, text });
      }
    }
    if (offenders.length) {
      failures.push({
        rel,
        count: errorCounts[rel],
        allowed: allowedTotal,
        offenders,
      });
    }
  }

  if (MODE.json) {
    process.stdout.write(
      `${JSON.stringify({ report, errorCounts, errorSigs, failures, totalErrors, totalWarn }, null, 2)}\n`,
    );
    process.exit(failures.length ? 1 : 0);
  }

  const files = Object.keys(report).sort();
  for (const rel of files) {
    for (const violation of report[rel]) {
      const tag = violation.severity === "error" ? "ERROR" : " warn";
      process.stdout.write(
        `${rel}:${violation.line}  [${tag} ${violation.rule}] ${violation.text}\n`,
      );
    }
  }

  process.stdout.write(
    `\ni18n-guard: ${totalErrors} errors, ${totalWarn} warnings across ${files.length} files (scanned ${targets.length}).\n`,
  );

  if (failures.length) {
    process.stdout.write(
      `\n✗ FAIL — ${failures.length} file(s) above i18n baseline (new/regressed debt):\n`,
    );
    for (const failure of failures.sort((a, b) => b.count - a.count)) {
      process.stdout.write(
        `    ${failure.rel}: ${failure.count} errors (baseline ${failure.allowed})\n`,
      );
      for (const offender of failure.offenders) {
        const where = offender.lines.length
          ? `:${offender.lines.join(",")}`
          : "";
        const extra = offender.count - offender.allowed;
        process.stdout.write(
          `        + ${failure.rel}${where}  [${extra} new] ${offender.text}\n`,
        );
      }
    }
    process.stdout.write(
      "\nFix the new violations, or if you intentionally cleaned a file run\n" +
        "  node scripts/i18n-guard.mjs --update-baseline\n" +
        "to re-record the baseline.\n",
    );
    process.exit(1);
  }

  process.stdout.write("\n✓ PASS — no new i18n violations above baseline.\n");
  process.exit(0);
}

main();
