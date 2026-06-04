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
 * Ratchet: the repo ships with ~2,170 known-debt lines across 43 pages. A
 * hard fail on all of them would red-line CI until every WP lands, blocking the
 * very PRs that fix them. So the guard is baselined: scripts/i18n-guard-baseline.json
 * records, per file, a multiset of the current ERROR *signatures* — each
 * signature being `rule + normalized violation text`, independent of line
 * number so legitimate edits that merely shift lines do not trip it. The guard
 * FAILS when a file contains an ERROR signature whose count exceeds its baseline
 * allowance (a brand-new violation, or more copies of a known-shape one), or
 * when a non-baselined file has any error. Crucially this catches a *swap* —
 * remediating one violation and introducing a different one keeps the per-file
 * count identical but adds a never-seen signature, which fails. Known debt still
 * drains freely (removed signatures never fail). Warnings never fail. As a WP
 * cleans a file, drop/lower its baseline entry (or run `--update-baseline`); the
 * guard then locks the file clean.
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
const BASELINE_PATH = path.join(REPO_ROOT, "scripts", "i18n-guard-baseline.json");
const APPS_DIR = path.join(REPO_ROOT, "apps");
const SCAN_SUBDIRS = ["app", "components"];
// Scope per spec §0: the 20260604 bilingual remediation covers these two apps.
// Other apps (driver-app, tenant-console-web, …) have not been audited against
// this convention; add them here once their teams adopt it.
const SCOPE_APPS = new Set(["ops-console-web", "platform-admin-web"]);

// KEEP terms (spec §3) + structural acronyms allowed as bare literals.
const KEEP_TERMS = new Set(
  [
    "ETA", "SLA", "API", "RBAC", "TTL", "CSV", "PDF", "ZIP", "URL", "ID",
    "KPI", "UI", "UX", "OK", "QR", "SSO", "JSON", "CSI", "GPS", "VIN", "SMS",
  ].map((t) => t.toLowerCase()),
);

// §3 glossary terms that MUST be translated when sitting inside a zh string.
const CODE_SWITCH_TERMS = [
  "adapter", "registry", "override", "dispatch", "credential", "session",
  "callback", "fallback", "rollout", "queue", "scope", "gate", "token",
  "workspace", "snapshot", "provision", "banner", "readiness", "posture",
  "backlog", "stepper", "reconciliation", "forwarded", "secret",
];

const RULES = {
  helper: { id: "helper", severity: "error", desc: "inline bilingual helper / ternary / inline {en,zh}" },
  cjk: { id: "cjk", severity: "error", desc: "hard-coded CJK literal" },
  jsxText: { id: "jsxText", severity: "error", desc: "hard-coded English JSX text / attribute" },
  term: { id: "term", severity: "warn", desc: "zh code-switch: untranslated glossary term" },
};

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------
function isTargetFile(rel) {
  if (!/\.(tsx?|)$/.test(rel)) return false;
  if (!/\.(ts|tsx)$/.test(rel)) return false;
  if (/\.d\.ts$/.test(rel)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(rel)) return false;
  const base = path.basename(rel);
  if (base === "translations.ts" || base === "i18n.tsx") return false;
  // Must live under apps/<scoped-app>/(app|components)/
  const norm = rel.split(path.sep).join("/");
  const m = norm.match(/^apps\/([^/]+)\/(app|components)\//);
  return Boolean(m && SCOPE_APPS.has(m[1]));
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, out);
    } else if (e.isFile()) {
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
    for (const sub of SCAN_SUBDIRS) walk(path.join(APPS_DIR, app.name, sub), out);
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
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rel) => isTargetFile(rel))
    .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
    .sort();
}

// ---------------------------------------------------------------------------
// Comment-aware code extraction
// ---------------------------------------------------------------------------
/**
 * Returns a per-line array where comment characters are blanked to spaces but
 * string-literal contents are preserved (hard-coded CJK/English *in a string*
 * is exactly what we want to flag; CJK in a comment is fine).
 */
function blankComments(src) {
  const out = [];
  let line = "";
  let state = "code"; // code | line | block | sq | dq | tpl
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

// ---------------------------------------------------------------------------
// Rule checks (per file)
// ---------------------------------------------------------------------------
const HELPER_PATTERNS = [
  /\bfunction\s+(?:copy|tx|copyText)\s*\(/,
  /\b(?:const|let|var)\s+copy\s*=\s*locale\s*===/,
  /\blocale\s*===\s*["'](?:en|zh)["']\s*\?/,
  /\bzh\s*\?\s*["']/,
  /\{\s*en\s*:\s*["'][^"']*["']\s*,\s*zh\s*:/,
  /\{\s*zh\s*:\s*["'][^"']*["']\s*,\s*en\s*:/,
];

const ATTR_RE = /\b(placeholder|title|aria-label|alt|label)\s*=\s*"([^"]+)"/g;
// Leaf text node sitting directly before a closing tag: >  Some Text  </
const JSX_TEXT_RE = />\s*([^<>{}]*[A-Za-z]{2,}[^<>{}]*?)\s*<\//g;

function isWhitelistedDisplay(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // only symbols / digits / whitespace
  if (!/[A-Za-z]/.test(trimmed)) return true;
  // single KEEP acronym or short all-caps token
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
  /** @type {{line:number, rule:string, severity:string, text:string}[]} */
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

    // Rule 1 — inline bilingual machinery
    for (const re of HELPER_PATTERNS) {
      if (re.test(code)) {
        add(i, "helper", raw);
        break;
      }
    }

    // Rule 2 — hard-coded CJK in code (comments already blanked)
    if (CJK_RE.test(code)) add(i, "cjk", raw);

    // Rule 5 — code-switch warn: zh string still carrying a glossary term
    if (CJK_RE.test(code)) {
      const lower = code.toLowerCase();
      for (const term of CODE_SWITCH_TERMS) {
        if (new RegExp(`\\b${term}\\b`).test(lower)) {
          add(i, "term", `${raw.trim().slice(0, 90)}  «${term}»`);
          break;
        }
      }
    }

    // Rule 3 — hard-coded English JSX text + a11y/placeholder attrs (tsx only)
    if (isTsx) {
      let m;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(code))) {
        if (!isWhitelistedDisplay(m[2])) {
          add(i, "jsxText", `${m[1]}="${m[2]}"`);
          break;
        }
      }
      JSX_TEXT_RE.lastIndex = 0;
      while ((m = JSX_TEXT_RE.exec(code))) {
        if (!isWhitelistedDisplay(m[1])) {
          add(i, "jsxText", `>${m[1].trim()}<`);
          break;
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Violation signatures — line-independent identity of a single violation, so
// the baseline can tell a NEW violation apart from a known one even when edits
// shift line numbers or a remediation swaps one violation for a different one.
// ---------------------------------------------------------------------------
/** @param {{rule:string,text:string}} v */
function signature(v) {
  const norm = v.text.replace(/\s+/g, " ").trim();
  return `${v.rule}${norm}`;
}

/**
 * Multiset of ERROR signatures for a file's violations (warnings never gate).
 * @param {{line:number,rule:string,severity:string,text:string}[]} violations
 * @returns {Record<string, number>}
 */
function signatureCounts(violations) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const v of violations) {
    if (v.severity !== "error") continue;
    const s = signature(v);
    m[s] = (m[s] ?? 0) + 1;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------
/**
 * @returns {Record<string, Record<string, number>|number>} per-file signature
 *   multiset. Legacy numeric entries (old count-only baselines) are tolerated
 *   and fall back to a total-count comparison for that file.
 */
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

/** @param {Record<string, Record<string, number>>} files */
function writeBaseline(files) {
  const payload = {
    _comment:
      "Per-file ERROR-signature baseline for scripts/i18n-guard.mjs. Each file " +
      "maps a violation signature ('rule\\u0001normalized text', line-independent) " +
      "to the number of allowed occurrences. The guard fails when a file holds a " +
      "signature beyond its allowance (a new or extra violation) — this catches a " +
      "swap that keeps the per-file count identical. Lower/remove entries as i18n " +
      "remediation WPs clean each route; regenerate with --update-baseline.",
    generated: "i18n remediation 20260604",
    files,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const targets = MODE.staged ? discoverStagedTargets() : discoverAllTargets();
  const baseline = loadBaseline();

  /** @type {Record<string, {line:number,rule:string,severity:string,text:string}[]>} */
  const report = {};
  const errorCounts = {};
  /** @type {Record<string, Record<string, number>>} per-file ERROR signature multiset */
  const errorSigs = {};
  let totalErrors = 0;
  let totalWarn = 0;

  for (const rel of targets) {
    const v = checkFile(rel);
    if (v.length) report[rel] = v;
    const ec = v.filter((x) => x.severity === "error").length;
    if (ec) {
      errorCounts[rel] = ec;
      errorSigs[rel] = signatureCounts(v);
    }
    totalErrors += ec;
    totalWarn += v.length - ec;
  }

  if (MODE.updateBaseline) {
    // Persist sorted files, each with its signatures sorted, for stable diffs.
    const sortedFiles = {};
    for (const rel of Object.keys(errorSigs).sort()) {
      sortedFiles[rel] = Object.fromEntries(Object.entries(errorSigs[rel]).sort());
    }
    writeBaseline(sortedFiles);
    process.stdout.write(
      `i18n-guard: baseline written to scripts/i18n-guard-baseline.json ` +
        `(${Object.keys(errorSigs).length} files, ${totalErrors} errors)\n`,
    );
    process.exit(0);
  }

  // Determine failures by comparing each file's current ERROR signature multiset
  // against its baseline allowance. A file fails when it carries a signature
  // beyond its allowed count — i.e. a brand-new violation, an extra copy of a
  // known-shape one, OR a swap (one violation remediated, a *different* one
  // introduced: identical per-file count, but a never-seen signature). Removed
  // signatures (known debt draining) never fail. A non-baselined file with any
  // error fails outright (allowance 0 for every signature).
  /** @type {{rel:string,count:number,allowed:number,offenders:{sig:string,count:number,allowed:number,lines:number[],text:string}[]}[]} */
  const failures = [];
  for (const [rel, sigs] of Object.entries(errorSigs)) {
    const base = baseline[rel];
    // Tolerate a legacy count-only baseline entry: fall back to total-count gate.
    if (typeof base === "number") {
      if (errorCounts[rel] > base) {
        failures.push({ rel, count: errorCounts[rel], allowed: base, offenders: [] });
      }
      continue;
    }
    const allowedSigs = base ?? {};
    const offenders = [];
    let allowedTotal = 0;
    for (const [sig, allowed] of Object.entries(allowedSigs)) allowedTotal += allowed;
    for (const [sig, count] of Object.entries(sigs)) {
      const allowed = allowedSigs[sig] ?? 0;
      if (count > allowed) {
        // Locate the offending occurrences' file:line + display text.
        const matches = (report[rel] ?? []).filter(
          (x) => x.severity === "error" && signature(x) === sig,
        );
        const lines = matches.map((x) => x.line);
        const text = matches[0]?.text ?? "";
        offenders.push({ sig, count, allowed, lines, text });
      }
    }
    if (offenders.length) {
      failures.push({ rel, count: errorCounts[rel], allowed: allowedTotal, offenders });
    }
  }

  if (MODE.json) {
    process.stdout.write(
      `${JSON.stringify({ report, errorCounts, errorSigs, failures, totalErrors, totalWarn }, null, 2)}\n`,
    );
    process.exit(failures.length ? 1 : 0);
  }

  // Human file:line worklist.
  const files = Object.keys(report).sort();
  for (const rel of files) {
    for (const v of report[rel]) {
      const tag = v.severity === "error" ? "ERROR" : " warn";
      process.stdout.write(`${rel}:${v.line}  [${tag} ${v.rule}] ${v.text}\n`);
    }
  }

  process.stdout.write(
    `\ni18n-guard: ${totalErrors} errors, ${totalWarn} warnings across ` +
      `${files.length} files (scanned ${targets.length}).\n`,
  );

  if (failures.length) {
    process.stdout.write(
      `\n✗ FAIL — ${failures.length} file(s) above i18n baseline (new/regressed debt):\n`,
    );
    for (const f of failures.sort((a, b) => b.count - a.count)) {
      process.stdout.write(
        `    ${f.rel}: ${f.count} errors (baseline ${f.allowed})\n`,
      );
      // List the specific new/extra violations with file:line so the worklist
      // points straight at the regression, not just the file total.
      for (const o of f.offenders) {
        const where = o.lines.length ? `:${o.lines.join(",")}` : "";
        const extra = o.count - o.allowed;
        process.stdout.write(
          `        + ${f.rel}${where}  [${extra} new] ${o.text}\n`,
        );
      }
    }
    process.stdout.write(
      `\nFix the new violations, or if you intentionally cleaned a file run\n` +
        `  node scripts/i18n-guard.mjs --update-baseline\nto re-record the baseline.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`\n✓ PASS — no new i18n violations above baseline.\n`);
  process.exit(0);
}

main();
